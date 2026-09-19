/**
 * Row Level Security.
 *
 * RLS is the authorisation boundary for this system (architecture ADR-007).
 * Not middleware, not an `if` in a route handler - the database. A policy that
 * is subtly wrong is indistinguishable from one that is right until somebody
 * sees data they should not, and no unit test can tell the difference because
 * a unit test never asks Postgres.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  anonClient,
  createTestClient,
  createUser,
  deleteUser,
  serviceClient,
  stackIsUp,
  type TestUser,
} from './harness';

const up = await stackIsUp();
const describeIf = up ? describe : describe.skip;

describeIf('RLS', () => {
  let owner: TestUser;
  let viewer: TestUser;
  let clientId: string;

  beforeAll(async () => {
    owner = await createUser('owner');
    viewer = await createUser('viewer');
    clientId = await createTestClient(owner);
  });

  afterAll(async () => {
    await serviceClient().from('clients').delete().eq('id', clientId);
    await deleteUser(owner);
    await deleteUser(viewer);
  });

  describe('anonymous', () => {
    it('sees no clients at all', async () => {
      const { data, error } = await anonClient().from('clients').select('id');
      // RLS filters rather than refuses, so the correct result is an empty set
      // and no error. Asserting on a 403 here would pass for the wrong reason.
      expect(error).toBeNull();
      expect(data ?? []).toHaveLength(0);
    });

    it('sees no assessments, reports or audit entries', async () => {
      const anon = anonClient();
      for (const table of ['assessments', 'reports', 'audit_log'] as const) {
        const { data } = await anon.from(table).select('id');
        expect(data ?? [], `${table} leaked to anon`).toHaveLength(0);
      }
    });

    it('cannot insert a client', async () => {
      const { error } = await anonClient().from('clients').insert({
        legal_name: 'Should Never Exist',
        primary_contact_name: 'x',
        primary_contact_email: 'x@invalid.test',
        engagement_type: 'paid',
      });
      expect(error).not.toBeNull();
    });

    /**
     * The audit table is the one place where "cannot insert" is a problem
     * rather than a protection.
     *
     * A refused sign-in is unauthenticated by definition, so the application
     * cannot record it through the user's own client - the write is rejected
     * and, when the error is swallowed, silently lost. That is why the
     * magic-link route writes denials with the service-role client. This test
     * pins the reason down so the fix is not "simplified" back out.
     */
    it('cannot write to the audit log, which is why denials use the service role', async () => {
      const { error } = await anonClient().from('audit_log').insert({
        action: 'auth.denied',
        entity_type: 'session',
        actor_email: 'intruder@invalid.test',
      });
      expect(error).not.toBeNull();

      const { error: serviceError } = await serviceClient().from('audit_log').insert({
        action: 'auth.denied',
        entity_type: 'session',
        actor_email: 'intruder@invalid.test',
        metadata: { reason: 'not_on_allowlist', stage: 'integration_test' },
      });
      expect(serviceError).toBeNull();
    });
  });

  describe('viewer', () => {
    it('can read clients', async () => {
      const { data, error } = await viewer.db.from('clients').select('id').eq('id', clientId);
      expect(error).toBeNull();
      expect(data ?? []).toHaveLength(1);
    });

    it('cannot create a client', async () => {
      const { error } = await viewer.db.from('clients').insert({
        legal_name: 'Viewer Should Not Create This',
        primary_contact_name: 'x',
        primary_contact_email: 'x@invalid.test',
        engagement_type: 'paid',
        created_by: viewer.id,
      });
      expect(error).not.toBeNull();
    });

    it('cannot create an assessment', async () => {
      const { error } = await viewer.db.from('assessments').insert({
        client_id: clientId,
        status: 'draft',
        rubric_version: '1.0.0',
        intake_schema_version: '1.0.0',
        intake_data: { schema_version: '1.0.0' } as never,
        created_by: viewer.id,
      });
      expect(error).not.toBeNull();
    });

    it('cannot delete a client', async () => {
      await viewer.db.from('clients').delete().eq('id', clientId);
      // Whether the policy refuses or filters, the row must survive. Asserting
      // on the outcome rather than the error covers both.
      const { data } = await serviceClient().from('clients').select('id').eq('id', clientId);
      expect(data ?? []).toHaveLength(1);
    });
  });

  describe('owner', () => {
    it('can create an assessment and read it back', async () => {
      const { data, error } = await owner.db
        .from('assessments')
        .insert({
          client_id: clientId,
          status: 'draft',
          rubric_version: '1.0.0',
          intake_schema_version: '1.0.0',
          intake_data: { schema_version: '1.0.0' } as never,
          created_by: owner.id,
        })
        .select('id')
        .single();

      expect(error).toBeNull();
      expect(data?.id).toBeTruthy();
    });
  });

  describe('storage', () => {
    it('keeps the reports bucket private', async () => {
      const { data } = await serviceClient()
        .from('clients')
        .select('id')
        .limit(1);
      expect(data).toBeTruthy();

      // No storage policies exist on this bucket at all, by design: the only
      // route to a stored PDF is a signed URL minted by the download handler.
      const response = await fetch(
        'http://127.0.0.1:54321/storage/v1/object/reports/any/path.pdf',
        { headers: { apikey: (await import('./harness')).LOCAL.anonKey } },
      );
      expect(response.ok).toBe(false);
    });
  });
});
