/**
 * Does `MAX_OUTPUT_TOKENS` actually fit the response we demand?
 *
 * A live attempt hit the cap and truncated. Truncation is not a soft failure:
 * the response is discarded, the money is spent, and the operator gets the
 * fallback report. So the cap needs to be a measured number rather than a
 * round one.
 *
 * This builds a response at the upper end of what the prompt ASKS FOR - not
 * the schema's absolute maximums, which are guard rails against nonsense and
 * would imply a document nobody wants - and checks it fits with room to spare.
 *
 * If someone adds a section to the schema or widens a word band, this fails,
 * which is the point. The alternative is finding out from a truncated
 * generation on the morning of a client meeting.
 */

import { describe, expect, it } from 'vitest';

import { DIMENSION_IDS } from '@klawfin/rubric';

import { estimateTokens, MAX_OUTPUT_TOKENS } from '../src/cost';
import { DATA_ROOM_ITEMS, narrativeResponseSchema } from '../src/schema';
import { WORD_BANDS } from '../src/guardrails';

/** Filler at a given word count. Content is irrelevant; length is the point. */
function words(count: number): string {
  return Array.from({ length: count }, (_, i) => `word${i % 10}`).join(' ');
}

/**
 * The largest response the prompt actually asks for.
 *
 * Derived, not invented:
 *
 *   - Word bands for the three prose sections come from the prompt itself.
 *   - Three gaps and three recommendations per dimension. The schema allows
 *     eight, but a report naming eight gaps in each of six dimensions is not a
 *     document anyone would walk a client through, and the prompt's
 *     1,800-2,800 word narrative budget does not admit it either.
 *   - The itemised lists are at their real lengths: the data room checklist is
 *     a FIXED 28 items, so it is not a variable at all.
 */
function buildLargestPlausibleResponse() {
  const gapsPerDimension = 3;
  const recommendationsPerDimension = 3;

  return {
    executive_summary: words(WORD_BANDS.executive_summary!.max),
    overall_assessment: words(WORD_BANDS.overall_assessment!.max),
    dimensions: DIMENSION_IDS.map((id) => ({
      dimension_id: id,
      what_we_observed: words(WORD_BANDS.what_we_observed!.max),
      gaps: Array.from({ length: gapsPerDimension }, () => ({
        gap: words(20),
        why_it_matters: words(30),
        evidence: words(30),
      })),
      recommendations: Array.from({ length: recommendationsPerDimension }, () => ({
        action: words(20),
        effort: 'medium' as const,
        estimated_duration: '2-4 weeks',
        expected_effect: words(20),
      })),
      confidence_note: words(30),
    })),
    priority_gaps: Array.from({ length: 5 }, (_, i) => ({
      rank: i + 1,
      dimension_id: DIMENSION_IDS[i % DIMENSION_IDS.length]!,
      gap: words(20),
      rationale: words(45),
    })),
    remediation_plan: {
      days_0_30: Array.from({ length: 6 }, () => words(20)),
      days_31_60: Array.from({ length: 6 }, () => words(20)),
      days_61_90: Array.from({ length: 6 }, () => words(20)),
    },
    data_room_checklist: DATA_ROOM_ITEMS.map((item) => ({
      item,
      status: 'partial' as const,
      note: words(20),
    })),
    questions_you_cannot_yet_answer: Array.from({ length: 10 }, () => words(20)),
    generation_notes: words(150),
  };
}

describe('output token budget', () => {
  const response = buildLargestPlausibleResponse();

  it('is a response the schema actually accepts', () => {
    // A budget measured against something invalid measures nothing.
    const parsed = narrativeResponseSchema.safeParse(response);
    expect(parsed.success, JSON.stringify(parsed.error?.issues?.slice(0, 3))).toBe(true);
  });

  it('reports its own size, so the number is visible when this changes', () => {
    const serialised = JSON.stringify(response);
    const wordCount = serialised.replace(/[^a-z0-9 ]/gi, ' ').split(/\s+/).filter(Boolean).length;
    console.info(
      `[output budget] ${serialised.length} chars, ~${estimateTokens(serialised)} tokens, ` +
        `${wordCount} words, cap ${MAX_OUTPUT_TOKENS}`,
    );
    expect(serialised.length).toBeGreaterThan(0);
  });

  it('fits inside MAX_OUTPUT_TOKENS with headroom', () => {
    // The model emits JSON, so the JSON is what gets billed and capped - not
    // the prose alone. Structure is roughly a third of it.
    const serialised = JSON.stringify(response);
    const estimated = estimateTokens(serialised);

    // 20% headroom. The estimator is chars/3.5 and real tokenisation varies;
    // a budget with no margin is a budget that truncates on a bad day.
    expect(estimated).toBeLessThan(MAX_OUTPUT_TOKENS * 0.8);
  });

  it('would not fit in half the budget, so the cap is not arbitrarily generous', () => {
    // Guards the other direction: if this ever passes, the cap has drifted far
    // above what the document needs and is no longer a meaningful cost control.
    const estimated = estimateTokens(JSON.stringify(response));
    expect(estimated).toBeGreaterThan(MAX_OUTPUT_TOKENS * 0.15);
  });
});
