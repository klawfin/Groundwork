/**
 * Post-generation guardrails (PRD 6.5, 11.4).
 *
 * Run in order on EVERY generation, before the output is shown to Dhruv:
 *
 *   1. Schema validation            -> see schema.ts
 *   2. Numeric consistency check    -> here
 *   3. Prohibited-language check    -> here
 *   4. Length check                 -> here
 *   5. Empty-content check          -> here
 *
 * NEVER disable these, never bypass them for a demo, never ship with them
 * stubbed out (readme.md). A false positive costs thirty seconds. A false
 * negative is a regulatory exposure for an unincorporated company with no
 * compliance function.
 *
 * Pure: no network, no clock. Every check takes values and returns findings.
 */

import type { ScoreResult } from '@klawfin/rubric';
import type { NarrativeResponse } from './schema.js';

export type GuardrailSeverity = 'block' | 'warn';

export interface GuardrailFinding {
  check: 'numeric_consistency' | 'prohibited_language' | 'length' | 'empty_content' | 'confidence_note';
  severity: GuardrailSeverity;
  /** Where in the response the problem is, e.g. 'dimensions[2].what_we_observed'. */
  path: string;
  message: string;
  /** The offending text, so Dhruv can see exactly what tripped the check. */
  excerpt?: string;
}

export interface GuardrailReport {
  findings: readonly GuardrailFinding[];
  blocking: readonly GuardrailFinding[];
  warnings: readonly GuardrailFinding[];
  /** False means the output must NOT be published or exported. */
  passed: boolean;
}

/* ========================================================================== */
/* Check 3 - prohibited language (PRD 11.4)                                   */
/* ========================================================================== */

/**
 * Patterns that indicate investment advice, a recommendation, or a prediction
 * of outcome. Klawfin holds no securities licence; none of these may appear in
 * client-facing output.
 *
 * This is the PRD's starting set, expanded where a near-miss phrasing would
 * obviously slip through. Case-insensitive throughout.
 *
 * "Expanded as real output is observed" (PRD 11.4) - add patterns here, and
 * add a test for both the matching and the non-matching direction.
 */
export const PROHIBITED_PATTERNS: readonly { pattern: RegExp; why: string }[] = [
  {
    pattern: /\b(good|solid|attractive|compelling|strong|excellent)\s+investment\b/i,
    why: 'States an investment merit opinion.',
  },
  {
    pattern: /\bwe\s+(recommend|advise)\s+(investing|investment|investors)\b/i,
    why: 'Recommends investment.',
  },
  { pattern: /\binvestors?\s+should\b/i, why: 'Directs investor behaviour.' },
  {
    pattern: /\b(will|should|is likely to)\s+(successfully\s+)?raise\b/i,
    why: 'Predicts a fundraising outcome.',
  },
  {
    pattern: /\bvaluation\s+(should|ought to)\s+be\b/i,
    why: 'Gives a valuation opinion.',
  },
  {
    pattern: /\b(guarantee|guaranteed|assured)\s+(return|outcome|raise)\b/i,
    why: 'Guarantees an outcome.',
  },
  { pattern: /\bfair\s+value\b/i, why: 'Valuation terminology.' },
  {
    pattern: /\b(buy|sell|hold)\s+(recommendation|rating)\b/i,
    why: 'Securities research terminology.',
  },
  // --- Additions beyond the PRD's starting set ---------------------------
  {
    pattern: /\b(worth|a\s+worthwhile)\s+investing\s+in\b/i,
    why: 'States an investment merit opinion in an alternative phrasing.',
  },
  {
    pattern: /\bde-?risked\s+(bet|investment)\b/i,
    why: 'Frames the company as an investment proposition.',
  },
  {
    pattern: /\b(undervalued|overvalued|underpriced|fairly\s+priced)\b/i,
    why: 'Valuation opinion.',
  },
  {
    pattern: /\bexpected\s+(return|returns|roi)\b/i,
    why: 'Implies a return projection.',
  },
  {
    pattern: /\bwe\s+(are\s+)?confident\s+(you|they|the\s+company)\s+will\s+(raise|close)\b/i,
    why: 'Predicts a fundraising outcome.',
  },
  {
    pattern: /\b(certain|guaranteed)\s+to\s+(close|raise|succeed)\b/i,
    why: 'Predicts an outcome with certainty.',
  },
  {
    pattern: /\bklawfin\s+(is|are)\s+(sebi[- ]registered|a\s+registered\s+(investment\s+adviser|merchant\s+banker))\b/i,
    why: 'Claims a regulatory status Klawfin does not hold.',
  },
  {
    pattern: /\bwe\s+(can|will)\s+introduce\s+you\s+to\s+(investors|vcs|funds)\b/i,
    why: 'Promises investor introductions - a promise the business has not made, and one that changes the regulatory analysis.',
  },
];

