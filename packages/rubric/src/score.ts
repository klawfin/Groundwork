/**
 * The scoring engine.
 *
 * PURE. No network, no database, no Date.now(), no randomness. Same input,
 * same rubric version, same output, forever (readme.md structural rule 1).
 * This is the most heavily tested file in the repository and the reason the
 * tool can be defended line by line in a client meeting (PRD G2, G3).
 *
 * The LLM is not imported here and never will be. It receives this module's
 * output as fact (PRD NG9, 6.1).
 */

import type {
  AnchorScore,
  Confidence,
  DimensionResult,
  ScoreResult,
  SubCriterionResult,
} from './types.js';
import { ANCHOR_LABELS } from './types.js';
import { DIMENSIONS, RUBRIC_VERSION } from './definitions.js';
import { bandFor, confidenceFor, COVERAGE_GATES } from './bands.js';
import { inputsFor, isAnswered, isPreRevenue, RULE_BY_ID } from './mapping.js';
import type { Intake } from '@klawfin/core';

/**
 * Score an intake against rubric v1.
 *
 * @param intake Validated intake. Callers parse with `parseIntake` first.
 * @returns A complete, self-describing score. Every number the report shows
 *          comes from here.
 */
export function scoreIntake(intake: Intake): ScoreResult {
  const preRevenueMode = isPreRevenue(intake);

  const provisional = DIMENSIONS.map((dimension) => {
    const subResults: SubCriterionResult[] = dimension.subCriteria.map((sub) => {
      const rule = RULE_BY_ID.get(sub.id);
      if (!rule) {
        // assertMappingIntegrity() makes this unreachable, but a missing rule
        // must never silently become a zero on a client's report.
        throw new Error(`No scoring rule for sub-criterion ${sub.id}`);
      }

      const judgment = intake.judgments[sub.id];
      const accessors = inputsFor(rule, preRevenueMode);

      const answeredInputs: string[] = [];
      const missingInputs: string[] = [];
      for (const accessor of accessors) {
        (isAnswered(accessor.get(intake)) ? answeredInputs : missingInputs).push(accessor.label);
      }

      // --- N/A (PRD 5.4) ----------------------------------------------------
      // Requires a reason. Removed from numerator AND denominator.
      const naReason = judgment?.na_reason?.trim() ?? null;
      if (naReason) {
        return {
          id: sub.id,
          label: sub.label,
          score: null,
          naReason,
          anchorLabel: null,
          scoredOnSubstitute: false,
          answeredInputs,
          missingInputs,
          derivation: null,
        } satisfies SubCriterionResult;
      }

      // --- Scoring ----------------------------------------------------------
      const useSubstitute = preRevenueMode && Boolean(rule.derivePreRevenue);
      let score: AnchorScore;
      let derivation: string | null;

      if (sub.scoringKind === 'derived') {
        const fn = useSubstitute ? rule.derivePreRevenue! : rule.derive!;
        const result = fn(intake);
        score = result.score;
        derivation = result.derivation;
      } else {
        // Anchored: Dhruv's stored selection. An unselected anchor scores 0 -
        // "Absent" is the correct reading of a sub-criterion nobody assessed,
        // and low coverage is what signals that it was not assessed rather
        // than genuinely absent.
        score = (judgment?.anchor ?? 0) as AnchorScore;
        derivation = isAnswered(judgment?.anchor)
          ? null
          : 'Not yet assessed - scored 0 by default. Coverage reflects this.';
      }

      return {
        id: sub.id,
        label: sub.label,
        score,
        naReason: null,
        anchorLabel: ANCHOR_LABELS[score],
        scoredOnSubstitute: useSubstitute,
        answeredInputs,
        missingInputs,
        derivation,
      } satisfies SubCriterionResult;
    });

    // --- Dimension aggregation (PRD 5.5) ------------------------------------
    const applicable = subResults.filter((s) => s.score !== null);
    const raw = applicable.reduce((acc, s) => acc + (s.score as number) * weightOf(s.id), 0);
    const max = applicable.reduce((acc, s) => acc + 4 * weightOf(s.id), 0);
    const entirelyNotApplicable = applicable.length === 0;
    // Full precision here. Rounding happens exactly once, at the end.
    const pct = entirelyNotApplicable ? 0 : (raw / max) * 100;

    const totalInputs = subResults.reduce((acc, s) => acc + s.answeredInputs.length + s.missingInputs.length, 0);
    const answered = subResults.reduce((acc, s) => acc + s.answeredInputs.length, 0);
    const coverage = totalInputs === 0 ? 0 : answered / totalInputs;

    const naCount = subResults.length - applicable.length;
    // PRD 5.4: more than half N/A marks the dimension low confidence, and the
    // report must say so in that dimension's section.
    const lowConfidenceFromNa = naCount * 2 > subResults.length;
    const confidence: Confidence = lowConfidenceFromNa ? 'low' : confidenceFor(coverage);

    return {
      id: dimension.id,
      name: dimension.name,
      weight: dimension.weight,
      definedWeight: dimension.weight,
      raw,
      max,
      pct,
      weightedContribution: 0, // filled after any weight redistribution
      coverage,
      confidence,
      lowConfidenceFromNa,
      entirelyNotApplicable,
      // PRD 8.1: below this, the dimension is reported as not assessed. The
      // model must not infer a narrative for it.
      notAssessed: coverage < COVERAGE_GATES.dimensionNotAssessed,
      subCriteria: subResults,
    } satisfies DimensionResult;
  });

  // --- Weight redistribution (PRD 5.5) --------------------------------------
  // "If a whole dimension is entirely N/A, its weight is redistributed
  // proportionally across the remaining dimensions, and the report states
  // that this happened."
  const scored = provisional.filter((d) => !d.entirelyNotApplicable);
  const weightRedistributed = scored.length !== provisional.length && scored.length > 0;

  let dimensions: DimensionResult[];
  if (weightRedistributed) {
    const remainingWeight = scored.reduce((acc, d) => acc + d.definedWeight, 0);
    dimensions = provisional.map((d) => {
      if (d.entirelyNotApplicable) {
        return { ...d, weight: 0, weightedContribution: 0 };
      }
      const weight = d.definedWeight / remainingWeight;
      return { ...d, weight, weightedContribution: d.pct * weight };
    });
  } else {
    dimensions = provisional.map((d) => ({ ...d, weightedContribution: d.pct * d.weight }));
  }

  // --- Composite (PRD 5.5) --------------------------------------------------
  const compositeExact = dimensions.reduce((acc, d) => acc + d.weightedContribution, 0);
  // Rounded exactly once. Dimension percentages stay at full precision above
  // and are displayed to one decimal by the presentation layer.
  const composite = Math.round(compositeExact);

  // Overall coverage is computed across all inputs, not as a mean of
  // dimension coverages: a mean would let a two-input dimension outweigh a
  // six-input one and misstate how complete the intake actually is.
  const allSubs = dimensions.flatMap((d) => d.subCriteria);
  const totalInputs = allSubs.reduce((acc, s) => acc + s.answeredInputs.length + s.missingInputs.length, 0);
  const totalAnswered = allSubs.reduce((acc, s) => acc + s.answeredInputs.length, 0);
  const overallCoverage = totalInputs === 0 ? 0 : totalAnswered / totalInputs;

  return {
    composite,
    compositeExact,
    band: bandFor(composite),
    overallCoverage,
    overallConfidence: confidenceFor(overallCoverage),
    preRevenueMode,
    weightRedistributed,
    dimensions,
    rubricVersion: RUBRIC_VERSION,
  };
}

/**
 * Relative weight of a sub-criterion within its dimension.
 *
 * Equal weighting unless a sub-criterion declares otherwise (PRD 5.3). Kept as
 * a lookup so a future weighted sub-criterion needs no change to the maths.
 */
function weightOf(subCriterionId: string): number {
  const found = DIMENSIONS.flatMap((d) => d.subCriteria).find((s) => s.id === subCriterionId);
  return found?.weight ?? 1;
}

/** Percentage formatted for display: one decimal (PRD 5.5). */
export function formatPct(value: number): string {
  return value.toFixed(1);
}

/**
 * Assert that two scorings of the same intake are identical.
 *
 * Determinism is a requirement, not an aspiration (PRD G2, P1-04), so it is
 * asserted rather than assumed. Used by the test suite and available to a
 * pre-deploy check.
 */
export function assertDeterministic(intake: Intake): void {
  const a = JSON.stringify(scoreIntake(intake));
  const b = JSON.stringify(scoreIntake(intake));
  if (a !== b) {
    throw new Error('Scoring is not deterministic - identical intake produced different output');
  }
}
