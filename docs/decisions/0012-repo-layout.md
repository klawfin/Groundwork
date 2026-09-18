# 0012 — Repository layout: pnpm workspace

**Date:** 2026-09-19 · **Status:** Decided (by Nikhil) · **Not in the PRD's open list**

## Decision

A pnpm workspace with four packages and one app:

```
core ← rubric ← validation ← llm ← web
```

| Package | Contents | Depends on |
|---|---|---|
| `@klawfin/core` | Intake schema, presence primitives, fixed legal text | — |
| `@klawfin/rubric` | Definitions, anchors, mapping, scoring, prioritisation. **Pure.** | core |
| `@klawfin/validation` | Contradiction checks, coverage gating | core, rubric |
| `@klawfin/llm` | Prompts, response schema, guardrails, cost, API client | core, rubric, validation |
| `@klawfin/web` | Next.js app, PDF renderer, database, audit | all |

## Context

I initially recommended a single package, on the grounds that the seam a monorepo buys already existed: `score.ts` is pure, so extracting it later would be a file move rather than a refactor. The docs also push against premature structure (plan.md §2: "do not add abstraction layers 'for later'"; architecture §6.3 lists structural work under "Do NOT build now").

Nikhil chose the workspace. Recorded here rather than argued again.

## What the split forced, usefully

The package boundary surfaced a real cycle immediately: `rubric/mapping` imports the intake schema, while `validation/contradictions` imported `isAnswered` from `rubric/mapping`. In a single package that is an invisible tangle; across packages it is a build error.

`isAnswered` and its numeric helpers moved down into `core`, where both dependents can reach them. The dependency graph is now a clean DAG, and `@klawfin/rubric` **cannot** acquire a dependency on `@klawfin/llm` — the thing decision [0002](./0002-deterministic-scoring.md) most needs to stay true is now enforced by the build rather than by discipline.

## No build orchestration

Packages export TypeScript source directly (`"main": "./src/index.ts"`), the internal-packages pattern. There is no build step to sequence:

- **Vitest** resolves `@klawfin/*` through aliases in `vitest.config.ts`. The alias list is an **array, not an object**, because Vite matches string aliases by prefix and `@klawfin/core` would otherwise swallow `@klawfin/core/tests/fixtures`.
- **Next.js** resolves them via `transpilePackages`.
- **tsc** resolves them via `paths` in the root `tsconfig.json`, and one `pnpm typecheck` covers the whole workspace.

No Turborepo, no Nx, no `tsc -b` ordering. That keeps the operational burden — the scarcest resource for one part-time engineer — close to what a single package would have cost.

## Vercel

The app is at `apps/web`, so the Vercel project needs its **root directory set accordingly**. That is the one piece of configuration this layout adds, and it is easy to forget when the first deploy fails.
