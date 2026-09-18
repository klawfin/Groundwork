/**
 * Intake schema - the single authority on intake shape.
 *
 * Every field here traces to at least one rubric sub-criterion (PRD P1-03).
 * The executable mapping lives in `lib/rubric/mapping.ts`; this file defines
 * the shape and the validation rules.
 *
 * Three rules govern what may be collected:
 *
 * 1. PURPOSE LIMITATION (PRD 10.4, architecture 3.7). If a field cannot be
 *    traced to a sub-criterion, it does not belong on the form.
 * 2. NO THIRD-PARTY PII (architecture 3.5). Cap-table holders other than the
 *    client's own founders are stored as refs - 'A1', 'ESOP' - never names.
 *    Storing an angel investor's name would make Klawfin a Data Fiduciary for
 *    a person who never interacted with Klawfin and cannot practically be
 *    served a notice.
 * 3. NO SENSITIVE PERSONAL DATA, EVER. No ID numbers, no bank details, no
 *    dates of birth, no personal contact details for anyone but the single
 *    primary contact on the client record.
 *
 * Every field is optional. Intake is a resumable draft (PRD P1-03); coverage,
 * not validation, is what gates generation.
 */

import { z } from 'zod';

/** Bumped when the intake shape changes. Stored on every assessment. */
export const INTAKE_SCHEMA_VERSION = '1.0.0';

/** PRD 8.6 / P1-03: hard cap per free-text field, enforced in UI and server-side. */
export const FREE_TEXT_MAX = 1500;

/** Free text with the PRD's character cap. Truncation is never silent (PRD 8.6). */
const freeText = (max: number = FREE_TEXT_MAX) => z.string().trim().max(max).optional().nullable();

/** A short single-line string. */
const shortText = (max = 200) => z.string().trim().max(max).optional().nullable();

/** Non-negative money amount. Stored in the currency named alongside it. */
const money = () => z.number().finite().min(0).optional().nullable();

/** A count of things. Integer, non-negative. */
const count = () => z.number().int().min(0).optional().nullable();

/**
 * A percentage 0-100. Values outside the range warn rather than block
 * (PRD 8.5) - a real outlier exists - except where a contradiction check
 * classifies it as impossible.
 */
const percent = () => z.number().finite().optional().nullable();

/** Basis points: 10000 = 100%. Integers, never floats (architecture 3.1). */
const basisPoints = () => z.number().int().min(0).max(10000).optional().nullable();

const isoDate = () =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
    .optional()
    .nullable();

const isoMonth = () => z.string().regex(/^\d{4}-\d{2}$/, 'Expected YYYY-MM');

/* -------------------------------------------------------------------------- */
/* Enums                                                                      */
/* -------------------------------------------------------------------------- */

export const PRODUCT_STAGES = ['idea', 'prototype', 'beta', 'live', 'scaling'] as const;
export const productStageSchema = z.enum(PRODUCT_STAGES);
export type ProductStage = z.infer<typeof productStageSchema>;

export const SIZING_METHODS = ['none', 'top_down', 'mixed', 'bottom_up'] as const;
export const ENTITY_TYPES = [
  'not_incorporated',
  'sole_proprietorship',
  'partnership',
  'llp',
  'private_limited',
  'c_corp',
  'other',
] as const;

export const COMPLIANCE_STATES = ['current', 'minor_lapses', 'material_lapses', 'unknown'] as const;
export const TRI_STATE = ['yes', 'partial', 'no'] as const;
export const DATA_ROOM_INDEX_QUALITY = ['indexed_current', 'indexed_stale', 'unindexed', 'none'] as const;

/** Holder categories. Deliberately structural - see architecture 3.5. */
export const HOLDER_CATEGORIES = [
  'founder',
  'inactive_founder',
  'angel',
  'institutional',
  'esop_pool',
  'advisor',
  'other',
] as const;

/* -------------------------------------------------------------------------- */
/* D1 - Team                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * A founder of the client company.
 *
 * Founder names ARE collected: the report is addressed to the company about
 * itself and the engagement letter covers them (PRD 10.4). Nothing beyond
 * name, role and professional background is collected - no contact details,
 * no ID numbers, no date of birth.
 */
export const founderSchema = z.object({
  /** Display name, used in the report. Optional - a ref works just as well. */
  name: shortText(120),
  role: shortText(120),
  background: freeText(),
  years_in_sector: z.number().finite().min(0).max(80).optional().nullable(),
  full_time: z.boolean().optional().nullable(),
  /** Free text: "consulting two days a week", "finishing a PhD until June". */
  other_commitments: freeText(400),
});