/**
 * Scan every client-facing string in the response for prohibited language.
 *
 * `generation_notes` is excluded: it is for Dhruv, not the client, and does
 * not appear in the PDF (PRD 6.4).
 */
export function checkProhibitedLanguage(response: NarrativeResponse): GuardrailFinding[] {
  const findings: GuardrailFinding[] = [];

  for (const [path, text] of clientFacingStrings(response)) {
    for (const { pattern, why } of PROHIBITED_PATTERNS) {
      const match = pattern.exec(text);
      if (match) {
        findings.push({
          check: 'prohibited_language',
          severity: 'block',
          path,
          message: `Prohibited language: ${why} Matched "${match[0]}".`,
          excerpt: sentenceAround(text, match.index),
        });
      }
    }
  }

  return findings;
}

/* ========================================================================== */
/* Check 2 - numeric consistency (PRD 6.5)                                    */
/* ========================================================================== */

/**
 * Assert that every score-like number in the narrative matches a computed one.
 *
 * "Extract every number in the narrative that looks like a score or percentage
 * attributed to a dimension or composite; assert it matches the computed
 * value. Mismatch -> flag the section to Dhruv, do not auto-publish."
 *
 * This is the check that prevents a report whose prose says 71 while its
 * scorecard says 68 - the single failure most likely to be noticed in a client
 * meeting and most damaging to credibility when it is.
 */
export function checkNumericConsistency(
  response: NarrativeResponse,
  score: ScoreResult,
): GuardrailFinding[] {
  const findings: GuardrailFinding[] = [];

  // Values the model is permitted to state. Dimension percentages are allowed
  // at full precision and to one decimal, since either rendering is legitimate.
  const permitted = new Set<number>([score.composite, Math.round(score.compositeExact)]);
  for (const d of score.dimensions) {
    permitted.add(Math.round(d.pct));
    permitted.add(round1(d.pct));
    permitted.add(Math.round(d.weight * 100));
    permitted.add(round1(d.weightedContribution));
    permitted.add(Math.round(d.coverage * 100));
    for (const sub of d.subCriteria) {
      if (sub.score !== null) permitted.add(sub.score);
    }
  }
  permitted.add(Math.round(score.overallCoverage * 100));

  for (const [path, text] of clientFacingStrings(response)) {
    for (const claim of extractScoreClaims(text)) {
      if (!permitted.has(claim.value) && !permitted.has(round1(claim.value))) {
        findings.push({
          check: 'numeric_consistency',
          severity: 'block',
          path,
          message: `The narrative states a score of ${claim.value}, which does not match any computed value. Computed composite is ${score.composite}.`,
          excerpt: sentenceAround(text, claim.index),
        });
      }
    }
  }

  return findings;
}

/**
 * Numbers that read as a score or percentage attribution.
 *
 * Deliberately narrow. Matching every number in the text would fire on
 * revenue figures, customer counts and dates, which would make the check
 * noise and train Dhruv to ignore it. We match only constructions that
 * attribute a score or a percentage.
 */
