/**
 * End-to-end pipeline test.
 *
 * Runs a fabricated intake through every stage the product actually performs,
 * in the order the application performs them:
 *
 *   intake -> score -> contradictions -> coverage gate -> prompt assembly ->
 *   narrative -> guardrails -> edit -> edit magnitude -> PDF -> text
 *
 * The unit tests each prove one stage. This proves they compose - which is a
 * different claim, and the one that has actually broken before: every stage
 * passed while the document they produced together dropped its disclaimer.
 *
 * The database and the Anthropic API are the two stages not covered here.
 * Everything between them is real: the real scorer, the real guardrails, the
 * real renderer, and a real PDF parsed back out.
 */

import { describe, expect, it } from 'vitest';
import { renderToBuffer } from '@react-pdf/renderer';
import { PDFParse } from 'pdf-parse';

import { DISCLAIMER_SHORT, REPORT_TITLE } from '@klawfin/core';
import { completeIntake, sparseIntake } from '@klawfin/core/tests/fixtures';
import { scoreIntake } from '@klawfin/rubric';
import {
  assessCoverage,
  checkContradictions,
  dimensionsRequiringConfidenceNote,
  notAssessedDimensionIds,
} from '@klawfin/validation';
import {
  assemblePrompt,
  editMagnitude,
  runGuardrails,
  stubNarrative,
  type PromptFacts,
} from '@klawfin/llm';

import { ReportDocument } from '../src/lib/pdf/ReportDocument.js';
import { buildReportProps } from '../src/lib/pdf/render.js';

const CLIENT = 'Havenlock Logistics Private Limited';
const AS_OF = new Date('2026-09-19');

/** Exactly what lib/generation/run.ts assembles, without the database. */
function pipeline(intake: typeof completeIntake) {
  const score = scoreIntake(intake);
  const contradictions = checkContradictions(intake, AS_OF);
  const coverage = assessCoverage(score, null);

  const facts: PromptFacts = {
    clientName: CLIENT,
    score,
    intake,
    contradictions: contradictions.contradictions,
    notAssessedDimensionIds: notAssessedDimensionIds(score),
    dimensionsRequiringConfidenceNote: dimensionsRequiringConfidenceNote(score),
    preliminary: coverage.markPreliminary,
    truncationNotices: [],
  };

  const narrative = stubNarrative(facts);
  const guardrails = runGuardrails(narrative, score);

  return { score, contradictions, coverage, facts, narrative, guardrails };
}

/**
 * Collapse the line breaks a PDF's extracted text carries.
 *
 * Text laid out in a document wraps, so a phrase that reads as one line on the
 * page arrives here split across two. Normalising is what lets a test assert
 * on what a reader SEES rather than on where the renderer happened to wrap.
 *
 * It also catches mid-word hyphenation, which is why it is worth doing rather
 * than loosening the assertion: a title the renderer broke as
 * "Fundraise Readiness Assess-" / "ment" does not normalise back to the
 * title, and that is exactly the defect this caught.
 */
function normalise(text: string): string {
  return text.replace(/\s+/g, ' ');
}

async function renderPdf(input: Parameters<typeof buildReportProps>[0]) {
  const buffer = await renderToBuffer(ReportDocument(buildReportProps(input)));
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return { pages: result.pages.map((p) => p.text), text: result.text, bytes: buffer.length };
  } finally {
    await parser.destroy();
  }
}

