/**
 * Generation orchestration (PRD 6.4-6.6).
 *
 * One entry point, `runGeneration`, owning the whole sequence:
 *
 *   load -> score -> coverage gate -> assemble prompt -> ledger row ->
 *   call -> guardrails -> persist narrative -> persist outcome -> audit
 *
 * It lives here rather than inline in the route so the sequence can be read in
 * one place and so the route stays thin.
 *
 * Three ordering rules are deliberate and must survive edits:
 *
 *   1. The `llm_calls` row is written BEFORE the call is dispatched. A crash
 *      mid-call then leaves a pending row rather than silence. A spend with no
 *      record is the one failure the cost ledger cannot recover from.
 *   2. Guardrails run BEFORE a narrative is usable. A narrative that fails is
 *      still stored - it is evidence, and the operator may want to see what the
 *      model said - but `guardrail_passed` stays false and the report route
 *      refuses to embed it.
 *   3. The outcome row and the audit entry are written on every path,
 *      including failure. A generation that vanished is indistinguishable from
 *      one that never started.
 *
 * ONE `llm_calls` row per generation, not per attempt. `generateNarrative`
 * orchestrates its single retry internally and returns aggregate cost plus the
 * attempt count, which is what the cost view and the retry-rate metric need.
 * Per-attempt rows would mean threading a callback through the client for a
 * breakdown nobody has asked to see; `generations.attempts` already records
 * whether a retry happened.
 */

import 'server-only';

import { createHash } from 'node:crypto';

import type { SupabaseClient } from '@supabase/supabase-js';

import { scoreIntake } from '@klawfin/rubric';
import type { ScoreResult } from '@klawfin/rubric';
import {
  assessCoverage,
  checkContradictions,
  dimensionsRequiringConfidenceNote,
  notAssessedDimensionIds,
  unresolvedBlocking,
} from '@klawfin/validation';
import {
  assemblePrompt,
  generateNarrative,
  runGuardrails,
  stubNarrative,
  type GuardrailFinding,
  type NarrativeResponse,
  type PromptFacts,
} from '@klawfin/llm';

import { writeAudit, type AuditContext } from '../audit/log';
import { parseServerEnv } from '../config/env';
import type { Actor } from '../auth/session';
import type { Database, GenerationOutcome } from '../db/types';

type Db = SupabaseClient<Database>;

export interface RunGenerationInput {
  assessmentId: string;
  actor: Actor;
  audit: AuditContext;
}

export interface RunGenerationResult {
  ok: boolean;
  outcome: GenerationOutcome;
  narrativeId: string | null;
  guardrailPassed: boolean;
  blockingFindings: number;
  warningFindings: number;
  costPaise: number;
  attempts: number;
  /** Operator-facing. Rendered in the UI; never a raw exception string. */
  message: string;
  /** HTTP status the route should return. */
  status: number;
}

