/**
 * Database types.
 *
 * Hand-written to match `supabase/migrations/`. In a longer-lived project
 * these would be generated (`supabase gen types typescript`), and switching to
 * generation later is a drop-in replacement for this file.
 *
 * Kept deliberately narrow: only the tables and columns the application
 * actually reads or writes. A type that claims to describe the whole schema
 * and silently drifts from it is worse than one that covers less.
 */

import type { Intake } from '@klawfin/core';
import type { DimensionResult, SubCriterionResult } from '@klawfin/rubric';
import type { GuardrailFinding, NarrativeResponse } from '@klawfin/llm';
import type { Contradiction } from '@klawfin/validation';

export type UserRole = 'owner' | 'analyst' | 'viewer';
export type ClientSource = 'internal' | 'self_serve';
export type AssessmentStatus =
  | 'draft'
  | 'intake_locked'
  | 'scored'
  | 'generating'
  | 'review'
  | 'delivered'
  | 'abandoned'
  | 'failed';
export type ReportTier = 'summary' | 'full';
export type LlmPurpose = 'narrative' | 'repair';
export type RetentionPolicy = 'standard_24m' | 'short_90d' | 'legal_hold';
export type GenerationOutcome =
  | 'success'
  | 'success_after_retry'
  | 'fallback'
  | 'blocked_budget'
  | 'blocked_guardrail'
  | 'failed';

/**
 * Row types are `type` aliases, NOT interfaces, and that is load-bearing.
 *
 * supabase-js requires `Row: Record<string, unknown>`. A TypeScript interface
 * has no implicit index signature and is therefore not assignable to that; a
 * type alias is. Converting these to interfaces makes every query resolve to
 * `never`, which surfaces as "Property 'id' does not exist on type 'never'"
 * far from the actual cause.
 */