export const teamSchema = z.object({
  founders: z.array(founderSchema).max(10).default([]),
  founder_market_fit_notes: freeText(),
  has_technical_cofounder: z.boolean().optional().nullable(),
  key_hires: freeText(),
  open_critical_roles: z.array(shortText(120)).max(20).optional().nullable(),
  prior_ventures: freeText(),
  shipping_history: freeText(),
  notable_deliveries_last_12m: freeText(),
  key_person_dependencies: freeText(),
  advisors: freeText(),
  advisor_engagement_depth: freeText(400),
});

/* -------------------------------------------------------------------------- */
/* D2 - Market                                                                */
/* -------------------------------------------------------------------------- */

export const competitorSchema = z.object({
  /** A company name - a business identifier, not personal data. */
  name: shortText(120),
  /** 'direct' | 'indirect' | 'status_quo' - status quo is the one founders forget. */
  kind: z.enum(['direct', 'indirect', 'status_quo']).optional().nullable(),
  note: freeText(400),
});

export const marketSchema = z.object({
  icp_description: freeText(),
  icp_named_examples: z.array(shortText(120)).max(50).optional().nullable(),
  tam: money(),
  sam: money(),
  som: money(),
  market_currency: z.string().length(3).default('INR').optional(),
  sizing_method: z.enum(SIZING_METHODS).optional().nullable(),
  sizing_sources: freeText(),
  why_now_narrative: freeText(),
  market_shift_evidence: freeText(),
  competitors: z.array(competitorSchema).max(30).default([]),
  differentiation_claim: freeText(),
  competitor_pricing_known: z.boolean().optional().nullable(),
});

/* -------------------------------------------------------------------------- */
/* D3 - Traction                                                              */
/* -------------------------------------------------------------------------- */

export const monthlyValueSchema = z.object({
  month: isoMonth(),
  value: z.number().finite().min(0),
});

export const tractionSchema = z.object({
  mrr_current: money(),
  arr_current: money(),
  revenue_currency: z.string().length(3).default('INR').optional(),
  revenue_recognition_basis: freeText(400),
  mrr_by_month: z.array(monthlyValueSchema).max(60).default([]),
  growth_rate_calc: freeText(400),
  paying_customers_count: count(),
  logos_referenceable: count(),
  lois_signed: count(),
  pilots_running: count(),
  churn_rate: percent(),
  retention_cohorts_available: z.boolean().optional().nullable(),
  repeat_purchase_rate: percent(),
  /** Net revenue retention. May legitimately exceed 100 (PRD 8.3). */
  nrr: percent(),
  pipeline_value: money(),
  pipeline_stage_breakdown: freeText(),
  avg_sales_cycle_days: z.number().int().min(0).max(2000).optional().nullable(),

  /* Pre-revenue substitute ladder inputs (PRD 8.4). */
  preorders_count: count(),
  waitlist_with_payment_intent: count(),
  leading_indicator_name: shortText(120),
  leading_indicator_by_month: z.array(monthlyValueSchema).max(60).default([]),
  discovery_interviews_count: count(),
  named_targets_engaged: count(),
  design_partners_committed: count(),
  beta_repeat_usage_rate: percent(),
  pilot_engagement_notes: freeText(),
  named_prospects: count(),
  prospect_stage_breakdown: freeText(),
});

/* -------------------------------------------------------------------------- */
/* D4 - Product                                                               */
/* -------------------------------------------------------------------------- */

export const productSchema = z.object({
  product_stage: productStageSchema.optional().nullable(),
  live_users_count: count(),
  problem_statement: freeText(),
  solution_statement: freeText(),
  customer_quote_evidence: freeText(),
  cac: money(),
  ltv: money(),
  gross_margin_pct: percent(),
  contribution_margin: percent(),
  /** How CAC and LTV were derived. 'actuals' vs 'modelled' is the whole question. */
  unit_econ_basis: freeText(),
  pricing_model: shortText(200),
  price_points: freeText(400),
  pricing_rationale: freeText(),
  discount_practice: freeText(400),
  moat_claim: freeText(),
  moat_evidence: freeText(),
  ip_filed: z.boolean().optional().nullable(),
});

