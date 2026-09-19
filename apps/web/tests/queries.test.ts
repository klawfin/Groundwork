/**
 * Score -> storage row mapping.
 *
 * This is the only part of `queries.ts` with logic; the rest are single-query
 * wrappers, which a database mock would test the mock rather than the code.
 *
 * What matters here is that nothing computed is lost on the way to storage: a
 * dropped field means a report that cannot explain its own score.
 */

import { describe, expect, it } from 'vitest';

import { scoreIntake } from '@klawfin/rubric';
import { completeIntake, edgeIntake, preRevenueIntake } from '@klawfin/core/tests/fixtures';

import { toScoreRows } from '../src/lib/db/queries.js';

const ASSESSMENT_ID = '11111111-1111-4111-8111-111111111111';

describe('toScoreRows', () => {
  it('produces exactly one row per dimension', () => {
    const score = scoreIntake(completeIntake);
    const rows = toScoreRows(ASSESSMENT_ID, score);

    expect(rows).toHaveLength(6);
    expect(rows.map((r) => r.dimension_id)).toEqual(['D1', 'D2', 'D3', 'D4', 'D5', 'D6']);
    expect(rows.every((r) => r.assessment_id === ASSESSMENT_ID)).toBe(true);
  });

  it('carries every computed value through unchanged', () => {
    const score = scoreIntake(completeIntake);
    const rows = toScoreRows(ASSESSMENT_ID, score);

    score.dimensions.forEach((d, i) => {
      const row = rows[i]!;
      expect(row.pct).toBe(d.pct);
      expect(row.raw).toBe(d.raw);
      expect(row.max_points).toBe(d.max);
      expect(row.weight).toBe(d.weight);
      expect(row.defined_weight).toBe(d.definedWeight);
      expect(row.weighted_contribution).toBe(d.weightedContribution);
      expect(row.coverage).toBe(d.coverage);
      expect(row.confidence).toBe(d.confidence);
    });
  });

  it('preserves the applied weight separately from the defined weight', () => {
    // The edge fixture has an entirely-N/A dimension, so weights are
    // redistributed. Storing only one of the two would make the report unable
    // to explain why D1 contributed more than its rubric weight.
    const score = scoreIntake(edgeIntake);
    const rows = toScoreRows(ASSESSMENT_ID, score);

    expect(score.weightRedistributed).toBe(true);
    const d1 = rows.find((r) => r.dimension_id === 'D1')!;
    expect(d1.weight).not.toBe(d1.defined_weight);

    const d6 = rows.find((r) => r.dimension_id === 'D6')!;
    expect(d6.entirely_not_applicable).toBe(true);
    expect(d6.weight).toBe(0);
    expect(d6.defined_weight).toBe(0.1);
  });

  it('keeps the per-sub-criterion derivation, so a score stays defensible', () => {
    // PRD G3: "why did I score 2 on cap table hygiene" must be answerable from
    // the record alone.
    const score = scoreIntake(completeIntake);
    const rows = toScoreRows(ASSESSMENT_ID, score);

    const capTable = rows.find((r) => r.dimension_id === 'D5')!;
    expect(capTable.sub_criteria).toHaveLength(6);

    const cleanliness = capTable.sub_criteria.find((s) => s.id === 'D5.2')!;
    expect(cleanliness.derivation).toBeTruthy();
    expect(cleanliness.anchorLabel).toBeTruthy();
  });

  it('records the pre-revenue substitute flag', () => {
    // Without this the report cannot say which ladder D3 was scored against,
    // and the score gets misread as comparable to a revenue-stage company's.
    const rows = toScoreRows(ASSESSMENT_ID, scoreIntake(preRevenueIntake));
    const traction = rows.find((r) => r.dimension_id === 'D3')!;
    expect(traction.sub_criteria.every((s) => s.scoredOnSubstitute)).toBe(true);
  });

  it('records N/A reasons rather than dropping them', () => {
    const rows = toScoreRows(ASSESSMENT_ID, scoreIntake(edgeIntake));
    const ask = rows.find((r) => r.dimension_id === 'D6')!;
    for (const sub of ask.sub_criteria) {
      expect(sub.score).toBeNull();
      expect(sub.naReason).toBeTruthy();
    }
  });

  it('is pure - the same score maps identically every time', () => {
    const score = scoreIntake(completeIntake);
    expect(JSON.stringify(toScoreRows(ASSESSMENT_ID, score))).toBe(
      JSON.stringify(toScoreRows(ASSESSMENT_ID, score)),
    );
  });
});
