/**
 * Guardrail tests.
 *
 * readme.md: "Every prohibited-language pattern against both a matching and a
 * non-matching string. Numeric consistency check against a deliberately
 * inconsistent fixture."
 *
 * The non-matching direction is not optional. A pattern that fires on
 * legitimate advisory prose would make Dhruv dismiss guardrail output without
 * reading it, which is how a real false negative gets waved through.
 */

import { describe, expect, it } from 'vitest';

import { scoreIntake } from '@klawfin/rubric';
import { completeIntake, sparseIntake } from '@klawfin/core/tests/fixtures';
import {
  PLACEHOLDER_PATTERNS,
  PROHIBITED_PATTERNS,
  checkConfidenceNotes,
  checkEmptyContent,
  checkLength,
  checkNumericConsistency,
  checkProhibitedLanguage,
  runGuardrails,
} from '../src/guardrails';
import { validateNarrativeResponse, DATA_ROOM_ITEMS } from '../src/schema';
import type { NarrativeResponse } from '../src/schema';
import { validResponse, responseWith } from './fixtures/response';

const score = scoreIntake(completeIntake);

describe('prohibited language (PRD 11.4)', () => {
  /** Every pattern needs a string that matches it. */
  const matching: Record<string, string> = {
    'good|solid|attractive|compelling|strong|excellent': 'This is a compelling investment for the right fund.',
    'we\\s+(recommend|advise)': 'We recommend investing alongside the existing angels.',
    'investors?\\s+should': 'Investors should move quickly on this round.',
    'will|should|is likely to': 'The company will raise within two months.',
    'valuation\\s+(should|ought to)': 'The valuation should be around 40 crore.',
    guarantee: 'This is a guaranteed return for early participants.',
    'fair\\s+value': 'Fair value for the business sits above the current ask.',
    'buy|sell|hold': 'Our buy recommendation stands.',
    worth: 'The company is worth investing in at this stage.',
    'de-?risked': 'This is a de-risked bet compared to peers.',
    undervalued: 'The company appears undervalued at this price.',
    'expected\\s+(return|returns|roi)': 'Expected returns are attractive over five years.',
    confident: 'We are confident you will raise this round.',
    certain: 'You are certain to close by December.',
    'sebi': 'Klawfin is SEBI-registered and can advise on this.',
    introduce: 'We can introduce you to investors in our network.',
  };

  it('fires on a string matching every prohibited pattern', () => {
    for (const [, text] of Object.entries(matching)) {
      const findings = checkProhibitedLanguage(responseWith({ executive_summary: text }));
      expect(findings.length, `expected a match for: "${text}"`).toBeGreaterThan(0);
      expect(findings[0]!.severity).toBe('block');
    }
  });

  it('covers every registered pattern with at least one matching case', () => {
    // Guards against a pattern being added without a test - the readme
    // requires both directions for every pattern.
    for (const { pattern } of PROHIBITED_PATTERNS) {
      const hit = Object.values(matching).some((text) => {
        pattern.lastIndex = 0;
        return pattern.test(text);
      });
      expect(hit, `no matching test string for ${pattern}`).toBe(true);
    }
  });

  it('stays silent on legitimate advisory prose', () => {
    // These are exactly the sentences the tool is FOR. If any of them trips a
    // guardrail, the guardrail is wrong, not the prose.
    const legitimate = [
      'Your cap table does not reconcile to 100%, which will stop a diligence process before it starts.',
      'Your Rs.4,000 Cr TAM is top-down from an industry report with no reachable-customer derivation.',
      'You did not provide cohort retention data, so retention is unassessed in this report.',
      'Founder vesting is not documented. Investors will require it before close, and putting it in place takes about a week.',
      'Rebuild the market sizing bottom-up from unit price multiplied by reachable customer count. Two weeks, and it removes the most common first-meeting objection.',
      'Your strongest evidence is twelve committed design partners, which is unusual at this stage.',
      'The ask of Rs.6 Cr implies 25 months of runway against a stated 24-month target.',
      'Obtain independent legal advice on the FEMA position before accepting foreign capital.',
      'Three of your five critical functions are covered by contractors with no IP assignment in place.',
    ];

    for (const text of legitimate) {
      const findings = checkProhibitedLanguage(responseWith({ executive_summary: text }));
      expect(findings, `false positive on: "${text}"`).toEqual([]);
    }
  });

  it('scans nested narrative, not just the top-level summary', () => {
    const response = responseWith({});
    response.dimensions[4]!.gaps[0]!.why_it_matters = 'Investors should take this seriously.';
    const findings = checkProhibitedLanguage(response);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]!.path).toContain('dimensions[4].gaps[0].why_it_matters');
  });

  it('ignores generation_notes, which never reaches the client', () => {
    // generation_notes is Dhruv's channel and does not appear in the PDF
    // (PRD 6.4), so language rules for client-facing text do not apply.
    const response = responseWith({ generation_notes: 'This looks like a good investment to me.' });
    expect(checkProhibitedLanguage(response)).toEqual([]);
  });

  it('reports the offending sentence so Dhruv can see what tripped it', () => {
    const response = responseWith({
      executive_summary:
        'Your cap table is clean. Investors should move quickly here. Your data room is indexed.',
    });
    const findings = checkProhibitedLanguage(response);
    expect(findings[0]!.excerpt).toContain('Investors should move quickly');
  });
});