describe('end to end: complete intake', () => {
  const run = pipeline(completeIntake);

  it('scores, clears the coverage gate and produces a passing narrative', () => {
    expect(run.score.composite).toBeGreaterThan(0);
    expect(run.coverage.canGenerate).toBe(true);
    expect(run.guardrails.passed).toBe(true);
  });

  it('assembles a prompt whose static prefix carries no client content', () => {
    const prompt = assemblePrompt(run.facts);
    // The cacheable prefix must be byte-identical across clients, so a client
    // name appearing in it would silently defeat caching when it is enabled.
    expect(prompt.system).not.toContain(CLIENT);
    expect(prompt.user).toContain(CLIENT);
  });

  it('renders a PDF carrying the disclaimer on every page', async () => {
    const pdf = await renderPdf({
      clientName: CLIENT,
      score: run.score,
      narrative: run.narrative,
      reportVersion: 1,
      generatedOn: '2026-09-19',
      isPreliminary: run.coverage.markPreliminary,
      hasIncompleteWatermark: run.coverage.requiresWatermark,
    });

    expect(pdf.pages.length).toBeGreaterThan(1);
    for (const [index, page] of pdf.pages.entries()) {
      expect(page, `page ${index + 1} is missing the disclaimer`).toContain(DISCLAIMER_SHORT);
    }
    // Normalised: the cover wraps the title across two lines. Asserting on
    // the raw text would either fail on a legitimate wrap or, worse, pass
    // while the renderer hyphenated it to "Assess-ment".
    expect(normalise(pdf.pages[0] ?? '')).toContain(REPORT_TITLE);
    expect(normalise(pdf.text)).toContain(CLIENT);
  });

  it('prints the composite the scorer computed, not a restatement of it', async () => {
    const pdf = await renderPdf({
      clientName: CLIENT,
      score: run.score,
      narrative: run.narrative,
      reportVersion: 1,
      generatedOn: '2026-09-19',
      isPreliminary: false,
      hasIncompleteWatermark: false,
    });
    expect(pdf.text).toContain(String(run.score.composite));
  });
});

describe('end to end: sparse intake', () => {
  const run = pipeline(sparseIntake);

  it('still produces a renderable report when coverage is thin', async () => {
    const pdf = await renderPdf({
      clientName: CLIENT,
      score: run.score,
      narrative: run.narrative,
      reportVersion: 1,
      generatedOn: '2026-09-19',
      isPreliminary: run.coverage.markPreliminary,
      hasIncompleteWatermark: run.coverage.requiresWatermark,
    });

    for (const [index, page] of pdf.pages.entries()) {
      expect(page, `page ${index + 1} is missing the disclaimer`).toContain(DISCLAIMER_SHORT);
    }
  });

  it('never writes a confident assessment of a dimension it could not assess', () => {
    for (const dimension of run.score.dimensions) {
      if (!dimension.notAssessed) continue;
      const written = run.narrative.dimensions.find((d) => d.dimension_id === dimension.id);
      expect(written?.what_we_observed).toContain('could not be assessed');
      expect(written?.gaps).toEqual([]);
    }
  });
});

describe('end to end: the fallback path', () => {
  it('renders a report with no narrative at all (PRD 8.2)', async () => {
    const score = scoreIntake(completeIntake);
    const pdf = await renderPdf({
      clientName: CLIENT,
      score,
      narrative: null,
      reportVersion: 1,
      generatedOn: '2026-09-19',
      isPreliminary: false,
      hasIncompleteWatermark: false,
    });

    expect(pdf.pages.length).toBeGreaterThan(0);
    expect(pdf.text).toContain(String(score.composite));
    for (const page of pdf.pages) {
      expect(page).toContain(DISCLAIMER_SHORT);
    }
  });
});

describe('end to end: the edit loop (M4)', () => {
  it('measures a human edit against the raw generation, not the last save', () => {
    const run = pipeline(completeIntake);

    const firstEdit = { ...run.narrative, executive_summary: 'A completely rewritten summary.' };
    const secondEdit = { ...firstEdit, executive_summary: 'A completely rewritten summary!' };

    // The second edit changed one character from the first, but the metric
    // that matters is distance from what the model produced. Diffing against
    // the previous save would report this as ~0% edited and make M4 useless.
    const fromRaw = editMagnitude(run.narrative, secondEdit);
    const fromPrevious = editMagnitude(firstEdit, secondEdit);

    expect(fromRaw.bySection.executive_summary).toBeGreaterThan(0.5);
    expect(fromPrevious.bySection.executive_summary).toBeLessThan(0.05);
  });

  it('re-runs guardrails on edited text rather than trusting the earlier pass', () => {
    const run = pipeline(completeIntake);
    expect(run.guardrails.passed).toBe(true);

    const edited = {
      ...run.narrative,
      executive_summary: 'This company is a compelling investment and investors should move fast.',
    };

    const after = runGuardrails(edited, run.score);
    expect(after.passed).toBe(false);
    expect(after.blocking.map((f) => f.check)).toContain('prohibited_language');
  });
});
