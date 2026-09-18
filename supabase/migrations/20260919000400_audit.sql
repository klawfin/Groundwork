-- ---------------------------------------------------------------------------
-- Audit log.
--
-- Append-only, enforced IN THE DATABASE, not just in application code.
--
-- The strongest practical argument for this table is not the compliance
-- checkbox. It is breach notification: without it you cannot scope an
-- incident, only guess at it (architecture 3.7). It also cannot be backfilled,
-- which is why it exists from the first commit rather than from the first
-- audit.
--
-- HONEST LIMITATION: `service_role` bypasses RLS and anyone with the Supabase
-- dashboard password can drop the rules below. This is tamper-EVIDENT, not
-- tamper-PROOF. Do not describe it as immutable to a client. If a real
-- immutability requirement arrives, the answer is periodic export to
-- append-only external storage, not more triggers.
-- ---------------------------------------------------------------------------

create table audit_log (
  id            bigserial primary key,
  occurred_at   timestamptz not null default now(),
  actor_user_id uuid references app_users(id),
  actor_email   citext,                        -- denormalised: survives user deletion
  action        text not null,
  entity_type   text not null,
  entity_id     uuid,
  client_id     uuid,                          -- "everything touching this client"
  ip            inet,
  user_agent    text,
  request_id    text,                          -- correlates to platform + error tracking

  -- NEVER raw intake values. Metadata means model id, prompt version, token
  -- counts, cost, latency, outcome, dismissal reason - never a cap table and
  -- never a revenue figure (architecture 5.7).
  metadata      jsonb not null default '{}'::jsonb,

  created_at    timestamptz not null default now()
);

create index audit_log_occurred_idx on audit_log (occurred_at desc);
create index audit_log_actor_idx    on audit_log (actor_user_id, occurred_at desc);
create index audit_log_entity_idx   on audit_log (entity_type, entity_id, occurred_at desc);
create index audit_log_client_idx   on audit_log (client_id, occurred_at desc);
create index audit_log_action_idx   on audit_log (action, occurred_at desc);

-- Append-only. Revoke first, then block with rules so even a privileged path
-- cannot quietly rewrite history.
revoke update, delete on audit_log from authenticated, anon, service_role;

create rule audit_log_no_update as on update to audit_log do instead nothing;
create rule audit_log_no_delete as on delete to audit_log do instead nothing;

alter table audit_log enable row level security;

-- Anyone authenticated may WRITE an audit entry - forgetting to log is the
-- failure mode, not over-logging. Only the owner may read the log.
create policy audit_insert on audit_log
  for insert to authenticated
  with check (true);

create policy audit_owner_read on audit_log
  for select to authenticated
  using (current_app_role() = 'owner');

-- ---------------------------------------------------------------------------
-- Action vocabulary (PRD 10.7). Keep it small and keep it stable.
--
--   auth.login              auth.logout            auth.denied
--   client.created          client.viewed          client.updated
--   client.archived         client.deleted
--   intake.saved            intake.locked          intake.truncated
--   assessment.created      assessment.viewed      assessment.scored
--   contradiction.dismissed coverage.overridden
--   generation.started      generation.completed   generation.failed
--   guardrail.evaluated
--   narrative.edited        narrative.approved     narrative.reverted
--   report.generated        report.download_url_issued
--   report.purged
--   retention.purge_executed
--   deletion.requested      deletion.approved      deletion.executed
--
-- PRD 10.7 requires an entry for EVERY one of: sign-in success, sign-in
-- failure, client created, client deleted, intake submitted, generation
-- attempted, generation outcome, guardrail result, report exported, PDF
-- accessed via signed URL, contradiction dismissed, coverage override used.
-- All twelve appear above.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Protect the raw generation.
--
-- PRD P1-07: "Edits are saved as a report version distinct from the raw
-- generation; the raw generation is retained unmodified." Metric M4 measures
-- the diff between them, so an UPDATE that rewrote `raw_response` would not
-- merely lose data - it would make the most important quality metric in the
-- PRD silently unmeasurable.
-- ---------------------------------------------------------------------------
create or replace function protect_raw_narrative()
returns trigger language plpgsql as $$
begin
  if new.raw_response is distinct from old.raw_response then
    raise exception
      'raw_response is immutable. Narrative edits belong in edited_response; the raw generation is retained so edit magnitude (metric M4) stays measurable.';
  end if;
  if new.model_id is distinct from old.model_id
     or new.prompt_version is distinct from old.prompt_version
     or new.rubric_version is distinct from old.rubric_version then
    raise exception 'Provenance columns on a narrative are immutable once written.';
  end if;
  return new;
end $$;

create trigger assessment_narratives_protect_raw
  before update on assessment_narratives
  for each row execute function protect_raw_narrative();

-- ---------------------------------------------------------------------------
-- Reports are immutable once exported (P1-09). Only the download counters and
-- the purge markers may change.
-- ---------------------------------------------------------------------------
create or replace function protect_report_immutability()
returns trigger language plpgsql as $$
begin
  if new.storage_path     is distinct from old.storage_path
     or new.sha256        is distinct from old.sha256
     or new.composite_score is distinct from old.composite_score
     or new.narrative_id  is distinct from old.narrative_id
     or new.version       is distinct from old.version
     or new.rubric_version is distinct from old.rubric_version then
    raise exception
      'A report is immutable once generated. A change after export requires a new version (PRD P1-09).';
  end if;
  return new;
end $$;

create trigger reports_protect_immutability
  before update on reports
  for each row execute function protect_report_immutability();
