/**
 * Token accounting and cost control.
 *
 * CONSTRAINT (PRD G7, 6.6): under ~Rs.40 of Anthropic API spend per report,
 * computed from actual response usage rather than estimated, and logged on
 * every generation.
 *
 * Money is integer paise throughout (architecture 3.1). Never a float, never
 * a currency type. Rupee figures are produced only for display.
 *
 * Pure: no network, no clock. The caller supplies usage and a pricing row.
 */

/* -------------------------------------------------------------------------- */
/* Pricing                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Per-model pricing, in USD per million tokens.
 *
 * CORRECTION TO THE PRD: PRD 6.6 budgets at $3/MTok input and $15/MTok output.
 * Those are previous-generation Sonnet rates. Current first-party rates are
 * below, and the mid-tier option is now CHEAPER than the PRD assumed, not
 * dearer - which widens the headroom under the Rs.40 ceiling rather than
 * narrowing it.
 *
 * PRD OPEN-05 asks Nikhil to A/B a mid-tier against a frontier model on real
 * intakes before fixing a default. That A/B is a change to ANTHROPIC_MODEL_ID
 * and nothing else, because every model in this table is priced here.
 *
 * Note on model ids: these strings are complete as written. Do NOT append a
 * date suffix. (Architecture 4.4 advises pinning a dated snapshot; that advice
 * predates the current naming and would now produce an invalid model id.)
 *
 * VERIFY before relying on these for a real budget - vendor pricing changes,
 * and a stale row here silently misstates every cost in the ledger. That is
 * what `pricingVersion` is for: historical costs keep the row that priced them.
 */
export interface ModelPricing {
  pricingVersion: string;
  modelId: string;
  inputUsdPerMTok: number;
  outputUsdPerMTok: number;
  /** Cache writes cost a premium; cache reads are heavily discounted. */
  cacheWriteUsdPerMTok: number;
  cacheReadUsdPerMTok: number;
}

export const USD_INR_RATE = 88;

export const PRICING: Readonly<Record<string, ModelPricing>> = {
  'claude-opus-5': {
    pricingVersion: '2026-09-anthropic-v1',
    modelId: 'claude-opus-5',
    inputUsdPerMTok: 5,
    outputUsdPerMTok: 25,
    cacheWriteUsdPerMTok: 6.25,
    cacheReadUsdPerMTok: 0.5,
  },
  'claude-sonnet-5': {
    pricingVersion: '2026-09-anthropic-v1',
    modelId: 'claude-sonnet-5',
    inputUsdPerMTok: 2,
    outputUsdPerMTok: 10,
    cacheWriteUsdPerMTok: 2.5,
    cacheReadUsdPerMTok: 0.2,
  },
  'claude-haiku-4-5': {
    pricingVersion: '2026-09-anthropic-v1',
    modelId: 'claude-haiku-4-5',
    inputUsdPerMTok: 1,
    outputUsdPerMTok: 5,
    cacheWriteUsdPerMTok: 1.25,
    cacheReadUsdPerMTok: 0.1,
  },
};

export function pricingFor(modelId: string): ModelPricing {
  const row = PRICING[modelId];
  if (!row) {
    // Failing loudly beats guessing. An unknown model priced at zero would
    // make the cost ledger - the only defence against runaway spend - lie.
    throw new Error(
      `No pricing row for model "${modelId}". Add it to PRICING before using this model, or the cost ledger will under-report.`,
    );
  }
  return row;
}

/* -------------------------------------------------------------------------- */
/* Caps                                                                       */
/* -------------------------------------------------------------------------- */

/** Hard per-report cost cap in paise. Rs.40 = 4000 paise (PRD, architecture). */
export const DEFAULT_COST_CAP_PAISE = 4_000;

/** Soft target above which a report is visibly flagged (PRD P1-10). */
export const SOFT_TARGET_PAISE = 4_000;

/** `max_tokens` hard cap. Not advisory (PRD 6.6). */
export const MAX_OUTPUT_TOKENS = 8_000;

/** Exactly one retry per generation. Never a loop (PRD 6.6, 8.2). */
export const MAX_RETRIES = 1;

/* -------------------------------------------------------------------------- */
/* Usage and cost                                                             */
/* -------------------------------------------------------------------------- */

/** Token usage as reported by the API response. */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
}

export interface CostBreakdown {
  inputPaise: number;
  outputPaise: number;
  cacheWritePaise: number;
  cacheReadPaise: number;
  totalPaise: number;
  pricingVersion: string;
  modelId: string;
  usdInrRate: number;
}

/**
 * Compute cost in integer paise from actual usage.
 *
 * Rounding: each component rounds to the nearest paisa independently, then
 * sums. Rounding once at the end would be marginally more accurate but would
 * make the per-component figures in the ledger fail to add up to the total,
 * which is confusing in exactly the place you least want confusion.
 */
