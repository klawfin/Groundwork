/**
 * Cost and usage view (PRD P1-10, metric M5).
 *
 * "I want to see what this is costing me per report, so I know whether the
 * unit economics work before I sell it."
 *
 * Owner-only. `canViewCosts` is checked here AND the underlying tables carry
 * their own RLS policy - the page hiding the numbers is a courtesy, the policy
 * is the control (architecture ADR-007).
 *
 * Server Component: the aggregation happens here, so no cost figure is sent to
 * a browser that was not entitled to it in the first place.
 */

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import {
  costStats,
  DEFAULT_COST_CAP_PAISE,
  exceedsSoftTarget,
  formatPaise,
  SOFT_TARGET_PAISE,
} from '@klawfin/llm';

import { canViewCosts, resolveActor } from '@/lib/auth/session';
import { serverClient } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

/** How many recent generations the table shows. Beyond this, query the ledger. */
const RECENT_LIMIT = 50;

export default async function CostsPage() {
  const db = serverClient(await cookies());
  const auth = await resolveActor(db, await headers());
  if (!auth.ok) redirect('/login');

  if (!canViewCosts(auth.actor)) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-xl font-semibold">Costs</h1>
        <p className="mt-3 text-sm text-stone-600">
          This view is restricted to the account owner.
        </p>
      </main>
    );
  }

  const { data: generations } = await db
    .from('generations')
    .select('id, assessment_id, outcome, attempts, total_cost_paise, latency_ms, created_at')
    .order('created_at', { ascending: false })
    .limit(RECENT_LIMIT);

  const rows = generations ?? [];

  // Cost per REPORT, not per call: a generation that retried once cost what
  // both attempts cost, and that total is the number the unit economics turn
  // on. `generations.total_cost_paise` already carries the aggregate.
  const billable = rows.filter((row) => row.total_cost_paise > 0);
  const stats = costStats(billable.map((row) => row.total_cost_paise));

  const retried = rows.filter((row) => row.attempts > 1).length;
  const failed = rows.filter(
    (row) => row.outcome === 'failed' || row.outcome === 'blocked_budget',
  ).length;

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-wide text-stone-500">Admin</p>
        <h1 className="text-xl font-semibold">Cost and usage</h1>
        <p className="mt-1 text-xs text-stone-500">
          Last {RECENT_LIMIT} generations. Soft target {formatPaise(SOFT_TARGET_PAISE)} per report;
          hard cap {formatPaise(DEFAULT_COST_CAP_PAISE)}, enforced before the call rather than
          after it.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Billable reports" value={String(stats.count)} />
        <Stat label="Total spend" value={formatPaise(stats.totalPaise)} />
        <Stat label="Median per report" value={formatPaise(stats.medianPaise)} />
        <Stat label="p95 per report" value={formatPaise(stats.p95Paise)} />
        <Stat
          label="Over soft target"
          value={String(stats.overTargetCount)}
          tone={stats.overTargetCount > 0 ? 'warn' : 'plain'}
        />
      </section>

      <section className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Generations shown" value={String(rows.length)} />
        <Stat label="Needed a retry" value={String(retried)} tone={retried > 0 ? 'warn' : 'plain'} />
        <Stat label="Failed or capped" value={String(failed)} tone={failed > 0 ? 'warn' : 'plain'} />
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium">Recent generations</h2>
        {rows.length === 0 ? (
          <p className="mt-2 text-sm text-stone-600">
            Nothing generated yet. Offline runs cost nothing and do not appear here.
          </p>
        ) : (
          <div className="mt-2 overflow-x-auto rounded-lg border border-stone-200 bg-white">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-stone-200 text-stone-500">
                <tr>
                  <Th>When</Th>
                  <Th>Assessment</Th>
                  <Th>Outcome</Th>
                  <Th>Attempts</Th>
                  <Th>Latency</Th>
                  <Th>Cost</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-stone-100 last:border-0">
                    <Td>{row.created_at.slice(0, 16).replace('T', ' ')}</Td>
                    <Td>
                      <a
                        href={`/assessments/${row.assessment_id}`}
                        className="underline underline-offset-2"
                      >
                        {row.assessment_id.slice(0, 8)}
                      </a>
                    </Td>
                    <Td>{row.outcome.replace(/_/g, ' ')}</Td>
                    <Td>{row.attempts}</Td>
                    <Td>{row.latency_ms === null ? '-' : `${(row.latency_ms / 1000).toFixed(1)}s`}</Td>
                    <Td
                      className={
                        exceedsSoftTarget(row.total_cost_paise) ? 'text-amber-700' : undefined
                      }
                    >
                      {formatPaise(row.total_cost_paise)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function Stat({
  label,
  value,
  tone = 'plain',
}: {
  label: string;
  value: string;
  tone?: 'plain' | 'warn';
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        tone === 'warn' ? 'border-amber-200 bg-amber-50' : 'border-stone-200 bg-white'
      }`}
    >
      <p className="text-xs text-stone-500">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 font-medium">{children}</th>;
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 tabular-nums ${className ?? ''}`}>{children}</td>;
}
