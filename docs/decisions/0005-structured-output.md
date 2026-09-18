# 0005 — Response schema: structured output AND Zod validation

**Date:** 2026-09-19 · **Status:** Decided · **Resolves:** PRD `OPEN-04`

## Decision

Both, as the PRD proposed. The Zod schema in `packages/llm/src/schema.ts` is passed to the API through `zodOutputFormat()` so generation is constrained, **and** the same schema validates the response on receipt through `validateNarrativeResponse()`.

> "The API mechanism may change; the validator is the contract." — PRD OPEN-04

## Implementation note

The SDK's `zodOutputFormat` helper is typed against **zod v4**, while the intake schema in `@klawfin/core` uses **zod v3**. Both ship in the `zod` package and coexist: the response schema imports `zod/v4`, the intake schema imports `zod`. Nothing passes a schema across that boundary, so the split is contained to one import line and is documented at the top of each file.

Migrating the intake schema to v4 is a reasonable later cleanup. Doing it mid-build, to satisfy a helper's type signature, would have been a risky change to the most heavily tested part of the system for no functional gain.

## Beyond the schema

Schema validity is necessary and not sufficient. `packages/llm/src/guardrails.ts` runs the remaining PRD 6.5 checks on every generation: numeric consistency against computed scores, prohibited language, placeholder content, required confidence notes on low-coverage dimensions, and length. Schema-invalid triggers exactly one corrective retry, then the fallback report. Never a loop.
