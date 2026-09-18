# 0006 — Model selection: default set, A/B deferred as the PRD requires

**Date:** 2026-09-19 · **Status:** Default set; A/B outstanding · **Addresses:** PRD `OPEN-05`

## Decision

Default `ANTHROPIC_MODEL_ID=claude-opus-5`, configurable per environment. Every candidate model is priced in `packages/llm/src/cost.ts`, so the A/B the PRD asks for is a config change rather than a code change. The chosen id is recorded on every report and every `llm_calls` row either way.

## Correction to the PRD's cost model

PRD §6.6 budgets at **$3/MTok input and $15/MTok output**. Those are previous-generation rates. Current first-party pricing:

| Model | Input $/MTok | Output $/MTok |
|---|---:|---:|
| `claude-opus-5` | 5 | 25 |
| `claude-sonnet-5` | 2 | 10 |
| `claude-haiku-4-5` | 1 | 5 |

The mid-tier option is therefore **cheaper** than the PRD assumed, not dearer. Combined with [0002](./0002-deterministic-scoring.md) — which removes six scoring calls per report — the ₹40 ceiling has considerably more headroom than either source document projected. A test asserts that a typical report stays under the cap on every model in the table.

## Correction to the architecture document

architecture §4.4 advises pinning a **dated model snapshot**. Current model ids are complete as written, and appending a date suffix produces a 404 at request time. A test asserts that no id in the pricing table carries one.

The underlying concern — that a floating alias could silently repoint mid-engagement, leaving two clients scored by different models with no record — is real, and is handled instead by recording `model_id` on every report and every call.

## Outstanding

Nikhil runs the A/B on two or three real intakes. The thing to measure is **metric M4** (narrative edit magnitude), not subjective quality: if a cheaper model produces narrative Dhruv edits no more heavily, it is the better model for this job.
