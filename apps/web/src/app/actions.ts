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
import { editMagnitude, runGuardrails, type NarrativeResponse } from '@klawfin/llm';

import { resolveActor, canWrite, canViewCosts, type Actor } from '../lib/auth/session';
import { serverClient } from '../lib/db/client';
import { admin } from '../lib/db/admin';
import { executeClientDeletion } from '../lib/db/deletion';
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

/* -------------------------------------------------------------------------- */
/* Narrative review (PRD P1-07)                                               */
/* -------------------------------------------------------------------------- */

/**
 * The sections a human may edit.
 *
 * Deliberately NOT the whole response. Scores, priority ranking and the
 * disclaimer are not editable, so allowing an edit anywhere would let the
 * prose drift from the computed result the report also prints - the one
 * failure a reader notices immediately and cannot unsee.
 *
 * The shape mirrors the editable slice of `NarrativeResponse`; everything else
 * is carried through from the raw response unchanged.
 */
const narrativeEditSchema = z.object({
  executiveSummary: z.string().trim().min(1, 'The executive summary cannot be empty').max(3000),
  overallAssessment: z.string().trim().min(1, 'The overall assessment cannot be empty').max(4000),
  dimensions: z
    .array(
      z.object({
        dimensionId: z.string().trim().min(1),
        whatWeObserved: z.string().trim().min(1, 'This section cannot be empty').max(1500),
        confidenceNote: z.string().trim().max(600).nullable(),
      }),
    )
    .length(6),
});

export async function saveNarrativeEditAction(
  narrativeId: unknown,
  edit: unknown,
): Promise<
  ActionResult<{ editMagnitude: number; guardrailPassed: boolean; blockingFindings: number }>
> {
  const auth = await authorise();
  if (!auth.ok) return auth;

  const id = z.string().uuid().safeParse(narrativeId);
  if (!id.success) return { ok: false, error: 'Unknown narrative.' };

  const parsed = narrativeEditSchema.safeParse(edit);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'The edit could not be read.' };
  }

  const { data: row } = await auth.db
    .from('assessment_narratives')
    .select('id, assessment_id, raw_response, edited_response, is_fallback')
    .eq('id', id.data)
    .maybeSingle();

  if (!row) return { ok: false, error: 'Narrative not found.' };

  const { data: assessment } = await auth.db
    .from('assessments')
    .select('id, client_id, intake_data')
    .eq('id', row.assessment_id)
    .maybeSingle();

  if (!assessment) return { ok: false, error: 'Assessment not found.' };

  // Edits apply to the CURRENT text, which is the previous edit if there is
  // one. The diff is always taken against `raw_response`, never against the
  // intermediate, or M4 would measure the last keystroke instead of the total
  // distance from what the model produced.
  const base = row.edited_response ?? row.raw_response;
  const edited: NarrativeResponse = {
    ...base,
    executive_summary: parsed.data.executiveSummary,
    overall_assessment: parsed.data.overallAssessment,
    dimensions: base.dimensions.map((dimension) => {
      const change = parsed.data.dimensions.find((d) => d.dimensionId === dimension.dimension_id);
      if (!change) return dimension;
      return {
        ...dimension,
        what_we_observed: change.whatWeObserved,
        confidence_note: change.confidenceNote,
      };
    }),
  };

  // Re-run the guardrails on the EDITED text. A human edit is exactly as
  // capable of introducing a prohibited phrase or a wrong number as a
  // generation is, and an edit that silently kept a stale pass would defeat
  // the check entirely (PRD 6.5).
  const score = scoreIntake(assessment.intake_data);
  const guardrails = runGuardrails(edited, score);
  const magnitude = editMagnitude(row.raw_response, edited);

  const { error } = await auth.db
    .from('assessment_narratives')
    .update({
      edited_response: edited,
      edit_magnitude: { ...magnitude.bySection, overall: magnitude.overall },
      guardrail_findings: [...guardrails.findings],
      guardrail_passed: guardrails.passed,
      // An edit invalidates a prior approval: what was approved is no longer
      // what would be printed.
      approved_by: null,
      approved_at: null,
    })
    .eq('id', id.data);

  if (error) return { ok: false, error: 'The edit could not be saved.' };

  await writeAudit(auth.db, {
    ...auth.audit,
    action: 'narrative.edited',
    entityType: 'narrative',
    entityId: id.data,
    clientId: assessment.client_id,
    // Magnitudes and counts only. The edited TEXT is about a client and does
    // not belong in the audit table.
    metadata: {
      edit_magnitude_overall: Number(magnitude.overall.toFixed(4)),
      sections_touched: Object.values(magnitude.bySection).filter((v) => v > 0).length,
      guardrail_passed: guardrails.passed,
      blocking: guardrails.blocking.length,
    },
  });

  revalidatePath(`/assessments/${row.assessment_id}`);
  return {
    ok: true,
    data: {
      editMagnitude: magnitude.overall,
      guardrailPassed: guardrails.passed,
      blockingFindings: guardrails.blocking.length,
    },
  };
}

