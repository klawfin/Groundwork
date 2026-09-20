/**
 * Overview — what needs doing, not what exists.
 *
 * This route used to be `redirect('/clients')`, which meant the first screen
 * after sign-in was an alphabetical list of company names. That answers "who
 * are my clients". It does not answer the question actually being asked at
 * nine in the morning, which is "what is waiting on me", and with ten
 * engagements the only way to find out was to open all ten.
 *
 * ---------------------------------------------------------------------------
 * EVERY TILE IS A QUEUE, NOT A NUMBER
 *
 * The tiles link to the sections beneath them and the sections list the actual
 * rows. A dashboard of figures nobody can act on is decoration, and decoration
 * on the first screen of a delivery tool is worse than nothing because it
 * occupies the place a working queue should be.
 *
 * Nothing here is a metric for its own sake. There is no "total assessments"
 * tile, because no decision follows from that number.
 *
 * ---------------------------------------------------------------------------
 * BUCKETS ARE MUTUALLY EXCLUSIVE, IN PRIORITY ORDER
 *
 * An assessment can be `failed` AND below the coverage gate. If it appeared in
 * both queues the counts would sum to more than the work, and a tile that
 * overstates is a tile nobody trusts twice. Each row lands in exactly one
 * bucket, highest severity first: failed, then waiting, then blocked, then
 * stalled.
 */

import Link from 'next/link';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { PRODUCT_FULL_NAME } from '@klawfin/core';
import { COVERAGE_GATES } from '@klawfin/rubric';
import { formatPaise } from '@klawfin/llm';

import { canViewCosts, resolveActor } from '@/lib/auth/session';
import { serverClient } from '@/lib/db/client';
import { listPipeline, type PipelineRow } from '@/lib/db/queries';
import { coveragePct, statusMeaning } from '@/lib/status';
import { Card, Chip, PageHeader, Stat } from './ui';

export const dynamic = 'force-dynamic';

/**
 * A draft untouched for this long has been forgotten rather than paused.
 *
 * Two weeks rather than a few days: intake is genuinely slow, because it waits
 * on the client sending documents. A threshold that fires during normal work
 * trains people to ignore the queue.
 */
const STALLED_DAYS = 14;

