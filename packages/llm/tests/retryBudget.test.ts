/**
 * The cost cap must hold across a retry, not just before the first attempt.
 *
 * `generateNarrative` accumulated per-attempt cost into a variable it never
 * read, so the cap was enforced exactly once - against an estimate, before any
 * money had been spent - and a corrective retry could carry total spend past it
 * with nothing to stop it. PRD 6.6 asks for a hard abort over cap.
 *
 * The transport is injected, so these run with no network and no API key.
 */

import { describe, expect, it } from 'vitest';

import { completeIntake } from '@klawfin/core/tests/fixtures';
import { scoreIntake } from '@klawfin/rubric';
import { assessCoverage, checkContradictions } from '@klawfin/validation';
import {
  dimensionsRequiringConfidenceNote,
  notAssessedDimensionIds,
} from '@klawfin/validation';

import { generateNarrative } from '../src/client';
import type { PromptFacts } from '../src/prompt';
import type { Transport, TransportResult } from '../src/transport';

function facts(): PromptFacts {
  const score = scoreIntake(completeIntake);
  const coverage = assessCoverage(score, null);
  return {
    clientName: 'Fabricated Holdings Private Limited',
    score,
    intake: completeIntake,
    contradictions: checkContradictions(completeIntake, new Date('2026-09-19')).contradictions,
    notAssessedDimensionIds: notAssessedDimensionIds(score),
    dimensionsRequiringConfidenceNote: dimensionsRequiringConfidenceNote(score),
    preliminary: coverage.markPreliminary,
    truncationNotices: [],
  };
}

/** Returns a response that never validates, so the retry path is taken. */
function schemaInvalidTransport(outputTokens: number): { transport: Transport; calls: () => number } {
  let calls = 0;
  const transport: Transport = async (): Promise<TransportResult> => {
    calls += 1;
    return {
      parsedOutput: { not: 'a narrative' },
      usage: {
        inputTokens: 10_000,
        outputTokens,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      },
      stopReason: 'end_turn',
      reportedCostUsd: null,
      requestId: 'test',
    };
  };
  return { transport, calls: () => calls };
}

describe('retry budget', () => {
  it('retries once when the first attempt leaves room in the budget', async () => {
    const { transport, calls } = schemaInvalidTransport(500);

    const result = await generateNarrative({
      facts: facts(),
      modelId: 'claude-haiku-4-5',
      costCapPaise: 4_000,
      transport,
    });

    expect(calls()).toBe(2);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('schema_invalid');
  });

  it('refuses the retry when the first attempt has already eaten the budget', async () => {
    // A large, expensive first attempt. Retrying would carry total spend past
    // the cap, so the second call must never be made.
    const { transport, calls } = schemaInvalidTransport(13_000);

    const result = await generateNarrative({
      facts: facts(),
      modelId: 'claude-opus-5',
      costCapPaise: 4_000,
      transport,
    });

    expect(calls()).toBe(1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('budget_exceeded');
      // The scores are intact, so the fallback report is still worth offering.
      expect(result.useFallback).toBe(true);
    }
  });

  it('still refuses before spending anything when the estimate alone exceeds the cap', async () => {
    const { transport, calls } = schemaInvalidTransport(500);

    const result = await generateNarrative({
      facts: facts(),
      modelId: 'claude-opus-5',
      costCapPaise: 10, // Rs.0.10 - nothing fits
      transport,
    });

    expect(calls()).toBe(0);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('budget_exceeded');
  });
});