/* -------------------------------------------------------------------------- */
/* D5 - Cap table and legal                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A cap-table holder, stored structurally.
 *
 * NO NAMES. `ref` is an opaque label Dhruv assigns: 'F1', 'F2', 'A1', 'ESOP'.
 * The rubric scores structure, not identity: "a non-operational founder holds
 * 12% fully diluted with no vesting" is exactly the red flag D5.2 exists to
 * catch, and it scores identically whether or not the person is named.
 *
 * See architecture 3.5 and docs/decisions/0006-cap-table-pii.md.
 */
export const capTableHolderSchema = z.object({
  ref: z
    .string()
    .trim()
    .min(1)
    .max(16)
    .regex(/^[A-Za-z0-9_-]+$/, 'Use a ref such as F1, A1 or ESOP - never a person name'),
  category: z.enum(HOLDER_CATEGORIES),
  equity_bp: z.number().int().min(0).max(10000),
  /** Only meaningful for the ESOP pool row. */
  allocated_bp: basisPoints(),
  vesting: z.enum(['4y_1y_cliff', 'other_with_cliff', 'no_cliff', 'none', 'unknown']).optional().nullable(),
  instrument: shortText(60),
  /** Is this holder operationally involved? A 'no' on a founder row is dead equity. */
  is_operational: z.boolean().optional().nullable(),
});

export const capTableSchema = z.object({
  as_of: isoDate(),
  fully_diluted: z.boolean().optional().nullable(),
  holders: z.array(capTableHolderSchema).max(60).default([]),
  esop_pool_bp: basisPoints(),
  dead_equity_flag: z.boolean().optional().nullable(),
  related_party_terms: freeText(400),
});

export const capTableLegalSchema = z.object({
  entity_type: z.enum(ENTITY_TYPES).optional().nullable(),
  incorporation_date: isoDate(),
  jurisdiction: z.string().trim().length(2).optional().nullable(),
  structure_matches_raise_intent: z.enum(TRI_STATE).optional().nullable(),
  cap_table: capTableSchema.default({ holders: [] }),
  founder_vesting_in_place: z.enum(TRI_STATE).optional().nullable(),
  vesting_schedule: shortText(120),
  cliff: shortText(60),
  ip_assignment_signed: z.enum(TRI_STATE).optional().nullable(),
  employment_agreements_in_place: z.enum(TRI_STATE).optional().nullable(),
  contractor_ip_terms: z.enum(TRI_STATE).optional().nullable(),
  roc_filings_current: z.enum(COMPLIANCE_STATES).optional().nullable(),
  gst_status: z.enum(COMPLIANCE_STATES).optional().nullable(),
  tds_status: z.enum(COMPLIANCE_STATES).optional().nullable(),
  /** SHA / SSA completeness for any prior round. */
  prior_round_docs: z.enum(['complete', 'partial', 'missing', 'no_prior_round']).optional().nullable(),
  fema_fdi_compliance: z.enum(['clean', 'issues', 'not_applicable', 'unknown']).optional().nullable(),
  data_room_exists: z.boolean().optional().nullable(),
  data_room_completeness_pct: percent(),
  data_room_index_quality: z.enum(DATA_ROOM_INDEX_QUALITY).optional().nullable(),
  /**
   * Reviewed under a shorter retention window - it is the one field where a
   * name may legitimately appear (architecture 3.5).
   */
  legal_notes: freeText(),
});

/* -------------------------------------------------------------------------- */
/* D6 - Ask                                                                   */
/* -------------------------------------------------------------------------- */

export const useOfFundsLineSchema = z.object({
  category: shortText(80),
  pct: z.number().finite().min(0).max(100),
  headcount: count(),
  note: freeText(300),
});

export const milestoneSchema = z.object({
  description: shortText(300),
  /** A milestone with no target date is an aspiration (anchor 1 on D6.3). */
  target_date: isoDate(),
  measurable: z.boolean().optional().nullable(),
});

export const askSchema = z.object({
  ask_amount: money(),
  ask_currency: z.string().length(3).default('INR').optional(),
  current_burn_monthly: money(),
  current_runway_months: z.number().finite().min(0).max(240).optional().nullable(),
  target_runway_months: z.number().finite().min(0).max(240).optional().nullable(),
  use_of_funds_breakdown: z.array(useOfFundsLineSchema).max(20).default([]),
  milestones_this_round: z.array(milestoneSchema).max(20).default([]),
  next_round_criteria: freeText(),
  valuation_expectation: money(),
  instrument_type: shortText(80),
  comparable_basis: freeText(),
});