export default async function OverviewPage() {
  const db = serverClient(await cookies());
  const auth = await resolveActor(db, await headers());
  if (!auth.ok) redirect('/login');

  const pipeline = await listPipeline(db);

  /* ---- buckets, highest severity first; each row appears once ---------- */

  const failed = pipeline.filter((r) => r.status === 'failed');
  const taken = new Set(failed.map((r) => r.assessmentId));

  const waiting = pipeline.filter((r) => r.status === 'review' && !taken.has(r.assessmentId));
  waiting.forEach((r) => taken.add(r.assessmentId));

  // Below the preliminary gate with no written override. The threshold comes
  // from the rubric package rather than a number typed here: a screen that
  // drew the line somewhere the engine does not would be worse than no screen.
  const blocked = pipeline.filter(
    (r) =>
      !taken.has(r.assessmentId) &&
      r.coverage !== null &&
      r.coverage < COVERAGE_GATES.preliminary &&
      !r.coverageOverridden &&
      r.status !== 'delivered' &&
      r.status !== 'abandoned',
  );
  blocked.forEach((r) => taken.add(r.assessmentId));

  const cutoff = Date.now() - STALLED_DAYS * 86_400_000;
  const stalled = pipeline.filter(
    (r) =>
      !taken.has(r.assessmentId) &&
      r.status === 'draft' &&
      new Date(r.updatedAt).getTime() < cutoff,
  );

  const delivered = pipeline.filter((r) => r.status === 'delivered');
  const quiet = failed.length + waiting.length + blocked.length + stalled.length === 0;

  const totalSpend = pipeline.reduce((sum, r) => sum + r.costPaise, 0);

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <PageHeader
        eyebrow={PRODUCT_FULL_NAME}
        title="Overview"
        meta={
          pipeline.length === 0
            ? 'No assessments yet.'
            : `${pipeline.length} assessment${pipeline.length === 1 ? '' : 's'} across your engagements`
        }
      />

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <TileLink href="#waiting" show={waiting.length > 0}>
          <Stat
            label="Waiting on you"
            value={String(waiting.length)}
            tone={waiting.length > 0 ? 'warning' : undefined}
            hint={waiting.length > 0 ? 'narrative needs approval' : 'nothing to review'}
          />
        </TileLink>
        <TileLink href="#blocked" show={blocked.length > 0}>
          <Stat
            label="Blocked"
            value={String(blocked.length)}
            tone={blocked.length > 0 ? 'warning' : undefined}
            hint={`coverage under ${Math.round(COVERAGE_GATES.preliminary * 100)}%`}
          />
        </TileLink>
        <TileLink href="#failed" show={failed.length > 0}>
          <Stat
            label="Failed"
            value={String(failed.length)}
            tone={failed.length > 0 ? 'critical' : undefined}
            hint={failed.length > 0 ? 'may have spent money' : 'none'}
          />
        </TileLink>
        <Stat
          label="Delivered"
          value={String(delivered.length)}
          tone={delivered.length > 0 ? 'positive' : undefined}
          hint="reports issued"
        />
      </div>

      {quiet && (
        <Card className="mt-6">
          <p className="font-serif text-[15px] font-semibold text-ink-strong">Nothing is waiting.</p>
          <p className="mt-1.5 text-sm text-ink/70">
            {pipeline.length === 0
              ? 'Start by adding a client.'
              : `${pipeline.length - delivered.length} assessment${
                  pipeline.length - delivered.length === 1 ? '' : 's'
                } in progress, none of them blocked on you.`}
          </p>
          <Link
            href="/clients"
            className="mt-3 inline-block text-sm underline underline-offset-4 hover:text-ink-strong"
          >
            Go to clients &rarr;
          </Link>
        </Card>
      )}

      <Queue
        id="failed"
        title="Failed"
        note="A generation that failed has usually already been billed. Check the ledger before retrying."
        rows={failed}
      />
      <Queue
        id="waiting"
        title="Waiting on you"
        note="The narrative is written and paid for. It cannot become a report until it is approved."
        rows={waiting}
      />
      <Queue
        id="blocked"
        title="Blocked on coverage"
        note={`Below the ${Math.round(
          COVERAGE_GATES.preliminary * 100,
        )}% gate. Fill more of the intake, or override with a written reason.`}
        rows={blocked}
      />
      <Queue
        id="stalled"
        title={`Untouched for ${STALLED_DAYS} days`}
        note="Still a draft. Chase the documents or abandon it."
        rows={stalled}
      />

      {pipeline.length > 0 && (
        <p className="mt-8 border-t border-line pt-5 text-xs text-ink/55">
          {stageSummary(pipeline)}
          {canViewCosts(auth.actor) && totalSpend > 0 && (
            <>
              {' · '}
              <Link href="/admin/costs" className="underline underline-offset-2 hover:text-ink">
                {formatPaise(totalSpend)} spent
              </Link>
            </>
          )}
        </p>
      )}
    </main>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * A tile that is a link only when there is something to jump to.
 *
 * A link to an empty section is a dead end that teaches people the tiles do
 * not work, so a zero stays inert.
 */
function TileLink({
  href,
  show,
  children,
}: {
  href: string;
  show: boolean;
  children: React.ReactNode;
}) {
  if (!show) return <>{children}</>;
  return (
    <a href={href} className="block transition-transform hover:-translate-y-0.5">
      {children}
    </a>
  );
}

function Queue({
  id,
  title,
  note,
  rows,
}: {
  id: string;
  title: string;
  note: string;
  rows: PipelineRow[];
}) {
  // An empty queue renders nothing at all. A list of headings with "none"
  // under each is the same screen as no queues, but longer.
  if (rows.length === 0) return null;

  return (
    <section id={id} className="mt-8 scroll-mt-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-[15px] font-semibold text-ink-strong">{title}</h2>
        <span className="tabular text-xs text-ink/55">{rows.length}</span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-ink/60">{note}</p>

      <ul className="mt-2.5 divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
        {rows.map((row) => (
          <li key={row.assessmentId}>
            <Link
              href={`/assessments/${row.assessmentId}`}
              className="group flex items-center justify-between gap-4 px-4 py-3.5 transition-colors hover:bg-ground"
            >
              <div className="min-w-0">
                <p className="truncate font-serif text-[15px] font-semibold text-ink-strong">
                  {row.clientName}
                </p>
                <p className="mt-0.5 truncate text-xs text-ink/60">
                  {statusMeaning(row.status).nextAction ?? statusMeaning(row.status).label}
                  {row.coverage !== null && ` · ${coveragePct(row.coverage)}% coverage`}
                  {` · ${relativeDays(row.updatedAt)}`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2.5">
                {row.composite !== null && (
                  <span className="tabular text-sm font-semibold text-ink-strong">
                    {row.composite}
                  </span>
                )}
                <Chip tone={statusMeaning(row.status).tone}>{statusMeaning(row.status).label}</Chip>
                <span
                  aria-hidden
                  className="text-ink/35 transition-transform group-hover:translate-x-0.5 group-hover:text-ink"
                >
                  &rarr;
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

/** "3 draft · 2 scored · 1 delivered", in pipeline order rather than alphabetical. */
function stageSummary(rows: PipelineRow[]): string {
  const order = [
    'draft',
    'intake_locked',
    'scored',
    'generating',
    'review',
    'delivered',
    'failed',
    'abandoned',
  ] as const;

  return order
    .map((status) => ({ status, n: rows.filter((r) => r.status === status).length }))
    .filter((entry) => entry.n > 0)
    .map((entry) => `${entry.n} ${statusMeaning(entry.status).label.toLowerCase()}`)
    .join(' · ');
}

/**
 * Computed on the server and sent as text.
 *
 * Deliberately not a client-side relative timestamp: that is the textbook
 * hydration mismatch, and it would also disagree with the server whenever the
 * two clocks or time zones differ.
 */
function relativeDays(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? 'a month ago' : `${months} months ago`;
}
