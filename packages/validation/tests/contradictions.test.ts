/**
 * Contradiction check tests.
 *
 * readme.md: "Every check, both directions - fires when it should, stays
 * silent when it should not."
 *
 * The silent direction matters as much as the firing direction. A check that
 * fires on a clean intake trains Dhruv to dismiss warnings without reading
 * them, which destroys the value of the mechanism.
 */

import { describe, expect, it } from 'vitest';

import {
  CHECKS,
  checkContradictions,
  unresolvedBlocking,
} from '@klawfin/validation';
import {
  completeIntake,
  contradictoryIntake,
  makeIntake,
  preRevenueIntake,
  sparseIntake,
} from '@klawfin/core/tests/fixtures';

/** Fixed reference date so date-relative checks are deterministic. */
const AS_OF = new Date('2026-09-19T00:00:00Z');

const codes = (intake: Parameters<typeof checkContradictions>[0]) =>
  checkContradictions(intake, AS_OF).contradictions.map((c) => c.code);

describe('check registry', () => {
  it('has unique codes', () => {
    const seen = new Set(CHECKS.map((c) => c.code));
    expect(seen.size).toBe(CHECKS.length);
  });

  it('names implicated fields on every check so the UI can link to them', () => {
    for (const check of CHECKS) {
      expect(check.fields.length, check.code).toBeGreaterThan(0);
    }
  });
});

describe('stays silent on clean intakes', () => {
  it('fires nothing on a complete, consistent intake', () => {
    const report = checkContradictions(completeIntake, AS_OF);
    expect(report.contradictions).toEqual([]);
    expect(report.canGenerate).toBe(true);
  });

  it('fires nothing on a consistent pre-revenue intake', () => {
    // A pre-revenue company is not a contradictory one. If these checks fired
    // on every early-stage client they would be worthless.
    const report = checkContradictions(preRevenueIntake, AS_OF);
    expect(report.contradictions).toEqual([]);
    expect(report.canGenerate).toBe(true);
  });

  it('fires nothing on a sparse intake', () => {
    // Missing data is a coverage problem, not a contradiction. Conflating the
    // two would block generation for the wrong reason.
    expect(checkContradictions(sparseIntake, AS_OF).contradictions).toEqual([]);
  });

  it('fires nothing on a completely empty intake', () => {
    expect(checkContradictions(makeIntake(), AS_OF).contradictions).toEqual([]);
  });
});

describe('REVENUE_WITHOUT_CUSTOMERS (blocking)', () => {
  it('fires when revenue exists with zero paying customers', () => {
    const intake = makeIntake({ traction: { mrr_current: 250_000, paying_customers_count: 0 } });
    expect(codes(intake)).toContain('REVENUE_WITHOUT_CUSTOMERS');
  });

  it('stays silent when both are zero', () => {
    const intake = makeIntake({ traction: { mrr_current: 0, paying_customers_count: 0 } });
    expect(codes(intake)).not.toContain('REVENUE_WITHOUT_CUSTOMERS');
  });

  it('stays silent when customers are unrecorded', () => {
    const intake = makeIntake({ traction: { mrr_current: 250_000 } });
    expect(codes(intake)).not.toContain('REVENUE_WITHOUT_CUSTOMERS');
  });
});

describe('ARR_MRR_MISMATCH (warning)', () => {
  it('fires when ARR is far from MRR x 12', () => {
    const intake = makeIntake({ traction: { mrr_current: 100_000, arr_current: 500_000 } });
    expect(codes(intake)).toContain('ARR_MRR_MISMATCH');
  });

  it('stays silent within tolerance', () => {
    const intake = makeIntake({ traction: { mrr_current: 100_000, arr_current: 1_250_000 } });
    expect(codes(intake)).not.toContain('ARR_MRR_MISMATCH');
  });

  it('stays silent when ARR is exactly MRR x 12', () => {
    const intake = makeIntake({ traction: { mrr_current: 100_000, arr_current: 1_200_000 } });
    expect(codes(intake)).not.toContain('ARR_MRR_MISMATCH');
  });

  it('is classified a warning, never blocking', () => {
    const intake = makeIntake({ traction: { mrr_current: 100_000, arr_current: 500_000 } });
    const report = checkContradictions(intake, AS_OF);
    expect(report.blocking.map((c) => c.code)).not.toContain('ARR_MRR_MISMATCH');
    expect(report.canGenerate).toBe(true);
  });
});

