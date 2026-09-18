-- ---------------------------------------------------------------------------
-- Retention and deletion (PRD 10.6, P1-11; architecture 3.6).
--
-- Two distinctions that matter and are easy to get wrong:
--
-- 1. PURGING IS FIELD-LEVEL, NOT ROW-LEVEL. Deleting a `reports` row would
--    destroy the record that a report was ever delivered, which Klawfin needs
--    for its own defence. Purge the bytes and the personal content; keep the
--    ledger.
--
-- 2. llm_calls BODIES PURGE MUCH FASTER than everything else (90 days vs 24
--    months) because they are the largest concentration of raw client data in
--    the system, in the least structured form, for the least operational
--    benefit once the report has shipped.
--
-- RETENTION PERIODS ARE PROPOSED AND MUST BE CONFIRMED BY COUNSEL before the
-- first client (PRD OPEN-08). They are encoded here so the position is
-- explicit and reviewable, not so it is settled.
-- ---------------------------------------------------------------------------

create table deletion_requests (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references clients(id) on delete cascade,
  requested_by    text not null,            -- 'data_principal' | 'klawfin_internal'
  requester_email citext,
  reason          text,
  status          deletion_status not null default 'requested',
  approved_by     uuid references app_users(id),
  approved_at     timestamptz,
  executed_at     timestamptz,
  execution_note  text,
  created_at      timestamptz not null default now()
);
create index deletion_requests_status_idx on deletion_requests (status, created_at);

alter table deletion_requests enable row level security;

create policy deletion_requests_staff_read on deletion_requests
  for select to authenticated using (is_staff());

create policy deletion_requests_staff_insert on deletion_requests
  for insert to authenticated with check (can_write());

create policy deletion_requests_owner_update on deletion_requests
  for update to authenticated
  using (current_app_role() = 'owner')
  with check (current_app_role() = 'owner');

-- ---------------------------------------------------------------------------
-- Retention purge.
--
-- `dry_run` defaults to TRUE and MUST stay true for the first month of
-- operation (architecture 3.6). A retention job that silently destroys a
-- paying client's report is a worse outcome than data kept thirty days too
-- long. Run it in dry-run, read what it WOULD have purged, and only then flip
-- it.
--
-- It never hard-deletes a row.
-- ---------------------------------------------------------------------------
create or replace function run_retention_purge(dry_run boolean default true)
returns table (entity_type text, entity_id uuid, action text)
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
begin
  -- 1. llm_call bodies older than 90 days. Token counts, costs, hashes and
  --    model ids are retained forever; only the bodies go.
  for rec in
    select id from llm_calls
    where created_at < now() - interval '90 days'
      and (request_body is not null or response_body is not null)
  loop
    entity_type := 'llm_call'; entity_id := rec.id; action := 'purge_bodies';
    return next;
    if not dry_run then
      update llm_calls set request_body = null, response_body = null where id = rec.id;
      insert into audit_log (action, entity_type, entity_id, metadata)
      values ('retention.purge_executed', 'llm_call', rec.id,
              jsonb_build_object('purged', 'bodies', 'policy', '90d'));
    end if;
  end loop;

  -- 2. Intake data past its retention date.
  for rec in
    select a.id, a.client_id from assessments a
    where a.purge_after is not null
      and a.purge_after < now()
      and a.intake_data <> '{"purged": true}'::jsonb
      and not exists (select 1 from clients c where c.id = a.client_id and c.retention = 'legal_hold')
  loop
    entity_type := 'assessment'; entity_id := rec.id; action := 'purge_intake';
    return next;
    if not dry_run then
      update assessments
      set intake_data = jsonb_build_object('purged', true, 'purged_at', now())
      where id = rec.id;
      insert into audit_log (action, entity_type, entity_id, client_id, metadata)
      values ('retention.purge_executed', 'assessment', rec.id, rec.client_id,
              jsonb_build_object('purged', 'intake_data'));
    end if;
  end loop;

  -- 3. Report PDFs past retention. The BYTES go; the ledger row survives with
  --    its sha256 as proof of what was delivered.
  for rec in
    select r.id, a.client_id from reports r
    join assessments a on a.id = r.assessment_id
    where r.purge_after is not null
      and r.purge_after < now()
      and r.purged_at is null
      and not exists (select 1 from clients c where c.id = a.client_id and c.retention = 'legal_hold')
  loop
    entity_type := 'report'; entity_id := rec.id; action := 'purge_pdf_bytes';
    return next;
    if not dry_run then
      -- The storage object itself is removed by the application job that reads
      -- this function's output; SQL cannot delete a storage object.
      update reports set purged_at = now() where id = rec.id;
      insert into audit_log (action, entity_type, entity_id, client_id, metadata)
      values ('report.purged', 'report', rec.id, rec.client_id,
              jsonb_build_object('purged', 'pdf_bytes'));
    end if;
  end loop;

  -- 4. Personal contact fields on clients past retention. The row survives
  --    with business identifiers only.
  for rec in
    select id from clients
    where purge_after is not null
      and purge_after < now()
      and retention <> 'legal_hold'
      and primary_contact_email is not null
  loop
    entity_type := 'client'; entity_id := rec.id; action := 'purge_contact_fields';
    return next;
    if not dry_run then
      update clients
      set primary_contact_name = 'purged',
          primary_contact_email = concat('purged+', id::text, '@invalid'),
          primary_contact_phone = null
      where id = rec.id;
      insert into audit_log (action, entity_type, entity_id, client_id, metadata)
      values ('retention.purge_executed', 'client', rec.id, rec.id,
              jsonb_build_object('purged', 'contact_fields'));
    end if;
  end loop;

  return;