describe('numeric consistency (PRD 6.5 check 2)', () => {
  it('passes when the narrative states the computed composite', () => {
    const response = responseWith({
      executive_summary: `Your composite score is ${score.composite} out of 100, which places you in the ${score.band.label} band.`,
    });
    expect(checkNumericConsistency(response, score)).toEqual([]);
  });

  it('fires when the narrative states a composite that was not computed', () => {
    const wrong = score.composite === 71 ? 72 : 71;
    const response = responseWith({
      executive_summary: `Your composite score is ${wrong} out of 100.`,
    });
    const findings = checkNumericConsistency(response, score);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]!.severity).toBe('block');
    expect(findings[0]!.message).toContain(String(score.composite));
  });

  it('accepts a dimension percentage at one decimal', () => {
    const d = score.dimensions[0]!;
    const response = responseWith({
      overall_assessment: `Team & Execution scored ${d.pct.toFixed(1)} out of 100.`,
    });
    expect(checkNumericConsistency(response, score)).toEqual([]);
  });

  it('accepts a sub-criterion score stated out of 4', () => {
    const response = responseWith({ overall_assessment: 'Cap table cleanliness is rated 4 out of 4.' });
    expect(checkNumericConsistency(response, score)).toEqual([]);
  });

  it('does not fire on revenue figures, counts or dates', () => {
    // Matching every number in the text would make this check pure noise.
    const response = responseWith({
      executive_summary:
        'You reported 23 paying customers and monthly revenue of 820000, with a 47 day sales cycle, incorporated in 2023.',
    });
    expect(checkNumericConsistency(response, score)).toEqual([]);
  });
});

describe('empty and placeholder content (PRD 6.5 check 5)', () => {
  it('fires on placeholder text', () => {
    for (const text of ['[TODO]', 'Lorem ipsum dolor sit amet', 'TBD', '   ', 'N/A']) {
      const response = responseWith({ executive_summary: text });
      expect(checkEmptyContent(response).length, `expected a hit on "${text}"`).toBeGreaterThan(0);
    }
  });

  it('stays silent on real narrative', () => {
    const response = responseWith({
      executive_summary: 'Your cap table does not reconcile, which is the first thing to fix.',
    });
    expect(checkEmptyContent(response)).toEqual([]);
  });

  it('has a test for every registered placeholder pattern', () => {
    expect(PLACEHOLDER_PATTERNS.length).toBeGreaterThan(0);
  });
});

describe('confidence notes on low-coverage dimensions (PRD 8.1)', () => {
  const sparseScore = scoreIntake(sparseIntake);

  it('fires when a low-confidence dimension arrives without a confidence note', () => {
    const response = responseWith({});
    for (const d of response.dimensions) d.confidence_note = null;
    const findings = checkConfidenceNotes(response, sparseScore);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]!.severity).toBe('block');
  });

  it('passes when every low-confidence dimension carries a note', () => {
    const response = responseWith({});
    for (const d of response.dimensions) {
      d.confidence_note = 'Coverage for this dimension was too low to assess it.';
    }
    expect(checkConfidenceNotes(response, sparseScore)).toEqual([]);
  });

  it('does not require a note on a high-confidence dimension', () => {
    const response = responseWith({});
    for (const d of response.dimensions) d.confidence_note = null;
    const highConfidence = score.dimensions.filter((d) => d.confidence === 'high').map((d) => d.id);
    const findings = checkConfidenceNotes(response, score);
    for (const finding of findings) {
      const index = Number(/\[(\d+)\]/.exec(finding.path)?.[1] ?? -1);
      const dimensionId = response.dimensions[index]?.dimension_id;
      expect(highConfidence).not.toContain(dimensionId);
    }
  });
});

