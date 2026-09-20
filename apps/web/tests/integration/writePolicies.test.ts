/**
 * Every table the application writes to must actually be writable.
 *
 * This exists because two tables were not, and both failed SILENTLY:
 *
 *   llm_calls          had SELECT only. The cost ledger never recorded a
 *                      single API call, and the insert's error was discarded.
 *   assessment_scores  had INSERT but no UPDATE, so a re-score kept the stale
 *                      value while the composite moved on.
 *
 * Neither was visible to a unit test, a typecheck, a lint run or a build. RLS
 * rejects a write by returning an error, and an error nobody reads is a write
 * that appears to have worked.
 *
 * The test is deliberately written against the REAL POLICIES rather than
 * against a list of expected policy names: it asks "can a writer write?", which
 * is the question that matters, and it keeps mattering if the policies are
 * rewritten.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createTestClient,
  createUser,
  deleteUser,
  serviceClient,
  stackIsUp,
  type TestUser,
} from './harness';

const up = await stackIsUp();
const describeIf = up ? describe : describe.skip;

describeIf('write policies', () => {
  let owner: TestUser;
  let viewer: TestUser;
  let clientId: string;
  let assessmentId: string;

  beforeAll(async () => {
    owner = await createUser('owner');
    viewer = await createUser('viewer');
    clientId = await createTestClient(owner);
    const { data } = await owner.db
      .from('assessments')
      .insert({
        client_id: clientId,
        status: 'generating',
        rubric_version: '1.0.0',
        intake_schema_version: '1.0.0',
        intake_data: { schema_version: '1.0.0' } as never,
        created_by: owner.id,
      })
      .select('id')
      .single();
    assessmentId = data!.id;
  });

  afterAll(async () => {
    await serviceClient().from('clients').delete().eq('id', clientId);
    await deleteUser(owner);
    await deleteUser(viewer);
  });

  /** The regression that started this file. PRD 6.6 requires the ledger. */
  it('records an llm_calls row, then completes it', async () => {
    const { data, error } = await owner.db
      .from('llm_calls')
      .insert({
        assessment_id: assessmentId,
        purpose: 'narrative',
        model_id: 'test-model',
        max_tokens: 14_000,
        prompt_version: '1.0.0',
        system_prompt_sha256: 'a'.repeat(64),
        prompt_sha256: 'b'.repeat(64),
        pricing_version: 'test',
        usd_inr_rate: 88,
        status: 'pending',
      })
      .select('id')
      .single();

    expect(error, error?.message).toBeNull();
    expect(data?.id).toBeTruthy();

    // The post-call update is a separate policy and was also missing.
    const { error: updateError } = await owner.db
      .from('llm_calls')
      .update({ status: 'complete', input_tokens: 100, output_tokens: 200, cost_paise: 42 })
      .eq('id', data!.id);

    expect(updateError, updateError?.message).toBeNull();

    const { data: after } = await serviceClient()
      .from('llm_calls')
      .select('status, cost_paise')
      .eq('id', data!.id)
      .single();
    expect(after?.status).toBe('complete');
    expect(after?.cost_paise).toBe(42);
  });

  it('re-scoring replaces the stored dimension score rather than keeping the old one', async () => {
    const row = {
      assessment_id: assessmentId,
      dimension_id: 'D2',
      dimension_name: 'Market',
      pct: 40,
      raw: 8,
      max_points: 20,
      weight: 0.2,
      defined_weight: 0.2,
      weighted_contribution: 8,
      coverage: 1,
      confidence: 'high',
      low_confidence_from_na: false,
      entirely_not_applicable: false,
      not_assessed: false,
      sub_criteria: [] as never,
    };

    const first = await owner.db
      .from('assessment_scores')
      .upsert(row, { onConflict: 'assessment_id,dimension_id' });
    expect(first.error, first.error?.message).toBeNull();

    const second = await owner.db
      .from('assessment_scores')
      .upsert({ ...row, pct: 85, raw: 17 }, { onConflict: 'assessment_id,dimension_id' });
    expect(second.error, second.error?.message).toBeNull();

    // The assertion that matters: a stale score here disagrees with the
    // composite printed beside it, which is the failure the whole guardrail
    // layer exists to prevent.
    const { data: after } = await serviceClient()
      .from('assessment_scores')
      .select('pct')
      .eq('assessment_id', assessmentId)
      .eq('dimension_id', 'D2')
      .single();
    expect(after?.pct).toBe(85);
  });

  it('still refuses a read-only account', async () => {
    // Fixing a missing write policy must not have opened the table to viewers.
    const { error } = await viewer.db.from('llm_calls').insert({
      assessment_id: assessmentId,
      purpose: 'narrative',
      model_id: 'test-model',
      max_tokens: 14_000,
      prompt_version: '1.0.0',
      system_prompt_sha256: 'c'.repeat(64),
      prompt_sha256: 'd'.repeat(64),
      pricing_version: 'test',
      usd_inr_rate: 88,
      status: 'pending',
    });
    expect(error).not.toBeNull();
  });

  it('keeps the ledger owner-only to read', async () => {
    // It holds the largest concentration of raw client data in the system.
    const { data } = await viewer.db.from('llm_calls').select('id').eq('assessment_id', assessmentId);
    expect(data ?? []).toHaveLength(0);
  });
});
