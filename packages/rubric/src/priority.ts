/**
 * Deterministic gap prioritisation.
 *
 * PRD 6.1 draws the line precisely:
 *
 *   "Prioritisation ordering | Deterministic code computes impact x effort;
 *    the LLM explains the ordering, it does not choose it."
 *
 * So the ranking is computed here and handed to the model as a fact. The model
 * writes the rationale for why a gap sits where it does; it cannot reorder the
 * list. If the top five priority gaps in a report could be reshuffled by a
 * model's mood, two similar clients would get differently-prioritised advice
 * and the instrument would not be an instrument.
 *
 * Pure. No I/O.
 */

import type { DimensionId, DimensionResult, Effort, ScoreResult } from './types';
import { SUB_CRITERION_BY_ID } from './definitions';

/**
 * Effort weights used in the priority score.
 *
 * Lower effort ranks higher for the same impact, because the Sprint sells
 * remediation and a founder needs to know what to do first, not merely what
 * is worst. A cap-table fix that takes a week outranks a "hire a VP of Sales"
 * gap of similar magnitude.
 */
export const EFFORT_WEIGHT: Record<Effort, number> = {
  low: 1.0,
  medium: 0.65,
  high: 0.4,
};

/** How many priority gaps the report carries (PRD 6.4: exactly 5, or fewer). */
export const PRIORITY_GAP_COUNT = 5;

export interface PriorityGap {
  rank: number;
  subCriterionId: string;
  dimensionId: DimensionId;
  dimensionName: string;
  label: string;
  /** Current 0-4 score. */
  score: number;
  effort: Effort;
  /**
   * Composite points the client would gain by moving this sub-criterion to 4.
   * This is a real number on the 0-100 scale, not an abstract index - it is
   * what makes the ordering explainable in a client meeting.
   */
  compositePointsAvailable: number;
  /** compositePointsAvailable x effort weight. The sort key. */
  priorityScore: number;
  /** The anchor text for the current level, so the gap is self-describing. */
  currentAnchor: string;
  /** The anchor text for level 4 - what "fixed" looks like. */
  targetAnchor: string;
}

/**
 * Rank every improvable sub-criterion by impact x effort.
 *
 * Impact is computed exactly: moving a sub-criterion from its current score to
 * 4 raises its dimension percentage by a known amount, which multiplies
 * through the dimension weight into the composite. No heuristics.
 *
 * N/A sub-criteria are excluded - there is nothing to fix. Sub-criteria
 * already at 4 are excluded for the same reason. Sub-criteria in a
 * not-assessed dimension are excluded because we do not know enough to claim
 * they are gaps (PRD 8.1).
 */
export function prioritiseGaps(score: ScoreResult): readonly PriorityGap[] {
  const candidates: PriorityGap[] = [];

  for (const dimension of score.dimensions) {
    // A dimension we could not assess has no defensible gaps. Ranking one
    // would mean telling a client to fix something we never looked at.
    if (dimension.notAssessed || dimension.entirelyNotApplicable) continue;

    for (const sub of dimension.subCriteria) {
      if (sub.score === null || sub.score >= 4) continue;

      const definition = SUB_CRITERION_BY_ID.get(sub.id);
      if (!definition) continue;

      const compositePointsAvailable = compositeGainIfPerfected(dimension, sub.id, sub.score);
      const effort = definition.effortToClose;

      candidates.push({
        rank: 0,
        subCriterionId: sub.id,
        dimensionId: dimension.id,
        dimensionName: dimension.name,
        label: sub.label,
        score: sub.score,
        effort,
        compositePointsAvailable,
        priorityScore: compositePointsAvailable * EFFORT_WEIGHT[effort],
        currentAnchor: definition.anchors[sub.score],
        targetAnchor: definition.anchors[4],
      });
    }
  }

  candidates.sort(comparePriority);
  return candidates.map((gap, index) => ({ ...gap, rank: index + 1 }));
}

/** The top N gaps, for the report's priority section. */
export function topPriorityGaps(
  score: ScoreResult,
  count: number = PRIORITY_GAP_COUNT,
): readonly PriorityGap[] {
  return prioritiseGaps(score).slice(0, count);
}

/**
 * Composite points gained by moving one sub-criterion to 4.
 *
 * Within a dimension, each applicable sub-criterion contributes
 * `weight / totalApplicableWeight` of the dimension percentage. Moving it up
 * by `(4 - current)` of 4 possible points therefore moves the dimension
 * percentage by that fraction, which moves the composite by the dimension's
 * weight again.
 */
function compositeGainIfPerfected(
  dimension: DimensionResult,
  subCriterionId: string,
  currentScore: number,
): number {
  if (dimension.max <= 0) return 0;

  const definition = SUB_CRITERION_BY_ID.get(subCriterionId);
  const subWeight = definition?.weight ?? 1;

  // Raw points recoverable, in the dimension's own numerator units.
  const rawGain = (4 - currentScore) * subWeight;
  // As a share of the dimension percentage (0-100).
  const dimensionPctGain = (rawGain / dimension.max) * 100;
  // Through the dimension weight into the composite.
  return dimensionPctGain * dimension.weight;
}

/**
 * Sort comparator. Deliberately total and deterministic: ties break on
 * sub-criterion id so the ordering never depends on array insertion order or
 * on the engine's sort stability.
 */
function comparePriority(a: PriorityGap, b: PriorityGap): number {
  if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
  // Larger raw impact first when the weighted scores tie.
  if (b.compositePointsAvailable !== a.compositePointsAvailable) {
    return b.compositePointsAvailable - a.compositePointsAvailable;
  }
  // Then lower current score - a 0 is a more urgent gap than a 3.
  if (a.score !== b.score) return a.score - b.score;
  return a.subCriterionId.localeCompare(b.subCriterionId);
}

/**
 * Remediation horizon buckets (PRD 6.4 `remediation_plan`).
 *
 * Assigning gaps to 0-30 / 31-60 / 61-90 days is deterministic too: effort
 * decides the horizon, priority decides the order within it. The model writes
 * the action text; it does not decide what is urgent.
 */
export type Horizon = 'days_0_30' | 'days_31_60' | 'days_61_90';

export function horizonFor(effort: Effort): Horizon {
  switch (effort) {
    case 'low':
      return 'days_0_30';
    case 'medium':
      return 'days_31_60';
    case 'high':
      return 'days_61_90';
  }
}

export interface RemediationSchedule {
  days_0_30: readonly PriorityGap[];
  days_31_60: readonly PriorityGap[];
  days_61_90: readonly PriorityGap[];
}

/**
 * Bucket the ranked gaps into the 30/60/90 plan.
 *
 * @param limit How many gaps to schedule in total. The full ranked list would
 *              overwhelm a founder; the report is a plan, not an inventory.
 */
export function remediationSchedule(score: ScoreResult, limit = 12): RemediationSchedule {
  const ranked = prioritiseGaps(score).slice(0, limit);
  return {
    days_0_30: ranked.filter((g) => horizonFor(g.effort) === 'days_0_30'),
    days_31_60: ranked.filter((g) => horizonFor(g.effort) === 'days_31_60'),
    days_61_90: ranked.filter((g) => horizonFor(g.effort) === 'days_61_90'),
  };
}
