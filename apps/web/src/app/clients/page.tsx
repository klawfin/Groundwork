import Link from 'next/link';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { PRODUCT_FULL_NAME } from '@klawfin/core';

import { resolveActor } from '@/lib/auth/session';
import { serverClient } from '@/lib/db/client';
import { listClients, listPipeline, type PipelineRow } from '@/lib/db/queries';
import { statusMeaning } from '@/lib/status';
import { NewClientForm } from './NewClientForm';
import { Chip, Meter, PageHeader } from '../ui';

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
        <ul className="mt-6 divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
          {clients.map((client) => {
            const current = latest.get(client.id);
            const meaning = current ? statusMeaning(current.status) : null;

            return (
              <li key={client.id}>
                {/* The whole row is the target. A 40px "Open" link beside a
                    200px row of dead space is a smaller target for no reason. */}
                <Link
                  href={`/clients/${client.id}`}
                  className="group flex items-center justify-between gap-4 px-4 py-3.5 transition-colors hover:bg-ground"
                >
                  <div className="min-w-0">
                    <p className="truncate font-serif text-[15px] font-semibold text-ink-strong">
                      {client.legal_name}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-ink/60">
                      {client.sector ?? 'sector not recorded'} ·{' '}
                      {client.stage ?? 'stage not recorded'}
                      {!current && ' · no assessment yet'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2.5">
                    {/* Score and bar together: the number is exact, the bar is
                        readable without being read. Fill proportion carries the
                        value rather than hue, the same choice the PDF makes so
                        the two surfaces agree in greyscale. */}
                    {current?.composite !== null && current !== undefined && (
                      <span className="hidden items-center gap-2 sm:flex">
                        <span className="tabular text-sm font-semibold text-ink-strong">
                          {current.composite}
                        </span>
                        <span className="w-14">
                          <Meter pct={current.composite ?? 0} />
                        </span>
                      </span>
                    )}
                    {client.archived_at && <Chip tone="neutral">Archived</Chip>}
                    {meaning && !client.archived_at && (
                      <Chip tone={meaning.tone}>{meaning.label}</Chip>
                    )}
                    <span
                      aria-hidden
                      className="text-ink/35 transition-transform group-hover:translate-x-0.5 group-hover:text-ink"
                    >
                      &rarr;
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
