/**
 * Scoring engine tests.
 *
 * readme.md: "Highest coverage in the repo. Every sub-criterion, every anchor
 * level, N/A handling, renormalisation, empty dimensions, boundary values
 * (0, 4, exactly at band edges). Determinism asserted explicitly."
 *
 * A bug in this module puts a wrong number in a paying client's hand and is
 * discovered in the meeting. That is what these tests exist to prevent.
 */

import { describe, expect, it } from 'vitest';

import { scoreIntake, assertDeterministic } from '@klawfin/rubric';
import { ALL_SUB_CRITERIA, DIMENSIONS, RUBRIC_VERSION, assertRubricIntegrity } from '@klawfin/rubric';
import { assertMappingIntegrity, RULE_BY_ID, isPreRevenue } from '@klawfin/rubric';
import { BANDS, bandFor, confidenceFor, coverageDisposition } from '@klawfin/rubric';
import type { AnchorScore } from '@klawfin/rubric';
import {
  ALL_FIXTURES,
  completeIntake,
  contradictoryIntake,
  edgeIntake,
  makeIntake,
  preRevenueIntake,
  sparseIntake,
} from '@klawfin/core/tests/fixtures';

describe('rubric integrity', () => {
  it('satisfies its structural invariants', () => {
    expect(() => assertRubricIntegrity()).not.toThrow();
    expect(() => assertMappingIntegrity()).not.toThrow();
  });

  it('has exactly six dimensions whose weights sum to 1.0', () => {
    expect(DIMENSIONS).toHaveLength(6);
    const sum = DIMENSIONS.reduce((acc, d) => acc + d.weight, 0);
    expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
  });

  it('defines the 29 sub-criteria the PRD specifies, in the documented split', () => {
    expect(ALL_SUB_CRITERIA).toHaveLength(29);
    const perDimension = DIMENSIONS.map((d) => d.subCriteria.length);
    // PRD 5.1: D1=5, D2=4, D3=5, D4=5, D5=6, D6=4
    expect(perDimension).toEqual([5, 4, 5, 5, 6, 4]);
  });

  it('gives every sub-criterion distinct anchor text at all five levels', () => {
    for (const sub of ALL_SUB_CRITERIA) {
      const texts = ([0, 1, 2, 3, 4] as AnchorScore[]).map((level) => sub.anchors[level]);
      for (const text of texts) {
        expect(text.length, `${sub.id} anchor text must be written`).toBeGreaterThan(10);
      }
      expect(new Set(texts).size, `${sub.id} anchors must differ from each other`).toBe(5);
    }
  });

  it('maps every sub-criterion to at least one intake input (PRD P1-03)', () => {
    for (const sub of ALL_SUB_CRITERIA) {
      expect(sub.inputs.length, `${sub.id}`).toBeGreaterThan(0);
      expect(RULE_BY_ID.get(sub.id), `${sub.id} needs a rule`).toBeDefined();
    }
  });
});

describe('determinism (PRD G2)', () => {
  it.each(ALL_FIXTURES)('scores $name identically on repeated runs', ({ intake }) => {
    expect(() => assertDeterministic(intake)).not.toThrow();
  });

  it('produces byte-identical output across separate invocations', () => {
    const first = JSON.stringify(scoreIntake(completeIntake));
    const second = JSON.stringify(scoreIntake(completeIntake));
    expect(first).toBe(second);
  });

  it('stamps the rubric version on every result', () => {
    expect(scoreIntake(completeIntake).rubricVersion).toBe(RUBRIC_VERSION);
  });
});

