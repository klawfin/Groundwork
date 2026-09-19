'use server';

/**
 * Server Actions for the intake -> score flow.
 *
 * Each one does the same three things before touching data: resolve the actor,
 * validate the input with Zod, write the audit row. Nothing here trusts its
 * arguments - a Server Action is a public HTTP endpoint wearing a function
 * signature.
 *
 * Errors are returned as values, not thrown, so the UI renders a message
 * instead of a blank screen (readme.md conventions).
 */

import { cookies, headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { parseIntake } from '@klawfin/core';
import { scoreIntake } from '@klawfin/rubric';
import { checkContradictions } from '@klawfin/validation';

import { resolveActor, canWrite, type Actor } from '../lib/auth/session';
import { serverClient } from '../lib/db/client';
import { writeAudit, type AuditContext } from '../lib/audit/log';
import {
  createAssessment,
  createClient,
  findClientsByName,
  lockIntakeAndSaveScore,
  saveIntake,
} from '../lib/db/queries';
import type { Database } from '../lib/db/types';
import type { SupabaseClient } from '@supabase/supabase-js';

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Resolve the session once, for every action.
 *
 * Returns the client, actor and audit context together so no action can
 * accidentally write data as one identity and audit it as another.
 */
async function authorise(): Promise<
  | { ok: true; db: SupabaseClient<Database>; actor: Actor; audit: AuditContext }
  | { ok: false; error: string }
> {
  const cookieStore = await cookies();
  const db = serverClient(cookieStore);
  const auth = await resolveActor(db, await headers());

  if (!auth.ok) {
    return { ok: false, error: 'You are not signed in, or this account is not permitted.' };
  }
  if (!canWrite(auth.actor)) {
    return { ok: false, error: 'This account has read-only access.' };
  }
  return { ok: true, db, actor: auth.actor, audit: auth.audit };
}

/* -------------------------------------------------------------------------- */
/* Clients                                                                    */
/* -------------------------------------------------------------------------- */

const newClientSchema = z.object({
  legalName: z.string().trim().min(1, 'Client name is required').max(200),
  primaryContactName: z.string().trim().min(1, 'Contact name is required').max(120),
  primaryContactEmail: z.string().trim().email('Enter a valid email address').max(200),
  sector: z.string().trim().max(120).optional().nullable(),
  stage: z.string().trim().max(60).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  /** Set true to proceed past a duplicate-name warning (P1-02). */
  confirmDuplicate: z.boolean().default(false),
});

export async function createClientAction(
  input: unknown,
): Promise<ActionResult<{ clientId: string; duplicateWarning?: string }>> {
  const auth = await authorise();
  if (!auth.ok) return auth;

  const parsed = newClientSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid client details.' };
  }

  // Duplicate detection WARNS and requires confirmation; it never blocks
  // (P1-02). Two portfolio companies can legitimately share a name.
  if (!parsed.data.confirmDuplicate) {
    const existing = await findClientsByName(auth.db, parsed.data.legalName);
    if (existing.length > 0) {
      return {
        ok: true,
        data: {
          clientId: '',
          duplicateWarning: `A client named "${parsed.data.legalName}" already exists. Confirm to create a second record.`,
        },
      };
    }
  }

  const client = await createClient(auth.db, parsed.data, auth.actor.id);

  await writeAudit(auth.db, {
    ...auth.audit,
    action: 'client.created',
    entityType: 'client',
    entityId: client.id,
    clientId: client.id,
    metadata: { confirmed_duplicate: parsed.data.confirmDuplicate },
  });

  revalidatePath('/clients');
  return { ok: true, data: { clientId: client.id } };
}

/* -------------------------------------------------------------------------- */
/* Assessments                                                                */
/* -------------------------------------------------------------------------- */

