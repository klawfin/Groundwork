/**
 * Anthropic API wrapper.
 *
 * The ONLY place in the codebase that holds the API key or makes a call to
 * Anthropic. Server-side only: `server-only` at the top makes an accidental
 * import from a Client Component a build-time failure rather than a key leak
 * (architecture 5.4 threat 7).
 *
 * Responsibilities, all of them mandated:
 *   - pre-flight cost gate, hard abort over cap (PRD 6.6)
 *   - exactly one retry, never a loop (PRD 6.6, 8.2)
 *   - structured output constrained by the Zod schema (PRD OPEN-04)
 *   - actual-usage cost computation for the ledger (PRD 6.6)
 *   - typed failures, never a throw into a blank screen (readme conventions)
 */

import 'server-only';

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

import {
  computeCost,
  estimateTokens,
  MAX_OUTPUT_TOKENS,
  MAX_RETRIES,
  preflight,
  pricingFor,
  USD_INR_RATE,
  type CostBreakdown,
  type TokenUsage,
} from './cost.js';
import { narrativeResponseSchema, validateNarrativeResponse, type NarrativeResponse } from './schema.js';
import { assemblePrompt, buildRepairMessage, type AssembledPrompt, type PromptFacts } from './prompt.js';

/**
 * Default model.
 *
 * PRD OPEN-05 leaves model choice to Nikhil, to be settled by A/B on real
 * intakes. Kept in configuration so that A/B is an env change, not a code
 * change, and so the chosen id is recorded on every report either way.
 *
 * These id strings are complete as written - never append a date suffix.
 */
export const DEFAULT_MODEL_ID = 'claude-opus-5';

/**
 * Prompt caching is OFF in Phase 1, deliberately (architecture ADR-008).
 *
 * Caching surcharges the cache WRITE and discounts reads, over a short TTL. At
 * Phase 1 volume - roughly one report a day or a week - every prompt would be
 * a cache miss paying the write premium, so enabling it would INCREASE cost.
 *
 * This contradicts PRD 6.6, which calls caching "the single largest lever" and
 * requires it from day one. The PRD's reasoning assumes reuse that Phase 1
 * volume does not produce. The prompt is structured cache-ready regardless
 * (prompt.ts assembly order), so switching this to `true` is the whole change.
 *
 * Switch it on at sustained >5 assessments/day, or when Phase 2 opens.
 */
export const ENABLE_PROMPT_CACHING = false;

export interface GenerateOptions {
  facts: PromptFacts;
  modelId?: string;
  /** Paise already spent on this report, retries included. */
  cumulativeCostPaise?: number;
  costCapPaise?: number;
  usdInrRate?: number;
  /** Per-call timeout, comfortably below the platform function limit. */
  timeoutMs?: number;
  apiKey?: string;
}

export type GenerationFailureReason =
  | 'budget_exceeded'
  | 'schema_invalid'
  | 'rate_limited'
  | 'timeout'
  | 'api_error'
  | 'refusal'
  | 'max_tokens';

/** Typed failure. Rendered by the UI; never thrown into a blank screen. */
export interface GenerationFailure {
  ok: false;
  reason: GenerationFailureReason;
  message: string;
  /** Present when the failure happened after a billable call. */
  cost: CostBreakdown | null;
  attempts: number;
  /** True when the caller should render the fallback report (PRD 8.2). */
  useFallback: boolean;
  schemaErrors?: readonly string[];
}

export interface GenerationSuccess {
  ok: true;
  response: NarrativeResponse;
  cost: CostBreakdown;
  usage: TokenUsage;
  modelId: string;
  promptVersion: string;
  attempts: number;
  latencyMs: number;
  /** Raw response, retained unmodified so edits can be diffed against it (P1-07). */
  raw: unknown;
}

export type GenerationResult = GenerationSuccess | GenerationFailure;

/** Latency measurement is injected so the module stays testable. */
export interface Clock {
  now(): number;
}

const systemClock: Clock = { now: () => Date.now() };

/**
 * Generate the narrative.
 *
 * One call, one retry at most. The retry is either a corrective schema repair
 * or a single backoff on a retryable transport error - never both, and never
 * a loop. PRD 6.6: "Maximum one retry per generation. Never a retry loop."
 */
