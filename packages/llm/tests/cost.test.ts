/**
 * Cost tests.
 *
 * readme.md: "Cost computation against known token counts. Cap enforcement."
 *
 * The cap is the only thing standing between a bug and the prepaid credit, so
 * it is asserted rather than assumed.
 */

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_COST_CAP_PAISE,
  MAX_OUTPUT_TOKENS,
  MAX_RETRIES,
  PRICING,
  USD_INR_RATE,
  computeCost,
  costStats,
  estimateTokens,
  exceedsSoftTarget,
  formatPaise,
  paiseToRupees,
  preflight,
  pricingFor,
} from '../src/cost';

describe('pricing table', () => {
  it('prices every model it lists with positive rates', () => {
    for (const [id, row] of Object.entries(PRICING)) {
      expect(row.modelId).toBe(id);
      expect(row.inputUsdPerMTok).toBeGreaterThan(0);
      expect(row.outputUsdPerMTok).toBeGreaterThan(row.inputUsdPerMTok);
      expect(row.cacheReadUsdPerMTok).toBeLessThan(row.inputUsdPerMTok);
      expect(row.cacheWriteUsdPerMTok).toBeGreaterThan(row.inputUsdPerMTok);
    }
  });

  it('uses model ids with no date suffix', () => {
    // Current model ids are complete as written. A date-suffixed id is a 404
    // at request time, which would surface as a failed generation on the
    // morning of a client meeting.
    for (const id of Object.keys(PRICING)) {
      expect(id).not.toMatch(/-\d{8}$/);
    }
  });

  it('throws on an unknown model rather than pricing it at zero', () => {
    // A silent zero would make the cost ledger - the only defence against
    // runaway spend - lie.
    expect(() => pricingFor('claude-not-a-real-model')).toThrow(/No pricing row/);
  });
});