export async function runGeneration(
  db: Db,
  input: RunGenerationInput,
): Promise<RunGenerationResult> {
  const { assessmentId, actor, audit } = input;
  const env = parseServerEnv();

  /* --- Load ------------------------------------------------------------- */

  const { data: assessment } = await db
    .from('assessments')
    .select(
      'id, client_id, status, intake_data, intake_locked_at, rubric_version, coverage_override_reason, coverage_overridden_by, coverage_overridden_at, cost_cap_paise, cost_actual_paise',
    )
    .eq('id', assessmentId)
    .maybeSingle();

  if (!assessment) {
    return refuse('failed', 'Assessment not found.', 404);
  }
  if (!assessment.intake_locked_at) {
    return refuse(
      'failed',
      'Lock the intake before generating. Generating from an editable intake produces a narrative about numbers that can still change.',
      409,
    );
  }

  const { data: client } = await db
    .from('clients')
    .select('legal_name')
    .eq('id', assessment.client_id)
    .maybeSingle();

  if (!client) {
    return refuse('failed', 'Client not found.', 404);
  }

  /* --- Score and gate --------------------------------------------------- */

  const score = scoreIntake(assessment.intake_data);

  // Checked as at the LOCK time, not now: a date-relative check that changes
  // its answer between locking and generating would make the narrative
  // disagree with the score it is describing.
  const contradictionReport = checkContradictions(
    assessment.intake_data,
    new Date(assessment.intake_locked_at),
  );

  // Dismissals are an explicit human decision to proceed despite a check.
  const { data: dismissals } = await db
    .from('contradiction_dismissals')
    .select('code, reason, dismissed_by, dismissed_at')
    .eq('assessment_id', assessmentId);

  const blocking = unresolvedBlocking(
    contradictionReport,
    (dismissals ?? []).map((d) => ({
      code: d.code,
      reason: d.reason,
      dismissedBy: d.dismissed_by,
      dismissedAt: d.dismissed_at,
    })),
  );
  if (blocking.length > 0) {
    return refuse(
      'failed',
      `${blocking.length} blocking contradiction${
        blocking.length === 1 ? '' : 's'
      } must be resolved or dismissed with a reason before generating: ${blocking
        .map((c) => c.message)
        .join(' ')}`,
      409,
    );
  }

  const coverage = assessCoverage(
    score,
    assessment.coverage_override_reason
      ? {
          reason: assessment.coverage_override_reason,
          overriddenBy: assessment.coverage_overridden_by ?? actor.id,
          overriddenAt: assessment.coverage_overridden_at ?? new Date().toISOString(),
        }
      : null,
  );

  if (!coverage.canGenerate) {
    return refuse('failed', coverage.summary, 409);
  }

  /* --- Assemble --------------------------------------------------------- */

  const facts: PromptFacts = {
    clientName: client.legal_name,
    score,
    intake: assessment.intake_data,
    contradictions: contradictionReport.contradictions,
    notAssessedDimensionIds: notAssessedDimensionIds(score),
    dimensionsRequiringConfidenceNote: dimensionsRequiringConfidenceNote(score),
    preliminary: coverage.markPreliminary,
    truncationNotices: [],
  };

  await db.from('assessments').update({ status: 'generating' }).eq('id', assessmentId);

  await writeAudit(db, {
    ...audit,
    action: 'generation.started',
    entityType: 'assessment',
    entityId: assessmentId,
    clientId: assessment.client_id,
    metadata: {
      offline: env.DISABLE_LLM_GENERATION,
      model_id: env.DISABLE_LLM_GENERATION ? 'none' : env.ANTHROPIC_MODEL_ID,
      rubric_version: score.rubricVersion,
      composite: score.composite,
      coverage_pct: Math.round(score.overallCoverage * 100),
      preliminary: coverage.markPreliminary,
    },
  });

  /* --- Generate --------------------------------------------------------- */

  const produced = env.DISABLE_LLM_GENERATION
    ? offlineNarrative(facts)
    : await liveNarrative(db, {
        assessmentId,
        facts,
        modelId: env.ANTHROPIC_MODEL_ID,
        apiKey: env.ANTHROPIC_API_KEY,
        costCapPaise: assessment.cost_cap_paise || env.reportCostCapPaise,
        alreadySpentPaise: assessment.cost_actual_paise,
        usdInrRate: env.USD_INR_RATE,
      });

  if (!produced.ok) {
    await recordOutcome(db, {
      assessmentId,
      clientId: assessment.client_id,
      narrativeId: null,
      outcome: produced.outcome,
      attempts: produced.attempts,
      costPaise: produced.costPaise,
      latencyMs: produced.latencyMs,
      failureReason: produced.message,
      startedBy: actor.id,
      audit,
    });

    // Back to `scored`, not `failed`: the intake and the score are intact and
    // the operator can retry or export the fallback report. `failed` would
    // suggest the assessment itself is unusable, which it is not.
    await db
      .from('assessments')
      .update({
        status: 'scored',
        cost_actual_paise: assessment.cost_actual_paise + produced.costPaise,
      })
      .eq('id', assessmentId);

    return {
      ok: false,
      outcome: produced.outcome,
      narrativeId: null,
      guardrailPassed: false,
      blockingFindings: 0,
      warningFindings: 0,
      costPaise: produced.costPaise,
      attempts: produced.attempts,
      message: produced.useFallback
        ? `${produced.message} You can still export the fallback report, which carries the scores without a narrative.`
        : produced.message,
      status: produced.outcome === 'blocked_budget' ? 402 : 502,
    };
  }

  /* --- Guardrails ------------------------------------------------------- */

  const guardrails = runGuardrails(produced.response, score);

  await writeAudit(db, {
    ...audit,
    action: 'guardrail.evaluated',
    entityType: 'assessment',
    entityId: assessmentId,
    clientId: assessment.client_id,
    metadata: {
      passed: guardrails.passed,
      blocking: guardrails.blocking.length,
      warnings: guardrails.warnings.length,
      // Check names only. A finding excerpt would put narrative text about a
      // client into the audit table, which is exactly what it must not hold.
      checks_failed: [...new Set(guardrails.findings.map((f) => f.check))],
    },
  });

  /* --- Persist ---------------------------------------------------------- */

  const { data: previous } = await db
    .from('assessment_narratives')
    .select('version')
    .eq('assessment_id', assessmentId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  const version = (previous?.version ?? 0) + 1;

  const { data: narrativeRow, error: narrativeError } = await db
    .from('assessment_narratives')
    .insert({
      assessment_id: assessmentId,
      version,
      raw_response: produced.response,
      edited_response: null,
      edit_magnitude: {},
      model_id: produced.modelId,
      prompt_version: produced.promptVersion,
      rubric_version: score.rubricVersion,
      guardrail_findings: guardrails.findings as GuardrailFinding[],
      guardrail_passed: guardrails.passed,
      is_fallback: produced.isStub,
    })
    .select('id')
    .single();

  if (narrativeError || !narrativeRow) {
    await db.from('assessments').update({ status: 'scored' }).eq('id', assessmentId);
    return refuse('failed', 'The narrative was generated but could not be saved.', 500);
  }

  const outcome: GenerationOutcome = produced.isStub
    ? 'fallback'
    : guardrails.passed
      ? produced.attempts > 1
        ? 'success_after_retry'
        : 'success'
      : 'blocked_guardrail';

  await recordOutcome(db, {
    assessmentId,
    clientId: assessment.client_id,
    narrativeId: narrativeRow.id,
    outcome,
    attempts: produced.attempts,
    costPaise: produced.costPaise,
    latencyMs: produced.latencyMs,
    failureReason: guardrails.passed ? null : `${guardrails.blocking.length} blocking guardrail findings`,
    startedBy: actor.id,
    audit,
  });

  await db
    .from('assessments')
    .update({
      status: 'review',
      cost_actual_paise: assessment.cost_actual_paise + produced.costPaise,
    })
    .eq('id', assessmentId);

  return {
    ok: true,
    outcome,
    narrativeId: narrativeRow.id,
    guardrailPassed: guardrails.passed,
    blockingFindings: guardrails.blocking.length,
    warningFindings: guardrails.warnings.length,
    costPaise: produced.costPaise,
    attempts: produced.attempts,
    message: guardrails.passed
      ? produced.isStub
        ? 'Offline narrative assembled from the computed scores. It is marked as a fallback and cannot be embedded in a client report.'
        : 'Narrative generated and passed every guardrail. Review it before export.'
      : `Narrative generated but ${guardrails.blocking.length} guardrail check${
          guardrails.blocking.length === 1 ? '' : 's'
        } blocked it. It is saved for review and will not be embedded in a report until it passes.`,
    status: 200,
  };
}

/* -------------------------------------------------------------------------- */
/* Narrative production                                                       */
/* -------------------------------------------------------------------------- */

type Produced =
  | {
      ok: true;
      response: NarrativeResponse;
      modelId: string;
      promptVersion: string;
      costPaise: number;
      attempts: number;
      latencyMs: number | null;
      isStub: boolean;
    }
  | {
      ok: false;
      outcome: GenerationOutcome;
      message: string;
      costPaise: number;
      attempts: number;
      latencyMs: number | null;
      useFallback: boolean;
    };

/** No API call, no spend. See stub.ts for why this cannot reach a client. */
function offlineNarrative(facts: PromptFacts): Produced {
  const prompt = assemblePrompt(facts);
  return {
    ok: true,
    response: stubNarrative(facts),
    modelId: 'offline-stub',
    promptVersion: prompt.promptVersion,
    costPaise: 0,
    attempts: 0,
    latencyMs: 0,
    isStub: true,
  };
}

interface LiveInput {
  assessmentId: string;
  facts: PromptFacts;
  modelId: string;
  apiKey: string | undefined;
  costCapPaise: number;
  alreadySpentPaise: number;
  usdInrRate: number;
}

async function liveNarrative(db: Db, input: LiveInput): Promise<Produced> {
  if (!input.apiKey) {
    return {
      ok: false,
      outcome: 'failed',
      message:
        'ANTHROPIC_API_KEY is not configured. Set it, or set DISABLE_LLM_GENERATION=true to run offline.',
      costPaise: 0,
      attempts: 0,
      latencyMs: null,
      useFallback: true,
    };
  }

  const prompt = assemblePrompt(input.facts);

  // Rule 1 above: the ledger row exists before any money can be spent.
  const { data: ledger } = await db
    .from('llm_calls')
    .insert({
      assessment_id: input.assessmentId,
      purpose: 'narrative',
      model_id: input.modelId,
      max_tokens: 8_000,
      prompt_version: prompt.promptVersion,
      system_prompt_sha256: sha256(prompt.system),
      prompt_sha256: sha256(prompt.user),
      pricing_version: 'pricing-2026-09',
      usd_inr_rate: input.usdInrRate,
      status: 'pending',
    })
    .select('id')
    .single();

  const result = await generateNarrative({
    facts: input.facts,
    modelId: input.modelId,
    apiKey: input.apiKey,
    costCapPaise: input.costCapPaise,
    cumulativeCostPaise: input.alreadySpentPaise,
    usdInrRate: input.usdInrRate,
  });

  const costPaise = result.ok ? result.cost.totalPaise : (result.cost?.totalPaise ?? 0);

  if (ledger) {
    await db
      .from('llm_calls')
      .update({
        input_tokens: result.ok ? result.usage.inputTokens : 0,
        output_tokens: result.ok ? result.usage.outputTokens : 0,
        cache_creation_tokens: result.ok ? result.usage.cacheCreationTokens : 0,
        cache_read_tokens: result.ok ? result.usage.cacheReadTokens : 0,
        cost_paise: costPaise,
        latency_ms: result.ok ? result.latencyMs : null,
        attempt: result.attempts,
        status: result.ok ? 'complete' : 'failed',
        error_code: result.ok ? null : result.reason,
        completed_at: new Date().toISOString(),
      })
      .eq('id', ledger.id);
  }

  if (!result.ok) {
    return {
      ok: false,
      outcome: result.reason === 'budget_exceeded' ? 'blocked_budget' : 'failed',
      message: result.message,
      costPaise,
      attempts: result.attempts,
      latencyMs: null,
      useFallback: result.useFallback,
    };
  }

  return {
    ok: true,
    response: result.response,
    modelId: result.modelId,
    promptVersion: result.promptVersion,
    costPaise,
    attempts: result.attempts,
    latencyMs: result.latencyMs,
    isStub: false,
  };
}

/* -------------------------------------------------------------------------- */
/* Outcome recording                                                          */
/* -------------------------------------------------------------------------- */

interface OutcomeInput {
  assessmentId: string;
  clientId: string;
  narrativeId: string | null;
  outcome: GenerationOutcome;
  attempts: number;
  costPaise: number;
  latencyMs: number | null;
  failureReason: string | null;
  startedBy: string;
  audit: AuditContext;
}

async function recordOutcome(db: Db, input: OutcomeInput): Promise<void> {
  await db.from('generations').insert({
    assessment_id: input.assessmentId,
    narrative_id: input.narrativeId,
    outcome: input.outcome,
    attempts: input.attempts,
    total_cost_paise: input.costPaise,
    latency_ms: input.latencyMs,
    failure_reason: input.failureReason,
    truncation_notices: [],
    started_by: input.startedBy,
  });

  const succeeded =
    input.outcome === 'success' || input.outcome === 'success_after_retry' || input.outcome === 'fallback';

  await writeAudit(db, {
    ...input.audit,
    action: succeeded ? 'generation.completed' : 'generation.failed',
    entityType: 'assessment',
    entityId: input.assessmentId,
    clientId: input.clientId,
    metadata: {
      outcome: input.outcome,
      attempts: input.attempts,
      cost_paise: input.costPaise,
      latency_ms: input.latencyMs,
      // The reason is an operator-facing string built from check names and
      // counts, never from narrative or intake content.
      failure_reason: input.failureReason,
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function refuse(outcome: GenerationOutcome, message: string, status: number): RunGenerationResult {
  return {
    ok: false,
    outcome,
    narrativeId: null,
    guardrailPassed: false,
    blockingFindings: 0,
    warningFindings: 0,
    costPaise: 0,
    attempts: 0,
    message,
    status,
  };
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}
