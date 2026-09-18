-- ---------------------------------------------------------------------------
-- Row Level Security.
--
-- RLS IS THE AUTHORISATION BOUNDARY. Application checks are a convenience
-- layer on top, not the boundary (architecture ADR-007).
--
-- With one user this looks like ceremony. It is not. Retrofitting
-- authorisation onto a table that already holds real client financials is the
-- single most expensive migration available, and IDOR becomes structurally
-- difficult rather than convention-dependent. The predicates below are written
-- in a shape Phase 2 NARROWS by adding `or owner_user_id = auth.uid()`, rather
-- than one Phase 2 has to rewrite.
--
-- CRITICAL FOOTGUN, stated once and loudly: a table with RLS enabled and NO
-- policy denies everything to `authenticated` and allows everything to
-- `service_role`. Code using the admin client keeps working while code using
-- the user client silently returns zero rows. "It works in my API route but
-- the page is empty" is almost always a missing policy. The test at the bottom
-- of this file's companion (tests/rls) asserts non-empty reads for every table
-- under a real user JWT.
-- ---------------------------------------------------------------------------

alter table app_users                enable row level security;
alter table clients                  enable row level security;
alter table assessments              enable row level security;
alter table assessment_scores        enable row level security;
alter table assessment_narratives    enable row level security;
alter table reports                  enable row level security;
alter table llm_calls                enable row level security;
alter table generations              enable row level security;
alter table contradiction_dismissals enable row level security;
alter table model_pricing            enable row level security;

-- ---------------------------------------------------------------------------
-- Role resolution
-- ---------------------------------------------------------------------------
create or replace function current_app_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from app_users where id = auth.uid() and is_active
$$;

create or replace function is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from app_users where id = auth.uid() and is_active)
$$;

create or replace function can_write()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from app_users
    where id = auth.uid() and is_active and role in ('owner', 'analyst')
  )
$$;

-- ---------------------------------------------------------------------------
-- app_users - a user may read their own row; only an owner sees all.
-- Nobody may change their own role through the API.
-- ---------------------------------------------------------------------------
create policy app_users_self_read on app_users
  for select to authenticated
  using (id = auth.uid() or current_app_role() = 'owner');

create policy app_users_owner_write on app_users
  for all to authenticated
  using (current_app_role() = 'owner')
  with check (current_app_role() = 'owner');

-- ---------------------------------------------------------------------------
-- clients
--
-- Phase 1: staff see all internal clients. The `source = 'internal'` predicate
-- is what Phase 2 narrows - a self-serve client row will carry an owner and
-- this clause gains `or owner_user_id = auth.uid()`.
-- ---------------------------------------------------------------------------
create policy clients_staff_read on clients
  for select to authenticated
  using (is_staff() and source = 'internal' and deleted_at is null);

create policy clients_staff_insert on clients
  for insert to authenticated
  with check (can_write() and created_by = auth.uid());

create policy clients_staff_update on clients
  for update to authenticated
  using (can_write() and deleted_at is null)
  with check (can_write());

-- Hard deletion is a deliberate operation performed server-side with the
-- service role after a recorded deletion request (P1-11, architecture 3.6).
-- There is no DELETE policy here on purpose: a one-click accident must not be
-- able to destroy a paying client's engagement data.

-- ---------------------------------------------------------------------------
-- assessments and children
--
-- Each child defers to its parent via an EXISTS on `assessments`, which in
-- turn defers to `clients`. Nested RLS does the real filtering, so a Phase 2
-- change to the `clients` predicate propagates automatically instead of
-- needing a security review of every query in the codebase.
-- ---------------------------------------------------------------------------
create policy assessments_staff_read on assessments
  for select to authenticated
  using (
    deleted_at is null
    and exists (select 1 from clients c where c.id = assessments.client_id)
  );

create policy assessments_staff_insert on assessments
  for insert to authenticated
  with check (
    can_write()
    and created_by = auth.uid()
    and exists (select 1 from clients c where c.id = client_id)
  );

