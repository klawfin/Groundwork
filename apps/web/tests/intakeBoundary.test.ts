/**
 * The intake that comes back from the database is not an Intake yet.
 *
 * `assessments.intake_data` is created with the column default `{}`. The row
 * type calls it `Intake`, which is true once something has written one and
 * false for every assessment between "Start assessment" and the first
 * autosave. For that window the object has no sections at all.
 *
 * The assessment page trusted the type and passed the raw value to the form.
 * `?? emptyIntake()` did not save it, because `{}` is neither null nor
 * undefined - so the fallback that looked like the safety net never ran once.
 * The page was a 500 from the moment the assessment was created.
 *
 * These tests pin both halves: that the raw default really is unusable, and
 * that parsing it really does make it usable. The first half is what stops the
 * fix being quietly reverted as an unnecessary call.
 */

import { describe, expect, it } from 'vitest';

import { parseIntake, type Intake } from '@klawfin/core';
import { scoreIntake } from '@klawfin/rubric';
import { checkContradictions } from '@klawfin/validation';

/** Exactly what Postgres stores for a new assessment. */
const COLUMN_DEFAULT = {};

describe('a freshly created assessment', () => {
  it('breaks the contradiction engine if it is cast rather than parsed', () => {
    // Not a hypothetical. This is the exact failure, reproduced: the engine
    // reaches traction.mrr_by_month.length and traction is undefined.
    expect(() => checkContradictions(COLUMN_DEFAULT as Intake, new Date())).toThrow(TypeError);
  });

  it('breaks the scorer too', () => {
    expect(() => scoreIntake(COLUMN_DEFAULT as Intake)).toThrow();
  });

  it('is fine once parsed, because the schema supplies every default', () => {
    const intake = parseIntake(COLUMN_DEFAULT);

    expect(intake.traction.mrr_by_month).toEqual([]);
    expect(intake.team.founders).toEqual([]);
    expect(intake.market.competitors).toEqual([]);
    expect(intake.judgments).toEqual({});

    expect(() => checkContradictions(intake, new Date())).not.toThrow();
    expect(() => scoreIntake(intake)).not.toThrow();
  });

  it('scores zero with no coverage rather than refusing to load', () => {
    // An empty assessment is a legitimate state - it is what every assessment
    // starts as - so it has to render, and it has to be honest about having
    // nothing in it.
    const score = scoreIntake(parseIntake(COLUMN_DEFAULT));
    expect(score.overallCoverage).toBe(0);
  });
});
