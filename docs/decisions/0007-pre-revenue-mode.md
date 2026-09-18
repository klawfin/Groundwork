# 0007 — Pre-revenue mode: substitute ladder, no reweighting

**Date:** 2026-09-19 · **Status:** Decided for v1 · **Resolves:** PRD `OPEN-06`

## Decision

When a company is pre-revenue, D3 (Traction & Validation) is scored against a **substitute evidence ladder** on the same 0–4 scale. Dimension weights are **not** changed.

## Reasoning

The PRD proposes no reweighting for v1, and its reason is the right one: reweighting introduces two incomparable scoring systems for marginal gain. A benchmark set assembled across both would not mean anything, and the benchmark set is the compounding asset.

The substitute ladder does the necessary work on its own. All five D3 sub-criteria have a pre-revenue counterpart:

| Sub-criterion | Pre-revenue substitute |
|---|---|
| D3.1 Revenue level | Signed LOIs, paid pilots, pre-orders, waitlist with payment intent |
| D3.2 Growth consistency | Growth in the leading indicator the company actually has |
| D3.3 Customer evidence | Documented discovery: interviews, named targets, design partners |
| D3.4 Retention and repeat | Beta/pilot engagement depth and repeat usage |
| D3.5 Pipeline quality | Named prospects with a stated stage |

A test asserts the PRD's own worked example: twelve committed design partners plus six months of documented discovery scores **above 60** on D3, not 0.

## Mode detection

Pre-revenue when product stage is `idea` or `prototype`, **or** paying customers is recorded as zero — with two guards:

- **Recorded revenue overrides everything**, including a stage of `idea`. Such an intake is contradictory and generation is blocked until it is resolved; but if scoring is reached it must keep the revenue rather than run the substitute ladder on a revenue-generating company and understate its traction.
- **An unanswered customer count is not evidence of being pre-revenue.** Missing data is missing data. Otherwise every blank intake would be assessed on the substitute ladder.

## Reporting requirement

The report states explicitly that D3 was assessed on pre-revenue evidence, so the score is not misread as comparable to a revenue-stage company's. The fixed text is `PRE_REVENUE_NOTICE` in `@klawfin/core/legal`.

**Benchmark data must be segmented by mode.** Never pool pre-revenue and revenue-stage D3 scores into one benchmark.

## Revisit

After three real clients, alongside PRD `OPEN-13` on the weights generally.
