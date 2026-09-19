/**
 * Render and store the report PDF (PRD P1-08, P1-09).
 *
 * Node runtime: react-pdf will not run on Edge.
 *
 * Regeneration creates a NEW VERSION and never overwrites. Prior versions and
 * their PDFs are retained and remain downloadable, because the delivered
 * artifact is the record of what a client was shown.
 *
 * Renders the FALLBACK report when no approved narrative exists (PRD 8.2), so
 * an API outage on the morning of a client session is an inconvenience rather
 * than a cancelled meeting.
 */

import { randomUUID } from 'node:crypto';

import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { scoreIntake } from '@klawfin/rubric';
import { assessCoverage } from '@klawfin/validation';

import { resolveActor, canWrite } from '@/lib/auth/session';
import { admin } from '@/lib/db/admin';
import { serverClient } from '@/lib/db/client';
import { writeAudit } from '@/lib/audit/log';
import { renderReport, storagePath } from '@/lib/pdf/render';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ assessmentId: string }> },
) {
  const { assessmentId } = await params;

  const db = serverClient(await cookies());
  const auth = await resolveActor(db, await headers());
  if (!auth.ok) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: auth.status });
  }
  if (!canWrite(auth.actor)) {
    return NextResponse.json({ error: 'This account has read-only access.' }, { status: 403 });
  }

  const { data: assessment } = await db
    .from('assessments')
    .select('id, client_id, intake_data, intake_locked_at, coverage_override_reason, rubric_version')
    .eq('id', assessmentId)
    .maybeSingle();

  if (!assessment) {
    return NextResponse.json({ error: 'Assessment not found.' }, { status: 404 });
  }
  if (!assessment.intake_locked_at) {
    return NextResponse.json(
      { error: 'Lock the intake before exporting. A report from an editable intake is not a record.' },
      { status: 409 },
    );
  }

  const { data: client } = await db
    .from('clients')
    .select('legal_name')
    .eq('id', assessment.client_id)
    .maybeSingle();

  if (!client) {
    return NextResponse.json({ error: 'Client not found.' }, { status: 404 });
  }

  // Latest narrative, if any. Absent -> fallback report.
  const { data: narrative } = await db
    .from('assessment_narratives')
    .select('id, raw_response, edited_response, prompt_version, guardrail_passed, is_fallback')
    .eq('assessment_id', assessmentId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Two independent reasons a narrative must not reach a client PDF:
  //
  //   guardrail_passed false - it failed a check (PRD 6.5). Better a fallback
  //   report than a blocked one published anyway.
  //
  //   is_fallback true - it is the offline stub, assembled from the scores by
  //   code with no model involved. It exists so the pipeline can be exercised
  //   without spending; it is not writing, and it must not be presented as
  //   though it were. This is what makes DISABLE_LLM_GENERATION safe to leave
  //   on during development.
  const usableNarrative =
    narrative && narrative.guardrail_passed && !narrative.is_fallback
      ? (narrative.edited_response ?? narrative.raw_response)
      : null;

  const score = scoreIntake(assessment.intake_data);
  const coverage = assessCoverage(
    score,
    assessment.coverage_override_reason
      ? {
          reason: assessment.coverage_override_reason,
          overriddenBy: auth.actor.id,
          overriddenAt: new Date().toISOString(),
        }
      : null,
  );

  // Next version number. Regeneration never overwrites (P1-09).
  const { data: previous } = await db
    .from('reports')
    .select('version')
    .eq('assessment_id', assessmentId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  const version = (previous?.version ?? 0) + 1;
  const generatedOn = new Date().toISOString().slice(0, 10);

  const rendered = await renderReport({
    clientName: client.legal_name,
    score,
    narrative: usableNarrative,
    reportVersion: version,
    generatedOn,
    isPreliminary: coverage.markPreliminary,
    hasIncompleteWatermark: coverage.requiresWatermark,
  });

  // The id is generated HERE, not by the database, and the order below is the
  // whole reason why.
  //
  // This route used to insert the row with storage_path 'pending', upload, and
  // then update the path. That can never work: `reports_protect_immutability`
  // forbids changing storage_path after insert, so the update was rejected and
  // - because its error was not checked - the route reported success while
  // leaving a row permanently pointing at 'pending'. The PDF sat in the bucket
  // and the download endpoint returned 502 forever. The first live run is what
  // caught it.
  //
  // Generating the id up front means the final path is known before anything
  // is written, so the row is correct the first time and never updated.
  //
  // UPLOAD BEFORE INSERT, also deliberate. If the upload fails there is no row,
  // so nothing offers a download that cannot work. The opposite order trades
  // that for a row promising a file that does not exist, which is the failure
  // this route just had. A failed insert leaves an orphaned object instead,
  // which is harmless and is cleaned up below.
  const reportId = randomUUID();
  const path = storagePath(assessment.client_id, assessmentId, reportId, version);

  const { error: uploadError } = await admin()
    .storage.from('reports')
    .upload(path, rendered.bytes, { contentType: 'application/pdf', upsert: false });

  if (uploadError) {
    return NextResponse.json({ error: 'Could not store the report.' }, { status: 502 });
  }

  const { data: row, error: insertError } = await db
    .from('reports')
    .insert({
      id: reportId,
      storage_path: path,
      assessment_id: assessmentId,
      // Null when the fallback was rendered: the column records which
      // narrative this PDF CONTAINS, not which one happened to exist.
      narrative_id: usableNarrative ? (narrative?.id ?? null) : null,
      version,
      byte_size: rendered.byteSize,
      sha256: rendered.sha256,
      composite_score: score.composite,
      rubric_version: assessment.rubric_version,
      prompt_version: usableNarrative ? (narrative?.prompt_version ?? 'none') : 'none',
      generator_version: process.env.VERCEL_GIT_COMMIT_SHA ?? 'local',
      is_preliminary: coverage.markPreliminary,
      has_incomplete_watermark: coverage.requiresWatermark,
      generated_by: auth.actor.id,
    })
    .select('id')
    .single();

  if (insertError || !row) {
    // Do not leave the object behind: without a row nothing can ever reach it.
    await admin().storage.from('reports').remove([path]).catch(() => undefined);
    return NextResponse.json({ error: 'Could not record the report.' }, { status: 500 });
  }

  await writeAudit(db, {
    ...auth.audit,
    action: 'report.generated',
    entityType: 'report',
    entityId: row.id,
    clientId: assessment.client_id,
    metadata: {
      version,
      composite: score.composite,
      is_fallback: usableNarrative === null,
      is_preliminary: coverage.markPreliminary,
      watermarked: coverage.requiresWatermark,
      sha256: rendered.sha256,
      bytes: rendered.byteSize,
    },
  });

  return NextResponse.json({
    reportId: row.id,
    version,
    isFallback: usableNarrative === null,
    downloadUrl: `/api/reports/${row.id}/download`,
  });
}