function extractScoreClaims(text: string): { value: number; index: number }[] {
  const claims: { value: number; index: number }[] = [];
  const patterns = [
    /\bscored?\s+(?:of\s+|at\s+)?(\d{1,3}(?:\.\d)?)\b/gi,
    /\bcomposite\s+(?:score\s+)?(?:of\s+|is\s+|:\s*)?(\d{1,3}(?:\.\d)?)\b/gi,
    /\b(\d{1,3}(?:\.\d)?)\s*(?:\/|out of)\s*100\b/gi,
    /\b(\d{1,3}(?:\.\d)?)\s*%\s*(?:coverage|score|readiness)\b/gi,
    /\brated?\s+(\d)\s*(?:\/|out of)\s*4\b/gi,
  ];

  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null = pattern.exec(text);
    while (match !== null) {
      const raw = match[1];
      if (raw !== undefined) {
        const value = Number.parseFloat(raw);
        if (Number.isFinite(value)) claims.push({ value, index: match.index });
      }
      match = pattern.exec(text);
    }
  }
  return claims;
}

/* ========================================================================== */
/* Checks 4 and 5 - length and empty content (PRD 6.5, 6.4)                   */
/* ========================================================================== */

/** Word bands from the response schema (PRD 6.4). Warn outside, never block. */
export const WORD_BANDS: Readonly<Record<string, { min: number; max: number }>> = {
  executive_summary: { min: 150, max: 220 },
  overall_assessment: { min: 200, max: 300 },
  what_we_observed: { min: 60, max: 120 },
};

/** Tolerance before a length warning fires. Bands are guidance, not a contract. */
export const LENGTH_TOLERANCE = 0.25;

export function checkLength(response: NarrativeResponse): GuardrailFinding[] {
  const findings: GuardrailFinding[] = [];

  const assess = (path: string, text: string, band: { min: number; max: number }) => {
    const words = countWords(text);
    const lower = band.min * (1 - LENGTH_TOLERANCE);
    const upper = band.max * (1 + LENGTH_TOLERANCE);
    if (words < lower || words > upper) {
      findings.push({
        check: 'length',
        severity: 'warn',
        path,
        message: `${words} words, materially outside the ${band.min}-${band.max} word band.`,
      });
    }
  };

  assess('executive_summary', response.executive_summary, WORD_BANDS.executive_summary!);
  assess('overall_assessment', response.overall_assessment, WORD_BANDS.overall_assessment!);
  response.dimensions.forEach((d, i) => {
    assess(`dimensions[${i}].what_we_observed`, d.what_we_observed, WORD_BANDS.what_we_observed!);
  });

  return findings;
}

/**
 * Placeholder and empty content (PRD 6.5 check 5).
 *
 * "Any required narrative string that is empty, whitespace, or a placeholder
 * -> treat as schema-invalid." A section reading "[TODO]" or "Lorem ipsum" in
 * a client PDF is worse than a failed generation, because a failed generation
 * is visible.
 */
