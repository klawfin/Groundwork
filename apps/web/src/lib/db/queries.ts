/**
 * Data access for the intake -> score flow.
 *
 * Plain functions taking an RLS-bound client. No repository class, no generic
 * query layer: every caller here is a Server Action with one job.
 *
 * All reads and writes use the SESSION-BOUND client so RLS does the
 * authorisation. The admin client is never used from this module.
 */

import { INTAKE_SCHEMA_VERSION, parseIntake, type Intake } from '@klawfin/core';
import { RUBRIC_VERSION, type ScoreResult } from '@klawfin/rubric';
import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  AssessmentRow,
  AssessmentScoreRow,
  AssessmentStatus,
  ClientRow,
  Database,
} from './types';

type Db = SupabaseClient<Database>;

/** Supabase errors carry structure the UI must not see. Narrow them here. */
function fail(context: string, message: string): never {
  throw new Error(`${context}: ${message}`);
}

/* -------------------------------------------------------------------------- */
/* Clients (P1-02)                                                            */
/* -------------------------------------------------------------------------- */

export interface NewClient {
  legalName: string;
  primaryContactName: string;
  primaryContactEmail: string;
  sector?: string | null;
  stage?: string | null;
  notes?: string | null;
}

export async function createClient(db: Db, input: NewClient, createdBy: string): Promise<ClientRow> {
  const { data, error } = await db
    .from('clients')
    .insert({
      legal_name: input.legalName,
      primary_contact_name: input.primaryContactName,
      primary_contact_email: input.primaryContactEmail,
      sector: input.sector ?? null,
      stage: input.stage ?? null,
      notes: input.notes ?? null,
      created_by: createdBy,
    })
    .select()
    .single();

  if (error) fail('Could not create the client record', error.message);
  return data as ClientRow;
}

/** Client list, newest first. Archived and deleted rows are excluded by RLS. */
export async function listClients(db: Db): Promise<ClientRow[]> {
  const { data, error } = await db
    .from('clients')
    .select()
    .is('archived_at', null)
    .order('created_at', { ascending: false });

  if (error) fail('Could not load clients', error.message);
  return (data ?? []) as ClientRow[];
}

export async function getClient(db: Db, clientId: string): Promise<ClientRow | null> {
  const { data, error } = await db.from('clients').select().eq('id', clientId).maybeSingle();
  if (error) fail('Could not load the client', error.message);
  return (data as ClientRow | null) ?? null;
}

/**
 * Existing clients whose name matches, case-insensitively and with whitespace
 * normalised (P1-02).
 *
 * Duplicate creation WARNS and requires confirmation; it does not block. So
 * this returns the matches and lets the caller decide.
 */
export async function findClientsByName(db: Db, legalName: string): Promise<ClientRow[]> {
  const normalised = legalName.trim().replace(/\s+/g, ' ');
  const { data, error } = await db.from('clients').select().ilike('legal_name', normalised);
  if (error) fail('Could not check for duplicate clients', error.message);
  return (data ?? []) as ClientRow[];
}

/* -------------------------------------------------------------------------- */
/* Assessments (P1-03, P1-04)                                                 */
/* -------------------------------------------------------------------------- */

export async function createAssessment(
  db: Db,
  clientId: string,
  createdBy: string,
): Promise<AssessmentRow> {
  const { data, error } = await db
    .from('assessments')
    .insert({
      client_id: clientId,
      created_by: createdBy,
      status: 'draft',
      // Stamped now so a historical score stays interpretable after either
      // version moves on (PRD 5.7).
      rubric_version: RUBRIC_VERSION,
      intake_schema_version: INTAKE_SCHEMA_VERSION,
    })
    .select()
    .single();

  if (error) fail('Could not start the assessment', error.message);
  return data as AssessmentRow;
}

export async function getAssessment(db: Db, assessmentId: string): Promise<AssessmentRow | null> {
  const { data, error } = await db
    .from('assessments')
    .select()
    .eq('id', assessmentId)
    .maybeSingle();

  if (error) fail('Could not load the assessment', error.message);
  return (data as AssessmentRow | null) ?? null;
}

/**
 * Every assessment for one client, newest first.
 *
 * Without this the client page is a dead end: an assessment started and
 * navigated away from is only reachable by remembering its URL.
 */
export async function listAssessments(db: Db, clientId: string): Promise<AssessmentRow[]> {
  const { data, error } = await db
    .from('assessments')
    .select()
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) fail('Could not load assessments', error.message);
  return (data as AssessmentRow[] | null) ?? [];
}

/**
 * Save an intake draft (P1-03: autosave, resumable across devices).
 *
 * Zod-parses before writing. With JSONB storage there is no database-level
 * constraint on intake contents, so this validation is the only thing standing
 * between a bug and bad data (architecture ADR-005).
 *
 * Refuses to write once the intake is locked: scores stop meaning anything if
 * the input behind them can still change.
 */
export async function saveIntake(db: Db, assessmentId: string, intake: unknown): Promise<Intake> {
  const parsed = parseIntake(intake);

  const { data, error } = await db
    .from('assessments')
    .update({ intake_data: parsed })
    .eq('id', assessmentId)
    .is('intake_locked_at', null)
    .select('id')
    .maybeSingle();

  if (error) fail('Could not save the intake', error.message);
  if (!data) {
    throw new Error(
      'This intake is locked and can no longer be edited. Start a new assessment to reassess this client.',
    );
  }
  return parsed;
}

