# 0013 — Product name: Groundwork by Klawfin

**Date:** 2026-09-19 · **Status:** Decided (by Nikhil) · **Not in the PRD's open list**

## Decision

The tool is **Groundwork**. Full form: **Groundwork by Klawfin**.

The report it produces keeps the descriptive title the PRD already fixes — **Fundraise Readiness Assessment** (PRD §7.1, section 1). The founder receives an assessment; Groundwork is the instrument that produced it.

Constants live in [`packages/core/src/legal/branding.ts`](../../packages/core/src/legal/branding.ts) so there is exactly one spelling in the system.

## The constraint that drove it

Naming here is bounded by a legal requirement rather than a stylistic one.

PRD §11.1: the score "is not a rating, not a credit assessment, not an investability grade, and must never be framed as a signal to a third party." PRD §11.3 prohibits any output that reads as an assessment of investment merit.

That rules out an entire category of otherwise-obvious product names. Anything built from **Score, Grade, Rank, Rating, Index, Verdict, Certified** or **Approved** would undermine the exact position that the prohibited-language guardrail and the disclaimer exist to protect — and would do it on the cover page, where it is most visible.

A test in `packages/core/tests/branding.test.ts` asserts that no client-facing name contains that vocabulary. It will fail if someone later renames the product to something that reads as a rating.

## Why this name

- **It names the preparation, not a judgement of the company.** Groundwork is what you lay before the building goes up. A founder reading it on a cover page is not being graded.
- **It survives the cover-page test.** The report gets photographed and emailed around (PRD §7.2). "Groundwork by Klawfin" reads like a firm's methodology.
- **It matches the vocabulary the source documents already reach for.** The PRD and plan.md both describe the tool as an *instrument*, and frame three real clients as what "turns the rubric from a guess into an instrument."

## Scope of the rename

Cheap, and it stays cheap. Package names are `@klawfin/*` — organisation-scoped, not product-scoped — so they did not change. The rename touched the root `package.json`, the README, `.env.example` and one migration header comment.

## Filename convention unchanged

`reportFilename()` still produces `Klawfin_Readiness_{ClientName}_{YYYY-MM-DD}_v{n}.pdf`, because PRD P1-08 fixes that string and a client's saved files should not change name because the tool was renamed.

Note that this is the **download** name only. The storage object key remains UUID-derived and never contains a client name: storage paths leak into logs and browser history, and a path should not disclose that Klawfin is assessing a particular company (architecture §5.3).