export async function approveNarrativeAction(
  narrativeId: unknown,
): Promise<ActionResult<{ approvedAt: string }>> {
  const auth = await authorise();
  if (!auth.ok) return auth;

  const id = z.string().uuid().safeParse(narrativeId);
  if (!id.success) return { ok: false, error: 'Unknown narrative.' };

  const { data: row } = await auth.db
    .from('assessment_narratives')
    .select('id, assessment_id, guardrail_passed, is_fallback')
    .eq('id', id.data)
    .maybeSingle();

  if (!row) return { ok: false, error: 'Narrative not found.' };

  // Two refusals, both deliberate. Approval is the step that makes a narrative
  // printable, so it is the right place to stop both of these rather than
  // relying on the export route to catch them later.
  if (!row.guardrail_passed) {
    return {
      ok: false,
      error:
        'This narrative has unresolved blocking guardrail findings. Edit the flagged sections, or regenerate.',
    };
  }
  if (row.is_fallback) {
    return {
      ok: false,
      error:
        'This is an offline narrative assembled from the scores, not generated writing. It cannot be approved for a client report. Generate with the model, or export the fallback report, which carries the scores without a narrative.',
    };
  }

  const approvedAt = new Date().toISOString();
  const { error } = await auth.db
    .from('assessment_narratives')
    .update({ approved_by: auth.actor.id, approved_at: approvedAt })
    .eq('id', id.data);

  if (error) return { ok: false, error: 'The approval could not be recorded.' };

  await writeAudit(auth.db, {
    ...auth.audit,
    action: 'narrative.approved',
    entityType: 'narrative',
    entityId: id.data,
    metadata: { assessment_id: row.assessment_id },
  });

  revalidatePath(`/assessments/${row.assessment_id}`);
  return { ok: true, data: { approvedAt } };
}

/* -------------------------------------------------------------------------- */
/* Overrides (PRD P1-05, 8.1)                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Both overrides below demand a written reason, and neither accepts a blank
 * one.
 *
 * A gate that can be clicked past without saying why is a gate that gets
 * clicked past. The reason is stored, audited and attributable, which is the
 * whole mechanism: the cost of overriding is having to write down that you
 * did, and why.
 */
const MIN_REASON = 10;

