/**
 * Core rubric types.
 *
 * PRD Section 5. These types are the contract between the intake form, the
 * scoring engine and the LLM narrative layer.
 *
 * Design rule that governs this whole module (readme.md structural rule 2,
 * PRD NG9): the LLM never produces a number. Every value defined here is
 * computed by `score.ts` from intake data. The model receives these as facts.
 */

/** The six rubric dimensions. Order is fixed and is the report's section order. */
export type DimensionId = 'D1' | 'D2' | 'D3' | 'D4' | 'D5' | 'D6';

export const DIMENSION_IDS: readonly DimensionId[] = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6'] as const;

/**
 * The anchored 0-4 scale (PRD 5.2). `null` means Not Applicable: the
 * sub-criterion is removed from both numerator and denominator (PRD 5.4).
 */
export type AnchorScore = 0 | 1 | 2 | 3 | 4;
export type SubScoreValue = AnchorScore | null;

export const ANCHOR_SCORES: readonly AnchorScore[] = [0, 1, 2, 3, 4] as const;

/** PRD 5.2 anchor labels. Printed in the report so a score is self-explaining. */
export const ANCHOR_LABELS: Record<AnchorScore, string> = {
  0: 'Absent',
  1: 'Asserted',
  2: 'Partial',
  3: 'Solid',
  4: 'Strong',
};

export type Confidence = 'high' | 'medium' | 'low';

/** Effort to close a gap. Feeds deterministic prioritisation (PRD 6.1). */
export type Effort = 'low' | 'medium' | 'high';

/** PRD 5.6 band identifiers. */
export type BandId = 'not_raise_ready' | 'significant_gaps' | 'raise_capable_with_fixes' | 'raise_ready';

export interface Band {
  id: BandId;
  label: string;
  /** Inclusive lower bound of the composite range. */
  min: number;
  /** Inclusive upper bound of the composite range. */
  max: number;
  /** Fixed, client-facing text. Not generated (PRD 5.6). */
  meaning: string;
}

/**
 * How a sub-criterion gets its 0-4 score.
 *
 * - `derived`  : computed mechanically from structured intake values by a rule
 *                in `mapping.ts`. No human judgment, fully reproducible.
 * - `anchored` : Dhruv selects the anchor level against the printed anchor
 *                text. He is the assessor; the tool is the instrument.
 *                Still deterministic: the selection is stored intake data, so
 *                the same intake always yields the same score.
 *
 * Both kinds are pure functions of intake. Neither involves the LLM.
 */
export type ScoringKind = 'derived' | 'anchored';

export interface SubCriterion {
  /** e.g. 'D1.1'. Stable across rubric versions; never reused for a different meaning. */
  id: string;
  dimensionId: DimensionId;
  label: string;
  /** Intake field paths that feed this sub-criterion (PRD 5.3). */
  inputs: readonly string[];
  /** What a 4 looks like (PRD 5.3). Shown in the intake UI and the report methodology. */
  strongLooksLike: string;
  scoringKind: ScoringKind;
  /**
   * Anchor descriptions for levels 0-4, written for THIS sub-criterion.
   * Shown beside the field so a score is defensible line by line (PRD G3).
   */
  anchors: Record<AnchorScore, string>;
  /**
   * Relative weight within the dimension. Sub-criteria are equally weighted
   * unless stated (PRD 5.3), so this defaults to 1.
   */
  weight: number;
  /** Effort to move this sub-criterion up. Used by deterministic prioritisation. */
  effortToClose: Effort;
  /**
   * Whether a pre-revenue substitute ladder applies (PRD 8.4). Only D3
   * sub-criteria carry one in v1.
   */
  preRevenueSubstitute?: {
    label: string;
    inputs: readonly string[];
    anchors: Record<AnchorScore, string>;
  };
}

export interface Dimension {
  id: DimensionId;
  name: string;
  /** Weight as a fraction of 1.0. The six must sum to exactly 1.0. */
  weight: number;
  /** Why this weight (PRD 5.1). Printed in the report methodology section. */
  rationale: string;
  subCriteria: readonly SubCriterion[];
}

/* -------------------------------------------------------------------------- */
/* Scoring output                                                             */
/* -------------------------------------------------------------------------- */

export interface SubCriterionResult {
  id: string;
  label: string;
  /** null when marked N/A - excluded from numerator and denominator. */
  score: SubScoreValue;
  /** Required when score is null (PRD 5.4). */
  naReason: string | null;
  /** Which anchor text the score corresponds to. null when N/A. */
  anchorLabel: string | null;
  /** True when the pre-revenue substitute ladder was used (PRD 8.4). */
  scoredOnSubstitute: boolean;
  /** Intake paths that were populated for this sub-criterion. Drives coverage. */
  answeredInputs: readonly string[];
  missingInputs: readonly string[];
  /** 'derived' results carry the rule that produced them, for inspectability (P1-04). */
  derivation: string | null;
}

export interface DimensionResult {
  id: DimensionId;
  name: string;
  /** Weight actually applied. Differs from the definition when a whole dimension is N/A (PRD 5.5). */
  weight: number;
  /** Weight as defined in the rubric, before any redistribution. */
  definedWeight: number;
  /** Sum of applicable sub-criterion scores. */
  raw: number;
  /** 4 x count of applicable sub-criteria. */
  max: number;
  /** (raw / max) * 100, full precision. Displayed to one decimal (PRD 5.5). */
  pct: number;
  /** pct * weight. Summed to produce the composite. */
  weightedContribution: number;
  coverage: number;
  confidence: Confidence;
  /** True when > half the sub-criteria are N/A (PRD 5.4). */
  lowConfidenceFromNa: boolean;
  /** True when the entire dimension is N/A and its weight was redistributed. */
  entirelyNotApplicable: boolean;
  /** PRD 8.1: below 40% coverage the dimension is reported as not assessed. */
  notAssessed: boolean;
  subCriteria: readonly SubCriterionResult[];
}

export interface ScoreResult {
  /** Integer 0-100. Rounded exactly once, at the end (PRD 5.5). */
  composite: number;
  /** Unrounded composite, retained for auditability. */
  compositeExact: number;
  band: Band;
  overallCoverage: number;
  overallConfidence: Confidence;
  /** PRD 8.4: the assessment ran against the pre-revenue substitute ladder. */
  preRevenueMode: boolean;
  /** True when at least one dimension's weight was redistributed (PRD 5.5). */
  weightRedistributed: boolean;
  dimensions: readonly DimensionResult[];
  rubricVersion: string;
}