describe('computeCost', () => {
  const sonnet = pricingFor('claude-sonnet-5');

  it('computes a known token count correctly', () => {
    // 1M input at $2/MTok = $2 = Rs.176 = 17,600 paise at Rs.88/USD.
    const cost = computeCost({ inputTokens: 1_000_000, outputTokens: 0 }, sonnet, 88);
    expect(cost.inputPaise).toBe(17_600);
    expect(cost.outputPaise).toBe(0);
    expect(cost.totalPaise).toBe(17_600);
  });

  it('prices output at the output rate', () => {
    // 1M output at $10/MTok = $10 = Rs.880 = 88,000 paise.
    const cost = computeCost({ inputTokens: 0, outputTokens: 1_000_000 }, sonnet, 88);
    expect(cost.outputPaise).toBe(88_000);
  });

  it('returns integer paise, never a float', () => {
    const cost = computeCost({ inputTokens: 12_345, outputTokens: 6_789 }, sonnet);
    for (const value of [cost.inputPaise, cost.outputPaise, cost.totalPaise]) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it('components sum to the total', () => {
    const cost = computeCost(
      { inputTokens: 9_000, outputTokens: 4_000, cacheCreationTokens: 2_000, cacheReadTokens: 6_000 },
      sonnet,
    );
    expect(cost.inputPaise + cost.outputPaise + cost.cacheWritePaise + cost.cacheReadPaise).toBe(
      cost.totalPaise,
    );
  });

  it('treats absent cache usage as zero', () => {
    const cost = computeCost({ inputTokens: 100, outputTokens: 100 }, sonnet);
    expect(cost.cacheWritePaise).toBe(0);
    expect(cost.cacheReadPaise).toBe(0);
  });

  it('records the pricing version so historical costs stay correct', () => {
    const cost = computeCost({ inputTokens: 1, outputTokens: 1 }, sonnet);
    expect(cost.pricingVersion).toBe(sonnet.pricingVersion);
    expect(cost.usdInrRate).toBe(USD_INR_RATE);
  });

  it('costs a realistic report well under the Rs.40 cap', () => {
    // A single narrative generation: roughly 14k input, 5k output. This is the
    // figure PRD G7 is about.
    for (const modelId of Object.keys(PRICING)) {
      const cost = computeCost(
        { inputTokens: 14_000, outputTokens: 5_000 },
        pricingFor(modelId),
      );
      expect(cost.totalPaise, `${modelId} exceeds the cap on a typical report`).toBeLessThan(
        DEFAULT_COST_CAP_PAISE,
      );
    }
  });
});

describe('preflight (PRD 6.6 - hard abort)', () => {
  const sonnet = pricingFor('claude-sonnet-5');

  it('permits a request comfortably within the cap', () => {
    const gate = preflight(14_000, sonnet, 0);
    expect(gate.withinCap).toBe(true);
    expect(gate.reason).toMatch(/Estimated worst case/);
  });

  it('assumes the full max_tokens of output, not an optimistic figure', () => {
    // A cap that only holds when the model happens to be terse is not a cap.
    const gate = preflight(1_000, sonnet, 0);
    expect(gate.assumedOutputTokens).toBe(MAX_OUTPUT_TOKENS);
  });

  it('refuses when cumulative spend would breach the cap', () => {
    const gate = preflight(14_000, sonnet, DEFAULT_COST_CAP_PAISE - 10);
    expect(gate.withinCap).toBe(false);
    expect(gate.reason).toMatch(/Aborted before dispatch/);
  });

  it('counts prior retries against the same cap', () => {
    const first = preflight(14_000, sonnet, 0);
    const second = preflight(14_000, sonnet, first.worstCasePaise);
    expect(second.cumulativePaise).toBe(first.worstCasePaise);
  });

  it('refuses an enormous input rather than spending on it', () => {
    const gate = preflight(5_000_000, sonnet, 0);
    expect(gate.withinCap).toBe(false);
  });

  it('respects a caller-supplied cap', () => {
    expect(preflight(14_000, sonnet, 0, 1).withinCap).toBe(false);
    expect(preflight(14_000, sonnet, 0, 1_000_000).withinCap).toBe(true);
  });

  it('is exactly at the boundary when the projection equals the cap', () => {
    const gate = preflight(14_000, sonnet, 0);
    const exact = preflight(14_000, sonnet, 0, gate.worstCasePaise);
    expect(exact.withinCap).toBe(true);
    const oneUnder = preflight(14_000, sonnet, 0, gate.worstCasePaise - 1);
    expect(oneUnder.withinCap).toBe(false);
  });
});

describe('retry policy', () => {
  it('permits exactly one retry, never a loop', () => {
    // PRD 6.6: "Maximum one retry per generation. Never a retry loop."
    expect(MAX_RETRIES).toBe(1);
  });

  it('caps output tokens at the documented hard limit', () => {
    expect(MAX_OUTPUT_TOKENS).toBe(8_000);
  });
});

describe('estimateTokens', () => {
  it('is pessimistic, so the gate errs towards refusing', () => {
    const text = 'a'.repeat(3_500);
    // chars/3.5 = 1000, higher than the ~875 a chars/4 estimate would give.
    expect(estimateTokens(text)).toBe(1_000);
    expect(estimateTokens(text)).toBeGreaterThan(text.length / 4);
  });

  it('handles an empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });
});

describe('display', () => {
  it('formats paise as rupees to two decimals', () => {
    expect(formatPaise(4_000)).toBe('Rs.40.00');
    expect(formatPaise(1_567)).toBe('Rs.15.67');
    expect(formatPaise(0)).toBe('Rs.0.00');
  });

  it('converts paise to rupees', () => {
    expect(paiseToRupees(4_000)).toBe(40);
  });

  it('flags a report over the soft target (PRD P1-10)', () => {
    expect(exceedsSoftTarget(4_001)).toBe(true);
    expect(exceedsSoftTarget(4_000)).toBe(false);
    expect(exceedsSoftTarget(1_200)).toBe(false);
  });
});

describe('costStats (PRD P1-10, M5)', () => {
  it('handles an empty set', () => {
    expect(costStats([])).toEqual({
      count: 0,
      totalPaise: 0,
      medianPaise: 0,
      p95Paise: 0,
      overTargetCount: 0,
    });
  });

  it('computes median and p95 by nearest rank', () => {
    const stats = costStats([100, 200, 300, 400, 500]);
    expect(stats.count).toBe(5);
    expect(stats.totalPaise).toBe(1_500);
    expect(stats.medianPaise).toBe(300);
    expect(stats.p95Paise).toBe(500);
  });

  it('is order-independent', () => {
    expect(costStats([500, 100, 300, 200, 400])).toEqual(costStats([100, 200, 300, 400, 500]));
  });

  it('counts reports over the soft target', () => {
    expect(costStats([1_000, 5_000, 6_000]).overTargetCount).toBe(2);
  });

  it('handles a single report', () => {
    const stats = costStats([2_500]);
    expect(stats.medianPaise).toBe(2_500);
    expect(stats.p95Paise).toBe(2_500);
  });
});
