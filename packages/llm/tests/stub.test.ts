/**
 * The offline stub has one job: run the whole pipeline without spending.
 *
 * That only works if it survives the same checks a real generation faces. A
 * stub that trips a guardrail would leave every offline run showing a blocked
 * narrative, which makes the review screen untestable and trains whoever is
 * working on it to ignore guardrail failures - the exact habit the guardrails
 * exist to prevent.
 *
 * So these tests assert it against the real validator and the real guardrails,
 * across every fixture, rather than against a hand-written expectation.
 */

import { describe, expect, it } from 'vitest';

import {
  completeIntake,
  contradictoryIntake,
  edgeIntake,
  preRevenueIntake,
  sparseIntake,
} from '@klawfin/core/tests/fixtures';
import { scoreIntake } from '@klawfin/rubric';
import { checkContradictions } from '@klawfin/validation';
import {
  assessCoverage,
  dimensionsRequiringConfidenceNote,
  notAssessedDimensionIds,
} from '@klawfin/validation';

import { runGuardrails } from '../src/guardrails';
import { validateNarrativeResponse } from '../src/schema';
import { STUB_MARKER, stubNarrative } from '../src/stub';
import type { PromptFacts } from '../src/prompt';

const FIXTURES = {
  complete: completeIntake,
  sparse: sparseIntake,
  'pre-revenue': preRevenueIntake,
  contradictory: contradictoryIntake,
  edge: edgeIntake,
} as const;

/** Assemble the same facts the orchestrator would. */
function factsFor(intake: (typeof FIXTURES)[keyof typeof FIXTURES]): PromptFacts {
  const score = scoreIntake(intake);
  const coverage = assessCoverage(score, null);
  return {
    clientName: 'Fabricated Test Company Private Limited',
    score,
    intake,
    contradictions: checkContradictions(intake, new Date('2026-09-19')).contradictions,
    notAssessedDimensionIds: notAssessedDimensionIds(score),
    dimensionsRequiringConfidenceNote: dimensionsRequiringConfidenceNote(score),
    preliminary: coverage.markPreliminary,
    truncationNotices: [],
  };
}

describe('stub narrative', () => {
  for (const [name, intake] of Object.entries(FIXTURES)) {
    describe(name, () => {
      const facts = factsFor(intake);
      const narrative = stubNarrative(facts);

      it('satisfies the response schema', () => {
        const result = validateNarrativeResponse(narrative);
        expect(result.errors).toEqual([]);
        expect(result.ok).toBe(true);
      });

      it('passes every blocking guardrail', () => {
        const report = runGuardrails(narrative, facts.score);
        expect(report.blocking).toEqual([]);
        expect(report.passed).toBe(true);
      });

      it('states no number the scorer did not compute', () => {
        // The single check worth calling out separately: the stub quotes
        // scores back, so a formatting slip here would produce a document
        // whose prose disagrees with its own scorecard.
        const report = runGuardrails(narrative, facts.score);
        expect(report.findings.filter((f) => f.check === 'numeric_consistency')).toEqual([]);
      });

      it('carries a confidence note on every dimension below high confidence', () => {
        for (const dimension of facts.score.dimensions) {
          if (dimension.confidence === 'high') continue;
          const written = narrative.dimensions.find((d) => d.dimension_id === dimension.id);
          expect(written?.confidence_note?.trim()).toBeTruthy();
        }
      });

      it('writes no assessment for a dimension that could not be assessed', () => {
        for (const dimension of facts.score.dimensions) {
          if (!dimension.notAssessed && !dimension.entirelyNotApplicable) continue;
          const written = narrative.dimensions.find((d) => d.dimension_id === dimension.id);
          expect(written?.gaps).toEqual([]);
          expect(written?.recommendations).toEqual([]);
          expect(written?.what_we_observed).toContain('could not be assessed');
        }
      });
    });
  }

  it('is deterministic - the same score always produces the same text', () => {
    const facts = factsFor(completeIntake);
    expect(stubNarrative(facts)).toEqual(stubNarrative(facts));
  });

  it('declares itself as machine-assembled in both operator and client text', () => {
    const narrative = stubNarrative(factsFor(completeIntake));
    // Operator channel, so the person who ran it knows what they are looking at.
    expect(narrative.generation_notes).toContain(STUB_MARKER);
    // And in the summary, because that is the section most likely to be read
    // in isolation and mistaken for real output.
    expect(narrative.executive_summary).toContain(STUB_MARKER);
  });

  it('reproduces the computed priority order rather than inventing one', () => {
    const facts = factsFor(completeIntake);
    const narrative = stubNarrative(facts);
    const ranks = narrative.priority_gaps.map((g) => g.rank);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(ranks).toEqual(ranks.map((_, i) => i + 1));
  });

  it('names the pre-revenue substitute ladder when the score used it', () => {
    const facts = factsFor(preRevenueIntake);
    expect(facts.score.preRevenueMode).toBe(true);
    expect(stubNarrative(facts).executive_summary).toContain('substitute evidence');
  });
});