/**
 * Lock the intake and persist the computed score.
 *
 * The score is computed by the CALLER using @klawfin/rubric and passed in.
 * This function does no scoring of its own - keeping the arithmetic in the
 * pure package is the whole point of decision 0002.
 */
export async function lockIntakeAndSaveScore(
  db: Db,
  assessmentId: string,
  score: ScoreResult,
): Promise<void> {
  const { error: assessmentError } = await db
    .from('assessments')
    .update({
      status: 'scored',
      intake_locked_at: new Date().toISOString(),
      composite_score: score.composite,
      composite_exact: score.compositeExact,
      composite_band: score.band.id,
      overall_coverage: score.overallCoverage,
      overall_confidence: score.overallConfidence,
      pre_revenue_mode: score.preRevenueMode,
      weight_redistributed: score.weightRedistributed,
    })
    .eq('id', assessmentId);

  if (assessmentError) fail('Could not lock the intake', assessmentError.message);

  const { error: scoreError } = await db
    .from('assessment_scores')
    .upsert(toScoreRows(assessmentId, score), { onConflict: 'assessment_id,dimension_id' });

  if (scoreError) fail('Could not save the dimension scores', scoreError.message);
}

export async function getScores(db: Db, assessmentId: string): Promise<AssessmentScoreRow[]> {
  const { data, error } = await db
    .from('assessment_scores')
    .select()
    .eq('assessment_id', assessmentId)
    .order('dimension_id');

  if (error) fail('Could not load the scores', error.message);
  return (data ?? []) as AssessmentScoreRow[];
}

/**
 * Map a computed score to its storage rows. PURE - unit tested.
 *
 * This is the only part of this module with logic worth testing; everything
 * else is a thin wrapper around a single query.
 */
export function toScoreRows(
  assessmentId: string,
  score: ScoreResult,
): Omit<AssessmentScoreRow, 'id' | 'computed_at'>[] {
  return score.dimensions.map((d) => ({
    assessment_id: assessmentId,
    dimension_id: d.id,
    dimension_name: d.name,
    pct: d.pct,
    raw: d.raw,
    max_points: d.max,
    weight: d.weight,
    defined_weight: d.definedWeight,
    weighted_contribution: d.weightedContribution,
    coverage: d.coverage,
    confidence: d.confidence,
    low_confidence_from_na: d.lowConfidenceFromNa,
    entirely_not_applicable: d.entirelyNotApplicable,
    not_assessed: d.notAssessed,
    // Retaining the per-sub-criterion derivation is what lets Dhruv answer
    // "why did I score 2 on cap table hygiene" from the record alone (PRD G3).
    sub_criteria: [...d.subCriteria],
  }));
}

/* -------------------------------------------------------------------------- */
/* Pipeline (overview)                                                        */
/* -------------------------------------------------------------------------- */

/** One engagement's position in the pipeline, joined to the company name. */
export interface PipelineRow {
  assessmentId: string;
  clientId: string;
  clientName: string;
  status: AssessmentStatus;
  composite: number | null;
  band: string | null;
  coverage: number | null;
  /** Coverage below the gate was accepted with a written reason (PRD 8.1). */
  coverageOverridden: boolean;
  costPaise: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Every assessment the caller may see, with its client's name.
 *
 * TWO QUERIES AND A JOIN IN MEMORY, not a PostgREST embed. An embed would be
 * one round trip, but the row types in `types.ts` describe flat tables and an
 * embedded object has no type to stand on - the call site would end up casting,
 * which is how `intake_data` came to be typed as something it was not. At one
 * operator and tens of rows the extra round trip is not measurable.
 *
 * RLS scopes both halves, so this needs no filtering of its own beyond
 * excluding soft-deleted and archived records.
 */
export async function listPipeline(db: Db): Promise<PipelineRow[]> {
  const [assessments, clients] = await Promise.all([
    db
      .from('assessments')
      .select(
        'id, client_id, status, composite_score, composite_band, overall_coverage, coverage_override_reason, cost_actual_paise, created_at, updated_at',
      )
      .is('deleted_at', null)
      .order('updated_at', { ascending: false }),
    db.from('clients').select('id, legal_name').is('archived_at', null).is('deleted_at', null),
  ]);

  if (assessments.error) fail('Could not load the pipeline', assessments.error.message);
  if (clients.error) fail('Could not load clients for the pipeline', clients.error.message);

  const nameOf = new Map((clients.data ?? []).map((c) => [c.id, c.legal_name]));

  return (assessments.data ?? [])
    // An assessment whose client is archived is not dropped by RLS, only by
    // this join. Dropping it is right: the overview answers "what needs doing",
    // and an archived engagement needs nothing.
    .filter((row) => nameOf.has(row.client_id))
    .map((row) => ({
      assessmentId: row.id,
      clientId: row.client_id,
      clientName: nameOf.get(row.client_id)!,
      status: row.status,
      composite: row.composite_score,
      band: row.composite_band,
      coverage: row.overall_coverage,
      coverageOverridden: row.coverage_override_reason !== null,
      costPaise: row.cost_actual_paise ?? 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
}