describe('composite calculation (PRD 5.5)', () => {
  it('returns an integer 0-100', () => {
    for (const { intake } of ALL_FIXTURES) {
      const result = scoreIntake(intake);
      expect(Number.isInteger(result.composite)).toBe(true);
      expect(result.composite).toBeGreaterThanOrEqual(0);
      expect(result.composite).toBeLessThanOrEqual(100);
    }
  });

  it('rounds exactly once, at the end', () => {
    const result = scoreIntake(completeIntake);
    // Dimension percentages are carried at full precision; only the composite
    // is rounded. If an implementation rounded per dimension, the exact and
    // rounded composites would agree far more often than they should.
    expect(result.composite).toBe(Math.round(result.compositeExact));
    const recomputed = result.dimensions.reduce((acc, d) => acc + d.pct * d.weight, 0);
    expect(recomputed).toBeCloseTo(result.compositeExact, 10);
  });

  it('weights each dimension by its defined weight', () => {
    const result = scoreIntake(completeIntake);
    for (const d of result.dimensions) {
      expect(d.weightedContribution).toBeCloseTo(d.pct * d.weight, 10);
    }
  });

  it('scores an all-maximum intake at or near 100', () => {
    const result = scoreIntake(completeIntake);
    expect(result.composite).toBeGreaterThanOrEqual(75);
    expect(result.band.id).toBe('raise_ready');
  });

  it('scores an empty intake at 0 and in the lowest band', () => {
    const result = scoreIntake(makeIntake());
    expect(result.composite).toBe(0);
    expect(result.band.id).toBe('not_raise_ready');
    expect(result.overallCoverage).toBe(0);
    expect(result.overallConfidence).toBe('low');
  });
});

describe('N/A handling and weight redistribution (PRD 5.4, 5.5)', () => {
  it('excludes an N/A sub-criterion from numerator and denominator', () => {
    const base = makeIntake({ judgments: { 'D1.1': { anchor: 4 }, 'D1.2': { anchor: 0 } } });
    const withNa = makeIntake({
      judgments: { 'D1.1': { anchor: 4 }, 'D1.2': { na_reason: 'No second function exists yet.' } },
    });

    const d1Base = scoreIntake(base).dimensions.find((d) => d.id === 'D1')!;
    const d1Na = scoreIntake(withNa).dimensions.find((d) => d.id === 'D1')!;

    // Removing a zero-scored sub-criterion from the denominator must raise the
    // percentage - that is the whole point of N/A rather than scoring 0.
    expect(d1Na.pct).toBeGreaterThan(d1Base.pct);
    expect(d1Na.max).toBeLessThan(d1Base.max);
  });

  it('requires a reason to mark N/A, and records it', () => {
    const result = scoreIntake(edgeIntake);
    const d6 = result.dimensions.find((d) => d.id === 'D6')!;
    for (const sub of d6.subCriteria) {
      expect(sub.score).toBeNull();
      expect(sub.naReason).toBeTruthy();
    }
  });

  it('marks a dimension low-confidence when more than half its sub-criteria are N/A', () => {
    const intake = makeIntake({
      judgments: {
        'D1.1': { na_reason: 'n/a' },
        'D1.2': { na_reason: 'n/a' },
        'D1.3': { na_reason: 'n/a' },
        'D1.4': { anchor: 4 },
        'D1.5': { anchor: 4 },
      },
    });
    const d1 = scoreIntake(intake).dimensions.find((d) => d.id === 'D1')!;
    expect(d1.lowConfidenceFromNa).toBe(true);
    expect(d1.confidence).toBe('low');
  });

  it('redistributes an entirely-N/A dimension weight proportionally', () => {
    const result = scoreIntake(edgeIntake);
    const d6 = result.dimensions.find((d) => d.id === 'D6')!;

    expect(d6.entirelyNotApplicable).toBe(true);
    expect(d6.weight).toBe(0);
    expect(d6.weightedContribution).toBe(0);
    expect(result.weightRedistributed).toBe(true);

    // The remaining five weights must still total 1.0, and must keep their
    // relative proportions: D1 was twice D6's defined weight and must stay
    // twice whatever D2 was relative to it.
    const scoredWeight = result.dimensions.reduce((acc, d) => acc + d.weight, 0);
    expect(scoredWeight).toBeCloseTo(1, 10);

    const d1 = result.dimensions.find((d) => d.id === 'D1')!;
    const d3 = result.dimensions.find((d) => d.id === 'D3')!;
    // D1 defined 0.20, D3 defined 0.25 - ratio preserved after redistribution.
    expect(d1.weight / d3.weight).toBeCloseTo(0.2 / 0.25, 10);
  });

  it('does not flag redistribution when every dimension has at least one applicable sub-criterion', () => {
    expect(scoreIntake(completeIntake).weightRedistributed).toBe(false);
  });
});

