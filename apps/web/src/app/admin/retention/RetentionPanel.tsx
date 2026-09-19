'use client';

/**
 * Retention purge control (PRD 10.6, architecture 3.6).
 *
 * Dry run is one click. A real purge is behind a typed confirmation, because
 * the two differ only in whether a paying client's report still exists
 * afterwards, and nothing about the screen should make them feel equivalent.
 */

import { useState } from 'react';

import { runRetentionPurgeAction } from '../../actions';

type Summary = { action: string; count: number }[];

interface Result {
  dryRun: boolean;
  summary: Summary;
  total: number;
  objectsRemoved: number;
  orphanedPaths: string[];
}

export function RetentionPanel() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState('');

  async function run(execute: boolean) {
    setBusy(true);
    setError(null);
    const outcome = await runRetentionPurgeAction(execute);
    if (outcome.ok) {
      setResult(outcome.data);
      if (execute) setConfirm('');
    } else {
      setError(outcome.error);
    }
    setBusy(false);
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => run(false)}
          className="rounded bg-inverse px-3 py-1.5 text-xs font-medium text-on-inverse disabled:opacity-50"
        >
          {busy ? 'Running...' : 'Dry run'}
        </button>
      </div>

      {error && <p className="rounded bg-critical p-2 text-xs text-on-inverse">{error}</p>}

      {result && (
        <div className="rounded-card border border-line bg-surface p-4 text-sm">
          <p className="font-medium">
            {result.dryRun ? 'Dry run' : 'Purge executed'} · {result.total} item
            {result.total === 1 ? '' : 's'}
          </p>

          {result.total === 0 ? (
            <p className="mt-2 text-xs text-ink/70">
              Nothing is past its retention date. This is the expected result until the first
              records age out.
            </p>
          ) : (
            <table className="mt-3 w-full text-left text-xs">
              <thead className="text-ink/55">
                <tr>
                  <th className="py-1 font-medium">Action</th>
                  <th className="py-1 font-medium">Records</th>
                </tr>
              </thead>
              <tbody>
                {result.summary.map((row) => (
                  <tr key={row.action} className="border-t border-line">
                    <td className="py-1">{row.action.replace(/_/g, ' ')}</td>
                    <td className="py-1 tabular-nums">{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {!result.dryRun && (
            <p className="mt-3 text-xs text-ink/70">
              {result.objectsRemoved} stored file{result.objectsRemoved === 1 ? '' : 's'} removed
              from the bucket.
            </p>
          )}

          {result.orphanedPaths.length > 0 && (
            <p className="mt-2 rounded bg-critical p-2 text-xs text-on-inverse">
              {result.orphanedPaths.length} file(s) were marked purged in the database but could
              not be removed from storage. They are still downloadable. Remove them by hand:{' '}
              {result.orphanedPaths.join(', ')}
            </p>
          )}
        </div>
      )}

      <div className="rounded-card border border-line bg-critical p-4">
        <p className="text-sm font-medium text-on-inverse">Execute for real</p>
        <p className="mt-1 text-xs text-on-inverse">
          Irreversible. Do not run this until a month of dry-run output has been reviewed
          (architecture 3.6). Type <span className="font-mono">PURGE</span> to enable.
        </p>
        <div className="mt-2 flex gap-2">
          <input
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            placeholder="PURGE"
            className="rounded border border-line-strong px-2 py-1 text-xs"
          />
          <button
            type="button"
            disabled={busy || confirm !== 'PURGE'}
            onClick={() => run(true)}
            className="rounded bg-critical px-3 py-1.5 text-xs font-medium text-on-inverse disabled:opacity-40"
          >
            Purge now
          </button>
        </div>
      </div>
    </section>
  );
}