describe('MARKET_SIZE_INVERTED (blocking)', () => {
  it('fires when SAM exceeds TAM', () => {
    expect(codes(makeIntake({ market: { tam: 100, sam: 200 } }))).toContain('MARKET_SIZE_INVERTED');
  });

  it('fires when SOM exceeds SAM', () => {
    expect(codes(makeIntake({ market: { tam: 1000, sam: 200, som: 400 } }))).toContain(
      'MARKET_SIZE_INVERTED',
    );
  });

  it('stays silent on a properly nested set', () => {
    expect(codes(makeIntake({ market: { tam: 1000, sam: 200, som: 40 } }))).not.toContain(
      'MARKET_SIZE_INVERTED',
    );
  });

  it('stays silent when only some figures are present', () => {
    expect(codes(makeIntake({ market: { tam: 1000 } }))).not.toContain('MARKET_SIZE_INVERTED');
  });

  it('allows equal values at the boundary', () => {
    expect(codes(makeIntake({ market: { tam: 1000, sam: 1000, som: 1000 } }))).not.toContain(
      'MARKET_SIZE_INVERTED',
    );
  });
});

describe('CAP_TABLE_DOES_NOT_TOTAL_100 (blocking)', () => {
  it('fires when holdings do not reconcile', () => {
    const intake = makeIntake({
      cap_table_legal: {
        cap_table: { holders: [{ ref: 'F1', category: 'founder', equity_bp: 6000 }] },
      },
    });
    expect(codes(intake)).toContain('CAP_TABLE_DOES_NOT_TOTAL_100');
  });

  it('stays silent when holdings total exactly 100%', () => {
    const intake = makeIntake({
      cap_table_legal: {
        cap_table: {
          holders: [
            { ref: 'F1', category: 'founder', equity_bp: 9000 },
            { ref: 'ESOP', category: 'esop_pool', equity_bp: 1000 },
          ],
        },
      },
    });
    expect(codes(intake)).not.toContain('CAP_TABLE_DOES_NOT_TOTAL_100');
  });

  it('tolerates rounding within 50 basis points', () => {
    const intake = makeIntake({
      cap_table_legal: {
        cap_table: { holders: [{ ref: 'F1', category: 'founder', equity_bp: 9970 }] },
      },
    });
    expect(codes(intake)).not.toContain('CAP_TABLE_DOES_NOT_TOTAL_100');
  });

  it('stays silent when no cap table has been entered', () => {
    expect(codes(makeIntake())).not.toContain('CAP_TABLE_DOES_NOT_TOTAL_100');
  });
});

describe('USE_OF_FUNDS_DOES_NOT_TOTAL_100 (blocking)', () => {
  it('fires when percentages do not total 100', () => {
    const intake = makeIntake({
      ask: { use_of_funds_breakdown: [{ category: 'Eng', pct: 70 }, { category: 'Mktg', pct: 50 }] },
    });
    expect(codes(intake)).toContain('USE_OF_FUNDS_DOES_NOT_TOTAL_100');
  });

  it('stays silent when they total 100', () => {
    const intake = makeIntake({
      ask: { use_of_funds_breakdown: [{ category: 'Eng', pct: 60 }, { category: 'Mktg', pct: 40 }] },
    });
    expect(codes(intake)).not.toContain('USE_OF_FUNDS_DOES_NOT_TOTAL_100');
  });

  it('stays silent when no breakdown has been entered', () => {
    expect(codes(makeIntake())).not.toContain('USE_OF_FUNDS_DOES_NOT_TOTAL_100');
  });
});

describe('product stage contradictions (blocking)', () => {
  it('fires on idea stage with live users', () => {
    const intake = makeIntake({ product: { product_stage: 'idea', live_users_count: 4000 } });
    expect(codes(intake)).toContain('IDEA_STAGE_WITH_LIVE_USERS');
  });

  it('stays silent on idea stage with zero users', () => {
    const intake = makeIntake({ product: { product_stage: 'idea', live_users_count: 0 } });
    expect(codes(intake)).not.toContain('IDEA_STAGE_WITH_LIVE_USERS');
  });

  it('stays silent on live stage with users', () => {
    const intake = makeIntake({ product: { product_stage: 'live', live_users_count: 4000 } });
    expect(codes(intake)).not.toContain('IDEA_STAGE_WITH_LIVE_USERS');
  });

  it('fires on prototype stage with revenue', () => {
    const intake = makeIntake({
      product: { product_stage: 'prototype' },
      traction: { mrr_current: 50_000 },
    });
    expect(codes(intake)).toContain('IDEA_STAGE_WITH_REVENUE');
  });

  it('stays silent on beta stage with revenue', () => {
    const intake = makeIntake({
      product: { product_stage: 'beta' },
      traction: { mrr_current: 50_000 },
    });
    expect(codes(intake)).not.toContain('IDEA_STAGE_WITH_REVENUE');
  });
});

