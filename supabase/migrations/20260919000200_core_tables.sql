-- ---------------------------------------------------------------------------
-- Core tables.
--
-- Design principles (architecture 3.1):
--   1. Money is integer paise. Never a float, never `money`.
--   2. Append-only where it matters: scores, narratives, reports, audit.
--      Regeneration creates a new version; nothing is overwritten (P1-09).
--   3. Intake is JSONB; anything queried is a column (ADR-005).
--   4. RLS on every table from day one - see 20260919000300_rls.sql.
--   5. Third-party PII is minimised structurally, not by policy (3.5).
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- app_users - mirrors auth.users, holds authorisation state.
-- Phase 1 contains exactly two rows.
-- ---------------------------------------------------------------------------
create table app_users (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        citext not null unique,
  full_name    text,
  role         user_role not null default 'viewer',
  is_active    boolean not null default true,
  last_seen_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index app_users_role_idx on app_users (role) where is_active;

-- ---------------------------------------------------------------------------
-- clients - the startup being assessed.
--
-- PII minimisation: ONE named human, the primary contact, because a report has
-- to be sent to someone. No other individual is named on this table. Founder
-- names live inside intake_data and are covered by the signed engagement
-- letter; third-party cap-table holders are never named at all (3.5).
--
-- Deliberately NOT collected, anywhere, ever: ID numbers, bank details, dates
-- of birth, CVs, LinkedIn URLs.
-- ---------------------------------------------------------------------------
create table clients (
  id                    uuid primary key default gen_random_uuid(),
  legal_name            text not null,
  brand_name            text,
  website_url           text,
  sector                text,
  stage                 text,
  incorporation_country char(2),
  cin_or_reg_no         text,               -- business identifier, not personal

  primary_contact_name  text not null,
  primary_contact_email citext not null,
  primary_contact_phone text,               -- nullable; do not collect unless needed

  engagement_type       text not null default 'sprint',
  engagement_start_date date,

  source                client_source not null default 'internal',
  created_by            uuid not null references app_users(id),

  -- Phase 1: consent is contractual via the engagement letter, so these stay
  -- null and `notes` records which agreement version. Phase 2 makes them
  -- mandatory before any LLM call runs (architecture 3.7).
  consent_version       text,
  consent_at            timestamptz,
  consent_ip            inet,

  retention             retention_policy not null default 'standard_24m',
  purge_after           timestamptz,
  archived_at           timestamptz,
  deleted_at            timestamptz,

  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index clients_created_by_idx on clients (created_by);
create index clients_email_idx      on clients (primary_contact_email);
create index clients_purge_idx      on clients (purge_after) where deleted_at is null;
create index clients_name_trgm_idx  on clients using gin (legal_name gin_trgm_ops);
create index clients_source_idx     on clients (source, created_at desc);

-- Duplicate detection (P1-02) warns rather than blocks, so this is a
-- non-unique index supporting a case-insensitive, whitespace-normalised lookup
-- rather than a constraint.
create index clients_name_normalised_idx on clients (lower(regexp_replace(legal_name, '\s+', ' ', 'g')));

-- ---------------------------------------------------------------------------
-- assessments - one scoring run against one client.
-- ---------------------------------------------------------------------------
create table assessments (
  id                    uuid primary key default gen_random_uuid(),
  client_id             uuid not null references clients(id) on delete cascade,
  status                assessment_status not null default 'draft',

  -- Versions stamped on every assessment so a historical score stays
  -- interpretable after the rubric changes (PRD 5.7). Reports are NEVER
  -- retroactively rescored.
  rubric_version        text not null,
  intake_schema_version text not null,

  intake_data           jsonb not null default '{}'::jsonb,
  intake_locked_at      timestamptz,

  -- Denormalised out of intake_data because these are filtered and sorted on.
  -- Written by the server on intake lock, never by the browser.
  ask_amount_paise      bigint,
  ask_currency          char(3) default 'INR',
  round_stage           text,

  -- COMPUTED IN TYPESCRIPT by @klawfin/rubric. Never by a language model
  -- (PRD NG9). The full per-sub-criterion breakdown lives in assessment_scores.
  composite_score       integer,
  composite_exact       numeric(6,3),
  composite_band        text,
  overall_coverage      numeric(5,4),
  overall_confidence    text,
  pre_revenue_mode      boolean not null default false,
  weight_redistributed  boolean not null default false,

  -- Coverage gate (PRD 8.1). An override is explicit and recorded.
  coverage_override_reason text,
  coverage_overridden_by   uuid references app_users(id),
  coverage_overridden_at   timestamptz,

  -- Cost control. CONSTRAINT: ~Rs.40 per report.
  cost_cap_paise        bigint not null default 4000,
  cost_actual_paise     bigint not null default 0,

  created_by            uuid not null references app_users(id),
  delivered_at          timestamptz,
  purge_after           timestamptz,
  deleted_at            timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint assessments_composite_range
    check (composite_score is null or composite_score between 0 and 100),
  constraint assessments_coverage_range
    check (overall_coverage is null or overall_coverage between 0 and 1),
  constraint assessments_locked_implies_status
    check (intake_locked_at is null or status <> 'draft'),
  -- An override without a reason is not an override (PRD 8.1).
  constraint assessments_override_needs_reason
    check (coverage_overridden_at is null or coalesce(btrim(coverage_override_reason), '') <> '')
);
create index assessments_client_idx  on assessments (client_id, created_at desc);
create index assessments_status_idx  on assessments (status) where deleted_at is null;
create index assessments_purge_idx   on assessments (purge_after) where deleted_at is null;
create index assessments_creator_idx on assessments (created_by, created_at desc);
create index assessments_score_idx   on assessments (composite_score desc nulls last)
  where deleted_at is null and status = 'delivered';

-- ---------------------------------------------------------------------------
-- assessment_scores - the computed breakdown, one row per dimension.
-- Append-only. Rescoring writes new rows against a new assessment.
--
-- NOTE: every column here is written from @klawfin/rubric output. There is no
-- column a model writes to, by design.
-- ---------------------------------------------------------------------------
create table assessment_scores (
  id                   uuid primary key default gen_random_uuid(),
  assessment_id        uuid not null references assessments(id) on delete cascade,
  dimension_id         text not null,             -- 'D1'..'D6'
  dimension_name       text not null,             -- denormalised; survives a rubric change

  pct                  numeric(6,3) not null,     -- 0-100, full precision
  raw                  numeric(6,3) not null,
  max_points           numeric(6,3) not null,
  weight               numeric(5,4) not null,     -- weight ACTUALLY applied
  defined_weight       numeric(5,4) not null,     -- before any redistribution
  weighted_contribution numeric(6,3) not null,

  coverage             numeric(5,4) not null,
  confidence           text not null,
  low_confidence_from_na boolean not null default false,
  entirely_not_applicable boolean not null default false,
  not_assessed         boolean not null default false,

  -- [{id, label, score, naReason, anchorLabel, scoredOnSubstitute,
  --   answeredInputs, missingInputs, derivation}]
  -- Retaining the derivation is what lets Dhruv answer "why did I score 2 on
  -- cap table hygiene" from the record alone (PRD G3).
  sub_criteria         jsonb not null default '[]'::jsonb,

  computed_at          timestamptz not null default now(),

  constraint assessment_scores_pct_range check (pct between 0 and 100),
  unique (assessment_id, dimension_id)
);
create index assessment_scores_assessment_idx on assessment_scores (assessment_id);

-- ---------------------------------------------------------------------------
-- assessment_narratives - the written assessment. Versioned; human-editable.
--
-- `raw_response` is retained UNMODIFIED alongside `edited_response`. That
-- separation is what makes metric M4 (narrative edit magnitude) measurable.
-- Do not collapse the two (PRD P1-07).
-- ---------------------------------------------------------------------------
create table assessment_narratives (
  id              uuid primary key default gen_random_uuid(),
  assessment_id   uuid not null references assessments(id) on delete cascade,
  version         smallint not null default 1,

  raw_response    jsonb not null,           -- exactly as generated, never edited
  edited_response jsonb,                    -- null = accepted as generated

  -- Per-section character-level edit distance, for M4.
  edit_magnitude  jsonb not null default '{}'::jsonb,

  model_id        text not null,
  prompt_version  text not null,
  rubric_version  text not null,

  -- Guardrail outcomes, recorded for the audit entry (PRD 6.5).
  guardrail_findings jsonb not null default '[]'::jsonb,
  guardrail_passed   boolean not null default false,

  is_fallback     boolean not null default false,   -- PRD 8.2 fallback report

  approved_by     uuid references app_users(id),
  approved_at     timestamptz,
  created_at      timestamptz not null default now(),

  unique (assessment_id, version)
);
create index assessment_narratives_assessment_idx
  on assessment_narratives (assessment_id, version desc);

-- ---------------------------------------------------------------------------
-- reports - one row per rendered PDF. Append-only; regeneration = new version.
-- ---------------------------------------------------------------------------
create table reports (
  id                   uuid primary key default gen_random_uuid(),
  assessment_id        uuid not null references assessments(id) on delete cascade,
  -- NULLABLE on purpose: the fallback report (PRD 8.2) has no narrative. It
  -- carries scores, the rubric, the data room checklist and the disclaimer,
  -- with the narrative sections marked pending. Requiring a narrative here
  -- would make the outage path unstorable, which is the one path that must
  -- always work.
  narrative_id         uuid references assessment_narratives(id),
  version              smallint not null default 1,
  tier                 report_tier not null default 'full',

  storage_bucket       text not null default 'reports',
  -- reports/{client_id}/{assessment_id}/{report_id}-v{n}.pdf
  -- UUIDs only. A storage path must not disclose that Klawfin is assessing a
  -- particular company - paths leak into logs and browser history (5.3).
  storage_path         text not null,
  byte_size            integer not null,
  sha256               char(64) not null,   -- prove what the client was shown

  -- Snapshot at render time, so the PDF stays explainable after a rubric change.
  composite_score      integer not null,
  rubric_version       text not null,
  prompt_version       text not null,
  generator_version    text not null,       -- git SHA of the deploy that rendered it

  is_preliminary       boolean not null default false,
  has_incomplete_watermark boolean not null default false,

  generated_by         uuid not null references app_users(id),
  generated_at         timestamptz not null default now(),
  download_count       integer not null default 0,
  last_downloaded_at   timestamptz,

  purge_after          timestamptz,
  purged_at            timestamptz,        -- bytes gone; the LEDGER ROW SURVIVES

  unique (assessment_id, version)
);
create index reports_assessment_idx on reports (assessment_id, version desc);
create index reports_purge_idx      on reports (purge_after) where purged_at is null;

-- ---------------------------------------------------------------------------
-- llm_calls - every Anthropic request. Cost observability (CONSTRAINT) and
-- reproducibility.
--
-- The row is written BEFORE dispatch in a pending state, then updated with
-- actuals. Otherwise a function that dies after a billed call leaves spend
-- that never appears in the ledger, and the Rs.40 ceiling silently
-- under-counts (architecture 4.5).
-- ---------------------------------------------------------------------------
create table llm_calls (
  id                    uuid primary key default gen_random_uuid(),
  assessment_id         uuid references assessments(id) on delete cascade,
  purpose               llm_purpose not null,

  model_id              text not null,      -- exactly as sent
  max_tokens            integer not null,
  prompt_version        text not null,
  system_prompt_sha256  char(64) not null,
  prompt_sha256         char(64) not null,

  -- Purged after 90 days: the largest concentration of raw client data in the
  -- system, in the least structured form, for the least operational benefit
  -- once the report has shipped (architecture 3.6).
  request_body          jsonb,
  response_body         jsonb,

  input_tokens          integer not null default 0,
  output_tokens         integer not null default 0,
  cache_creation_tokens integer not null default 0,
  cache_read_tokens     integer not null default 0,
  cost_paise            bigint  not null default 0,
  pricing_version       text not null,
  usd_inr_rate          numeric(8,4) not null,

  latency_ms            integer,
  attempt               smallint not null default 1,
  stop_reason           text,
  error_code            text,
  status                text not null default 'pending',  -- pending | complete | failed
  anthropic_request_id  text,
  created_at            timestamptz not null default now(),
  completed_at          timestamptz
);
create index llm_calls_assessment_idx on llm_calls (assessment_id, created_at);
create index llm_calls_cost_idx       on llm_calls (created_at desc);
create index llm_calls_purpose_idx    on llm_calls (purpose, created_at desc);
create index llm_calls_error_idx      on llm_calls (error_code, created_at desc) where error_code is not null;
-- A pending row older than a few minutes is spend that may not be accounted
-- for. Surfacing it is the whole point.
create index llm_calls_stale_pending_idx on llm_calls (created_at) where status = 'pending';

-- ---------------------------------------------------------------------------
-- generations - one row per generation ATTEMPT, for metric M3 and the cost view.
-- ---------------------------------------------------------------------------
create table generations (
  id               uuid primary key default gen_random_uuid(),
  assessment_id    uuid not null references assessments(id) on delete cascade,
  narrative_id     uuid references assessment_narratives(id),
  outcome          generation_outcome not null,
  attempts         smallint not null default 1,
  total_cost_paise bigint not null default 0,
  latency_ms       integer,
  failure_reason   text,
  truncation_notices jsonb not null default '[]'::jsonb,
  started_by       uuid not null references app_users(id),
  created_at       timestamptz not null default now()
);
create index generations_assessment_idx on generations (assessment_id, created_at desc);
create index generations_outcome_idx    on generations (outcome, created_at desc);

-- ---------------------------------------------------------------------------
-- contradiction_dismissals - every dismissal, with the reason (P1-05).
-- ---------------------------------------------------------------------------
create table contradiction_dismissals (
  id            uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references assessments(id) on delete cascade,
  code          text not null,
  reason        text not null,
  dismissed_by  uuid not null references app_users(id),
  dismissed_at  timestamptz not null default now(),

  constraint dismissal_reason_not_blank check (btrim(reason) <> '')
);
create index contradiction_dismissals_assessment_idx
  on contradiction_dismissals (assessment_id, dismissed_at desc);

-- ---------------------------------------------------------------------------
-- model_pricing - so historical cost figures do not change when the vendor
-- changes its price list.
-- ---------------------------------------------------------------------------
create table model_pricing (
  pricing_version            text primary key,
  model_id                   text not null,
  input_paise_per_mtok       bigint not null,
  output_paise_per_mtok      bigint not null,
  cache_write_paise_per_mtok bigint,
  cache_read_paise_per_mtok  bigint,
  usd_inr_rate               numeric(8,4) not null,
  effective_from             date not null,
  created_at                 timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger app_users_touch   before update on app_users   for each row execute function touch_updated_at();
create trigger clients_touch     before update on clients     for each row execute function touch_updated_at();
create trigger assessments_touch before update on assessments for each row execute function touch_updated_at();