/* -------------------------------------------------------------------------- */
/* Judgments - Dhruv's anchor selections                                      */
/* -------------------------------------------------------------------------- */

/**
 * For `anchored` sub-criteria, Dhruv selects the 0-4 level against the printed
 * anchor text. He is the assessor; the tool is the instrument.
 *
 * This is still deterministic scoring: the selection is stored intake data, so
 * the same intake yields the same score forever (PRD G2). It is emphatically
 * not the LLM scoring - the model never sees an anchor selection it can change
 * (PRD NG9).
 *
 * `na_reason` may be set on ANY sub-criterion, derived or anchored, and
 * removes it from numerator and denominator (PRD 5.4).
 */
export const judgmentSchema = z.object({
  anchor: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional().nullable(),
  /** Required to mark N/A. Stored and made available to the LLM (PRD 5.4). */
  na_reason: z.string().trim().min(3).max(300).optional().nullable(),
  /**
   * Why this level. Feeds the model as evidence so criticism can name the
   * specific input that prompted it (PRD 6.3).
   */
  evidence_note: freeText(),
});

export type Judgment = z.infer<typeof judgmentSchema>;

/* -------------------------------------------------------------------------- */
/* The whole intake                                                           */
/* -------------------------------------------------------------------------- */

export const intakeSchema = z.object({
  schema_version: z.string().default(INTAKE_SCHEMA_VERSION),
  team: teamSchema.default({ founders: [] }),
  market: marketSchema.default({ competitors: [] }),
  traction: tractionSchema.default({ mrr_by_month: [], leading_indicator_by_month: [] }),
  product: productSchema.default({}),
  cap_table_legal: capTableLegalSchema.default({ cap_table: { holders: [] } }),
  ask: askSchema.default({ use_of_funds_breakdown: [], milestones_this_round: [] }),
  /** Keyed by sub-criterion id: 'D1.1', 'D5.2', ... */
  judgments: z.record(z.string(), judgmentSchema).default({}),
  /**
   * Out-of-range values that warned but were kept (PRD P1-03). Recorded so the
   * warning text travels with the intake and reaches the model.
   */
  accepted_warnings: z.array(z.string().max(300)).max(100).default([]),
});

export type Intake = z.infer<typeof intakeSchema>;
export type Team = z.infer<typeof teamSchema>;
export type Market = z.infer<typeof marketSchema>;
export type Traction = z.infer<typeof tractionSchema>;
export type Product = z.infer<typeof productSchema>;
export type CapTableLegal = z.infer<typeof capTableLegalSchema>;
export type CapTableHolder = z.infer<typeof capTableHolderSchema>;
export type Ask = z.infer<typeof askSchema>;

/** An empty intake, used to seed a new assessment draft. */
export function emptyIntake(): Intake {
  return intakeSchema.parse({});
}

/**
 * Parse untrusted intake. Used at every write boundary - Server Actions
 * included, not only API routes (architecture ADR-005: with JSONB storage,
 * zod validation is the ONLY thing standing between a bug and bad data).
 */
export function parseIntake(input: unknown): Intake {
  return intakeSchema.parse(input);
}

/**
 * Truncate every free-text field to FREE_TEXT_MAX, reporting what was cut.
 *
 * Server-side second line of defence behind the UI counter (PRD 8.6). The
 * caller writes the returned notices to the audit entry - truncation is never
 * silent.
 */
export function truncateFreeText(intake: Intake): { intake: Intake; truncated: string[] } {
  const truncated: string[] = [];

  const walk = (node: unknown, path: string): unknown => {
    if (typeof node === 'string') {
      if (node.length > FREE_TEXT_MAX) {
        truncated.push(`${path} truncated from ${node.length} to ${FREE_TEXT_MAX} characters`);
        return node.slice(0, FREE_TEXT_MAX);
      }
      return node;
    }
    if (Array.isArray(node)) return node.map((v, i) => walk(v, `${path}[${i}]`));
    if (node && typeof node === 'object') {
      return Object.fromEntries(
        Object.entries(node as Record<string, unknown>).map(([k, v]) => [
          k,
          walk(v, path ? `${path}.${k}` : k),
        ]),
      );
    }
    return node;
  };

  return { intake: walk(intake, '') as Intake, truncated };
}
