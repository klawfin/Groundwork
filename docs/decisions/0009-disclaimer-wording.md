# 0009 — Disclaimer wording: DRAFT ONLY, NOT CLEARED FOR DELIVERY

**Date:** 2026-09-19 · **Status:** **OPEN — HARD GATE** · **PRD `OPEN-09`, plan.md gate D2**

## This is not a resolved decision

It is recorded here so the gate is visible in the codebase, not only in a planning document.

**No report goes to a paying founder until the disclaimer text is reviewed against actual legal input and signed off by Dhruv.** This gate is not negotiable for schedule reasons. It blocks delivery, not just the tool.

## Current state

`packages/core/src/legal/disclaimers.ts` carries the PRD's draft wording, with:

```ts
export const DISCLAIMER_APPROVAL = {
  status: 'pending_legal_review',
  approvedBy: null,
  approvedOn: null,
  decisionRecord: 'docs/decisions/0009-disclaimer-wording.md',
};
```

While `status` is `pending_legal_review`, every rendered report carries a visible `PENDING LEGAL SIGN-OFF — NOT FOR CLIENT DELIVERY` marker. That marker is deliberately impossible to miss: shipping placeholder legal text to a paying client is the failure this module exists to prevent.

## Why this is a source constant and not an environment variable

A legal sign-off is a reviewed code change, not a runtime toggle someone can flip at 11pm before a client meeting. Flipping it requires a commit that references this record.

## What counsel must check

1. **SEBI terminology.** The draft states Klawfin "is not registered with the Securities and Exchange Board of India as an investment adviser, research analyst, or merchant banker." Whether that phrasing is accurate for an **unincorporated** entity — and whether an unincorporated entity can make the statement at all — is exactly the question.
2. Whether "business assessment, not investment advice" is sufficient framing for what the report actually contains.
3. Whether the engagement letter's data-handling clauses match what the system does (PRD §10.5). Note this depends on the Anthropic commercial-terms verification still owed in `todo.md`: **do not put the claim in writing before it is verified.**
4. Who the data controller is, given non-incorporation. That is PRD `OPEN-08` and blocks Phase 2 rather than Phase 1.

## Related risk

plan.md rates L1 High/High: "A report goes to a paying client carrying disclaimer text nobody qualified has reviewed."

## The code-side backstop is separate and already active

`packages/llm/src/guardrails.ts` blocks export on prohibited language regardless of this gate. The two are independent: the guardrail stops the *model* writing advice, this gate stops *Klawfin* shipping unreviewed legal text. Neither substitutes for the other.