export function computeCost(
  usage: TokenUsage,
  pricing: ModelPricing,
  usdInrRate: number = USD_INR_RATE,
): CostBreakdown {
  const paise = (tokens: number, usdPerMTok: number): number =>
    Math.round((tokens / 1_000_000) * usdPerMTok * usdInrRate * 100);

  const inputPaise = paise(usage.inputTokens, pricing.inputUsdPerMTok);
  const outputPaise = paise(usage.outputTokens, pricing.outputUsdPerMTok);
  const cacheWritePaise = paise(usage.cacheCreationTokens ?? 0, pricing.cacheWriteUsdPerMTok);
  const cacheReadPaise = paise(usage.cacheReadTokens ?? 0, pricing.cacheReadUsdPerMTok);

  return {
    inputPaise,
    outputPaise,
    cacheWritePaise,
    cacheReadPaise,
    totalPaise: inputPaise + outputPaise + cacheWritePaise + cacheReadPaise,
    pricingVersion: pricing.pricingVersion,
    modelId: pricing.modelId,
    usdInrRate,
  };
}

/* -------------------------------------------------------------------------- */
/* Pre-flight                                                                 */
/* -------------------------------------------------------------------------- */

export interface PreflightEstimate {
  estimatedInputTokens: number;
  assumedOutputTokens: number;
  worstCasePaise: number;
  cumulativePaise: number;
  capPaise: number;
  /** False means the request must NOT fire (PRD 6.6: hard abort). */
  withinCap: boolean;
  reason: string;
}

/**
 * Decide whether a generation may fire, BEFORE spending anything.
 *
 * PRD 6.6: "Hard abort if the pre-flight estimate exceeds the cap. The request
 * does not fire." Worst case assumes the full `max_tokens` of output, because
 * a cap that only holds when the model is terse is not a cap.
 *
 * @param estimatedInputTokens From the token-counting endpoint where available.
 *                             `estimateTokens` is the fallback.
 * @param cumulativePaise      Already spent on this report - retries included.
 */
export function preflight(
  estimatedInputTokens: number,
  pricing: ModelPricing,
  cumulativePaise: number,
  capPaise: number = DEFAULT_COST_CAP_PAISE,
  maxOutputTokens: number = MAX_OUTPUT_TOKENS,
  usdInrRate: number = USD_INR_RATE,
): PreflightEstimate {
  const worstCase = computeCost(
    { inputTokens: estimatedInputTokens, outputTokens: maxOutputTokens },
    pricing,
    usdInrRate,
  );
  const projected = cumulativePaise + worstCase.totalPaise;
  const withinCap = projected <= capPaise;

  return {
    estimatedInputTokens,
    assumedOutputTokens: maxOutputTokens,
    worstCasePaise: worstCase.totalPaise,
    cumulativePaise,
    capPaise,
    withinCap,
    reason: withinCap
      ? `Estimated worst case ${formatPaise(worstCase.totalPaise)} on top of ${formatPaise(
          cumulativePaise,
        )} already spent, against a cap of ${formatPaise(capPaise)}.`
      : `Aborted before dispatch: worst case ${formatPaise(
          worstCase.totalPaise,
        )} plus ${formatPaise(cumulativePaise)} already spent would reach ${formatPaise(
          projected,
        )}, over the ${formatPaise(capPaise)} cap.`,
  };
}

/**
 * Rough token estimate for pre-flight when the counting endpoint is
 * unavailable.
 *
 * Deliberately pessimistic (chars/3.5 rather than the ~4 that is typical), so
 * the pre-flight gate errs towards refusing a borderline request rather than
 * towards overspending. Architecture 4.6 specifies this fallback.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

/* -------------------------------------------------------------------------- */
/* Display                                                                    */
/* -------------------------------------------------------------------------- */

/** Paise to a rupee string for the UI and the audit log. */
export function formatPaise(paise: number): string {
  return `Rs.${(paise / 100).toFixed(2)}`;
}

export function paiseToRupees(paise: number): number {
  return paise / 100;
}

/** PRD P1-10: reports over the soft target are visibly flagged. */
export function exceedsSoftTarget(totalPaise: number): boolean {
  return totalPaise > SOFT_TARGET_PAISE;
}

/* -------------------------------------------------------------------------- */
/* Aggregates for the usage view (PRD P1-10)                                  */
/* -------------------------------------------------------------------------- */

export interface CostStats {
  count: number;
  totalPaise: number;
  medianPaise: number;
  p95Paise: number;
  overTargetCount: number;
}

/**
 * Median and p95 per-report cost (PRD P1-10, M5).
 *
 * Uses the nearest-rank percentile: with the handful of reports Phase 1 will
 * produce, interpolation implies a precision that is not there.
 */
export function costStats(reportCostsPaise: readonly number[]): CostStats {
  if (reportCostsPaise.length === 0) {
    return { count: 0, totalPaise: 0, medianPaise: 0, p95Paise: 0, overTargetCount: 0 };
  }
  const sorted = [...reportCostsPaise].sort((a, b) => a - b);
  const rank = (p: number) => sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]!;

  return {
    count: sorted.length,
    totalPaise: sorted.reduce((acc, v) => acc + v, 0),
    medianPaise: rank(0.5),
    p95Paise: rank(0.95),
    overTargetCount: sorted.filter(exceedsSoftTarget).length,
  };
}