export async function dismissContradictionAction(
  assessmentId: unknown,
  code: unknown,
  reason: unknown,
): Promise<ActionResult<{ code: string }>> {
  const auth = await authorise();
  if (!auth.ok) return auth;

  const parsed = z
    .object({
      assessmentId: z.string().uuid(),
      code: z.string().trim().min(1).max(80),
      reason: z
        .string()
        .trim()
        .min(MIN_REASON, 'Say why this contradiction is acceptable - at least a sentence.')
        .max(1000),
    })
    .safeParse({ assessmentId, code, reason });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'The dismissal could not be read.' };
  }

  const { data: assessment } = await auth.db
    .from('assessments')
    .select('id, client_id, intake_data, intake_locked_at')
    .eq('id', parsed.data.assessmentId)
    .maybeSingle();

  if (!assessment) return { ok: false, error: 'Assessment not found.' };

  // Only a contradiction that actually fired may be dismissed. Without this,
  // a stale or mistyped code would sit in the table looking like a decision
  // somebody made.
  const report = checkContradictions(
    assessment.intake_data,
    new Date(assessment.intake_locked_at ?? Date.now()),
  );
  const target = report.contradictions.find((c) => c.code === parsed.data.code);
  if (!target) {
    return { ok: false, error: 'That contradiction is not currently firing on this intake.' };
  }

  const { error } = await auth.db.from('contradiction_dismissals').insert({
    assessment_id: parsed.data.assessmentId,
    code: parsed.data.code,
    reason: parsed.data.reason,
    dismissed_by: auth.actor.id,
  });

  if (error) return { ok: false, error: 'The dismissal could not be saved.' };

  await writeAudit(auth.db, {
    ...auth.audit,
    action: 'contradiction.dismissed',
    entityType: 'assessment',
    entityId: parsed.data.assessmentId,
    clientId: assessment.client_id,
    // The code and the class, not the message: the message quotes intake
    // values back, and those do not belong in the audit table.
    metadata: { code: parsed.data.code, class: target.class },
  });

  revalidatePath(`/assessments/${parsed.data.assessmentId}`);
  return { ok: true, data: { code: parsed.data.code } };
}

export async function overrideCoverageAction(
  assessmentId: unknown,
  reason: unknown,
): Promise<ActionResult<{ overriddenAt: string }>> {
  const auth = await authorise();
  if (!auth.ok) return auth;

  const parsed = z
    .object({
      assessmentId: z.string().uuid(),
      reason: z
        .string()
        .trim()
        .min(MIN_REASON, 'Say why a report is worth producing on this much information.')
        .max(1000),
    })
    .safeParse({ assessmentId, reason });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'The override could not be read.' };
  }

  const { data: assessment } = await auth.db
    .from('assessments')
    .select('id, client_id, intake_data')
    .eq('id', parsed.data.assessmentId)
    .maybeSingle();

  if (!assessment) return { ok: false, error: 'Assessment not found.' };

  const score = scoreIntake(assessment.intake_data);
  const overriddenAt = new Date().toISOString();

  const { error } = await auth.db
    .from('assessments')
    .update({
      coverage_override_reason: parsed.data.reason,
      coverage_overridden_by: auth.actor.id,
      coverage_overridden_at: overriddenAt,
    })
    .eq('id', parsed.data.assessmentId);

  if (error) return { ok: false, error: 'The override could not be saved.' };

  await writeAudit(auth.db, {
    ...auth.audit,
    action: 'coverage.overridden',
    entityType: 'assessment',
    entityId: parsed.data.assessmentId,
    clientId: assessment.client_id,
    metadata: {
      coverage_pct: Math.round(score.overallCoverage * 100),
      composite: score.composite,
    },
  });

  revalidatePath(`/assessments/${parsed.data.assessmentId}`);
  return { ok: true, data: { overriddenAt } };
}

/* -------------------------------------------------------------------------- */
/* Client lifecycle (P1-11, PRD 10.6)                                         */
/* -------------------------------------------------------------------------- */

/**
 * Archive a client.
 *
 * Soft. The engagement is over, the record stays. This is the common case and
 * it is deliberately the easy one to reach, so that deletion - which is not
 * reversible - is never chosen merely because it was the nearer button.
 */
export async function archiveClientAction(
  clientId: unknown,
): Promise<ActionResult<{ archivedAt: string }>> {
  const auth = await authorise();
  if (!auth.ok) return auth;

  const id = z.string().uuid().safeParse(clientId);
  if (!id.success) return { ok: false, error: 'Unknown client.' };

  const archivedAt = new Date().toISOString();
  const { error } = await auth.db
    .from('clients')
    .update({ archived_at: archivedAt })
    .eq('id', id.data);

  if (error) return { ok: false, error: 'The client could not be archived.' };

  await writeAudit(auth.db, {
    ...auth.audit,
    action: 'client.archived',
    entityType: 'client',
    entityId: id.data,
    clientId: id.data,
    metadata: {},
  });

  revalidatePath('/clients');
  revalidatePath(`/clients/${id.data}`);
  return { ok: true, data: { archivedAt } };
}

