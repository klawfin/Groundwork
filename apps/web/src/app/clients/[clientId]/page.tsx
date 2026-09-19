import { cookies, headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import { canViewCosts, resolveActor } from '@/lib/auth/session';
import { serverClient } from '@/lib/db/client';
import { getClient, listAssessments } from '@/lib/db/queries';
import { StartAssessment } from './StartAssessment';
import { ClientLifecycle, type DeletionRequestSummary } from './ClientLifecycle';

export default async function ClientPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;

  const db = serverClient(await cookies());
  const auth = await resolveActor(db, await headers());
  if (!auth.ok) redirect('/login');

  const client = await getClient(db, clientId);
  if (!client) notFound();

  const assessments = await listAssessments(db, client.id);

  const { data: requestRows } = await db
    .from('deletion_requests')
    .select('id, status, requested_by, created_at, executed_at')
    .eq('client_id', client.id)
    .order('created_at', { ascending: false });

  const requests: DeletionRequestSummary[] = (requestRows ?? []).map((row) => ({
    id: row.id,
    status: row.status,
    requestedBy: row.requested_by,
    createdAt: row.created_at,
    executedAt: row.executed_at,
  }));

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <header>
        <h1 className="text-xl font-semibold">{client.legal_name}</h1>
        <p className="mt-1 text-sm text-ink/55">
          {client.primary_contact_name} · {client.sector ?? 'sector not recorded'}
          {client.archived_at && ' · archived'}
        </p>
      </header>

      <section className="mt-6">
        <h2 className="text-sm font-medium">Assessments</h2>
        {assessments.length === 0 ? (
          <p className="mt-2 text-sm text-ink/70">None yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line rounded-card border border-line bg-surface">
            {assessments.map((assessment) => (
              <li key={assessment.id} className="flex items-baseline justify-between gap-3 px-4 py-3">
                <a
                  href={`/assessments/${assessment.id}`}
                  className="text-sm underline underline-offset-2"
                >
                  {assessment.created_at.slice(0, 10)}
                </a>
                <span className="text-xs text-ink/55">
                  {assessment.status}
                  {assessment.composite_score !== null && ` · ${assessment.composite_score}/100`}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4">
          <StartAssessment clientId={client.id} />
        </div>
      </section>

      <div className="mt-8">
        <ClientLifecycle
          clientId={client.id}
          clientName={client.legal_name}
          archivedAt={client.archived_at}
          isOwner={canViewCosts(auth.actor)}
          requests={requests}
        />
      </div>
    </main>
  );
}
