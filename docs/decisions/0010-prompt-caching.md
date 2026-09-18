# 0010 — Prompt caching off in Phase 1, prompt structured cache-ready

**Date:** 2026-09-19 · **Status:** Decided · **Supersedes:** PRD §6.6 on this point

## The conflict

**PRD §6.6** requires caching from day one: "Prompt caching on the static system prompt and rubric block. **This is the single largest lever and must be in from day one.**" The readme repeats it, and adds "Before optimising anything else for cost, check the cache hit rate."

**architecture ADR-008** says the opposite: structure prompts cache-ready, but do not enable `cache_control` in Phase 1, because at one report per day or per week every prompt is a cache **miss** paying the cache **write** premium. "Caching would make it more expensive."

## The decision

**The architecture document is right on the economics.** `ENABLE_PROMPT_CACHING = false` in `packages/llm/src/client.ts`, with the prompt structured so switching it on is a one-line change.

## Reasoning

Prompt caching discounts reads and surcharges writes, over a short TTL measured in minutes. It pays when a large static prefix is reused inside that window.

Phase 1 volume is roughly one report per day or per week. Every generation would pay the write premium and never read the cache back. The PRD's instruction optimises for a reuse pattern Phase 1 does not have.

Decision [0002](./0002-deterministic-scoring.md) sharpens this further. The architecture's caching case rested on six dimension-scoring calls firing within a minute of each other and sharing a prefix — calls 2–6 would hit a warm cache. With deterministic scoring there are **no scoring calls at all**: one narrative generation per report, with nothing to share a prefix with.

## What is implemented instead

The assembly order in `prompt.ts` is cache-ready and will stay that way:

```
[1] STATIC PREFIX     identical for every client — role, hard rules, legal constraints
[2] RUBRIC BLOCK      identical for every client — dimensions, sub-criteria, anchors
[3] OUTPUT CONTRACT   identical for every client — the schema
[4] VARIABLE CONTENT  last — this client's computed scores and intake
```

`RUBRIC_BLOCK` is built once at module load rather than per request, which also guarantees byte-stability. A prefix that varied per call would never cache even once caching is enabled — that is the silent-invalidator failure, and building it at module load rules it out structurally.

## Trigger to switch it on

Sustained **more than 5 assessments/day**, or when Phase 2 opens (concurrent public users keep the prefix warm continuously). Flipping `ENABLE_PROMPT_CACHING` is then the whole change.

## Permanently excluded

**Any caching of a *result*.** No semantic cache, no "similar intake → reuse score." Two startups with similar intakes get independently generated assessments, always. Reusing an assessment across clients is the kind of shortcut that is invisible until it is a scandal.
