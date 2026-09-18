/**
 * Coverage gate tests.
 *
 * readme.md: "All four coverage thresholds and their behaviours."
 *
 * PRD 8.1 defines the gate. Getting it wrong in the permissive direction means
 * a confident-sounding report built from nothing reaches a paying client,
 * which the PRD names as "the most likely way the tool embarrasses Dhruv in
 * front of a client."
 */

import { describe, expect, it } from 'vitest';

import { scoreIntake } from '@klawfin/rubric';
import {
  assessCoverage,
  dimensionsRequiringConfidenceNote,
  notAssessedDimensionIds,
} from '@klawfin/validation';
import { completeIntake, makeIntake, preRevenueIntake, sparseIntake } from '@klawfin/core/tests/fixtures';

const completeScore = scoreIntake(completeIntake);
const sparseScore = scoreIntake(sparseIntake);
const emptyScore = scoreIntake(makeIntake());

describe('the four thresholds (PRD 8.1)', () => {
  it('generates normally at or above 80% coverage', () => {
    const assessment = assessCoverage(completeScore);
    expect(assessment.disposition).toBe('normal');
    expect(assessment.canGenerate).toBe(true);
    expect(assessment.markPreliminary).toBe(false);
    expect(assessment.requiresWatermark).toBe(false);
  });

  it('blocks below 60% coverage by default', () => {
    const assessment = assessCoverage(sparseScore);
    expect(assessment.disposition).toBe('blocked');
    expect(assessment.canGenerate).toBe(false);
  });

  it('blocks an empty intake', () => {
    expect(assessCoverage(emptyScore).canGenerate).toBe(false);
  });

  it('marks a dimension not-assessed below 40% coverage', () => {
    const flagged = notAssessedDimensionIds(sparseScore);
    expect(flagged.length).toBeGreaterThan(0);
    for (const id of flagged) {
      const dimension = sparseScore.dimensions.find((d) => d.id === id)!;
      expect(dimension.coverage).toBeLessThan(0.4);
    }
  });

  it('requires a confidence note on every dimension not at high confidence', () => {
    const required = dimensionsRequiringConfidenceNote(sparseScore);
    for (const id of required) {
      expect(sparseScore.dimensions.find((d) => d.id === id)!.confidence).not.toBe('high');
    }
    const notRequired = completeScore.dimensions
      .filter((d) => d.confidence === 'high')
      .map((d) => d.id);
    for (const id of notRequired) {
      expect(dimensionsRequiringConfidenceNote(completeScore)).not.toContain(id);
    }
  });
});

describe('override (PRD 8.1, P1-03)', () => {
  const override = {
    reason: 'Founder is travelling; proceeding on partial intake for the Tuesday session.',
    overriddenBy: 'dhruv@example.invalid',
    overriddenAt: '2026-09-19T10:00:00Z',
  };

  it('permits generation when an override with a reason is supplied', () => {
    const assessment = assessCoverage(sparseScore, override);
    expect(assessment.canGenerate).toBe(true);
  });

  it('still requires the incomplete-data watermark on an overridden report', () => {
    // The watermark attaches to the FACT of generating below the floor, not to
    // whether someone supplied a reason. An overridden report is still an
    // incomplete-data report and must say so on every page.
    const assessment = assessCoverage(sparseScore, override);
    expect(assessment.requiresWatermark).toBe(true);
    expect(assessment.markPreliminary).toBe(true);
  });

  it('rejects an override with a blank reason', () => {
    const blank = { ...override, reason: '   ' };
    expect(assessCoverage(sparseScore, blank).canGenerate).toBe(false);
  });

  it('rejects a null override', () => {
    expect(assessCoverage(sparseScore, null).canGenerate).toBe(false);
  });

  it('does not change anything for an intake that was never blocked', () => {
    const withOverride = assessCoverage(completeScore, override);
    const without = assessCoverage(completeScore);
    expect(withOverride.requiresWatermark).toBe(without.requiresWatermark);
    expect(withOverride.canGenerate).toBe(true);
  });
});

describe('flags', () => {
  it('names the dimension and its coverage in every flag', () => {
    const assessment = assessCoverage(sparseScore);
    expect(assessment.flags.length).toBeGreaterThan(0);
    for (const flag of assessment.flags) {
      expect(flag.dimensionName.length).toBeGreaterThan(0);
      expect(flag.message).toContain('%');
    }
  });

  it('says plainly that a not-assessed dimension gets no narrative', () => {
    const assessment = assessCoverage(sparseScore);
    const notAssessed = assessment.flags.filter((f) => f.notAssessed);
    expect(notAssessed.length).toBeGreaterThan(0);
    for (const flag of notAssessed) {
      expect(flag.message).toMatch(/not assessed/i);
    }
  });

  it('raises no flags on a fully covered intake', () => {
    expect(assessCoverage(completeScore).flags).toEqual([]);
  });
});

describe('summary text', () => {
  it('explains the normal case', () => {
    expect(assessCoverage(completeScore).summary).toMatch(/proceed normally/i);
  });

  it('explains the blocked case and how to proceed', () => {
    const summary = assessCoverage(sparseScore).summary;
    expect(summary).toMatch(/blocked/i);
    expect(summary).toMatch(/override/i);
  });

  it('explains the overridden case, including the watermark', () => {
    const summary = assessCoverage(sparseScore, {
      reason: 'Proceeding deliberately.',
      overriddenBy: 'dhruv@example.invalid',
      overriddenAt: '2026-09-19T10:00:00Z',
    }).summary;
    expect(summary).toMatch(/watermark/i);
  });

  it('states the coverage percentage', () => {
    expect(assessCoverage(completeScore).summary).toMatch(/\d+%/);
  });
});

describe('a well-documented pre-revenue company', () => {
  it('is not blocked merely for having no revenue', () => {
    // The substitute ladder means its coverage is measured against the inputs
    // it actually has. Blocking it here would defeat PRD 8.4 entirely.
    const assessment = assessCoverage(scoreIntake(preRevenueIntake));
    expect(assessment.canGenerate).toBe(true);
  });
});
