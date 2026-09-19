/**
 * Client deletion (P1-11, PRD 10.6).
 *
 * Deletion is TWO operations that must both succeed, and only one of them can
 * happen in SQL:
 *
 *   1. `execute_client_deletion` removes the client row and everything that
 *      cascades from it, writes the audit entry, and RETURNS the storage
 *      objects it could not touch.
 *   2. This module removes those objects from the bucket.
 *
 * A deletion that leaves the PDFs in storage is not a deletion. "We'd have to
 * look into it" is not an answer to give a client who asked to be forgotten.
 *
 * ORDER IS DELIBERATE: the rows go first, then the objects. The alternative -
 * objects first - risks a crash that has destroyed the PDFs while leaving rows
 * pointing at them, which reads as corruption. This way a crash leaves
 * orphaned objects, which are findable from the audit entry and removable by
 * hand.
 *
 * The audit entry is written by the SQL function and SURVIVES the deletion. It
 * records who, when and which client id - never what the client's data said.
 */

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from './types';

export interface DeletionOutcome {
  ok: boolean;
  rowsDeleted: boolean;
  objectsRequested: number;
  objectsRemoved: number;
  /** Objects the database named but storage would not remove. */
  orphanedPaths: string[];
  message: string;
}

/**
 * @param db     a client with rights to call the function (service role)
 * @param admin  the service-role client that can write to the private bucket
 */
export async function executeClientDeletion(
  db: SupabaseClient<Database>,
  admin: SupabaseClient<Database>,
  clientId: string,
  actorId: string,
): Promise<DeletionOutcome> {
  const { data: objects, error } = await db.rpc('execute_client_deletion', {
    target_client_id: clientId,
    actor: actorId,
  });

  if (error) {
    return {
      ok: false,
      rowsDeleted: false,
      objectsRequested: 0,
      objectsRemoved: 0,
      orphanedPaths: [],
      message: 'The deletion did not run. Nothing was removed.',
    };
  }

  const targets = objects ?? [];
  if (targets.length === 0) {
    return {
      ok: true,
      rowsDeleted: true,
      objectsRequested: 0,
      objectsRemoved: 0,
      orphanedPaths: [],
      message: 'Client data deleted. There were no stored reports to remove.',
    };
  }

  // Grouped by bucket: the storage API removes within one bucket per call, and
  // the column exists precisely because the bucket is not assumed.
  const byBucket = new Map<string, string[]>();
  for (const object of targets) {
    const paths = byBucket.get(object.storage_bucket) ?? [];
    paths.push(object.storage_path);
    byBucket.set(object.storage_bucket, paths);
  }

  const orphanedPaths: string[] = [];
  let removed = 0;

  for (const [bucket, paths] of byBucket) {
    const { data, error: storageError } = await admin.storage.from(bucket).remove(paths);
    if (storageError || !data) {
      orphanedPaths.push(...paths);
      continue;
    }
    removed += data.length;
    // `remove` reports what it actually removed. Anything the database named
    // and storage did not return is still in the bucket, and saying so is the
    // point - a silent partial deletion is the worst outcome here.
    const removedPaths = new Set(data.map((entry) => entry.name));
    orphanedPaths.push(...paths.filter((path) => !removedPaths.has(path)));
  }

  return {
    ok: orphanedPaths.length === 0,
    rowsDeleted: true,
    objectsRequested: targets.length,
    objectsRemoved: removed,
    orphanedPaths,
    message:
      orphanedPaths.length === 0
        ? `Client data deleted, including ${removed} stored report${removed === 1 ? '' : 's'}.`
        : `Database records were deleted, but ${orphanedPaths.length} stored file(s) could not be removed and are still in the bucket. Remove them manually before telling the client the deletion is complete.`,
  };
}
