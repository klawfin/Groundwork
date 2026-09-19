/**
 * The narrow seam between "which service do we call" and everything else.
 *
 * A transport sends ONE request and reports what came back. It does not gate
 * cost, does not retry, does not validate, and does not decide what a failure
 * means. Those rules are PRD-mandated and live once, in client.ts, so that a
 * change to the single-retry rule cannot be applied to one provider and
 * forgotten on the other.
 *
 * This file exists because there are two providers TODAY - Anthropic and
 * OpenRouter - not in anticipation of a third.
 */

import type { TokenUsage } from './cost';
import type { AssembledPrompt } from './prompt';

/** What one request returned. */
export interface TransportResult {
  /** The model's structured output, already parsed from JSON. */
  parsedOutput: unknown;
  usage: TokenUsage;
  /** Normalised: 'end_turn' | 'max_tokens' | 'refusal' | provider-specific. */
  stopReason: string | null;
  /**
   * Exact cost in USD when the provider reports it.
   *
   * OpenRouter does; Anthropic does not. When present it is recorded in place
   * of the computed estimate, because an exact figure from the biller beats a
   * local calculation against a pricing table that can go stale.
   */
  reportedCostUsd: number | null;
  requestId: string | null;
}

/**
 * Sends one request.
 *
 * `repairMessage` is passed in rather than imported so the corrective retry
 * wording stays identical across providers - it is part of the prompt
 * contract, not part of the transport.
 */
export type Transport = (
  prompt: AssembledPrompt,
  repairFor: readonly string[] | null,
  repairMessage: (errors: readonly string[]) => string,
) => Promise<TransportResult>;

export type GenerationFailureReason =
  | 'budget_exceeded'
  | 'schema_invalid'
  | 'rate_limited'
  | 'timeout'
  | 'api_error'
  | 'refusal'
  | 'max_tokens';

export interface ClassifiedError {
  reason: GenerationFailureReason;
  message: string;
  retryable: boolean;
}