export const PLACEHOLDER_PATTERNS: readonly RegExp[] = [
  /^\s*$/,
  /\b(lorem\s+ipsum)\b/i,
  /\[(todo|tbd|placeholder|insert|xxx)\b/i,
  /^\s*(n\/?a|none|tbd|todo|pending)\s*\.?\s*$/i,
  /\byour\s+(company|startup)\s+name\s+here\b/i,
];

export function checkEmptyContent(response: NarrativeResponse): GuardrailFinding[] {
  const findings: GuardrailFinding[] = [];

  for (const [path, text] of clientFacingStrings(response)) {
    for (const pattern of PLACEHOLDER_PATTERNS) {
      if (pattern.test(text)) {
        findings.push({
          check: 'empty_content',
          severity: 'block',
          path,
          message: 'Required narrative content is empty or a placeholder.',
          excerpt: text.slice(0, 120),
        });
        break;
      }
    }
  }

  return findings;
}

/* ========================================================================== */
/* Confidence notes on low-coverage dimensions (PRD 8.1)                      */
/* ========================================================================== */

/**
 * "The guard against it is explicit instruction in the prompt PLUS a code-side
 * check that low-coverage dimensions carry a `confidence_note`." (PRD 8.1)
 *
 * This is that code-side check. A not-assessed dimension that arrives with a
 * confident paragraph and no confidence note is the specific failure the PRD
 * calls "the most likely way the tool embarrasses Dhruv in front of a client".
 */
export function checkConfidenceNotes(
  response: NarrativeResponse,
  score: ScoreResult,
): GuardrailFinding[] {
  const findings: GuardrailFinding[] = [];

  for (const dimension of score.dimensions) {
    if (dimension.confidence === 'high') continue;

    const index = response.dimensions.findIndex((d) => d.dimension_id === dimension.id);
    if (index === -1) continue;
    const narrative = response.dimensions[index]!;

    const note = narrative.confidence_note?.trim() ?? '';
    if (note.length === 0) {
      findings.push({
        check: 'confidence_note',
        severity: 'block',
        path: `dimensions[${index}].confidence_note`,
        message: `${dimension.name} is at ${Math.round(
          dimension.coverage * 100,
        )}% coverage (${dimension.confidence} confidence) but the narrative carries no confidence note.`,
      });
    }
  }

  return findings;
}

/* ========================================================================== */
/* Runner                                                                     */
/* ========================================================================== */

/**
 * Run every post-generation guardrail.
 *
 * Schema validation happens before this (schema.ts) because a response that
 * does not parse cannot be meaningfully inspected. Everything downstream of
 * parsing runs here, and all outcomes are recorded in the audit entry for the
 * generation (PRD 6.5).
 */
export function runGuardrails(response: NarrativeResponse, score: ScoreResult): GuardrailReport {
  const findings = [
    ...checkNumericConsistency(response, score),
    ...checkProhibitedLanguage(response),
    ...checkEmptyContent(response),
    ...checkConfidenceNotes(response, score),
    ...checkLength(response),
  ];

  const blocking = findings.filter((f) => f.severity === 'block');
  const warnings = findings.filter((f) => f.severity === 'warn');

  return { findings, blocking, warnings, passed: blocking.length === 0 };
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Every string in the response that can reach the client PDF, with its path.
 *
 * `generation_notes` is deliberately excluded - it is Dhruv's channel and does
 * not appear in the report (PRD 6.4).
 */
export function clientFacingStrings(response: NarrativeResponse): [string, string][] {
  const out: [string, string][] = [];
  const add = (path: string, text: string | null | undefined) => {
    if (typeof text === 'string') out.push([path, text]);
  };

  add('executive_summary', response.executive_summary);
  add('overall_assessment', response.overall_assessment);

  for (const [i, d] of response.dimensions.entries()) {
    add(`dimensions[${i}].what_we_observed`, d.what_we_observed);
    add(`dimensions[${i}].confidence_note`, d.confidence_note);
    for (const [j, g] of d.gaps.entries()) {
      add(`dimensions[${i}].gaps[${j}].gap`, g.gap);
      add(`dimensions[${i}].gaps[${j}].why_it_matters`, g.why_it_matters);
      add(`dimensions[${i}].gaps[${j}].evidence`, g.evidence);
    }
    for (const [j, rec] of d.recommendations.entries()) {
      add(`dimensions[${i}].recommendations[${j}].action`, rec.action);
      add(`dimensions[${i}].recommendations[${j}].expected_effect`, rec.expected_effect);
    }
  }

  for (const [i, p] of response.priority_gaps.entries()) {
    add(`priority_gaps[${i}].gap`, p.gap);
    add(`priority_gaps[${i}].rationale`, p.rationale);
  }

  for (const horizon of ['days_0_30', 'days_31_60', 'days_61_90'] as const) {
    for (const [i, item] of response.remediation_plan[horizon].entries()) {
      add(`remediation_plan.${horizon}[${i}]`, item);
    }
  }

  for (const [i, item] of response.data_room_checklist.entries()) {
    add(`data_room_checklist[${i}].item`, item.item);
    add(`data_room_checklist[${i}].note`, item.note);
  }

  for (const [i, q] of response.questions_you_cannot_yet_answer.entries()) {
    add(`questions_you_cannot_yet_answer[${i}]`, q);
  }

  return out;
}

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** The sentence containing `index`, so a finding shows Dhruv the offending line. */
function sentenceAround(text: string, index: number): string {
  const start = Math.max(0, text.lastIndexOf('.', Math.max(0, index - 1)) + 1);
  const endMarker = text.indexOf('.', index);
  const end = endMarker === -1 ? text.length : endMarker + 1;
  return text.slice(start, end).trim();
}
