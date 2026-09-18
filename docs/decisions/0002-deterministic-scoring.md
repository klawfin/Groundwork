# 0002 — Sub-criterion scores are assigned by deterministic code, not the LLM

**Date:** 2026-09-19
**Status:** Decided
**Supersedes:** architecture.md ADR-003 and §4.1

## The conflict

The source documents disagree on the single most important design question in
the system.

**PRD** — the model writes narrative only:
- NG9: "LLM computing the score — Scoring is deterministic code. The model writes narrative only."
- G2: "The assessment is consistent — the same inputs produce the same score, every time. Deterministic scoring, unit-tested."
- §6.1: "The LLM never computes a score… enforced in post-processing, not by asking the model nicely."
- P1-04: the score must be visible **before** generation, so Dhruv can fix bad input before spending money.

**readme.md** — structural rule 2: "The LLM never computes a score… Any code path where a model output influences a number is a bug."

**sprint_plan.md** — S1-04: a pure `score(intake)` function with unit tests, landing in Sprint 1 *before* the LLM ticket S1-07.

**architecture.md** — the opposite. ADR-003 has the LLM assign sub-criterion points from a scoring guide, with TypeScript doing only the arithmetic. §4.4 states plainly: "Do not promise determinism… re-running the same client can move the composite by a point or two."

## The decision

**Deterministic code assigns every sub-criterion score. The LLM writes narrative about scores it is given as facts.**

## Reasoning

1. **The PRD is the requirements document.** The architecture document describes itself as "PROPOSED — every decision here is a proposal… can reject any of it," and lists ADR-004 and ADR-002 among the five things it would most want challenged. It is a proposal against a spec, and the spec says otherwise.

2. **Three documents to one.** PRD, readme and sprint plan all specify deterministic scoring, independently and in detail.

3. **The architecture's own blocker is now removed.** Its open technical question 8 says: "Who defines the `sub_criteria` for each of the six dimensions? This is the highest-value unwritten artifact in the whole build… The LLM layer cannot be built well until this exists." It reached for the LLM partly because the sub-criteria did not exist. PRD §5.3 defines all 29 with their intake-field mappings, and `packages/rubric` now implements them.

4. **P1-04 is impossible under the alternative.** "See the score before generating… so I can fix bad input first" cannot work if scoring costs six LLM calls. Under this decision the score is free and instant, which is also what makes the intake form usable.

5. **G2 and G3 are unachievable under the alternative.** The architecture is honest that its approach cannot promise determinism. But "why did I score 2 on cap table hygiene" must be answerable from the report alone, in front of a paying client, and "the model judged it so" is not an answer Dhruv can defend.

6. **Cost.** Six scoring calls plus narrative plus exec summary was budgeted at ~₹23/report. One narrative call is a fraction of that.

## What this does NOT mean

It does not mean a spreadsheet replaces judgment. Eleven of the 29 sub-criteria are **anchored**: Dhruv reads the printed anchor text and selects the level. He is the assessor; the tool is the instrument. His selection is stored intake data, so the same intake yields the same score forever — still deterministic, still unit-tested, still defensible. The other eighteen are **derived** by rule from structured values (cap table arithmetic, month-series analysis, use-of-funds totals).

This matches NG4, which already has Dhruv reading the documents and entering structured facts rather than the system parsing them.

## What was kept from the architecture document

Its reasoning was sound even where its conclusion was not, and several of its ideas are implemented:

- The evidence/derivation trail per sub-criterion (`derivation` on every derived result)
- The `llm_calls` cost ledger with pre-flight gating
- Append-only scores, narratives, reports and audit log
- RLS from day one with Phase-2-shaped predicates
- The write-the-ledger-row-before-dispatch pattern
- Cap-table PII minimisation (see [0011](./0011-cap-table-pii.md))

## Consequences

- `packages/rubric` has no dependency on `packages/llm`, and cannot acquire one: the dependency graph runs `core ← rubric ← validation ← llm`.
- Determinism is asserted in tests rather than hoped for (`assertDeterministic`).
- Rubric weight changes re-score historical assessments offline with no API spend.
- The prompt must carry the computed scores as facts, and the numeric-consistency guardrail enforces that the narrative does not contradict them.

## Revisit if

Dhruv finds anchoring 11 sub-criteria per client too slow in practice. The fix then is better anchor UI, or moving specific sub-criteria from `anchored` to `derived` by collecting more structured input — not handing scoring to the model.
