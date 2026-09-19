'use client';

/**
 * Generate, review, edit, approve, export (PRD P1-06, P1-07, P1-08).
 *
 * One panel because it is one linear workflow: nothing here is reachable
 * except by having done the step before it, and splitting it would mean
 * threading the same four pieces of state through three components.
 *
 * The edit boxes cover only what a human may change - the summary, the overall
 * assessment, and each dimension's observation and confidence note. Scores,
 * priority ranking and the disclaimer are absent on purpose: an editable score
 * is a score that can disagree with the scorecard printed beside it.
 */

import { useState } from 'react';

import type { GuardrailFinding, NarrativeResponse } from '@klawfin/llm';

import { approveNarrativeAction, saveNarrativeEditAction } from '../../actions';

export interface NarrativeSummary {
  id: string;
  version: number;
  modelId: string;
  guardrailPassed: boolean;
  guardrailFindings: GuardrailFinding[];
  isFallback: boolean;
  approvedAt: string | null;
  editMagnitudeOverall: number;
  current: NarrativeResponse;
}

export interface ReportSummary {
  id: string;
  version: number;
  generatedAt: string;
  isPreliminary: boolean;
}

interface Props {
  assessmentId: string;
  intakeLocked: boolean;
  narrative: NarrativeSummary | null;
  reports: ReportSummary[];
}

type Busy = 'generate' | 'save' | 'approve' | 'export' | null;

