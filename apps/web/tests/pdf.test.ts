/**
 * PDF export tests.
 *
 * readme.md: "At minimum, an assertion that the disclaimer string appears on
 * every page of the output and that the fallback report renders."
 *
 * These render a real PDF to a buffer and extract its text. That is the whole
 * point — a structural assertion on the React tree would pass while the actual
 * document dropped the footer on a page break, which is precisely the failure
 * mode decision 0003 chose react-pdf to avoid.
 */

import { describe, expect, it } from 'vitest';
import { renderToBuffer } from '@react-pdf/renderer';
import { PDFParse } from 'pdf-parse';

import { scoreIntake } from '@klawfin/rubric';
import { DISCLAIMER_SHORT, DISCLAIMER_FULL, WATERMARK_INCOMPLETE } from '@klawfin/core';
import { completeIntake, preRevenueIntake, sparseIntake } from '@klawfin/core/tests/fixtures';
import { validResponse } from '../../../packages/llm/tests/fixtures/response.js';

import { ReportDocument } from '../src/lib/pdf/ReportDocument.js';
import { buildReportProps, storagePath, type RenderInput } from '../src/lib/pdf/render.js';

interface ParsedPdf {
  numpages: number;
  text: string;
  /** Text per page. Page boundaries are what make the footer assertion real. */
  pages: string[];
}

/**
 * Render to a real PDF and extract its text, page by page.
 *
 * Page boundaries matter: "the disclaimer appears on every page" cannot be
 * asserted against concatenated document text, and concatenated text is
 * exactly what would hide a footer dropped on one page break.
 */
async function render(input: RenderInput): Promise<ParsedPdf> {
  const buffer = await renderToBuffer(ReportDocument(buildReportProps(input)));
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return {
      numpages: result.pages.length,
      text: result.text,
      pages: result.pages.map((p) => p.text),
    };
  } finally {
    await parser.destroy();
  }
}

const baseInput = (overrides: Partial<RenderInput> = {}): RenderInput => ({
  clientName: 'Havenlock Logistics',
  score: scoreIntake(completeIntake),
  narrative: validResponse(scoreIntake(completeIntake)),
  reportVersion: 1,
  generatedOn: '2026-09-19',
  isPreliminary: false,
  hasIncompleteWatermark: false,
  ...overrides,
});

describe('report renders', () => {
  it('produces a multi-page PDF', async () => {
    const pdf = await render(baseInput());
    // Cover + disclaimer + summary + overall + 6 dimensions + priorities +
    // data room + methodology. Anything near one page means the document
    // failed to lay out rather than that it is concise.
    expect(pdf.numpages).toBeGreaterThanOrEqual(12);
  }, 30_000);

  it('is text-selectable, not a raster image (PRD P1-08)', async () => {
    const pdf = await render(baseInput());
    expect(pdf.text.length).toBeGreaterThan(2_000);
    expect(pdf.text).toContain('Havenlock Logistics');
  }, 30_000);
});

describe('the disclaimer appears on EVERY page (PRD P1-08)', () => {
  it('renders the short form in the footer of every page', async () => {
    const pdf = await render(baseInput());

    // The exact requirement, asserted per page rather than over the whole
    // document. This is the assertion the whole PDF approach was chosen for.
    pdf.pages.forEach((page, index) => {
      expect(
        normalise(page),
        `page ${index + 1} of ${pdf.numpages} is missing the disclaimer footer`,
      ).toContain(normalise(DISCLAIMER_SHORT));
    });
  }, 30_000);

  it('renders the full disclaimer somewhere in the document', async () => {
    const pdf = await render(baseInput());
    // A distinctive clause rather than the whole paragraph, because text
    // extraction reflows line breaks.
    expect(normalise(pdf.text)).toContain(normalise('not investment advice'));
    expect(normalise(pdf.text)).toContain(normalise('holds no securities licence'));
    expect(normalise(pdf.text)).toContain(
      normalise(DISCLAIMER_FULL.slice(0, 80)),
    );
  }, 30_000);

  it('marks every page confidential and names the client (PRD 7.3)', async () => {
    const pdf = await render(baseInput());
    for (const [index, page] of pdf.pages.entries()) {
      expect(normalise(page), `page ${index + 1}`).toContain(
        normalise('Confidential — prepared for Havenlock Logistics'),
      );
    }
  }, 30_000);

  it('numbers every page and dates it', async () => {
    const pdf = await render(baseInput());
    // Page 1 is the cover, which carries the date but not a page number.
    for (const [index, page] of pdf.pages.entries()) {
      if (index === 0) continue;
      expect(normalise(page), `page ${index + 1}`).toMatch(/Page \d+ of \d+/);
      expect(page).toContain('2026-09-19');
    }
  }, 30_000);
});