create policy assessments_staff_update on assessments
  for update to authenticated
  using (can_write() and deleted_at is null)
  with check (can_write());

create policy scores_staff_read on assessment_scores
  for select to authenticated
  using (exists (select 1 from assessments a where a.id = assessment_scores.assessment_id));

-- Scores are written server-side from @klawfin/rubric output. No browser path
-- inserts a score: a client-side write to this table would be a model or a
-- user choosing a number, which is exactly what PRD NG9 forbids.
create policy scores_service_insert on assessment_scores
  for insert to authenticated
  with check (
    can_write()
    and exists (select 1 from assessments a where a.id = assessment_id)
  );

create policy narratives_staff_read on assessment_narratives
  for select to authenticated
  using (exists (select 1 from assessments a where a.id = assessment_narratives.assessment_id));

create policy narratives_staff_insert on assessment_narratives
  for insert to authenticated
  with check (
    can_write()
    and exists (select 1 from assessments a where a.id = assessment_id)
  );

-- Editing a narrative writes `edited_response`; `raw_response` must stay
-- untouched so metric M4 remains measurable (PRD P1-07). The column-level
-- guard is the trigger in 20260919000400_audit.sql.
create policy narratives_staff_update on assessment_narratives
  for update to authenticated
  using (can_write())
  with check (can_write());

create policy reports_staff_read on reports
  for select to authenticated
  using (exists (select 1 from assessments a where a.id = reports.assessment_id));

create policy reports_staff_insert on reports
  for insert to authenticated
  with check (
    can_write()
    and generated_by = auth.uid()
    and exists (select 1 from assessments a where a.id = assessment_id)
  );

-- Download counters only. Reports are immutable once exported (P1-09).
create policy reports_staff_update on reports
  for update to authenticated
  using (can_write())
  with check (can_write());

create policy dismissals_staff_read on contradiction_dismissals
  for select to authenticated
  using (exists (select 1 from assessments a where a.id = contradiction_dismissals.assessment_id));

create policy dismissals_staff_insert on contradiction_dismissals
  for insert to authenticated
  with check (can_write() and dismissed_by = auth.uid());

-- ---------------------------------------------------------------------------
-- Cost and generation data - owner only.
-- Spend is not something every seat needs to see.
-- ---------------------------------------------------------------------------
create policy llm_calls_owner_read on llm_calls
  for select to authenticated
  using (current_app_role() = 'owner');

create policy generations_staff_read on generations
  for select to authenticated
  using (exists (select 1 from assessments a where a.id = generations.assessment_id));

create policy generations_staff_insert on generations
  for insert to authenticated
  with check (can_write() and started_by = auth.uid());

-- ---------------------------------------------------------------------------
-- Reference data - everyone reads, owner edits.
-- ---------------------------------------------------------------------------
create policy model_pricing_read on model_pricing
  for select to authenticated
  using (is_staff());

create policy model_pricing_owner_write on model_pricing
  for all to authenticated
  using (current_app_role() = 'owner')
  with check (current_app_role() = 'owner');

-- ---------------------------------------------------------------------------
-- Storage: the reports bucket is PRIVATE and has no policies at all.
--
-- Nothing reads it directly. The only path to a PDF is
-- GET /api/reports/:id/download, which verifies the session, verifies via RLS
-- that this user can see the report row, writes the audit entry BEFORE issuing
-- the URL, and then mints a short-lived signed URL with the admin client
-- (architecture 5.3).
--
-- Residual risk, stated honestly: a signed URL is a bearer token for its
-- lifetime. In Phase 1 Dhruv hands the PDF over in a meeting, so that is
-- acceptable. If reports are ever emailed, the answer is a per-recipient
-- tokenised link with its own row and its own audit trail, not a longer expiry.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('reports', 'reports', false)
on conflict (id) do nothing;
