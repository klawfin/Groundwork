# 0011 — Cap-table holders are stored as refs, never as names

**Date:** 2026-09-19 · **Status:** Decided · **Source:** architecture §3.5

## Decision

Cap-table holders other than the client's own founders are stored as opaque refs — `F1`, `A1`, `ESOP` — with a category and a holding in basis points. **No names.**

The schema enforces it:

```ts
ref: z.string().regex(/^[A-Za-z0-9_-]+$/, 'Use a ref such as F1, A1 or ESOP — never a person name')
```

## Reasoning

This is the sharpest data-protection point in the whole design, and the architecture document was right to say it would fight hardest for it.

A cap table's natural shape is a list of named individuals with their ownership percentages. Stored that way, Klawfin holds **personal financial data about people who never interacted with Klawfin and never consented to anything**. Under the DPDP Act that makes Klawfin a Data Fiduciary for each of them, with notice and rights obligations it cannot practically discharge — there is no way to serve a privacy notice to an angel investor in a client's cap table.

**The rubric scores structure, not identity.** "A non-operational founder holds 12% fully diluted with no vesting" is exactly the red flag D5.2 exists to catch, and it scores identically whether or not that person is named. The derivation for D5.2 reads holder categories, basis points, vesting status and operational status — none of which require a name.

## What this costs

A slightly more awkward intake form, and the report cannot say "Rahul holds 12%." Small prices. The alternative is building a data-subject-rights obligation to strangers into the schema on day one.

## Founder names ARE collected

The report is addressed to the company about itself, and PRD §10.4 accepts that founder names are needed for that. Founders are the client's own principals and are covered by the signed engagement letter. Even so, only name, role and professional background are stored — no contact details, no ID numbers, no dates of birth, no CVs, no LinkedIn URLs.

## The one escape hatch

`legal_notes` is free text and may legitimately contain a name where a specific dispute must be recorded. The UI tells Dhruv that this field is reviewed under a shorter retention window, and such a client can be set to `retention = 'short_90d'`.

## Related

The same principle governs what reaches the model: structured intake fields only, no documents (Phase 1 accepts no uploads at all), no founder personal contact details, no ID or bank details — and those are not collected in the first place, which is the only reliable way not to send them.
