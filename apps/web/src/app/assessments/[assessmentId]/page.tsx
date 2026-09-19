import { cookies, headers } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';
import { notFound, redirect } from 'next/navigation';

import { emptyIntake } from '@klawfin/core';

import { resolveActor } from '@/lib/auth/session';
import { serverClient } from '@/lib/db/client';
import type { Database } from '@/lib/db/types';
import { getAssessment, getClient } from '@/lib/db/queries';
import { IntakeForm } from './IntakeForm';
import { NarrativePanel, type NarrativeSummary, type ReportSummary } from './NarrativePanel';

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

  const { data: dismissals } = await db
    .from('contradiction_dismissals')
    .select('code')
    .eq('assessment_id', assessment.id);

  const narrative = await latestNarrative(db, assessment.id);
  const reports = await reportHistory(db, assessment.id);

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-wide text-ink/55">Assessment</p>
        <h1 className="text-xl font-semibold">{client.legal_name}</h1>
        <p className="mt-1 text-xs text-ink/55">
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
        dismissedCodes={(dismissals ?? []).map((d) => d.code)}
        coverageOverridden={assessment.coverage_override_reason !== null}
      />

      <div className="mt-8">
        <NarrativePanel
          assessmentId={assessment.id}
          intakeLocked={assessment.intake_locked_at !== null}
          narrative={narrative}
          reports={reports}
        />
      </div>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/* Narrative and report history                                               */
/* -------------------------------------------------------------------------- */

/**
 * The latest narrative, shaped for the review panel.
 *
 * `current` is the edited text where one exists, because that is what the
 * report would print and therefore what a reviewer must be looking at. The raw
 * response stays in the database untouched so M4 keeps measuring the distance
 * from what the model actually produced.
 */
async function latestNarrative(
  db: SupabaseClient<Database>,
  assessmentId: string,
): Promise<NarrativeSummary | null> {
  const { data } = await db
    .from('assessment_narratives')
    .select(
      'id, version, model_id, raw_response, edited_response, edit_magnitude, guardrail_findings, guardrail_passed, is_fallback, approved_at',
    )
    .eq('assessment_id', assessmentId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  return {
    id: data.id,
    version: data.version,
    modelId: data.model_id,
    guardrailPassed: data.guardrail_passed,
    guardrailFindings: data.guardrail_findings,
    isFallback: data.is_fallback,
    approvedAt: data.approved_at,
    editMagnitudeOverall: data.edit_magnitude.overall ?? 0,
    current: data.edited_response ?? data.raw_response,
  };
}

async function reportHistory(
  db: SupabaseClient<Database>,
  assessmentId: string,
): Promise<ReportSummary[]> {
  const { data } = await db
    .from('reports')
    .select('id, version, generated_at, is_preliminary')
    .eq('assessment_id', assessmentId)
    .is('purged_at', null)
    .order('version', { ascending: false });

  return (data ?? []).map((row) => ({
    id: row.id,
    version: row.version,
    generatedAt: row.generated_at,
    isPreliminary: row.is_preliminary,
  }));
}