export function NarrativePanel({ assessmentId, intakeLocked, narrative, reports }: Props) {
  const [busy, setBusy] = useState<Busy>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'warn' | 'error'; text: string } | null>(
    null,
  );
  const [draft, setDraft] = useState(() => (narrative ? toDraft(narrative.current) : null));

  if (!intakeLocked) {
    return (
      <section className="rounded-lg border border-stone-200 bg-white p-4 text-sm">
        <h2 className="font-medium">Narrative</h2>
        <p className="mt-2 text-stone-600">
          Lock the intake first. A narrative written about numbers that can still change is not a
          record of anything.
        </p>
      </section>
    );
  }

  async function generate() {
    setBusy('generate');
    setMessage(null);
    try {
      const response = await fetch(`/api/assessments/${assessmentId}/generate`, {
        method: 'POST',
      });
      const body = (await response.json()) as { message?: string; error?: string };
      const text = body.message ?? body.error ?? 'Generation finished with no message.';
      setMessage({ tone: response.ok ? 'ok' : 'error', text });
      if (response.ok) window.location.reload();
    } catch {
      setMessage({ tone: 'error', text: 'Could not reach the server. Nothing was generated.' });
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!narrative || !draft) return;
    setBusy('save');
    setMessage(null);
    const result = await saveNarrativeEditAction(narrative.id, draft);
    if (result.ok) {
      setMessage({
        tone: result.data.guardrailPassed ? 'ok' : 'warn',
        text: result.data.guardrailPassed
          ? `Saved. ${Math.round(result.data.editMagnitude * 100)}% of the generated text has been changed.`
          : `Saved, but ${result.data.blockingFindings} guardrail check(s) now block it. Approval is unavailable until they clear.`,
      });
    } else {
      setMessage({ tone: 'error', text: result.error });
    }
    setBusy(null);
  }

  async function approve() {
    if (!narrative) return;
    setBusy('approve');
    setMessage(null);
    const result = await approveNarrativeAction(narrative.id);
    setMessage(
      result.ok
        ? { tone: 'ok', text: 'Approved. This narrative can now be exported.' }
        : { tone: 'error', text: result.error },
    );
    setBusy(null);
  }

  async function exportReport() {
    setBusy('export');
    setMessage(null);
    try {
      const response = await fetch(`/api/assessments/${assessmentId}/report`, { method: 'POST' });
      const body = (await response.json()) as {
        error?: string;
        isFallback?: boolean;
        version?: number;
      };
      if (!response.ok) {
        setMessage({ tone: 'error', text: body.error ?? 'The report could not be generated.' });
      } else {
        setMessage({
          tone: body.isFallback ? 'warn' : 'ok',
          text: body.isFallback
            ? `Version ${body.version} exported as a FALLBACK report: scores and disclaimer, no narrative.`
            : `Version ${body.version} exported.`,
        });
        window.location.reload();
      }
    } catch {
      setMessage({ tone: 'error', text: 'Could not reach the server. Nothing was exported.' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-4 rounded-lg border border-stone-200 bg-white p-4 text-sm">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">Narrative</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={generate}
            disabled={busy !== null}
            className="rounded bg-stone-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            {busy === 'generate'
              ? 'Generating...'
              : narrative
                ? 'Regenerate'
                : 'Generate narrative'}
          </button>
          <button
            type="button"
            onClick={exportReport}
            disabled={busy !== null}
            className="rounded border border-stone-300 px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          >
            {busy === 'export' ? 'Exporting...' : 'Export report'}
          </button>
        </div>
      </header>

      {message && (
        <p
          className={`rounded p-2 text-xs ${
            message.tone === 'ok'
              ? 'bg-emerald-50 text-emerald-900'
              : message.tone === 'warn'
                ? 'bg-amber-50 text-amber-900'
                : 'bg-red-50 text-red-900'
          }`}
        >
          {message.text}
        </p>
      )}

      {!narrative && (
        <p className="text-stone-600">
          No narrative yet. Generating calls the model once, with one retry at most, and stops
          before the cost cap rather than after it.
        </p>
      )}

      {narrative && draft && (
        <>
          <dl className="grid grid-cols-2 gap-2 border-y border-stone-100 py-3 text-xs sm:grid-cols-4">
            <Fact label="Version" value={String(narrative.version)} />
            <Fact label="Model" value={narrative.modelId} />
            <Fact
              label="Edited"
              value={`${Math.round(narrative.editMagnitudeOverall * 100)}%`}
            />
            <Fact
              label="Status"
              value={
                narrative.approvedAt
                  ? 'Approved'
                  : narrative.guardrailPassed
                    ? 'Awaiting approval'
                    : 'Blocked'
              }
            />
          </dl>

          {narrative.isFallback && (
            <p className="rounded bg-amber-50 p-2 text-xs text-amber-900">
              This narrative was assembled offline from the computed scores, with no model
              involved. It is here so the workflow can be exercised without spending. It cannot be
              approved and will never be embedded in a client report.
            </p>
          )}

          {narrative.guardrailFindings.length > 0 && (
            <div>
              <h3 className="text-xs font-medium uppercase tracking-wide text-stone-500">
                Guardrail findings
              </h3>
              <ul className="mt-2 space-y-1">
                {narrative.guardrailFindings.map((finding, i) => (
                  <li
                    key={`${finding.check}-${finding.path}-${i}`}
                    className={`rounded p-2 text-xs ${
                      finding.severity === 'block'
                        ? 'bg-red-50 text-red-900'
                        : 'bg-amber-50 text-amber-900'
                    }`}
                  >
                    <span className="font-medium">{finding.check}</span> · {finding.path}
                    <br />
                    {finding.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Editable
            label="Executive summary"
            rows={8}
            value={draft.executiveSummary}
            onChange={(v) => setDraft({ ...draft, executiveSummary: v })}
          />
          <Editable
            label="Overall assessment"
            rows={10}
            value={draft.overallAssessment}
            onChange={(v) => setDraft({ ...draft, overallAssessment: v })}
          />

          {draft.dimensions.map((dimension, index) => (
            <div key={dimension.dimensionId} className="border-t border-stone-100 pt-3">
              <Editable
                label={`${dimension.dimensionId} - what we observed`}
                rows={5}
                value={dimension.whatWeObserved}
                onChange={(v) => setDraft(replaceDimension(draft, index, { whatWeObserved: v }))}
              />
              <Editable
                label={`${dimension.dimensionId} - confidence note`}
                rows={2}
                value={dimension.confidenceNote ?? ''}
                onChange={(v) =>
                  setDraft(
                    replaceDimension(draft, index, {
                      // Empty means "no note", which is distinct from an empty
                      // note: the guardrail treats the latter as a failure.
                      confidenceNote: v.trim().length === 0 ? null : v,
                    }),
                  )
                }
              />
            </div>
          ))}

          <div className="flex flex-wrap gap-2 border-t border-stone-100 pt-3">
            <button
              type="button"
              onClick={save}
              disabled={busy !== null}
              className="rounded bg-stone-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              {busy === 'save' ? 'Saving...' : 'Save edits'}
            </button>
            <button
              type="button"
              onClick={approve}
              disabled={busy !== null || !narrative.guardrailPassed || narrative.isFallback}
              title={
                narrative.isFallback
                  ? 'An offline narrative cannot be approved.'
                  : !narrative.guardrailPassed
                    ? 'Clear the blocking guardrail findings first.'
                    : undefined
              }
              className="rounded border border-stone-300 px-3 py-1.5 text-xs font-medium disabled:opacity-50"
            >
              {busy === 'approve' ? 'Approving...' : 'Approve'}
            </button>
          </div>
        </>
      )}

      {reports.length > 0 && (
        <div className="border-t border-stone-100 pt-3">
          <h3 className="text-xs font-medium uppercase tracking-wide text-stone-500">
            Reports
          </h3>
          <ul className="mt-2 space-y-1 text-xs">
            {reports.map((report) => (
              <li key={report.id} className="flex items-center justify-between gap-2">
                <span>
                  Version {report.version} · {report.generatedAt.slice(0, 10)}
                  {report.isPreliminary && ' · preliminary'}
                </span>
                <a
                  href={`/api/reports/${report.id}/download`}
                  className="underline underline-offset-2"
                >
                  Download
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Draft state                                                                */
/* -------------------------------------------------------------------------- */

interface DimensionDraft {
  dimensionId: string;
  whatWeObserved: string;
  confidenceNote: string | null;
}

interface Draft {
  executiveSummary: string;
  overallAssessment: string;
  dimensions: DimensionDraft[];
}

function toDraft(response: NarrativeResponse): Draft {
  return {
    executiveSummary: response.executive_summary,
    overallAssessment: response.overall_assessment,
    dimensions: response.dimensions.map((d) => ({
      dimensionId: d.dimension_id,
      whatWeObserved: d.what_we_observed,
      confidenceNote: d.confidence_note,
    })),
  };
}

function replaceDimension(draft: Draft, index: number, patch: Partial<DimensionDraft>): Draft {
  return {
    ...draft,
    dimensions: draft.dimensions.map((d, i) => (i === index ? { ...d, ...patch } : d)),
  };
}

/* -------------------------------------------------------------------------- */
/* Presentation                                                               */
/* -------------------------------------------------------------------------- */

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-stone-500">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

function Editable({
  label,
  rows,
  value,
  onChange,
}: {
  label: string;
  rows: number;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="mt-3 block">
      <span className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</span>
      <textarea
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded border border-stone-300 p-2 text-sm"
      />
    </label>
  );
}
