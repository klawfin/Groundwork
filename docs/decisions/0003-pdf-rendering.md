# 0003 — PDF rendering: `@react-pdf/renderer`

**Date:** 2026-09-19 · **Status:** Decided · **Resolves:** PRD `OPEN-02`

## Decision

`@react-pdf/renderer`, Node runtime, self-hosted registered fonts. Browser print of a `@media print` stylesheet is retained as a **documented fallback**, not the destination.

## The conflict

- **PRD OPEN-02** proposes react-pdf on serverless grounds.
- **architecture ADR-002** agrees, and rejects headless Chromium (bundle size against the serverless limit, cold starts, version drift between the chromium shim and puppeteer) and hosted HTML-to-PDF APIs (monthly cash they do not have, plus a fourth vendor receiving client cap tables — a processor to disclose under DPDP for no proportionate benefit).
- **sprint_plan S2-02** says the opposite: "print CSS from the report page first. Only move to a server-side renderer if print CSS genuinely fails."

## Why react-pdf wins

The deciding requirement is PRD P1-08: **the disclaimer must appear on every page.** react-pdf has a `fixed` footer primitive that renders on every page structurally. A print stylesheet relies on `position: fixed` behaviour in paged media, which differs between browsers and silently drops or duplicates the footer across some page breaks. A missing disclaimer on page four of a client deliverable is a regulatory exposure, not a layout bug — and it is the kind that is invisible until someone checks.

Secondary reasons: output is identical in development and production; the document is text-selectable rather than a raster image (P1-08); no client financial data leaves for a fourth vendor.

## What this costs, stated plainly

- **No Tailwind or shadcn/ui inside the PDF.** react-pdf implements its own flexbox subset with its own `StyleSheet`. The report is a second, separate design surface. Budget 1.5–2 days, and note that this artifact is disproportionately important — it is the thing the client actually receives.
- **Fonts must be committed and registered.** Never fetch fonts at render time; a network hiccup then becomes a failed client deliverable, and it is the single most common way this library fails in production.
- **Manual page-break control.** Design to the subset from the start rather than designing freely and then fighting it.

## Required action

**Spike this on day one, not day nine** (architecture open question 11). Build one page with real fonts and the dimension scorecard before committing the rest of the build. If react-pdf fights back, the print-CSS fallback is still cheap on day one and is not at all cheap on day nine.
