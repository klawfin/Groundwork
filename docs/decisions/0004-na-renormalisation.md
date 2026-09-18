# 0004 — N/A handling: renormalise, with a low-confidence flag

**Date:** 2026-09-19 · **Status:** Decided for v1 · **Resolves:** PRD `OPEN-03`

## Decision

A sub-criterion marked N/A is removed from **both numerator and denominator**. The dimension is scored on what remains. No penalty is applied.

Two mitigations, both implemented:

- More than half a dimension's sub-criteria N/A → the dimension is flagged **low confidence**, and the report must say so in that section.
- An entirely N/A dimension has its weight **redistributed proportionally** across the remaining dimensions, and the report states that this happened.

## Reasoning

The PRD proposes renormalisation for v1 and names the objection itself: a company can score 4 on a dimension where only one sub-criterion applied. That is real, and the low-confidence flag is the stated mitigation.

The alternative — penalising absence — punishes a company for a question that genuinely does not apply to it. A company that has never raised has no prior-round paperwork; scoring that 0 assesses them on a fact about their history rather than on their readiness.

N/A requires a reason string, which is stored, shown in the UI, and passed to the model. That is what stops N/A becoming a quiet way to raise a score.

## Revisit

After three real clients, per the PRD. The specific thing to watch is whether Dhruv reaches for N/A where a low score is the honest answer.
