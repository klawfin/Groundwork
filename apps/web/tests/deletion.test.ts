/**
 * Client deletion (P1-11).
 *
 * `queries.ts` deliberately has no database mock - a single-query wrapper
 * tested against a mock tests the mock. This module is different: it branches,
 * it groups, and it decides whether to report success. The failure that
 * matters is reporting a completed deletion while PDFs are still sitting in
 * the bucket, and that is exactly what the branching decides.
 *
 * So the fake below implements only the two calls this module makes, and every
 * assertion is about what the module concluded, not about what the fake was
 * asked.
 */

import { describe, expect, it } from 'vitest';

import { executeClientDeletion } from '../src/lib/db/deletion.js';

const CLIENT = '22222222-2222-4222-8222-222222222222';
const ACTOR = '33333333-3333-4333-8333-333333333333';

interface FakeOptions {
  /** Objects the database says must be removed from storage. */
  objects?: { storage_bucket: string; storage_path: string }[];
  rpcFails?: boolean;
  /** Paths storage refuses to remove, by path. */
  unremovable?: string[];
  storageErrors?: boolean;
}

function fakeDb(options: FakeOptions = {}) {
  const removeCalls: { bucket: string; paths: string[] }[] = [];

  const client = {
    rpc: async () =>
      options.rpcFails
        ? { data: null, error: { message: 'boom' } }
        : { data: options.objects ?? [], error: null },
    storage: {
      from: (bucket: string) => ({
        remove: async (paths: string[]) => {
          removeCalls.push({ bucket, paths });
          if (options.storageErrors) return { data: null, error: { message: 'storage down' } };
          const unremovable = new Set(options.unremovable ?? []);
          return {
            data: paths.filter((p) => !unremovable.has(p)).map((name) => ({ name })),
            error: null,
          };
        },
      }),
    },
  };

  // The fake stands in for a typed Supabase client; the cast is confined here
  // rather than weakening the signature the application uses.
  return { client: client as never, removeCalls };
}

describe('executeClientDeletion', () => {
  it('reports failure and deletes nothing when the function does not run', async () => {
    const { client, removeCalls } = fakeDb({ rpcFails: true });
    const outcome = await executeClientDeletion(client, client, CLIENT, ACTOR);

    expect(outcome.ok).toBe(false);
    expect(outcome.rowsDeleted).toBe(false);
    // Nothing must be removed from storage when the rows were not deleted.
    expect(removeCalls).toEqual([]);
  });

  it('succeeds cleanly when there is nothing stored', async () => {
    const { client } = fakeDb({ objects: [] });
    const outcome = await executeClientDeletion(client, client, CLIENT, ACTOR);

    expect(outcome.ok).toBe(true);
    expect(outcome.rowsDeleted).toBe(true);
    expect(outcome.objectsRemoved).toBe(0);
    expect(outcome.orphanedPaths).toEqual([]);
  });

  it('removes every stored object the database named', async () => {
    const { client, removeCalls } = fakeDb({
      objects: [
        { storage_bucket: 'reports', storage_path: 'a/1.pdf' },
        { storage_bucket: 'reports', storage_path: 'a/2.pdf' },
      ],
    });
    const outcome = await executeClientDeletion(client, client, CLIENT, ACTOR);

    expect(outcome.ok).toBe(true);
    expect(outcome.objectsRequested).toBe(2);
    expect(outcome.objectsRemoved).toBe(2);
    expect(outcome.orphanedPaths).toEqual([]);
    // One call for one bucket, not one call per object.
    expect(removeCalls).toHaveLength(1);
    expect(removeCalls[0]?.paths).toEqual(['a/1.pdf', 'a/2.pdf']);
  });

  it('groups by bucket rather than assuming a single one', async () => {
    const { client, removeCalls } = fakeDb({
      objects: [
        { storage_bucket: 'reports', storage_path: 'a/1.pdf' },
        { storage_bucket: 'archive', storage_path: 'b/2.pdf' },
        { storage_bucket: 'reports', storage_path: 'a/3.pdf' },
      ],
    });
    const outcome = await executeClientDeletion(client, client, CLIENT, ACTOR);

    expect(outcome.ok).toBe(true);
    expect(removeCalls).toHaveLength(2);
    expect(removeCalls.find((c) => c.bucket === 'reports')?.paths).toEqual(['a/1.pdf', 'a/3.pdf']);
    expect(removeCalls.find((c) => c.bucket === 'archive')?.paths).toEqual(['b/2.pdf']);
  });

  it('does NOT report success when a file silently survives', async () => {
    // The dangerous case: storage returns no error but did not remove
    // everything. Trusting the absence of an error would tell the operator the
    // client's data is gone while a report PDF is still downloadable.
    const { client } = fakeDb({
      objects: [
        { storage_bucket: 'reports', storage_path: 'a/1.pdf' },
        { storage_bucket: 'reports', storage_path: 'a/2.pdf' },
      ],
      unremovable: ['a/2.pdf'],
    });
    const outcome = await executeClientDeletion(client, client, CLIENT, ACTOR);

    expect(outcome.ok).toBe(false);
    expect(outcome.rowsDeleted).toBe(true);
    expect(outcome.orphanedPaths).toEqual(['a/2.pdf']);
    expect(outcome.message).toContain('still in the bucket');
  });

  it('treats a storage outage as orphaned files, not as success', async () => {
    const { client } = fakeDb({
      objects: [{ storage_bucket: 'reports', storage_path: 'a/1.pdf' }],
      storageErrors: true,
    });
    const outcome = await executeClientDeletion(client, client, CLIENT, ACTOR);

    expect(outcome.ok).toBe(false);
    expect(outcome.orphanedPaths).toEqual(['a/1.pdf']);
  });

  it('names the surviving files so somebody can finish the job by hand', async () => {
    const { client } = fakeDb({
      objects: [{ storage_bucket: 'reports', storage_path: 'a/1.pdf' }],
      unremovable: ['a/1.pdf'],
    });
    const outcome = await executeClientDeletion(client, client, CLIENT, ACTOR);

    expect(outcome.orphanedPaths).toContain('a/1.pdf');
    expect(outcome.message).toContain('manually');
  });
});