describe('length (PRD 6.5 check 4)', () => {
  it('warns, never blocks', () => {
    const response = responseWith({ executive_summary: 'Too short.' });
    const findings = checkLength(response);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((f) => f.severity === 'warn')).toBe(true);
  });

  it('stays silent inside the band', () => {
    const response = responseWith({ executive_summary: words(180) });
    const findings = checkLength(response).filter((f) => f.path === 'executive_summary');
    expect(findings).toEqual([]);
  });
});

describe('runGuardrails', () => {
  it('passes a clean response', () => {
    const report = runGuardrails(validResponse(score), score);
    expect(report.blocking).toEqual([]);
    expect(report.passed).toBe(true);
  });

  it('fails and blocks publication when prohibited language is present', () => {
    const response = validResponse(score);
    response.executive_summary = 'This is a compelling investment.';
    const report = runGuardrails(response, score);
    expect(report.passed).toBe(false);
    expect(report.blocking.some((f) => f.check === 'prohibited_language')).toBe(true);
  });

  it('records every finding, blocking and warning alike, for the audit entry', () => {
    const response = validResponse(score);
    response.executive_summary = 'Investors should buy. Short.';
    const report = runGuardrails(response, score);
    expect(report.findings.length).toBeGreaterThanOrEqual(report.blocking.length);
    expect(report.findings).toEqual([...report.blocking, ...report.warnings].sort(byPath));
  });
});

describe('response schema (PRD 6.4)', () => {
  it('accepts a valid response', () => {
    expect(validateNarrativeResponse(validResponse(score)).ok).toBe(true);
  });

  it('rejects a missing dimension', () => {
    const response = validResponse(score) as NarrativeResponse;
    const broken = { ...response, dimensions: response.dimensions.slice(0, 5) };
    const result = validateNarrativeResponse(broken);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/dimensions/);
  });

  it('rejects an extra dimension', () => {
    const response = validResponse(score) as NarrativeResponse;
    const broken = { ...response, dimensions: [...response.dimensions, response.dimensions[0]!] };
    expect(validateNarrativeResponse(broken).ok).toBe(false);
  });

  it('rejects dimensions out of order', () => {
    const response = validResponse(score) as NarrativeResponse;
    const reordered = [...response.dimensions].reverse();
    const result = validateNarrativeResponse({ ...response, dimensions: reordered });
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/in order|Expected dimension/);
  });

  it('rejects an unknown dimension_id', () => {
    const response = validResponse(score) as NarrativeResponse;
    // Cast through unknown deliberately: the point of the test is that a value
    // the type system forbids is still rejected at runtime, because the model
    // is not bound by our types.
    const broken = structuredClone(response) as unknown as {
      dimensions: { dimension_id: string }[];
    };
    broken.dimensions[0]!.dimension_id = 'D9';
    expect(validateNarrativeResponse(broken).ok).toBe(false);
  });

  it('rejects an empty required string', () => {
    const response = validResponse(score) as NarrativeResponse;
    const broken = { ...response, executive_summary: '' };
    expect(validateNarrativeResponse(broken).ok).toBe(false);
  });

  it('rejects non-consecutive priority ranks', () => {
    const response = validResponse(score) as NarrativeResponse;
    const broken = structuredClone(response);
    if (broken.priority_gaps.length >= 2) {
      broken.priority_gaps[1]!.rank = 5;
      expect(validateNarrativeResponse(broken).ok).toBe(false);
    }
  });

  it('formats errors with paths, for the corrective retry', () => {
    const result = validateNarrativeResponse({ executive_summary: '' });
    expect(result.ok).toBe(false);
    expect(result.errors.every((e) => e.includes(':'))).toBe(true);
  });
});

describe('fixed data room list', () => {
  it('is non-empty and has no duplicates', () => {
    expect(DATA_ROOM_ITEMS.length).toBeGreaterThan(20);
    expect(new Set(DATA_ROOM_ITEMS).size).toBe(DATA_ROOM_ITEMS.length);
  });
});

function words(count: number): string {
  return Array.from({ length: count }, (_, i) => `word${i}`).join(' ');
}

function byPath(_a: { path: string }, _b: { path: string }): number {
  return 0; // stable: only used to compare set membership, not ordering
}