end $$;

-- ---------------------------------------------------------------------------
-- Full deletion on client request (P1-11).
--
-- Removes the client record, intake, all report versions and all narratives.
-- The AUDIT ENTRY IS RETAINED - who, when, which client id - even though the
-- client data is gone (PRD 10.6, P1-11).
--
-- Deletion must also reach STORAGE OBJECTS, not only database rows. This
-- function returns the storage paths so the calling application job deletes
-- them; a SQL function cannot. A deletion that leaves the PDFs in the bucket
-- is not a deletion, and "we'd have to look into it" is not an answer to give
-- a client who asks.
-- ---------------------------------------------------------------------------
create or replace function execute_client_deletion(target_client_id uuid, actor uuid)
returns table (storage_bucket text, storage_path text)
language plpgsql
security definer
set search_path = public
as $$
declare
  client_name text;
begin
  select legal_name into client_name from clients where id = target_client_id;
  if not found then
    raise exception 'Client % not found', target_client_id;
  end if;

  -- Hand the caller every object it must remove from storage, BEFORE the rows
  -- that name them are deleted.
  return query
    select r.storage_bucket, r.storage_path
    from reports r
    join assessments a on a.id = r.assessment_id
    where a.client_id = target_client_id and r.purged_at is null;

  insert into audit_log (action, entity_type, entity_id, client_id, actor_user_id, metadata)
  values ('deletion.executed', 'client', target_client_id, target_client_id, actor,
          jsonb_build_object(
            'reports_deleted', (select count(*) from reports r
                                join assessments a on a.id = r.assessment_id
                                where a.client_id = target_client_id),
            'assessments_deleted', (select count(*) from assessments
                                    where client_id = target_client_id)
          ));

  -- ON DELETE CASCADE carries assessments, scores, narratives, reports,
  -- llm_calls, generations and dismissals with the client row.
  delete from clients where id = target_client_id;

  return;
end $$;

-- ---------------------------------------------------------------------------
-- Scheduling.
--
-- pg_cron availability on the current plan is UNVERIFIED (architecture 3.6).
-- If it is unavailable, the fallback is a scheduled CI job hitting an
-- authenticated internal route that calls the same function - same logic, one
-- more moving part.
--
--   select cron.schedule(
--     'nightly-retention-purge', '30 13 * * *',   -- 13:30 UTC = 19:00 IST
--     $$ select run_retention_purge(false); $$
--   );
--
-- DO NOT schedule this with dry_run = false until the dry-run output has been
-- reviewed for a month.
-- ---------------------------------------------------------------------------
