# 0014 — What `DISABLE_LLM_GENERATION` actually does

**Status:** accepted
**Date:** 2026-09-19

## Context

`DISABLE_LLM_GENERATION` exists so the product can be built, demonstrated and
tested without spending money on every page refresh. None of the source
documents specify what it should *do*, so it was settled here.

Two readings were available:

1. **Return nothing.** Generation produces no narrative, and the export route
   renders the fallback report (PRD 8.2). Simplest possible implementation —
   no code at all beyond an early return.
2. **Return a deterministic stub narrative** assembled from the computed score,
   so the rest of the pipeline has something to carry.

## Decision

Reading 2, with a hard constraint attached: **a stub can never reach a client
PDF.**

The stub is persisted like any other narrative, with `is_fallback = true`. The
export route refuses to embed a narrative that is `is_fallback`, and
`approveNarrativeAction` refuses to approve one. An offline run therefore
exercises generation, guardrails, persistence, the review screen, the edit
loop, M4 and the audit trail — and still exports the fallback report, which is
what reading 1 would have produced anyway.

## Why not reading 1

Reading 1 is smaller, and under Rule 2 that normally wins. It loses on one
point that matters more: with no narrative, the review and edit screens have
nothing to render, so the *entire* P1-07 surface is unreachable without a live
API key. The people who will be doing QA in Month 2 would have to spend real
money to look at the screen they are testing.

## Why the stub cannot be allowed to look like writing

Every sentence it produces is assembled from `ScoreResult`. It states no fact
about a company that the deterministic scorer did not compute, which is what
makes it safe to store next to real narratives. It is not an imitation of the
model and must never be improved into one — the moment it reads like
generated prose, somebody ships it.

`packages/llm/tests/stub.test.ts` runs it against the real schema validator and
the real guardrails across all five fixtures. That is deliberate: a stub that
failed a guardrail would leave every offline run showing a blocked narrative,
and would train whoever is working on it to ignore guardrail failures — the
exact habit the guardrails exist to create.

## Consequences

- Offline runs cost nothing and appear nowhere in `/admin/costs`, because no
  `llm_calls` row is written when no call is made.
- The narrative review screen is fully exercisable with no API key.
- A stub narrative in the database is inert: it cannot be approved, and it
  cannot be printed.
- One extra module (`packages/llm/src/stub.ts`) exists that produces no client
  value. It is the price of the two points above.

## Related

- [[0002-deterministic-scoring]] — the stub is only possible because the score
  is computed, not generated.
- PRD 8.2 — the fallback report, which is what an offline run still exports.
