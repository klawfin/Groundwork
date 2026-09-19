/**
 * Retention and deletion, against the real database functions.
 *
 * Both are irreversible in production and neither can be meaningfully tested
 * with a mock: the whole point is what Postgres does to rows and what survives
 * afterwards. What survives is the part that matters - purging is field-level,
 * never row-level, because deleting a `reports` row would destroy the record
 * that a report was ever delivered.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runRetentionPurge } from '../../src/lib/db/retention';
import { executeClientDeletion } from '../../src/lib/db/deletion';
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

describeIf('retention purge', () => {
  let owner: TestUser;
  let clientId: string;
  let assessmentId: string;

  beforeAll(async () => {
    owner = await createUser('owner');
    clientId = await createTestClient(owner);
    const { data } = await owner.db
      .from('assessments')
      .insert({
        client_id: clientId,
        status: 'delivered',
        rubric_version: '1.0.0',
        intake_schema_version: '1.0.0',
        intake_data: { schema_version: '1.0.0' } as never,
        created_by: owner.id,
        // Already past retention, so the purge has something to find.
        purge_after: new Date(Date.now() - 86_400_000).toISOString(),
      })
      .select('id')
      .single();
    assessmentId = data!.id;
  });

  afterAll(async () => {
    await serviceClient().from('clients').delete().eq('id', clientId);
    await deleteUser(owner);
  });

  it('a dry run reports what it would do and changes nothing', async () => {
    const before = await serviceClient()
      .from('assessments')
      .select('intake_data')
      .eq('id', assessmentId)
      .single();

    const result = await runRetentionPurge(serviceClient(), true);

    expect(result.error).toBeNull();
    expect(result.dryRun).toBe(true);
    expect(result.entries.some((e) => e.entityId === assessmentId)).toBe(true);
    // Never touches storage on a dry run, whatever it reports.
    expect(result.objectsRemoved).toBe(0);

    const after = await serviceClient()
      .from('assessments')
      .select('intake_data')
      .eq('id', assessmentId)
      .single();
    expect(after.data?.intake_data).toEqual(before.data?.intake_data);
  });

  it('a real purge strips the intake but keeps the assessment row', async () => {
    const result = await runRetentionPurge(serviceClient(), false);
    expect(result.error).toBeNull();

    const { data } = await serviceClient()
      .from('assessments')
      .select('id, intake_data, composite_score')
      .eq('id', assessmentId)
      .single();

    // The row survives. Deleting it would destroy the record that an
    // assessment was ever delivered, which is the thing Klawfin needs to keep.
    expect(data?.id).toBe(assessmentId);

    // A TOMBSTONE, not an empty object. `{}` would be indistinguishable from
    // an intake nobody ever filled in; this says the data existed and was
    // deliberately removed, and when.
    const purged = data?.intake_data as unknown as { purged?: boolean; purged_at?: string };
    expect(purged.purged).toBe(true);
    expect(purged.purged_at).toBeTruthy();
  });

  it('records the purge in the audit log', async () => {
    const { data } = await serviceClient()
      .from('audit_log')
      .select('action, entity_id')
      .eq('entity_id', assessmentId)
      .eq('action', 'retention.purge_executed');

    expect((data ?? []).length).toBeGreaterThan(0);
  });
});

describeIf('client deletion (P1-11)', () => {
  let owner: TestUser;

  beforeAll(async () => {
    owner = await createUser('owner');
  });

  afterAll(async () => {
    await deleteUser(owner);
  });

  it('removes the client and everything cascading from it, and keeps the audit entry', async () => {
    const clientId = await createTestClient(owner);
    const { data: assessment } = await owner.db
      .from('assessments')
      .insert({
        client_id: clientId,
        status: 'delivered',
        rubric_version: '1.0.0',
        intake_schema_version: '1.0.0',
        intake_data: { schema_version: '1.0.0' } as never,
        created_by: owner.id,
      })
      .select('id')
      .single();

    const service = serviceClient();
    const outcome = await executeClientDeletion(service, service, clientId, owner.id);

    expect(outcome.rowsDeleted).toBe(true);
    expect(outcome.ok).toBe(true);

    const { data: clients } = await service.from('clients').select('id').eq('id', clientId);
    expect(clients ?? []).toHaveLength(0);

    const { data: assessments } = await service
      .from('assessments')
      .select('id')
      .eq('id', assessment!.id);
    expect(assessments ?? []).toHaveLength(0);

    // The audit entry OUTLIVES the data it concerns. After a deletion it is
    // the only remaining answer to "did you action that request, and when".
    const { data: audit } = await service
      .from('audit_log')
      .select('action, client_id')
      .eq('client_id', clientId)
      .eq('action', 'deletion.executed');
    expect((audit ?? []).length).toBeGreaterThan(0);
  });
});