export type AppUserRow = {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  is_active: boolean;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

export type ClientRow = {
  id: string;
  legal_name: string;
  brand_name: string | null;
  website_url: string | null;
  sector: string | null;
  stage: string | null;
  incorporation_country: string | null;
  cin_or_reg_no: string | null;
  primary_contact_name: string;
  primary_contact_email: string;
  primary_contact_phone: string | null;
  engagement_type: string;
  engagement_start_date: string | null;
  source: ClientSource;
  created_by: string;
  consent_version: string | null;
  consent_at: string | null;
  retention: RetentionPolicy;
  purge_after: string | null;
  archived_at: string | null;
  deleted_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type AssessmentRow = {
  id: string;
  client_id: string;
  status: AssessmentStatus;
  rubric_version: string;
  intake_schema_version: string;
  intake_data: Intake;
  intake_locked_at: string | null;
  ask_amount_paise: number | null;
  ask_currency: string | null;
  round_stage: string | null;
  composite_score: number | null;
  composite_exact: number | null;
  composite_band: string | null;
  overall_coverage: number | null;
  overall_confidence: string | null;
  pre_revenue_mode: boolean;
  weight_redistributed: boolean;
  coverage_override_reason: string | null;
  coverage_overridden_by: string | null;
  coverage_overridden_at: string | null;
  cost_cap_paise: number;
  cost_actual_paise: number;
  created_by: string;
  delivered_at: string | null;
  purge_after: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Mirrors `DimensionResult`, flattened for storage. */
export type AssessmentScoreRow = {
  id: string;
  assessment_id: string;
  dimension_id: string;
  dimension_name: string;
  pct: number;
  raw: number;
  max_points: number;
  weight: number;
  defined_weight: number;
  weighted_contribution: number;
  coverage: number;
  confidence: string;
  low_confidence_from_na: boolean;
  entirely_not_applicable: boolean;
  not_assessed: boolean;
  sub_criteria: SubCriterionResult[];
  computed_at: string;
}

export type AssessmentNarrativeRow = {
  id: string;
  assessment_id: string;
  version: number;
  /** Retained UNMODIFIED. Metric M4 diffs against this (PRD P1-07). */
  raw_response: NarrativeResponse;
  edited_response: NarrativeResponse | null;
  edit_magnitude: Record<string, number>;
  model_id: string;
  prompt_version: string;
  rubric_version: string;
  guardrail_findings: GuardrailFinding[];
  guardrail_passed: boolean;
  is_fallback: boolean;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
}

export type ReportRow = {
  id: string;
  assessment_id: string;
  narrative_id: string;
  version: number;
  tier: ReportTier;
  storage_bucket: string;
  storage_path: string;
  byte_size: number;
  sha256: string;
  composite_score: number;
  rubric_version: string;
  prompt_version: string;
  generator_version: string;
  is_preliminary: boolean;
  has_incomplete_watermark: boolean;
  generated_by: string;
  generated_at: string;
  download_count: number;
  last_downloaded_at: string | null;
  purge_after: string | null;
  purged_at: string | null;
}

export type LlmCallRow = {
  id: string;
  assessment_id: string | null;
  purpose: LlmPurpose;
  model_id: string;
  max_tokens: number;
  prompt_version: string;
  system_prompt_sha256: string;
  prompt_sha256: string;
  request_body: unknown | null;
  response_body: unknown | null;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  cost_paise: number;
  pricing_version: string;
  usd_inr_rate: number;
  latency_ms: number | null;
  attempt: number;
  stop_reason: string | null;
  error_code: string | null;
  status: string;
  anthropic_request_id: string | null;
  created_at: string;
  completed_at: string | null;
}

export type GenerationRow = {
  id: string;
  assessment_id: string;
  narrative_id: string | null;
  outcome: GenerationOutcome;
  attempts: number;
  total_cost_paise: number;
  latency_ms: number | null;
  failure_reason: string | null;
  truncation_notices: string[];
  started_by: string;
  created_at: string;
}

export type ContradictionDismissalRow = {
  id: string;
  assessment_id: string;
  code: string;
  reason: string;
  dismissed_by: string;
  dismissed_at: string;
}

export type AuditLogRow = {
  id: number;
  occurred_at: string;
  actor_user_id: string | null;
  actor_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  client_id: string | null;
  ip: string | null;
  user_agent: string | null;
  request_id: string | null;
  /** NEVER raw intake values (architecture 5.7). */
  metadata: Record<string, unknown>;
  created_at: string;
}

/**
 * Shape supabase-js expects for a table.
 *
 * `Insert` omits server-defaulted columns and makes the rest optional, which
 * matches how these tables are actually written: ids, timestamps and counters
 * come from the database, never from the application.
 */
type ServerManaged = 'id' | 'created_at' | 'updated_at';

type Table<Row> = {
  Row: Row;
  Insert: Partial<Omit<Row, ServerManaged>> & Partial<Pick<Row, Extract<ServerManaged, keyof Row>>>;
  Update: Partial<Row>;
  Relationships: [];
};

/** Idiomatic empty map for the schema slots this project does not use. */
type Empty = { [_ in never]: never };

export interface Database {
  public: {
    Tables: {
      app_users: Table<AppUserRow>;
      clients: Table<ClientRow>;
      assessments: Table<AssessmentRow>;
      assessment_scores: Table<AssessmentScoreRow>;
      assessment_narratives: Table<AssessmentNarrativeRow>;
      reports: Table<ReportRow>;
      llm_calls: Table<LlmCallRow>;
      generations: Table<GenerationRow>;
      contradiction_dismissals: Table<ContradictionDismissalRow>;
      audit_log: Table<AuditLogRow>;
    };
    Views: Empty;
    Functions: Empty;
    Enums: {
      user_role: UserRole;
      client_source: ClientSource;
      assessment_status: AssessmentStatus;
      report_tier: ReportTier;
      llm_purpose: LlmPurpose;
      retention_policy: RetentionPolicy;
      generation_outcome: GenerationOutcome;
    };
    CompositeTypes: Empty;
  };
}

/** Re-exported for convenience at call sites. */
export type { DimensionResult, Contradiction };
