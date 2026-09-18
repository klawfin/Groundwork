/**
 * LLM response schema (PRD 6.4).
 *
 * PRD OPEN-04 asks: enforce with the API's structured-output mechanism, or
 * generate JSON and validate with Zod? PROPOSED answer: both. This file is the
 * resolution - the Zod schema below is passed to the API through
 * `zodOutputFormat()` so generation is constrained, AND the same schema
 * validates the response on receipt.
 *
 * "The API mechanism may change; the validator is the contract." (PRD OPEN-04)
 *
 * Note what is NOT in this schema: any score, any percentage, any composite.
 * The model receives computed scores as facts and writes about them. A field
 * here that invited a number would be a hole in PRD NG9.
 */

import { z } from 'zod';
import { DIMENSION_IDS } from '@klawfin/rubric';

/** Bumped on any prompt or schema change. Stored on every report (PRD 6.7). */
export const PROMPT_VERSION = '1.0.0';

const nonEmpty = (max: number) => z.string().trim().min(1).max(max);

export const effortSchema = z.enum(['low', 'medium', 'high']);

export const gapSchema = z.object({
  gap: nonEmpty(400).describe('One sentence naming the gap.'),
  why_it_matters: nonEmpty(600).describe(
    "One or two sentences from an investor's perspective on why this gap costs the company.",
  ),
  evidence: nonEmpty(600).describe(
    'The specific input, number or absence in the intake this is based on. Never a general claim.',
  ),
});

export const recommendationSchema = z.object({
  action: nonEmpty(400).describe('Imperative and specific. What to do.'),
  effort: effortSchema,
  estimated_duration: nonEmpty(60).describe("For example '1-2 weeks'."),
  expected_effect: nonEmpty(400).describe('What changes if this is done.'),
});

export const dimensionNarrativeSchema = z.object({
  dimension_id: z.enum(DIMENSION_IDS as unknown as [string, ...string[]]),
  what_we_observed: nonEmpty(1_500),
  gaps: z.array(gapSchema).max(8),
  recommendations: z.array(recommendationSchema).max(8),
  /**
   * Required whenever dimension confidence is not high. Enforced code-side in
   * guardrails.ts - the prompt asks, the check verifies (PRD 8.1).
   */
  confidence_note: z.string().trim().max(600).nullable(),
});

export const priorityGapSchema = z.object({
  rank: z.number().int().min(1).max(10),
  dimension_id: z.enum(DIMENSION_IDS as unknown as [string, ...string[]]),
  gap: nonEmpty(400),
  rationale: nonEmpty(800).describe(
    'Why this gap ranks here, referencing score impact and effort. The ordering is supplied; explain it, do not change it.',
  ),
});

export const remediationPlanSchema = z.object({
  days_0_30: z.array(nonEmpty(400)).max(12),
  days_31_60: z.array(nonEmpty(400)).max(12),
  days_61_90: z.array(nonEmpty(400)).max(12),
});

export const dataRoomItemSchema = z.object({
  item: nonEmpty(200),
  status: z.enum(['present', 'partial', 'missing', 'unknown']),
  note: z.string().trim().max(400),
});

/**
 * The complete narrative response.
 *
 * `dimensions` must contain exactly six entries, one per dimension, in order
 * D1-D6. A response with a missing or extra dimension is schema-invalid
 * (PRD 6.4) and triggers the retry-then-fallback path.
 */