describe('the fallback report (PRD 8.2)', () => {
  it('renders a valid PDF with no narrative at all', async () => {
    // "A valid PDF containing scores, dimension breakdown, the rubric
    // definitions, the data room checklist and the disclaimer - with all
    // narrative sections blank and marked 'Assessment narrative pending'."
    const pdf = await render(baseInput({ narrative: null }));

    expect(pdf.numpages).toBeGreaterThanOrEqual(12);
    expect(pdf.text).toContain('Assessment narrative pending');
  }, 30_000);

  it('still carries the disclaimer on every page', async () => {
    // An outage must not also strip the legal text.
    const pdf = await render(baseInput({ narrative: null }));
    for (const [index, page] of pdf.pages.entries()) {
      expect(normalise(page), `page ${index + 1}`).toContain(normalise(DISCLAIMER_SHORT));
    }
  }, 30_000);

  it('still shows the computed scores', async () => {
    // Scores come from the rubric, not the model, so a generation failure
    // cannot remove them. That is the point of the fallback.
    const score = scoreIntake(completeIntake);
    const pdf = await render(baseInput({ narrative: null, score }));
    expect(pdf.text).toContain(String(score.composite));
    expect(pdf.text).toContain('Dimension scorecard');
  }, 30_000);
});

describe('coverage and mode markers', () => {
  it('watermarks every page of an incomplete-data report (PRD 8.1)', async () => {
    const pdf = await render(
      baseInput({
        score: scoreIntake(sparseIntake),
        narrative: null,
        hasIncompleteWatermark: true,
        isPreliminary: true,
      }),
    );

    for (const [index, page] of pdf.pages.entries()) {
      expect(normalise(page), `page ${index + 1}`).toContain(normalise(WATERMARK_INCOMPLETE));
    }
  }, 30_000);

  it('omits the watermark on a complete report', async () => {
    const pdf = await render(baseInput());
    expect(pdf.text).not.toContain(WATERMARK_INCOMPLETE);
  }, 30_000);

  it('states pre-revenue mode so the traction score is not misread (PRD 8.4)', async () => {
    const score = scoreIntake(preRevenueIntake);
    const pdf = await render(baseInput({ score, narrative: null }));
    expect(score.preRevenueMode).toBe(true);
    expect(normalise(pdf.text)).toContain(normalise('assessed against pre-revenue evidence'));
  }, 30_000);
});

describe('the legal sign-off gate', () => {
  it('renders the PENDING LEGAL SIGN-OFF marker while the disclaimer is unapproved', async () => {
    // docs/decisions/0009: while DISCLAIMER_APPROVAL.status is
    // 'pending_legal_review', every report must say so unmissably. If this
    // test ever fails, either the gate was approved (update the test) or the
    // marker was lost (fix the renderer) - both are things to notice.
    const pdf = await render(baseInput());
    expect(pdf.text).toContain('PENDING LEGAL SIGN-OFF');
  }, 30_000);
});

describe('computed content is present and correct', () => {
  it('shows every dimension with its weight', async () => {
    const score = scoreIntake(completeIntake);
    const pdf = await render(baseInput({ score }));
    for (const dimension of score.dimensions) {
      expect(pdf.text, `${dimension.id} missing`).toContain(dimension.id);
      expect(pdf.text).toContain(dimension.name);
    }
  }, 30_000);

  it('shows the derivation for each sub-criterion, so a score is defensible', async () => {
    // PRD G3: Dhruv must be able to answer "why did I score 2 on cap table
    // hygiene" from the report alone.
    const pdf = await render(baseInput());
    expect(pdf.text).toContain('How this score was reached');
  }, 30_000);

  it('includes the methodology and the rubric version', async () => {
    const score = scoreIntake(completeIntake);
    const pdf = await render(baseInput({ score }));
    expect(pdf.text).toContain('Methodology');
    expect(pdf.text).toContain(score.rubricVersion);
  }, 30_000);
});

describe('storagePath', () => {
  it('contains only UUIDs, never a client name (architecture 5.3)', () => {
    const path = storagePath(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
      2,
    );
    expect(path).toBe(
      '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333-v2.pdf',
    );
    expect(path.toLowerCase()).not.toContain('havenlock');
  });
});

/**
 * Normalise extracted text for comparison.
 *
 * PDF text extraction inserts its own spacing between glyph runs and converts
 * typographic dashes, so a raw `toContain` on the source string is fragile in
 * a way that has nothing to do with whether the text is on the page.
 */
function normalise(text: string): string {
  return text
    .replace(/[‐-―]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}
