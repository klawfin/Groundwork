/**
 * OpenRouter transport.
 *
 * A second way to reach a model, used when `ANTHROPIC_API_KEY` is absent. It
 * is a TRANSPORT, not a second generator: the cost gate, the single-retry
 * rule, schema validation and the typed failures all still live in client.ts
 * and are shared. Duplicating that loop would mean fixing the retry rule twice
 * and eventually only fixing it once.
 *
 * Two things differ from the Anthropic path and both are improvements:
 *
 *   1. OpenRouter REPORTS THE EXACT COST of each call in USD. The ledger
 *      records that figure rather than a computed estimate, so the cost view
 *      is exact rather than approximately right.
 *   2. Structured output is enforced with a JSON Schema generated from the
 *      same Zod schema that validates the response, so the constraint and the
 *      contract cannot drift apart (decision 0005).
 *
 * Plain `fetch`, no SDK. The endpoint is one POST, and a dependency whose only
 * job is to build that POST is a dependency to keep updated for nothing.
 */

import * as z from 'zod/v4';

import { narrativeResponseSchema } from './schema';
import type { AssembledPrompt } from './prompt';
import type { TokenUsage } from './cost';
import type { ClassifiedError, TransportResult } from './transport';

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

export interface OpenRouterConfig {
  apiKey: string;
  modelId: string;
  maxTokens: number;
  timeoutMs: number;
  /** Sent as HTTP-Referer/X-Title so usage is attributable in the dashboard. */
  appUrl?: string;
  appName?: string;
}

/**
 * The response schema as JSON Schema, built once at module load.
 *
 * Once, not per request: it is identical for every call, and rebuilding it
 * each time would add latency to every generation for no benefit.
 *
 * `io: 'output'` matters - it describes what the model must PRODUCE, which is
 * the post-transform shape, not the input shape Zod would otherwise emit.
 */
export const NARRATIVE_JSON_SCHEMA: Record<string, unknown> = z.toJSONSchema(
  narrativeResponseSchema,
  { io: 'output' },
) as Record<string, unknown>;

export function openRouterTransport(config: OpenRouterConfig) {
  return async function call(
    prompt: AssembledPrompt,
    repairFor: readonly string[] | null,
    repairMessage: (errors: readonly string[]) => string,
  ): Promise<TransportResult> {
    const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user },
    ];

    if (repairFor) {
      messages.push({
        role: 'assistant',
        content: '(previous response omitted - it failed validation)',
      });
      messages.push({ role: 'user', content: repairMessage(repairFor) });
    }

    // Our own timeout, deliberately below the platform function limit, so a
    // request we abandon still produces an error we can record.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);

    let response: Response;
    try {
      response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
          ...(config.appUrl ? { 'HTTP-Referer': config.appUrl } : {}),
          ...(config.appName ? { 'X-Title': config.appName } : {}),
        },
        body: JSON.stringify({
          model: config.modelId,
          messages,
          max_tokens: config.maxTokens,
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'narrative_response',
              strict: true,
              schema: NARRATIVE_JSON_SCHEMA,
            },
          },
          // Asks OpenRouter to return the exact cost of the call.
          usage: { include: true },
        }),
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new OpenRouterError(response.status, body.slice(0, 500));
    }

    const payload = (await response.json()) as OpenRouterResponse;
    const choice = payload.choices?.[0];

    if (!choice) {
      throw new OpenRouterError(502, 'OpenRouter returned no choices.');
    }

    const usage: TokenUsage = {
      inputTokens: payload.usage?.prompt_tokens ?? 0,
      outputTokens: payload.usage?.completion_tokens ?? 0,
      // OpenRouter does not expose Anthropic's cache token split. Reporting 0
      // is honest: caching is off in Phase 1 either way (ADR-008).
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    };

    return {
      // The content is a JSON string. Parsing failures are handled as schema
      // failures upstream, which is correct - an unparseable body is a
      // response that does not match the contract.
      parsedOutput: safeParseJson(choice.message?.content ?? ''),
      usage,
      stopReason: mapFinishReason(choice.finish_reason),
      reportedCostUsd: typeof payload.usage?.cost === 'number' ? payload.usage.cost : null,
      requestId: payload.id ?? null,
    };
  };
}

/**
 * Map OpenRouter's finish reasons onto the ones the orchestrator understands.
 *
 * `length` and `content_filter` must NOT be retried as schema failures: one is
 * a truncation and the other a refusal, and a corrective retry would spend
 * money to receive the same answer.
 */
function mapFinishReason(reason: string | null | undefined): string | null {
  switch (reason) {
    case 'length':
      return 'max_tokens';
    case 'content_filter':
      return 'refusal';
    case 'stop':
    case 'tool_calls':
      return 'end_turn';
    default:
      return reason ?? null;
  }
}

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export class OpenRouterError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`OpenRouter returned ${status}`);
    this.name = 'OpenRouterError';
  }
}

/**
 * Classify a transport failure.
 *
 * Same policy as the Anthropic path: retry 429 and 5xx and connection
 * failures; never retry a 400 (our bug) or a 401/403 (the key). Retrying a bad
 * request wastes money and cannot succeed.
 */
export function classifyOpenRouterError(error: unknown): ClassifiedError {
  if (error instanceof Error && error.name === 'AbortError') {
    return { reason: 'timeout', message: 'The request to OpenRouter timed out.', retryable: true };
  }
  if (error instanceof OpenRouterError) {
    if (error.status === 429) {
      return {
        reason: 'rate_limited',
        message: 'OpenRouter is rate limiting this account. Wait and try again.',
        retryable: true,
      };
    }
    if (error.status === 401 || error.status === 403) {
      return {
        reason: 'api_error',
        message: 'OpenRouter rejected the API key. Check OPENROUTER_API_KEY.',
        retryable: false,
      };
    }
    if (error.status === 402) {
      return {
        reason: 'budget_exceeded',
        message: 'The OpenRouter account is out of credit.',
        retryable: false,
      };
    }
    if (error.status === 404) {
      return {
        reason: 'api_error',
        message:
          'OpenRouter does not recognise that model. Check OPENROUTER_MODEL_ID against the model list.',
        retryable: false,
      };
    }
    if (error.status >= 500) {
      return { reason: 'api_error', message: 'OpenRouter returned a server error.', retryable: true };
    }
    return {
      reason: 'api_error',
      message: `OpenRouter rejected the request (${error.status}). This is a bug in the request, not a transient failure.`,
      retryable: false,
    };
  }
  if (error instanceof TypeError) {
    // fetch throws TypeError on a network-level failure.
    return { reason: 'api_error', message: 'Could not reach OpenRouter.', retryable: true };
  }
  return {
    reason: 'api_error',
    message: error instanceof Error ? error.message : 'Unknown error during generation.',
    retryable: false,
  };
}

/* -------------------------------------------------------------------------- */
/* Wire format                                                                */
/* -------------------------------------------------------------------------- */

interface OpenRouterResponse {
  id?: string;
  choices?: {
    message?: { content?: string };
    finish_reason?: string | null;
  }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    /** Exact cost of this call in USD. Present because we asked for it. */
    cost?: number;
  };
}
