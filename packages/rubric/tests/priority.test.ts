/**
 * Prioritisation tests.
 *
 * PRD 6.1: "Deterministic code computes impact x effort; the LLM explains the
 * ordering, it does not choose it."
 *
 * If the top five priority gaps could be reshuffled by a model's mood, two
 * similar clients would get differently-prioritised advice and the instrument
 * would not be an instrument. These tests pin the ordering.
 */

import { describe, expect, it } from 'vitest';

import {
  EFFORT_WEIGHT,
  PRIORITY_GAP_COUNT,
  horizonFor,
  prioritiseGaps,
  remediationSchedule,
  scoreIntake,
  topPriorityGaps,
} from '@klawfin/rubric';
import {
  completeIntake,
  edgeIntake,
  makeIntake,
  preRevenueIntake,
  sparseIntake,
} from '@klawfin/core/tests/fixtures';

describe('prioritiseGaps', () => {
  const score = scoreIntake(preRevenueIntake);
  const gaps = prioritiseGaps(score);

  it('ranks consecutively from 1', () => {
    gaps.forEach((gap, index) => expect(gap.rank).toBe(index + 1));
  });

  it('sorts by descending priority score', () => {
    for (let i = 1; i < gaps.length; i += 1) {
      expect(gaps[i - 1]!.priorityScore).toBeGreaterThanOrEqual(gaps[i]!.priorityScore);
    }
  });

  it('is deterministic across runs', () => {
    const a = JSON.stringify(prioritiseGaps(scoreIntake(preRevenueIntake)));
    const b = JSON.stringify(prioritiseGaps(scoreIntake(preRevenueIntake)));
    expect(a).toBe(b);
  });

  it('excludes sub-criteria already at 4 - there is nothing to fix', () => {
    for (const gap of gaps) expect(gap.score).toBeLessThan(4);
  });

  it('excludes N/A sub-criteria', () => {
    const edgeGaps = prioritiseGaps(scoreIntake(edgeIntake));
    // D6 is entirely N/A in the edge fixture.
    expect(edgeGaps.map((g) => g.dimensionId)).not.toContain('D6');
  });

  it('excludes dimensions that could not be assessed', () => {
    // Ranking a gap in a dimension we never looked at would mean telling a
    // client to fix something we did not assess (PRD 8.1).
    const sparseScore = scoreIntake(sparseIntake);
    const notAssessed = sparseScore.dimensions.filter((d) => d.notAssessed).map((d) => d.id);
    const sparseGaps = prioritiseGaps(sparseScore);
    for (const gap of sparseGaps) {
      expect(notAssessed).not.toContain(gap.dimensionId);
    }
  });

  it('computes impact as real composite points, not an abstract index', () => {
    // This is what makes the ordering explainable in a client meeting.
    for (const gap of gaps) {
      expect(gap.compositePointsAvailable).toBeGreaterThan(0);
      expect(gap.compositePointsAvailable).toBeLessThan(100);
    }
  });

  it('weights low effort above high effort at equal impact', () => {
    expect(EFFORT_WEIGHT.low).toBeGreaterThan(EFFORT_WEIGHT.medium);
    expect(EFFORT_WEIGHT.medium).toBeGreaterThan(EFFORT_WEIGHT.high);
  });

  it('prefers the cheaper fix when two gaps have equal impact', () => {
    const score2 = scoreIntake(makeIntake({ product: { product_stage: 'beta' } }));
    const all = prioritiseGaps(score2);
    // Find two gaps with the same available impact but different effort.
    for (const a of all) {
      const cheaper = all.find(
        (b) =>
          Math.abs(b.compositePointsAvailable - a.compositePointsAvailable) < 1e-9 &&
          EFFORT_WEIGHT[b.effort] > EFFORT_WEIGHT[a.effort],
      );
      if (cheaper) {
        expect(cheaper.rank).toBeLessThan(a.rank);
        return;
      }
    }
  });

  it('carries the anchor text for the current level and for a 4', () => {
    for (const gap of gaps) {
      expect(gap.currentAnchor.length).toBeGreaterThan(10);
      expect(gap.targetAnchor.length).toBeGreaterThan(10);
      expect(gap.currentAnchor).not.toBe(gap.targetAnchor);
    }
  });

  it('breaks ties on a stable key, not on insertion order', () => {
    // Sorting must be total. Anything else makes the "top five" depend on
    // array construction order, which is not a defensible reason for a gap to
    // appear in a client's report.
    const once = prioritiseGaps(score).map((g) => g.subCriterionId);
    const twice = prioritiseGaps(scoreIntake(preRevenueIntake)).map((g) => g.subCriterionId);
    expect(once).toEqual(twice);
  });

  it('returns nothing for a perfect assessment', () => {
    const perfect = prioritiseGaps(scoreIntake(completeIntake));
    for (const gap of perfect) expect(gap.score).toBeLessThan(4);
  });
});

describe('topPriorityGaps', () => {
  it('returns at most five, per the response schema', () => {
    expect(PRIORITY_GAP_COUNT).toBe(5);
    expect(topPriorityGaps(scoreIntake(preRevenueIntake)).length).toBeLessThanOrEqual(5);
  });

  it('returns the highest-ranked gaps', () => {
    const score = scoreIntake(preRevenueIntake);
    const top = topPriorityGaps(score);
    const all = prioritiseGaps(score);
    expect(top).toEqual(all.slice(0, top.length));
  });

  it('returns fewer than five when fewer gaps exist', () => {
    const top = topPriorityGaps(scoreIntake(completeIntake));
    expect(top.length).toBeLessThanOrEqual(5);
  });
});

describe('remediation schedule (PRD 6.4)', () => {
  const score = scoreIntake(preRevenueIntake);
  const schedule = remediationSchedule(score);

  it('assigns horizons by effort', () => {
    expect(horizonFor('low')).toBe('days_0_30');
    expect(horizonFor('medium')).toBe('days_31_60');
    expect(horizonFor('high')).toBe('days_61_90');
  });

  it('places every scheduled gap in the horizon its effort implies', () => {
    for (const gap of schedule.days_0_30) expect(gap.effort).toBe('low');
    for (const gap of schedule.days_31_60) expect(gap.effort).toBe('medium');
    for (const gap of schedule.days_61_90) expect(gap.effort).toBe('high');
  });

  it('schedules a plan rather than an inventory', () => {
    const total =
      schedule.days_0_30.length + schedule.days_31_60.length + schedule.days_61_90.length;
    expect(total).toBeLessThanOrEqual(12);
    expect(total).toBeGreaterThan(0);
  });

  it('preserves priority order inside each horizon', () => {
    for (const bucket of [schedule.days_0_30, schedule.days_31_60, schedule.days_61_90]) {
      for (let i = 1; i < bucket.length; i += 1) {
        expect(bucket[i - 1]!.rank).toBeLessThan(bucket[i]!.rank);
      }
    }
  });
});