/**
 * Record a deletion request.
 *
 * Recording and executing are separate steps on purpose. The request is
 * evidence that someone asked; the execution is the irreversible act. Keeping
 * them apart means a request can be logged the moment it arrives - which is
 * what the statutory clock runs on - without anyone having to decide, in that
 * same minute, to destroy a paying client's file.
 */
export async function requestClientDeletionAction(
  clientId: unknown,
  input: unknown,
): Promise<ActionResult<{ requestId: string }>> {
  const auth = await authorise();
  if (!auth.ok) return auth;

  const parsed = z
    .object({
      clientId: z.string().uuid(),
      requestedBy: z.enum(['data_principal', 'klawfin_internal']),
      requesterEmail: z.string().trim().email().max(200).optional().nullable(),
      reason: z.string().trim().min(MIN_REASON, 'Record what was asked for, and by whom.').max(1000),
    })
    .safeParse({ clientId, ...(typeof input === 'object' && input !== null ? input : {}) });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'The request could not be read.' };
  }

  const { data: row, error } = await auth.db
    .from('deletion_requests')
    .insert({
      client_id: parsed.data.clientId,
      requested_by: parsed.data.requestedBy,
      requester_email: parsed.data.requesterEmail ?? null,
      reason: parsed.data.reason,
      status: 'requested',
    })
    .select('id')
    .single();

  if (error || !row) return { ok: false, error: 'The deletion request could not be recorded.' };

  await writeAudit(auth.db, {
    ...auth.audit,
    action: 'deletion.requested',
    entityType: 'client',
    entityId: parsed.data.clientId,
    clientId: parsed.data.clientId,
    // Who asked and in what capacity. Not the reason text, which may quote the
    // client's own words about their business.
    metadata: { requested_by: parsed.data.requestedBy, request_id: row.id },
  });

  revalidatePath(`/clients/${parsed.data.clientId}`);
  return { ok: true, data: { requestId: row.id } };
}

/**
 * Execute a recorded deletion request. IRREVERSIBLE.
 *
 * Owner only, and only against a request that already exists. Both conditions
 * are the point: deletion cannot be reached by a single click from a single
 * account, and every execution has a written request behind it.
 *
 * Runs through the service-role client because the rows being deleted are
 * exactly the rows RLS protects, and because clearing the storage bucket is
 * one of the operations RLS cannot express.
 */
export async function executeDeletionAction(
  requestId: unknown,
): Promise<ActionResult<{ message: string; orphanedPaths: string[] }>> {
  const auth = await authorise();
  if (!auth.ok) return auth;

  if (!canViewCosts(auth.actor)) {
    return { ok: false, error: 'Only the account owner can execute a deletion.' };
  }

  const id = z.string().uuid().safeParse(requestId);
  if (!id.success) return { ok: false, error: 'Unknown deletion request.' };

  const { data: request } = await auth.db
    .from('deletion_requests')
    .select('id, client_id, status')
    .eq('id', id.data)
    .maybeSingle();

  if (!request) return { ok: false, error: 'Deletion request not found.' };
  if (request.status === 'executed') {
    return { ok: false, error: 'That request has already been executed.' };
  }
  if (request.status === 'rejected') {
    return { ok: false, error: 'That request was rejected. Record a new one if it has changed.' };
  }

  const service = admin();
  const outcome = await executeClientDeletion(service, service, request.client_id, auth.actor.id);

  if (!outcome.rowsDeleted) {
    return { ok: false, error: outcome.message };
  }

  // The request row survives its client: it is the record that the deletion
  // happened, and the only remaining place that says so.
  await service
    .from('deletion_requests')
    .update({
      status: 'executed',
      approved_by: auth.actor.id,
      approved_at: new Date().toISOString(),
      executed_at: new Date().toISOString(),
      execution_note: outcome.message,
    })
    .eq('id', id.data);

  revalidatePath('/clients');
  return { ok: true, data: { message: outcome.message, orphanedPaths: outcome.orphanedPaths } };
}
