/**
 * Retention purge (PRD 10.6, architecture 3.6).
 *
 * `run_retention_purge` does everything SQL can do: it nulls llm_call bodies,
 * strips intake data, marks report rows purged and redacts contact fields. It
 * CANNOT remove the PDF from storage, so a purge that stops at the SQL is not a
 * purge - the file is still sitting in the bucket and still reachable by anyone
 * who can mint a signed URL.
 *
 * This module is the other half: it reads what the function reported and
 * removes the corresponding objects.
 *
 * DRY RUN IS THE DEFAULT AND MUST STAY SO for the first month of operation
 * (architecture 3.6). A retention job that silently destroys a paying client's
 * report is a worse outcome than data kept thirty days too long. Run it dry,
 * read what it would have removed, and only then pass `dryRun: false`.
 */

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from './types';

export interface PurgeEntry {
  entityType: string;
  entityId: string;
  action: string;
}

export interface PurgeResult {
  dryRun: boolean;
  entries: PurgeEntry[];
  /** Report PDFs removed from the bucket. Always 0 on a dry run. */
  objectsRemoved: number;
  /** Named so somebody can finish the job by hand. */
  orphanedPaths: string[];
  error: string | null;
}

export async function runRetentionPurge(
  db: SupabaseClient<Database>,
  dryRun = true,
): Promise<PurgeResult> {
  const { data, error } = await db.rpc('run_retention_purge', { dry_run: dryRun });

  if (error) {
    return {
      dryRun,
      entries: [],
      objectsRemoved: 0,
      orphanedPaths: [],
      error: 'The retention purge did not run. Nothing was changed.',
    };
  }

  const entries: PurgeEntry[] = (data ?? []).map((row) => ({
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
  }));

  if (dryRun) {
    return { dryRun, entries, objectsRemoved: 0, orphanedPaths: [], error: null };
  }

  const reportIds = entries
    .filter((entry) => entry.action === 'purge_pdf_bytes')
    .map((entry) => entry.entityId);

  if (reportIds.length === 0) {
    return { dryRun, entries, objectsRemoved: 0, orphanedPaths: [], error: null };
  }

  // The rows survive the purge with storage_path intact - only the bytes go -
  // so the paths are still readable after the function has run.
  const { data: rows } = await db
    .from('reports')
    .select('id, storage_bucket, storage_path')
    .in('id', reportIds);

  const byBucket = new Map<string, string[]>();
  for (const row of rows ?? []) {
    const paths = byBucket.get(row.storage_bucket) ?? [];
    paths.push(row.storage_path);
    byBucket.set(row.storage_bucket, paths);
  }

  let objectsRemoved = 0;
  const orphanedPaths: string[] = [];

  for (const [bucket, paths] of byBucket) {
    const { data: removed, error: storageError } = await db.storage.from(bucket).remove(paths);
    if (storageError || !removed) {
      orphanedPaths.push(...paths);
      continue;
    }
    objectsRemoved += removed.length;
    // Trusting the absence of an error is how a partial purge gets reported as
    // a complete one. Compare what was asked against what came back.
    const removedPaths = new Set(removed.map((entry) => entry.name));
    orphanedPaths.push(...paths.filter((path) => !removedPaths.has(path)));
  }

  return { dryRun, entries, objectsRemoved, orphanedPaths, error: null };
}

/** Group a dry run by action, which is how an operator actually reads it. */
export function summarisePurge(entries: readonly PurgeEntry[]): { action: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    counts.set(entry.action, (counts.get(entry.action) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([action, count]) => ({ action, count }))
    .sort((a, b) => b.count - a.count);
}