describe('date checks (warning)', () => {
  it('fires when incorporation is in the future', () => {
    const intake = makeIntake({ cap_table_legal: { incorporation_date: '2027-01-01' } });
    expect(codes(intake)).toContain('INCORPORATION_DATE_IN_FUTURE');
  });

  it('stays silent on a past incorporation date', () => {
    const intake = makeIntake({ cap_table_legal: { incorporation_date: '2023-06-12' } });
    expect(codes(intake)).not.toContain('INCORPORATION_DATE_IN_FUTURE');
  });

  it('fires when revenue predates incorporation', () => {
    const intake = makeIntake({
      cap_table_legal: { incorporation_date: '2026-05-01' },
      traction: { mrr_by_month: [{ month: '2026-01', value: 1000 }] },
    });
    expect(codes(intake)).toContain('REVENUE_BEFORE_INCORPORATION');
  });

  it('stays silent when revenue follows incorporation', () => {
    const intake = makeIntake({
      cap_table_legal: { incorporation_date: '2026-01-01' },
      traction: { mrr_by_month: [{ month: '2026-05', value: 1000 }] },
    });
    expect(codes(intake)).not.toContain('REVENUE_BEFORE_INCORPORATION');
  });
});

describe('PERCENTAGE_OUT_OF_RANGE (blocking)', () => {
  it('fires on churn above 100', () => {
    expect(codes(makeIntake({ traction: { churn_rate: 140 } }))).toContain('PERCENTAGE_OUT_OF_RANGE');
  });

  it('fires on a negative percentage', () => {
    expect(codes(makeIntake({ product: { gross_margin_pct: -10 } }))).toContain(
      'PERCENTAGE_OUT_OF_RANGE',
    );
  });

  it('stays silent at the 0 and 100 boundaries', () => {
    const intake = makeIntake({ traction: { churn_rate: 0 }, product: { gross_margin_pct: 100 } });
    expect(codes(intake)).not.toContain('PERCENTAGE_OUT_OF_RANGE');
  });

  it('exempts NRR, which legitimately exceeds 100', () => {
    // Net revenue retention above 100% is the point of measuring it (PRD 8.3).
    expect(codes(makeIntake({ traction: { nrr: 135 } }))).not.toContain('PERCENTAGE_OUT_OF_RANGE');
  });
});

describe('MONTH_SERIES_DISORDERED (warning)', () => {
  it('fires on non-chronological entries', () => {
    const intake = makeIntake({
      traction: {
        mrr_by_month: [
          { month: '2026-06', value: 100 },
          { month: '2026-04', value: 90 },
        ],
      },
    });
    expect(codes(intake)).toContain('MONTH_SERIES_DISORDERED');
  });

  it('fires on a gap in the sequence', () => {
    const intake = makeIntake({
      traction: {
        mrr_by_month: [
          { month: '2026-01', value: 100 },
          { month: '2026-04', value: 200 },
        ],
      },
    });
    expect(codes(intake)).toContain('MONTH_SERIES_DISORDERED');
  });

  it('fires on a duplicated month', () => {
    const intake = makeIntake({
      traction: {
        mrr_by_month: [
          { month: '2026-01', value: 100 },
          { month: '2026-01', value: 120 },
        ],
      },
    });
    expect(codes(intake)).toContain('MONTH_SERIES_DISORDERED');
  });

  it('stays silent on a contiguous ordered series crossing a year boundary', () => {
    const intake = makeIntake({
      traction: {
        mrr_by_month: [
          { month: '2025-11', value: 100 },
          { month: '2025-12', value: 110 },
          { month: '2026-01', value: 120 },
        ],
      },
    });
    expect(codes(intake)).not.toContain('MONTH_SERIES_DISORDERED');
  });
});

describe('LTV_BELOW_CAC (warning)', () => {
  it('fires when LTV is below CAC', () => {
    expect(codes(makeIntake({ product: { cac: 90_000, ltv: 20_000 } }))).toContain('LTV_BELOW_CAC');
  });

  it('stays silent when LTV exceeds CAC', () => {
    expect(codes(makeIntake({ product: { cac: 20_000, ltv: 90_000 } }))).not.toContain(
      'LTV_BELOW_CAC',
    );
  });

  it('remains a warning even when unacknowledged - it is a finding, not an error', () => {
    const report = checkContradictions(makeIntake({ product: { cac: 90_000, ltv: 20_000 } }), AS_OF);
    expect(report.canGenerate).toBe(true);
  });
});