export async function generateNarrative(
  options: GenerateOptions,
  clock: Clock = systemClock,
): Promise<GenerationResult> {
  const modelId = options.modelId ?? DEFAULT_MODEL_ID;
  const pricing = pricingFor(modelId);
  const usdInrRate = options.usdInrRate ?? USD_INR_RATE;
  const cumulative = options.cumulativeCostPaise ?? 0;

  const prompt = assemblePrompt(options.facts);

  // --- Pre-flight: hard abort before spending anything (PRD 6.6) -----------
  const estimatedInput = estimateTokens(prompt.system) + estimateTokens(prompt.user);
  const gate = preflight(estimatedInput, pricing, cumulative, options.costCapPaise, MAX_OUTPUT_TOKENS, usdInrRate);
  if (!gate.withinCap) {
    return {
      ok: false,
      reason: 'budget_exceeded',
      message: gate.reason,
      cost: null,
      attempts: 0,
      useFallback: false,
    };
  }

  const client = new Anthropic({
    ...(options.apiKey ? { apiKey: options.apiKey } : {}),
    // Below the platform function limit so our own timeout fires first: a
    // request killed by the platform gives no error body and no ledger row,
    // one killed by us gives both (architecture 4.5).
    timeout: options.timeoutMs ?? 90_000,
    maxRetries: 0, // retries are orchestrated here, so every attempt is billed visibly
  });

  const started = clock.now();
  let attempts = 0;
  let accumulated = cumulative;
  let lastCost: CostBreakdown | null = null;
  let repairFor: readonly string[] | null = null;

  while (attempts <= MAX_RETRIES) {
    attempts += 1;

    try {
      const message = await callModel(client, prompt, modelId, repairFor);

      const usage: TokenUsage = {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        cacheCreationTokens: message.usage.cache_creation_input_tokens ?? 0,
        cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
      };
      const cost = computeCost(usage, pricing, usdInrRate);
      lastCost = cost;
      accumulated += cost.totalPaise;

      // A refusal or a truncation is not a schema problem and must not be
      // retried as one.
      if (message.stop_reason === 'refusal') {
        return {
          ok: false,
          reason: 'refusal',
          message: 'The model declined this request. Review the intake for content that may have triggered it.',
          cost,
          attempts,
          useFallback: true,
        };
      }
      if (message.stop_reason === 'max_tokens') {
        return {
          ok: false,
          reason: 'max_tokens',
          message: `Response hit the ${MAX_OUTPUT_TOKENS} token cap and was truncated.`,
          cost,
          attempts,
          useFallback: true,
        };
      }

      const validated = validateNarrativeResponse(message.parsed_output);
      if (validated.ok && validated.data) {
        return {
          ok: true,
          response: validated.data,
          cost,
          usage,
          modelId,
          promptVersion: prompt.promptVersion,
          attempts,
          latencyMs: clock.now() - started,
          raw: message.parsed_output,
        };
      }

      // Schema-invalid: exactly one corrective retry, then fallback.
      if (attempts > MAX_RETRIES) {
        return {
          ok: false,
          reason: 'schema_invalid',
          message: 'The model returned a response that does not match the required schema, twice.',
          cost,
          attempts,
          useFallback: true,
          schemaErrors: validated.errors,
        };
      }
      repairFor = validated.errors;
    } catch (error) {
      const classified = classifyError(error);

      if (attempts > MAX_RETRIES || !classified.retryable) {
        return {
          ok: false,
          reason: classified.reason,
          message: classified.message,
          cost: lastCost,
          attempts,
          // A rate limit is not a fallback case: surface "service busy, try
          // again" rather than handing Dhruv a blank-narrative report he did
          // not ask for (PRD 8.2).
          useFallback: classified.reason !== 'rate_limited',
        };
      }
      repairFor = null;
    }
  }

  return {
    ok: false,
    reason: 'api_error',
    message: 'Generation did not complete within the permitted attempts.',
    cost: lastCost,
    attempts,
    useFallback: true,
  };
}

async function callModel(
  client: Anthropic,
  prompt: AssembledPrompt,
  modelId: string,
  repairFor: readonly string[] | null,
) {
  const system = ENABLE_PROMPT_CACHING
    ? [{ type: 'text' as const, text: prompt.system, cache_control: { type: 'ephemeral' as const } }]
    : prompt.system;

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: prompt.user }];
  if (repairFor) {
    // The repair turn restates the failure rather than starting a new
    // conversation, so the model sees what it produced and what was wrong.
    messages.push({ role: 'assistant', content: '(previous response omitted - it failed validation)' });
    messages.push({ role: 'user', content: buildRepairMessage(repairFor) });
  }

  return client.messages.parse({
    model: modelId,
    max_tokens: MAX_OUTPUT_TOKENS,
    system,
    messages,
    output_config: { format: zodOutputFormat(narrativeResponseSchema) },
  });
}

interface ClassifiedError {
  reason: GenerationFailureReason;
  message: string;
  retryable: boolean;
}

/**
 * Classify an SDK error.
 *
 * Retryable: 429 and 5xx and connection errors. Not retryable: 400 (our bug),
 * 401/403 (key), 404 (model id). Retrying a bad request wastes money and time
 * and cannot succeed (architecture 4.5).
 */
function classifyError(error: unknown): ClassifiedError {
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return { reason: 'timeout', message: 'The request to Anthropic timed out.', retryable: true };
  }
  if (error instanceof Anthropic.RateLimitError) {
    return {
      reason: 'rate_limited',
      message: 'Anthropic is rate limiting this account. Wait and try again.',
      retryable: true,
    };
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return { reason: 'api_error', message: 'Could not reach Anthropic.', retryable: true };
  }
  if (error instanceof Anthropic.APIError) {
    const status = error.status ?? 0;
    if (status === 401 || status === 403) {
      return {
        reason: 'api_error',
        message: 'Anthropic rejected the API key. Check ANTHROPIC_API_KEY.',
        retryable: false,
      };
    }
    if (status === 404) {
      return {
        reason: 'api_error',
        message: `Model not found. Check ANTHROPIC_MODEL_ID - model ids take no date suffix.`,
        retryable: false,
      };
    }
    if (status >= 500) {
      return { reason: 'api_error', message: 'Anthropic returned a server error.', retryable: true };
    }
    return {
      reason: 'api_error',
      message: `Anthropic rejected the request (${status}). This is a bug in the request, not a transient failure.`,
      retryable: false,
    };
  }
  return {
    reason: 'api_error',
    message: error instanceof Error ? error.message : 'Unknown error during generation.',
    retryable: false,
  };
}
