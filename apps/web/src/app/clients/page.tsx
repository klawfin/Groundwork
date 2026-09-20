import Link from 'next/link';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { PRODUCT_FULL_NAME } from '@klawfin/core';

import { resolveActor } from '@/lib/auth/session';
import { serverClient } from '@/lib/db/client';
import { listClients, listPipeline, type PipelineRow } from '@/lib/db/queries';

import { NewClientForm } from './NewClientForm';
import { AnimatedMeter, StaggerItem, StaggerList } from '../motion';
import { StatusChip } from '../StatusChip';
import { Chip, PageHeader } from '../ui';

/** Client list (P1-02). Searchable ordering is by date; one user, few rows. */
export default async function ClientsPage() {
  const db = serverClient(await cookies());
  const auth = await resolveActor(db, await headers());
  if (!auth.ok) redirect('/login');

  const clients = await listClients(db);

  /*
   * The list used to show sector and stage and nothing else, which meant the
   * one question it is opened to answer - which of these needs me - could only
   * be answered by opening every row in turn.
   *
   * `listPipeline` is already ordered newest-first, so the first row seen for
   * a client is its current assessment. A client with none simply has no
   * entry, and the row says so rather than showing an empty chip.
   */
  const latest = new Map<string, PipelineRow>();
  for (const row of await listPipeline(db)) {
    if (!latest.has(row.clientId)) latest.set(row.clientId, row);
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <PageHeader
        eyebrow={PRODUCT_FULL_NAME}
        title="Clients"
        meta={
          clients.length === 0
            ? 'No engagements yet.'
            : `${clients.length} engagement${clients.length === 1 ? '' : 's'}`
        }
      />

      <NewClientForm />

      {clients.length === 0 ? (
        <p className="mt-6 text-sm text-ink/55">No clients yet.</p>
      ) : (
        <StaggerList className="mt-6 divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
          {clients.map((client) => {
            const current = latest.get(client.id);

            return (
              <StaggerItem key={client.id}>
                {/*
                 * OVERLAY LINK, not a link wrapping the row.
                 *
                 * The whole row stays clickable - a 40px "Open" beside 200px of
                 * dead space is a smaller target for no reason - but the status
                 * chip now carries a tooltip, and a tooltip trigger is a button.
                 * A <button> inside an <a> is invalid interactive nesting: React
                 * hydrates it into a different tree than the server sent and
                 * warns, and some browsers drop the inner control entirely.
                 *
                 * So the anchor covers the row with a pseudo-element instead of
                 * containing it, and anything that needs its own interaction
                 * sits above that overlay.
                 */}
                <div className="group relative flex items-center justify-between gap-4 px-4 py-3.5 transition-colors hover:bg-ground">
                  <div className="min-w-0">
                    <Link
                      href={`/clients/${client.id}`}
                      className="font-serif text-[15px] font-semibold text-ink-strong after:absolute after:inset-0 after:content-['']"
                    >
                      <span className="block truncate">{client.legal_name}</span>
                    </Link>
                    <p className="mt-0.5 truncate text-xs text-ink/60">
                      {client.sector ?? 'sector not recorded'} ·{' '}
                      {client.stage ?? 'stage not recorded'}
                      {!current && ' · no assessment yet'}
                    </p>
                  </div>

                  {/* Above the overlay, so the chip is hoverable and focusable. */}
                  <div className="relative z-10 flex shrink-0 items-center gap-2.5">
                    {/* Score and bar together: the number is exact, the bar is
                        readable without being read. Fill proportion carries the
                        value rather than hue, the same choice the PDF makes so
                        the two surfaces agree in greyscale. */}
                    {current && current.composite !== null && (
                      <span className="hidden items-center gap-2 sm:flex">
                        <span className="tabular text-sm font-semibold text-ink-strong">
                          {current.composite}
                        </span>
                        <span className="w-14">
                          <AnimatedMeter pct={current.composite} />
                        </span>
                      </span>
                    )}
                    {client.archived_at && <Chip tone="neutral">Archived</Chip>}
                    {current && !client.archived_at && <StatusChip status={current.status} />}
                    <span
                      aria-hidden
                      className="text-ink/35 transition-transform group-hover:translate-x-0.5 group-hover:text-ink"
                    >
                      &rarr;
                    </span>
                  </div>
                </div>
              </StaggerItem>
            );
          })}
        </StaggerList>
      )}
    </main>
  );
}
