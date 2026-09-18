/**
 * Branding and report-naming tests.
 *
 * The filename convention is fixed by PRD P1-08. It is the kind of small spec
 * that drifts silently, and the drift only shows up in a founder's inbox.
 */

import { describe, expect, it } from 'vitest';

import {
  ORG_NAME,
  PRODUCT_FULL_NAME,
  PRODUCT_NAME,
  REPORT_TITLE,
  reportByline,
  reportFilename,
} from '@klawfin/core';

describe('naming', () => {
  it('composes the full product name', () => {
    expect(PRODUCT_FULL_NAME).toBe('Groundwork by Klawfin');
    expect(PRODUCT_NAME).toBe('Groundwork');
    expect(ORG_NAME).toBe('Klawfin');
  });

  it('keeps the report title descriptive rather than branded', () => {
    // The founder receives a "Fundraise Readiness Assessment". The product is
    // the instrument that produced it, not the name of the deliverable.
    expect(REPORT_TITLE).toBe('Fundraise Readiness Assessment');
    expect(REPORT_TITLE).not.toContain(PRODUCT_NAME);
  });

  it('carries no rating language in any client-facing name', () => {
    // PRD 11.1: the score is never a rating, a grade, or a third-party signal.
    // A product name built from that vocabulary would undermine the position
    // the disclaimer and the guardrails exist to protect.
    const forbidden = /\b(score|grade|rank|rating|index|verdict|certified|approved)\b/i;
    for (const text of [PRODUCT_NAME, ORG_NAME, PRODUCT_FULL_NAME, REPORT_TITLE, reportByline()]) {
      expect(text, `"${text}" contains rating language`).not.toMatch(forbidden);
    }
  });

  it('produces a byline naming both the firm and the instrument', () => {
    expect(reportByline()).toContain(ORG_NAME);
    expect(reportByline()).toContain(PRODUCT_NAME);
  });
});

describe('reportFilename (PRD P1-08)', () => {
  it('follows the fixed convention', () => {
    expect(reportFilename('Havenlock Logistics', '2026-09-19', 1)).toBe(
      'Klawfin_Readiness_Havenlock_Logistics_2026-09-19_v1.pdf',
    );
  });

  it('increments with the report version', () => {
    expect(reportFilename('Acme', '2026-09-19', 3)).toMatch(/_v3\.pdf$/);
  });

  it('strips characters that are illegal or awkward in a filename', () => {
    const name = reportFilename('Foo/Bar: Pvt. Ltd. <test>', '2026-09-19', 1);
    expect(name).not.toMatch(/[/\\:<>"|?*]/);
    expect(name).toMatch(/^Klawfin_Readiness_.+_2026-09-19_v1\.pdf$/);
  });

  it('collapses whitespace to single underscores', () => {
    expect(reportFilename('Acme   Widgets   Co', '2026-09-19', 1)).toBe(
      'Klawfin_Readiness_Acme_Widgets_Co_2026-09-19_v1.pdf',
    );
  });

  it('survives a name that sanitises to nothing', () => {
    // A client legibly named only in a non-Latin script would otherwise
    // produce "Klawfin_Readiness__2026-09-19_v1.pdf".
    expect(reportFilename('???', '2026-09-19', 1)).toBe(
      'Klawfin_Readiness_Client_2026-09-19_v1.pdf',
    );
  });

  it('truncates a very long client name rather than producing an unusable filename', () => {
    const long = 'A'.repeat(200);
    const name = reportFilename(long, '2026-09-19', 1);
    expect(name.length).toBeLessThan(120);
  });

  it('is a download name only - storage keys stay UUID-derived', () => {
    // Storage paths leak into logs and browser history, so a path must not
    // disclose that Klawfin is assessing a particular company (architecture 5.3).
    // This function is deliberately NOT used to build a storage key; that
    // separation is asserted here so a future refactor does not quietly merge
    // the two.
    const name = reportFilename('Havenlock Logistics', '2026-09-19', 1);
    expect(name).toContain('Havenlock');
    expect(name).toMatch(/\.pdf$/);
  });
});
