/**
 * Database triggers and the application's agreement with them.
 *
 * Two of the three tests below would have caught a defect that shipped and was
 * only found by running the product by hand (decision 0015). That is the whole
 * argument for this file existing.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createTestClient,
  createUser,
  deleteUser,
  LOCAL,
  serviceClient,
  stackIsUp,
  uniqueEmail,
  type TestUser,
} from './harness';

const up = await stackIsUp();
const describeIf = up ? describe : describe.skip;

if (!up) {
  console.warn('[integration] local Supabase is not running - skipping. `npx supabase start`');
}

describeIf('auth allowlist trigger', () => {
  it('creates the app_users row on first sign-in, with the allowlisted role', async () => {
    const user = await createUser('analyst');
    try {
      const { data } = await serviceClient()
        .from('app_users')
        .select('id, email, role, is_active')
        .eq('id', user.id)
        .single();

      // The row must be created by the trigger with the REAL auth id. The
      // original design pre-provisioned it with a random uuid and rebound it
      // later, which could not work at all - `app_users.id` references
      // `auth.users(id)`, so the row could not exist first.
      expect(data?.id).toBe(user.id);
      expect(data?.email).toBe(user.email);
      expect(data?.role).toBe('analyst');
      expect(data?.is_active).toBe(true);
    } finally {
      await deleteUser(user);
    }
  });

  it('refuses an address that is not allowlisted, and creates no account', async () => {
    const email = uniqueEmail('intruder');

    const response = await fetch(`${LOCAL.url}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        apikey: LOCAL.serviceKey,
        Authorization: `Bearer ${LOCAL.serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, email_confirm: true }),
    });

    expect(response.ok).toBe(false);
    const body = (await response.json()) as { message?: string };
    expect(body.message).toContain('Not authorised');

    // Refusing is only half of it: no account may survive the attempt.
    const { data } = await serviceClient().from('app_users').select('id').eq('email', email);
    expect(data ?? []).toHaveLength(0);
  });
});

describeIf('report immutability', () => {
  let owner: TestUser;
  let clientId: string;
  let assessmentId: string;

  beforeAll(async () => {
    owner = await createUser('owner');
    clientId = await createTestClient(owner);
    const { data, error } = await owner.db
      .from('assessments')
      .insert({
        client_id: clientId,
        status: 'scored',
        rubric_version: '1.0.0',
        intake_schema_version: '1.0.0',
        intake_data: { schema_version: '1.0.0' } as never,
        intake_locked_at: new Date().toISOString(),
        created_by: owner.id,
      })
      .select('id')
      .single();
    if (error || !data) throw new Error(`assessment insert failed: ${error?.message}`);
    assessmentId = data.id;
  });

  afterAll(async () => {
    await serviceClient().from('clients').delete().eq('id', clientId);
    await deleteUser(owner);
  });

  /**
   * THE test that was missing.
   *
   * The export route used to insert with storage_path 'pending', upload, then
   * update the path. This trigger rejected that update every time; the route
   * did not check the error and returned 200 with a download URL pointing at a
   * row that said 'pending'. Every report was undownloadable and nothing said
   * so.
   */
  it('refuses to let storage_path change after insert', async () => {
    const { data: report, error: insertError } = await owner.db
      .from('reports')
      .insert({
        assessment_id: assessmentId,
        version: 1,
        storage_path: 'final/path-v1.pdf',
        byte_size: 1,
        sha256: 'a'.repeat(64),
        composite_score: 50,
        rubric_version: '1.0.0',
        prompt_version: 'none',
        generator_version: 'test',
        generated_by: owner.id,
      })
      .select('id')
      .single();

    expect(insertError).toBeNull();

    const { error } = await owner.db
      .from('reports')
      .update({ storage_path: 'somewhere/else.pdf' })
      .eq('id', report!.id);

    expect(error).not.toBeNull();
    expect(error?.message).toContain('immutable');
  });

  it('allows the download counter to move, which is not part of the record', async () => {
    const { data: report } = await owner.db
      .from('reports')
      .insert({
        assessment_id: assessmentId,
        version: 2,
        storage_path: 'final/path-v2.pdf',
        byte_size: 1,
        sha256: 'b'.repeat(64),
        composite_score: 50,
        rubric_version: '1.0.0',
        prompt_version: 'none',
        generator_version: 'test',
        generated_by: owner.id,
      })
      .select('id, download_count')
      .single();

    const { error } = await owner.db
      .from('reports')
      .update({ download_count: report!.download_count + 1 })
      .eq('id', report!.id);

    expect(error).toBeNull();

    const { data: after } = await serviceClient()
      .from('reports')
      .select('download_count')
      .eq('id', report!.id)
      .single();
    expect(after?.download_count).toBe(1);
  });
});

describeIf('narrative raw_response immutability (metric M4)', () => {
  let owner: TestUser;
  let clientId: string;

  beforeAll(async () => {
    owner = await createUser('owner');
    clientId = await createTestClient(owner);
  });

  afterAll(async () => {
    await serviceClient().from('clients').delete().eq('id', clientId);
    await deleteUser(owner);
  });

  it('refuses to let the raw generation be rewritten', async () => {
    const { data: assessment } = await owner.db
      .from('assessments')
      .insert({
        client_id: clientId,
        status: 'review',
        rubric_version: '1.0.0',
        intake_schema_version: '1.0.0',
        intake_data: { schema_version: '1.0.0' } as never,
        created_by: owner.id,
      })
      .select('id')
      .single();

    const { data: narrative, error: insertError } = await owner.db
      .from('assessment_narratives')
      .insert({
        assessment_id: assessment!.id,
        version: 1,
        raw_response: { executive_summary: 'original' } as never,
        model_id: 'test',
        prompt_version: '1.0.0',
        rubric_version: '1.0.0',
      })
      .select('id')
      .single();

    expect(insertError).toBeNull();

    // M4 measures the distance between what the model produced and what was
    // published. If raw_response can be rewritten, that distance is
    // unmeasurable and the most important quality metric in the project
    // silently reads zero.
    const { error } = await owner.db
      .from('assessment_narratives')
      .update({ raw_response: { executive_summary: 'rewritten' } as never })
      .eq('id', narrative!.id);

    expect(error).not.toBeNull();

    // The edited copy is the one that is meant to move.
    const { error: editError } = await owner.db
      .from('assessment_narratives')
      .update({ edited_response: { executive_summary: 'edited' } as never })
      .eq('id', narrative!.id);
    expect(editError).toBeNull();
  });
});