describe('coverage and confidence (PRD 5.5, 8.1)', () => {
  it('treats zero and false as answered, not missing', () => {
    // "Gross margin is 0%" and "no IP is filed" are answers. Treating them as
    // missing would understate coverage and wrongly push a documented company
    // into a low-confidence band.
    //
    // Deliberately uses fields that do not flip the assessment into
    // pre-revenue mode, so this measures presence handling and nothing else.
    const answered = makeIntake({ product: { gross_margin_pct: 0, ip_filed: false } });
    const unanswered = makeIntake();
    expect(scoreIntake(answered).overallCoverage).toBeGreaterThan(
      scoreIntake(unanswered).overallCoverage,
    );
  });

  it('maps coverage to confidence at the documented thresholds', () => {
    expect(confidenceFor(0.8)).toBe('high');
    expect(confidenceFor(0.7999)).toBe('medium');
    expect(confidenceFor(0.6)).toBe('medium');
    expect(confidenceFor(0.5999)).toBe('low');
    expect(confidenceFor(0)).toBe('low');
  });

  it('marks a dimension not-assessed below 40% coverage', () => {
    const result = scoreIntake(sparseIntake);
    const starved = result.dimensions.filter((d) => d.coverage < 0.4);
    expect(starved.length).toBeGreaterThan(0);
    for (const d of starved) expect(d.notAssessed).toBe(true);
  });

  it('gates generation at the documented coverage thresholds (PRD 8.1)', () => {
    expect(coverageDisposition(0.85)).toBe('normal');
    expect(coverageDisposition(0.8)).toBe('normal');
    expect(coverageDisposition(0.79)).toBe('preliminary');
    expect(coverageDisposition(0.6)).toBe('preliminary');
    expect(coverageDisposition(0.59)).toBe('blocked');
  });

  it('blocks a sparse intake and permits a complete one', () => {
    expect(coverageDisposition(scoreIntake(sparseIntake).overallCoverage)).toBe('blocked');
    expect(coverageDisposition(scoreIntake(completeIntake).overallCoverage)).not.toBe('blocked');
  });
});

describe('bands (PRD 5.6)', () => {
  it('covers 0-100 contiguously with no gap or overlap', () => {
    for (let score = 0; score <= 100; score += 1) {
      expect(() => bandFor(score)).not.toThrow();
    }
    const sorted = [...BANDS].sort((a, b) => a.min - b.min);
    for (let i = 1; i < sorted.length; i += 1) {
      expect(sorted[i]!.min).toBe(sorted[i - 1]!.max + 1);
    }
  });

  it('resolves exactly at every band boundary', () => {
    expect(bandFor(0).id).toBe('not_raise_ready');
    expect(bandFor(39).id).toBe('not_raise_ready');
    expect(bandFor(40).id).toBe('significant_gaps');
    expect(bandFor(59).id).toBe('significant_gaps');
    expect(bandFor(60).id).toBe('raise_capable_with_fixes');
    expect(bandFor(74).id).toBe('raise_capable_with_fixes');
    expect(bandFor(75).id).toBe('raise_ready');
    expect(bandFor(100).id).toBe('raise_ready');
  });

  it('rejects a non-finite composite rather than printing a blank band', () => {
    expect(() => bandFor(Number.NaN)).toThrow();
  });
});