export async function createAssessmentAction(
  clientId: unknown,
): Promise<ActionResult<{ assessmentId: string }>> {
  const auth = await authorise();
  if (!auth.ok) return auth;

  const parsed = z.string().uuid().safeParse(clientId);
  if (!parsed.success) return { ok: false, error: 'Unknown client.' };

  const assessment = await createAssessment(auth.db, parsed.data, auth.actor.id);

  await writeAudit(auth.db, {
    ...auth.audit,
    action: 'assessment.created',
    entityType: 'assessment',
    entityId: assessment.id,
    clientId: parsed.data,
    metadata: { rubric_version: assessment.rubric_version },
  });

  revalidatePath(`/clients/${parsed.data}`);
  return { ok: true, data: { assessmentId: assessment.id } };
}

/**
 * Autosave an intake draft (P1-03).
 *
 * Called on field blur and on a debounce, so it is the highest-frequency write
 * in the application. It deliberately does NOT write an audit row per
 * keystroke - `intake.locked` records the submission that matters, and an
 * audit log flooded with autosaves is one nobody reads.
 */
export async function saveIntakeAction(
  assessmentId: unknown,
  intake: unknown,
): Promise<ActionResult<{ savedAt: string }>> {
  const auth = await authorise();
  if (!auth.ok) return auth;

  const id = z.string().uuid().safeParse(assessmentId);
  if (!id.success) return { ok: false, error: 'Unknown assessment.' };

  try {
    await saveIntake(auth.db, id.data, intake);
    return { ok: true, data: { savedAt: new Date().toISOString() } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not save.' };
  }
}

/**
 * Score the intake without locking it (P1-04).
 *
 * "See the computed score and dimension breakdown BEFORE I spend money on
 * generation, so I can fix bad input first." Pure computation, no database
 * write, no LLM call - which is only possible because scoring is deterministic
 * (decision 0002).
 */
export async function previewScoreAction(intake: unknown): Promise<
  ActionResult<{
    score: ReturnType<typeof scoreIntake>;
    contradictions: ReturnType<typeof checkContradictions>;
  }>
> {
  const auth = await authorise();
  if (!auth.ok) return auth;

  try {
    const parsed = parseIntake(intake);
    return {
      ok: true,
      data: {
        score: scoreIntake(parsed),
        contradictions: checkContradictions(parsed, new Date()),
      },
    };
  } catch {
    return { ok: false, error: 'The intake could not be read. Check the values entered.' };
  }
}

/**
 * Lock the intake and persist the score (P1-03 -> P1-04).
 *
 * Refuses while a blocking contradiction is unresolved (P1-05). Dismissals are
 * recorded separately and are not re-checked here; this is the gate, not the
 * dismissal mechanism.
 */
export async function lockIntakeAction(
  assessmentId: unknown,
  intake: unknown,
): Promise<ActionResult<{ composite: number; band: string }>> {
  const auth = await authorise();
  if (!auth.ok) return auth;

  const id = z.string().uuid().safeParse(assessmentId);
  if (!id.success) return { ok: false, error: 'Unknown assessment.' };

  let parsedIntake;
  try {
    parsedIntake = parseIntake(intake);
  } catch {
    return { ok: false, error: 'The intake could not be read. Check the values entered.' };
  }

  const contradictions = checkContradictions(parsedIntake, new Date());
  if (!contradictions.canGenerate) {
    return {
      ok: false,
      error: `Resolve or dismiss ${contradictions.blocking.length} blocking contradiction(s) before locking the intake.`,
    };
  }

  const score = scoreIntake(parsedIntake);

  await saveIntake(auth.db, id.data, parsedIntake);
  await lockIntakeAndSaveScore(auth.db, id.data, score);

  await writeAudit(auth.db, {
    ...auth.audit,
    action: 'intake.locked',
    entityType: 'assessment',
    entityId: id.data,
    // Metadata records WHAT HAPPENED, never what the intake said.
    metadata: {
      composite: score.composite,
      band: score.band.id,
      coverage_pct: Math.round(score.overallCoverage * 100),
      rubric_version: score.rubricVersion,
      pre_revenue_mode: score.preRevenueMode,
      warnings: contradictions.warnings.length,
    },
  });

  revalidatePath(`/assessments/${id.data}`);
  return { ok: true, data: { composite: score.composite, band: score.band.label } };
}
