# Decision records — Groundwork by Klawfin

One file per resolved `OPEN-` item from the PRD. Each records the decision, the
date, and the reasoning.

> "An open question that has been silently decided in code is worse than one
> still open, because nobody knows it was decided." — readme.md

When a decision is recorded here, remove the item from PRD §12.

| ID | Question | Status | Record |
|---|---|---|---|
| OPEN-01 | Auth mechanism | **Resolved** | [0001](./0001-auth-mechanism.md) |
| OPEN-02 | PDF rendering approach | **Resolved** | [0003](./0003-pdf-rendering.md) |
| OPEN-03 | N/A renormalisation vs. penalty | **Resolved (v1)** | [0004](./0004-na-renormalisation.md) |
| OPEN-04 | Structured output vs. JSON + Zod | **Resolved** | [0005](./0005-structured-output.md) |
| OPEN-05 | Model selection | **Deferred to A/B**, default set | [0006](./0006-model-selection.md) |
| OPEN-06 | Pre-revenue reweighting | **Resolved (v1)** | [0007](./0007-pre-revenue-mode.md) |
| OPEN-07 | Show score change between versions to the client? | Open — Dhruv | — |
| OPEN-08 | Privacy notice / data-controller identity | Open — counsel. Blocks Phase 2 | — |
| OPEN-09 | Legal review of disclaimer wording | **Open — BLOCKS FIRST CLIENT REPORT** | [0009](./0009-disclaimer-wording.md) |
| OPEN-10 | Data residency — Supabase region | Open — decide in the first hour | — |
| OPEN-11 | Benchmark anonymisation threshold | Open — not needed until N is large | — |
| OPEN-12 | Does the client ever fill the intake in Phase 1? | **Resolved: Dhruv only** | [0008](./0008-intake-authorship.md) |
| OPEN-13 | Rubric weight confirmation | Baseline stands; revisit after 3 clients | — |
| OPEN-14 | Account ownership while unincorporated | Open — Dhruv + Nikhil | — |
| OPEN-15 | Backup and recovery expectations | Open — Nikhil | — |
| OPEN-16 | Phase 2 rubric — reduced set? | Open — at Phase 2 | — |
| OPEN-17 | Analytics choice | Open — Phase 2 only | — |

## Decisions not in the PRD's open list

These arose from reconciling the PRD, the architecture document, the sprint
plan and the readme, which disagree in places.

| ID | Decision | Record |
|---|---|---|
| — | **Who assigns sub-criterion scores** — deterministic code, not the LLM | [0002](./0002-deterministic-scoring.md) |
| — | Prompt caching off in Phase 1, prompt structured cache-ready | [0010](./0010-prompt-caching.md) |
| — | Cap-table holders stored as refs, never names | [0011](./0011-cap-table-pii.md) |
| — | Repository layout: pnpm workspace | [0012](./0012-repo-layout.md) |
| — | Product name: Groundwork by Klawfin | [0013](./0013-product-name.md) |
| — | `DISABLE_LLM_GENERATION` produces an inert stub narrative, never a client PDF | [0014](./0014-offline-generation.md) |
| — | What the first run against a real database found, and why the tests missed it | [0015](./0015-first-live-run.md) |
