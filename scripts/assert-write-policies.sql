-- ---------------------------------------------------------------------------
-- Assert that every table the application writes to can actually be written.
--
-- Run after every migration, in CI and on deploy.
--
-- This exists because two tables silently could not be written for the entire
-- life of the project:
--
--   llm_calls          SELECT only. The cost ledger never held a row, and the
--                      application discarded the rejection.
--   assessment_scores  INSERT but no UPDATE, so a re-score kept the stale
--                      value while the composite moved on.
--
-- RLS refuses a write by RETURNING an error. Nothing throws, nothing logs, and
-- a build stays green. The only reliable guard is to assert the policies exist.
--
-- Raises an exception on a gap, so a migration that removes a policy fails the
-- deploy rather than being discovered from an empty table weeks later.
-- ---------------------------------------------------------------------------

do $$
declare
  required record;
  found_count integer;
  gaps text[] := '{}';
begin
  for required in
    select * from (values
      ('app_users',                'UPDATE'),
      ('assessment_narratives',    'INSERT'),
      ('assessment_narratives',    'UPDATE'),
      ('assessment_scores',        'INSERT'),
      ('assessment_scores',        'UPDATE'),   -- upsert takes this path
      ('assessments',              'INSERT'),
      ('assessments',              'UPDATE'),
      ('audit_log',                'INSERT'),
      ('clients',                  'INSERT'),
      ('clients',                  'UPDATE'),
      ('contradiction_dismissals', 'INSERT'),
      ('deletion_requests',        'INSERT'),
      ('deletion_requests',        'UPDATE'),
      ('generations',              'INSERT'),
      ('llm_calls',                'INSERT'),   -- PRD 6.6 cost ledger
      ('llm_calls',                'UPDATE'),   -- usage written after the call
      ('reports',                  'INSERT'),
      ('reports',                  'UPDATE')
    ) as t(table_name, command)
  loop
    select count(*) into found_count
    from pg_policies
    where schemaname = 'public'
      and tablename = required.table_name
      and cmd in (required.command, 'ALL');

    if found_count = 0 then
      gaps := gaps || (required.table_name || '.' || required.command);
    end if;
  end loop;

  if array_length(gaps, 1) > 0 then
    raise exception
      'Missing RLS write policies: %. The application writes to these and the rejection would be silent.',
      array_to_string(gaps, ', ');
  end if;

  raise notice 'Write policy check passed: all 18 required policies present.';
end $$;

-- Every public table must have RLS enabled at all. A table without it is
-- readable by anyone holding the anon key, which is published in the browser.
do $$
declare
  unprotected text[];
begin
  select array_agg(c.relname::text) into unprotected
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and not c.relrowsecurity;

  if unprotected is not null then
    raise exception 'Tables without RLS: %', array_to_string(unprotected, ', ');
  end if;

  raise notice 'RLS enabled on every public table.';
end $$;