export const narrativeResponseSchema = z
  .object({
    executive_summary: nonEmpty(3_000),
    overall_assessment: nonEmpty(4_000),
    dimensions: z.array(dimensionNarrativeSchema).length(6),
    priority_gaps: z.array(priorityGapSchema).max(5),
    remediation_plan: remediationPlanSchema,
    data_room_checklist: z.array(dataRoomItemSchema).max(40),
    questions_you_cannot_yet_answer: z.array(nonEmpty(400)).max(20),
    /** For Dhruv, not the client. Does not appear in the PDF (PRD 6.4). */
    generation_notes: z.string().trim().max(2_000).nullable(),
  })
  .superRefine((value, ctx) => {
    // Exactly one entry per dimension, in D1-D6 order. Checking the order and
    // not merely the set means the report's section sequence is guaranteed by
    // the schema rather than by a sort at render time.
    const ids = value.dimensions.map((d) => d.dimension_id);
    DIMENSION_IDS.forEach((expected, index) => {
      if (ids[index] !== expected) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['dimensions', index, 'dimension_id'],
          message: `Expected dimension ${expected} at position ${index}, received ${ids[index] ?? 'nothing'}. Dimensions must be exactly D1-D6, in order.`,
        });
      }
    });

    // Priority ranks must be 1..n with no duplicates. A duplicated rank in a
    // client-facing "top five" is the kind of small wrongness that undermines
    // a whole document.
    const ranks = value.priority_gaps.map((g) => g.rank).sort((a, b) => a - b);
    ranks.forEach((rank, index) => {
      if (rank !== index + 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['priority_gaps'],
          message: `Priority ranks must be consecutive from 1; got [${ranks.join(', ')}].`,
        });
      }
    });
  });

export type NarrativeResponse = z.infer<typeof narrativeResponseSchema>;
export type DimensionNarrative = z.infer<typeof dimensionNarrativeSchema>;
export type Gap = z.infer<typeof gapSchema>;
export type Recommendation = z.infer<typeof recommendationSchema>;
export type DataRoomItem = z.infer<typeof dataRoomItemSchema>;

export interface SchemaValidationResult {
  ok: boolean;
  data: NarrativeResponse | null;
  /** Formatted for the corrective retry message (PRD 8.2). */
  errors: readonly string[];
}

/**
 * Validate a raw model response.
 *
 * On failure the errors are formatted for the single corrective retry: the
 * model is told exactly which paths failed and why. Exactly one retry, then
 * the fallback report (PRD 6.6, 8.2) - never a loop.
 */
export function validateNarrativeResponse(raw: unknown): SchemaValidationResult {
  const parsed = narrativeResponseSchema.safeParse(raw);
  if (parsed.success) {
    return { ok: true, data: parsed.data, errors: [] };
  }
  return {
    ok: false,
    data: null,
    errors: parsed.error.issues.map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
      return `${path}: ${issue.message}`;
    }),
  };
}

/**
 * The fixed data-room item list (PRD 7.1 section 10, 8.2).
 *
 * The model assesses each item's status against the intake; it does not invent
 * the list. A fixed list is what makes the checklist comparable across clients
 * and is what the fallback report renders when generation fails entirely.
 */
export const DATA_ROOM_ITEMS: readonly string[] = [
  'Certificate of incorporation and constitutional documents',
  'Current shareholding pattern / cap table, fully diluted',
  'Share subscription and shareholders agreements from prior rounds',
  'Board and shareholder resolutions to date',
  'Founder vesting agreements',
  'ESOP scheme documents and grant register',
  'IP assignment deeds from all founders, employees and contractors',
  'Employment agreements and offer letters',
  'Contractor and consultant agreements',
  'Statutory filings: ROC / MCA annual returns',
  'GST registration and recent returns',
  'TDS filings and challans',
  'Audited or management financial statements',
  'Monthly management accounts for the trailing 12 months',
  'Bank statements for the trailing 12 months',
  'Revenue recognition policy',
  'Customer contracts and master service agreements',
  'Top-customer concentration analysis',
  'Cohort retention and churn analysis',
  'Unit economics model with stated assumptions',
  'Financial model and projections',
  'Sales pipeline report',
  'Product roadmap',
  'Technology architecture overview',
  'Data protection and privacy policy',
  'Material litigation and dispute register, or a nil declaration',
  'Insurance policies',
  'FEMA / FDI filings where foreign capital is present',
];
