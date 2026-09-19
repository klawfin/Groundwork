/**
 * Edit magnitude tests - metric M4.
 *
 * PRD 9: "M4 is the most important quality metric in this document." If it
 * under-reports, heavy rewriting looks like light rewriting and the signal
 * that generation is not working never arrives.
 */

import { describe, expect, it } from 'vitest';

import { scoreIntake } from '@klawfin/rubric';
import { completeIntake } from '@klawfin/core/tests/fixtures';

import { editMagnitude, editRatio, levenshtein } from '../src/editMagnitude';
import { validResponse } from './fixtures/response';

describe('levenshtein', () => {
  it('is zero for identical strings', () => {
    expect(levenshtein('abc', 'abc')).toBe(0);
  });

  it('counts single-character edits', () => {
    expect(levenshtein('abc', 'abd')).toBe(1);
    expect(levenshtein('abc', 'ab')).toBe(1);
    expect(levenshtein('abc', 'abcd')).toBe(1);
  });

  it('handles empty strings in both directions', () => {
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', '')).toBe(3);
    expect(levenshtein('', '')).toBe(0);
  });

  it('is symmetric', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(levenshtein('sitting', 'kitten'));
    expect(levenshtein('kitten', 'sitting')).toBe(3);
  });
});

describe('editRatio', () => {
  it('is 0 for an untouched string', () => {
    expect(editRatio('same text', 'same text')).toBe(0);
  });

  it('is 1 for a complete rewrite', () => {
    expect(editRatio('aaaa', 'bbbb')).toBe(1);
  });

  it('is bounded to 0..1', () => {
    expect(editRatio('short', 'a much much longer replacement string')).toBeLessThanOrEqual(1);
    expect(editRatio('', '')).toBe(0);
  });

  it('scales with how much actually changed', () => {
    const light = editRatio('the quick brown fox', 'the quick brown cat');
    const heavy = editRatio('the quick brown fox', 'completely different words here');
    expect(light).toBeLessThan(heavy);
    expect(light).toBeLessThan(0.2);
  });
});

describe('editMagnitude', () => {
  const raw = validResponse(scoreIntake(completeIntake));

  it('reports zero when the narrative was accepted as generated', () => {
    // `edited_response` is null when Dhruv accepted it unchanged.
    expect(editMagnitude(raw, null).overall).toBe(0);
  });

  it('reports zero when the edited copy is identical', () => {
    const result = editMagnitude(raw, structuredClone(raw));
    expect(result.overall).toBe(0);
    expect(Object.values(result.bySection).every((v) => v === 0)).toBe(true);
  });

  it('detects an edit in one section and attributes it there', () => {
    const edited = structuredClone(raw);
    edited.executive_summary = 'Completely rewritten executive summary by hand.';

    const result = editMagnitude(raw, edited);
    expect(result.bySection.executive_summary).toBeGreaterThan(0.5);
    expect(result.bySection.overall_assessment).toBe(0);
    expect(result.overall).toBeGreaterThan(0);
  });

  it('detects a heavy rewrite across every section', () => {
    const edited = structuredClone(raw);
    edited.executive_summary = 'x';
    edited.overall_assessment = 'y';
    for (const d of edited.dimensions) d.what_we_observed = 'z';

    // This is the case the metric exists to surface: the model's output was
    // not usable, and the tool must show that rather than hide it.
    expect(editMagnitude(raw, edited).overall).toBeGreaterThan(0.9);
  });

  it('stays under the 20% target for a light touch-up', () => {
    const edited = structuredClone(raw);
    edited.executive_summary = raw.executive_summary.replace('Your', 'The');

    expect(editMagnitude(raw, edited).overall).toBeLessThan(0.2);
  });
});