describe('cap table structural checks', () => {
  it('fires ESOP_OVER_ALLOCATED when grants exceed the pool', () => {
    const intake = makeIntake({
      cap_table_legal: {
        cap_table: {
          holders: [
            { ref: 'F1', category: 'founder', equity_bp: 9000 },
            { ref: 'ESOP', category: 'esop_pool', equity_bp: 1000, allocated_bp: 1500 },
          ],
        },
      },
    });
    expect(codes(intake)).toContain('ESOP_OVER_ALLOCATED');
  });

  it('stays silent when allocation is within the pool', () => {
    const intake = makeIntake({
      cap_table_legal: {
        cap_table: {
          holders: [
            { ref: 'F1', category: 'founder', equity_bp: 9000 },
            { ref: 'ESOP', category: 'esop_pool', equity_bp: 1000, allocated_bp: 400 },
          ],
        },
      },
    });
    expect(codes(intake)).not.toContain('ESOP_OVER_ALLOCATED');
  });

  it('fires NOT_INCORPORATED_WITH_CAP_TABLE', () => {
    const intake = makeIntake({
      cap_table_legal: {
        entity_type: 'not_incorporated',
        cap_table: { holders: [{ ref: 'F1', category: 'founder', equity_bp: 10_000 }] },
      },
    });
    expect(codes(intake)).toContain('NOT_INCORPORATED_WITH_CAP_TABLE');
  });
});

describe('the contradictory fixture', () => {
  it('trips every blocking class the PRD names', () => {
    const report = checkContradictions(contradictoryIntake, AS_OF);
    const fired = report.contradictions.map((c) => c.code);

    expect(fired).toContain('REVENUE_WITHOUT_CUSTOMERS');
    expect(fired).toContain('MARKET_SIZE_INVERTED');
    expect(fired).toContain('CAP_TABLE_DOES_NOT_TOTAL_100');
    expect(fired).toContain('USE_OF_FUNDS_DOES_NOT_TOTAL_100');
    expect(fired).toContain('IDEA_STAGE_WITH_LIVE_USERS');
    expect(fired).toContain('PERCENTAGE_OUT_OF_RANGE');

    expect(report.canGenerate).toBe(false);
    expect(report.blocking.length).toBeGreaterThanOrEqual(5);
    expect(report.warnings.length).toBeGreaterThan(0);
  });
});

describe('dismissal (PRD P1-05)', () => {
  const report = checkContradictions(contradictoryIntake, AS_OF);

  it('clears a blocking contradiction when dismissed with a reason', () => {
    const dismissals = report.blocking.map((c) => ({
      code: c.code,
      reason: 'Confirmed with the founder; the intake value was a typo and has been corrected.',
      dismissedBy: 'dhruv@example.invalid',
      dismissedAt: '2026-09-19T10:00:00Z',
    }));
    expect(unresolvedBlocking(report, dismissals)).toEqual([]);
  });

  it('does not clear anything when the reason is blank', () => {
    // The reason is the entire audit value of the mechanism. A blank reason
    // must not dismiss a blocking contradiction.
    const dismissals = report.blocking.map((c) => ({
      code: c.code,
      reason: '   ',
      dismissedBy: 'dhruv@example.invalid',
      dismissedAt: '2026-09-19T10:00:00Z',
    }));
    expect(unresolvedBlocking(report, dismissals)).toHaveLength(report.blocking.length);
  });

  it('leaves undismissed blocking contradictions in place', () => {
    const dismissals = [
      {
        code: 'MARKET_SIZE_INVERTED',
        reason: 'Figures corrected.',
        dismissedBy: 'dhruv@example.invalid',
        dismissedAt: '2026-09-19T10:00:00Z',
      },
    ];
    const remaining = unresolvedBlocking(report, dismissals);
    expect(remaining.map((c) => c.code)).not.toContain('MARKET_SIZE_INVERTED');
    expect(remaining.length).toBe(report.blocking.length - 1);
  });
});

describe('purity', () => {
  it('produces identical output for identical input', () => {
    const a = JSON.stringify(checkContradictions(contradictoryIntake, AS_OF));
    const b = JSON.stringify(checkContradictions(contradictoryIntake, AS_OF));
    expect(a).toBe(b);
  });
});