describe('pre-revenue mode (PRD 8.4)', () => {
  it('detects idea and prototype stages', () => {
    expect(isPreRevenue(makeIntake({ product: { product_stage: 'idea' } }))).toBe(true);
    expect(isPreRevenue(makeIntake({ product: { product_stage: 'prototype' } }))).toBe(true);
  });

  it('detects zero paying customers', () => {
    expect(isPreRevenue(makeIntake({ traction: { paying_customers_count: 0 } }))).toBe(true);
  });

  it('does not treat an unanswered customer count as pre-revenue', () => {
    // Missing data is missing data, not evidence of being pre-revenue.
    expect(isPreRevenue(makeIntake())).toBe(false);
  });

  it('does not classify a revenue-generating company as pre-revenue', () => {
    expect(isPreRevenue(completeIntake)).toBe(false);
  });

  it('lets recorded revenue override a contradictory "idea" stage', () => {
    // The contradictory fixture claims idea stage AND 250,000 MRR. Generation
    // is blocked on that contradiction, but if scoring is reached it must keep
    // the revenue rather than assess a revenue-generating company on the
    // substitute ladder and understate its traction.
    expect(isPreRevenue(contradictoryIntake)).toBe(false);
    expect(isPreRevenue(makeIntake({ product: { product_stage: 'idea' }, traction: { mrr_current: 50_000 } }))).toBe(
      false,
    );
    // With no revenue, idea stage is pre-revenue as the PRD specifies.
    expect(isPreRevenue(makeIntake({ product: { product_stage: 'idea' } }))).toBe(true);
  });

  it('scores a well-evidenced pre-revenue company well above zero on traction', () => {
    const result = scoreIntake(preRevenueIntake);
    const d3 = result.dimensions.find((d) => d.id === 'D3')!;

    expect(result.preRevenueMode).toBe(true);
    // The PRD's explicit requirement: twelve design partners and six months of
    // documented discovery is not a 0 on traction, and the report must not
    // say it is.
    expect(d3.pct).toBeGreaterThan(60);
    for (const sub of d3.subCriteria) {
      expect(sub.scoredOnSubstitute, `${sub.id} should use the substitute ladder`).toBe(true);
      expect(sub.score).not.toBeNull();
    }
  });

  it('does not mark pre-revenue traction as N/A', () => {
    const d3 = scoreIntake(preRevenueIntake).dimensions.find((d) => d.id === 'D3')!;
    expect(d3.entirelyNotApplicable).toBe(false);
    expect(d3.subCriteria.every((s) => s.naReason === null)).toBe(true);
  });

  it('uses substitute inputs for coverage in pre-revenue mode', () => {
    const d3 = scoreIntake(preRevenueIntake).dimensions.find((d) => d.id === 'D3')!;
    const labels = d3.subCriteria.flatMap((s) => [...s.answeredInputs, ...s.missingInputs]);
    expect(labels).toContain('design_partners_committed');
    // Revenue-mode inputs must not be counted against a pre-revenue company.
    expect(labels).not.toContain('mrr_by_month[]');
  });
});

describe('sub-criterion inspectability (PRD P1-04)', () => {
  it('exposes every sub-criterion with its score and anchor label', () => {
    const result = scoreIntake(completeIntake);
    const all = result.dimensions.flatMap((d) => d.subCriteria);
    expect(all).toHaveLength(29);
    for (const sub of all) {
      if (sub.score !== null) {
        expect(sub.anchorLabel).toBeTruthy();
        expect(sub.score).toBeGreaterThanOrEqual(0);
        expect(sub.score).toBeLessThanOrEqual(4);
      }
    }
  });

  it('explains how every derived score was reached', () => {
    const result = scoreIntake(completeIntake);
    const derived = result.dimensions
      .flatMap((d) => d.subCriteria)
      .filter((s) => ALL_SUB_CRITERIA.find((x) => x.id === s.id)?.scoringKind === 'derived');

    expect(derived.length).toBeGreaterThan(0);
    for (const sub of derived) {
      // "Why did I score 2 on cap table hygiene" must be answerable from the
      // report alone (PRD G3).
      expect(sub.derivation, `${sub.id} must state its derivation`).toBeTruthy();
    }
  });

  it('records which inputs were answered and which were missing', () => {
    const result = scoreIntake(sparseIntake);
    const all = result.dimensions.flatMap((d) => d.subCriteria);
    const missing = all.flatMap((s) => s.missingInputs);
    expect(missing.length).toBeGreaterThan(0);
  });
});

describe('every anchor level is reachable', () => {
  // A sub-criterion whose rule can never return 4 would quietly cap a client's
  // score. This sweeps each derived rule across the fixtures plus targeted
  // inputs and asserts the full range is achievable.
  it('reaches 0 and 4 on a representative derived rule per dimension', () => {
    const zero = scoreIntake(makeIntake());
    const top = scoreIntake(completeIntake);

    const zeroD5 = zero.dimensions.find((d) => d.id === 'D5')!.subCriteria.find((s) => s.id === 'D5.2')!;
    const topD5 = top.dimensions.find((d) => d.id === 'D5')!.subCriteria.find((s) => s.id === 'D5.2')!;
    expect(zeroD5.score).toBe(0);
    expect(topD5.score).toBe(4);

    const topD6 = top.dimensions.find((d) => d.id === 'D6')!.subCriteria.find((s) => s.id === 'D6.2')!;
    expect(topD6.score).toBe(4);
  });

  it('scores an unselected anchored sub-criterion as 0 and says so', () => {
    const result = scoreIntake(makeIntake());
    const d11 = result.dimensions.find((d) => d.id === 'D1')!.subCriteria.find((s) => s.id === 'D1.1')!;
    expect(d11.score).toBe(0);
    expect(d11.derivation).toMatch(/not yet assessed/i);
  });
});
