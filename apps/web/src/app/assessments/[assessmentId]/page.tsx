import { cookies, headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import { emptyIntake } from '@klawfin/core';

import { resolveActor } from '@/lib/auth/session';
import { serverClient } from '@/lib/db/client';
import { getAssessment, getClient } from '@/lib/db/queries';
import { IntakeForm } from './IntakeForm';

/**
 * Intake and live score for one assessment.
 *
 * Server Component: the session and the client record are resolved here, so an
 * unauthorised request never reaches the form.
 */
export default async function AssessmentPage({
  params,
}: {
  params: Promise<{ assessmentId: string }>;
}) {
  const { assessmentId } = await params;

  const db = serverClient(await cookies());
  const auth = await resolveActor(db, await headers());
  if (!auth.ok) redirect('/login');

  const assessment = await getAssessment(db, assessmentId);
  if (!assessment) notFound();

  const client = await getClient(db, assessment.client_id);
  if (!client) notFound();

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-wide text-stone-500">Assessment</p>
        <h1 className="text-xl font-semibold">{client.legal_name}</h1>
        <p className="mt-1 text-xs text-stone-500">
          Rubric {assessment.rubric_version} · {assessment.status}
          {assessment.intake_locked_at && ' · intake locked'}
        </p>
      </header>

      <IntakeForm
        assessmentId={assessment.id}
        initialIntake={assessment.intake_data ?? emptyIntake()}
        // Passed from the server so date-relative contradiction checks do not
        // depend on the browser's clock.
        asOf={new Date().toISOString()}
      />
    </main>
  );
}
