-- ---------------------------------------------------------------------------
-- Two missing write policies, both found by cross-referencing every table the
-- application writes to against the policies that exist. Both failed SILENTLY.
--
-- 1. llm_calls had SELECT only.
--
--    `lib/generation/run.ts` inserts the ledger row before dispatching the API
--    call and updates it with usage afterwards. RLS rejected both, and the
--    insert's error was not checked, so EVERY PAID CALL WAS RECORDED NOWHERE:
--    no prompt hashes, no token counts, no per-call cost, no latency.
--
--    That file's own comment reads "a spend with no record is the one failure
--    the cost ledger cannot recover from", which is exactly what happened.
--    PRD 6.6 requires the ledger; it has never held a row.
--
-- 2. assessment_scores had INSERT but no UPDATE.
--
--    `toScoreRows` is written with `upsert`, so a re-score takes the UPDATE
--    path. RLS rejected it and the stored dimension scores stayed at their
--    first value while the assessment's composite moved on - a scorecard that
--    silently disagrees with the number printed beside it.
--
-- Read policies are unchanged. `llm_calls` stays owner-only to read: it holds
-- the largest concentration of raw client data in the system.
-- ---------------------------------------------------------------------------

-- --- llm_calls -------------------------------------------------------------
-- Written by the application on behalf of a generation, so `can_write()` is
-- the right gate: an analyst generating a report must be able to record what
-- it cost. Reading stays restricted to the owner.
create policy llm_calls_staff_insert on llm_calls
  for insert to authenticated
  with check (
    can_write()
    and (
      assessment_id is null
      or exists (select 1 from assessments a where a.id = assessment_id)
    )
  );

-- The post-call update writes usage, cost, latency and status onto the row
-- that was inserted before dispatch. Scoped to rows for assessments that
-- exist, matching the insert.
create policy llm_calls_staff_update on llm_calls
  for update to authenticated
  using (
    can_write()
    and (
      assessment_id is null
      or exists (select 1 from assessments a where a.id = llm_calls.assessment_id)
    )
  )
  with check (can_write());

-- --- assessment_scores -----------------------------------------------------
-- Same conditions as the insert policy, so a re-score is permitted exactly
-- where the original score was.
create policy scores_service_update on assessment_scores
  for update to authenticated
  using (
    can_write()
    and exists (select 1 from assessments a where a.id = assessment_scores.assessment_id)
  )
  with check (
    can_write()
    and exists (select 1 from assessments a where a.id = assessment_id)
  );
