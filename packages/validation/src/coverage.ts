/**
 * Coverage assessment and the generation gate (PRD 8.1).
 *
 * Coverage is computed inside the scoring engine (it shares the denominator
 * with sub-criterion inputs). This module turns that number into the decision
 * the UI and the generation route need: may we generate, and with what
 * labelling.
 *
 * Pure. No I/O.
 */

import type { ScoreResult } from '@klawfin/rubric';
import { COVERAGE_GATES, coverageDisposition } from '@klawfin/rubric';
import type { CoverageDisposition } from '@klawfin/rubric';

export interface CoverageFlag {
  dimensionId: string;
  dimensionName: string;
  coverage: number;
  /** True when this dimension must be reported as "not assessed" (PRD 8.1). */
  notAssessed: boolean;
  confidence: string;
  message: string;
}

export interface CoverageAssessment {
  overallCoverage: number;
  disposition: CoverageDisposition;
  /** True when generation may proceed without an explicit override. */
  canGenerate: boolean;
  /** True when the report must be marked "Preliminary" (PRD 8.1). */
  markPreliminary: boolean;
  /** True when the report must carry the incomplete-data watermark. */
  requiresWatermark: boolean;
  /** Dimensions below the not-assessed threshold. */
  flags: readonly CoverageFlag[];
  /** Human-readable summary for the pre-generation screen. */
  summary: string;
}

/**
 * A recorded coverage override (PRD 8.1, P1-03).
 *
 * Generating below 60% coverage requires an explicit confirmation with a
 * recorded reason, and the resulting report is watermarked on every page.
 */
export interface CoverageOverride {
  reason: string;
  overriddenBy: string;
  overriddenAt: string;
}

/**
 * Assess coverage and decide what generation is permitted.
 *
 * @param score   Output of the scoring engine.
 * @param override Present when Dhruv has explicitly overridden a block.
 */
export function assessCoverage(
  score: ScoreResult,
  override?: CoverageOverride | null,
): CoverageAssessment {
  const disposition = coverageDisposition(score.overallCoverage);

  const flags: CoverageFlag[] = score.dimensions
    .filter((d) => d.notAssessed || d.confidence === 'low')
    .map((d) => ({
      dimensionId: d.id,
      dimensionName: d.name,
      coverage: d.coverage,
      notAssessed: d.notAssessed,
      confidence: d.confidence,
      message: d.notAssessed
        ? `${d.name} is at ${pct(d.coverage)} coverage, below the ${pct(
            COVERAGE_GATES.dimensionNotAssessed,
          )} threshold. This dimension will be reported as not assessed, and no narrative will be written for it.`
        : `${d.name} is at ${pct(d.coverage)} coverage - low confidence. The report will say so in that dimension's section.`,
    }));

  const hasValidOverride = Boolean(override && override.reason.trim().length > 0);
  const blocked = disposition === 'blocked';

  const canGenerate = !blocked || hasValidOverride;
  const markPreliminary = disposition !== 'normal';
  // The watermark attaches to the fact of having generated below the floor,
  // not to whether an override was supplied. An overridden report is still an
  // incomplete-data report and must say so on every page.
  const requiresWatermark = blocked;

  return {
    overallCoverage: score.overallCoverage,
    disposition,
    canGenerate,
    markPreliminary,
    requiresWatermark,
    flags,
    summary: summarise(score.overallCoverage, disposition, flags.length, hasValidOverride),
  };
}

function summarise(
  coverage: number,
  disposition: CoverageDisposition,
  flagCount: number,
  overridden: boolean,
): string {
  const head = `Intake coverage is ${pct(coverage)}.`;
  const tail =
    flagCount > 0
      ? ` ${flagCount} dimension(s) are below the confidence threshold and will be labelled in the report.`
      : '';

  switch (disposition) {
    case 'normal':
      return `${head} Generation may proceed normally.${tail}`;
    case 'preliminary':
      return `${head} The report will be marked "Preliminary" and will state its coverage in the executive summary.${tail}`;
    case 'blocked':
      return overridden
        ? `${head} This is below the ${pct(
            COVERAGE_GATES.preliminary,
          )} minimum. Generation is proceeding under a recorded override, and every page will carry the incomplete-data watermark.${tail}`
        : `${head} This is below the ${pct(
            COVERAGE_GATES.preliminary,
          )} minimum, so generation is blocked. Complete more of the intake, or override with a recorded reason.${tail}`;
  }
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/**
 * Dimensions the model must NOT write a narrative for (PRD 8.1).
 *
 * "A dimension with insufficient data produces 'not assessed', never a
 * confident-sounding paragraph built from nothing. This is the most likely way
 * the tool embarrasses Dhruv in front of a client."
 *
 * Passed into the prompt as an explicit instruction AND checked code-side
 * after generation.
 */
export function notAssessedDimensionIds(score: ScoreResult): readonly string[] {
  return score.dimensions.filter((d) => d.notAssessed).map((d) => d.id);
}

/**
 * Dimensions that must carry a `confidence_note` in the generated response.
 *
 * Anything not at high confidence. Enforced after generation: a low-coverage
 * dimension whose narrative arrives without a confidence note is a guardrail
 * failure, not a stylistic preference.
 */
export function dimensionsRequiringConfidenceNote(score: ScoreResult): readonly string[] {
  return score.dimensions.filter((d) => d.confidence !== 'high').map((d) => d.id);
}
