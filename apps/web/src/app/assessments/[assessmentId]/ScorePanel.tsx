'use client';

/**
 * Live score panel (P1-04).
 *
 * "See the computed score and dimension breakdown BEFORE I spend money on
 * generation, so I can fix bad input first." Every sub-criterion is
 * inspectable: Dhruv must be able to answer "why did I score 2 on cap table
 * hygiene" from this screen, in front of a client (PRD G3).
 *
 * Scoring runs here with no network call and no LLM, which is only possible
 * because it is deterministic (decision 0002).
 */

import { useMemo, useState } from 'react';

import type { Intake } from '@klawfin/core';
import { ANCHOR_LABELS, formatPct, scoreIntake, topPriorityGaps } from '@klawfin/rubric';
import { assessCoverage } from '@klawfin/validation';
import { checkContradictions } from '@klawfin/validation';

import { dismissContradictionAction, overrideCoverageAction } from '../../actions';

export function ScorePanel({
  assessmentId,
  intake,
  asOf,
  dismissedCodes,
  coverageOverridden,
}: {
  assessmentId: string;
  intake: Intake;
  asOf: string;
  dismissedCodes: readonly string[];
  coverageOverridden: boolean;
}) {
  const [openDimension, setOpenDimension] = useState<string | null>(null);

  // `asOf` is passed from the server rather than read from the clock here, so
  // the date-relative contradiction checks stay deterministic.
  const { score, coverage, contradictions, priorities } = useMemo(() => {
    const computed = scoreIntake(intake);
    return {
      score: computed,
      coverage: assessCoverage(computed),
      contradictions: checkContradictions(intake, new Date(asOf)),
      priorities: topPriorityGaps(computed),
    };
  }, [intake, asOf]);

  return (
    <aside className="space-y-5 text-sm">
      <section className="rounded-lg border border-stone-200 bg-white p-4">
        <p className="text-xs uppercase tracking-wide text-stone-500">Composite</p>
        <p className="mt-1 text-4xl font-semibold tabular-nums">{score.composite}</p>
        <p className="font-medium">{score.band.label}</p>
        <p className="mt-2 text-xs text-stone-600">{score.band.meaning}</p>

        <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-stone-100 pt-3 text-xs">
          <div>
            <dt className="text-stone-500">Coverage</dt>
            <dd className="tabular-nums">{Math.round(score.overallCoverage * 100)}%</dd>
          </div>
          <div>
            <dt className="text-stone-500">Confidence</dt>
            <dd>{score.overallConfidence}</dd>
          </div>
        </dl>

        {score.preRevenueMode && (
          <p className="mt-3 rounded bg-amber-50 p-2 text-xs text-amber-900">
            Pre-revenue mode. Traction is scored against substitute evidence, not revenue.
          </p>
        )}
        {score.weightRedistributed && (
          <p className="mt-2 rounded bg-stone-100 p-2 text-xs">
            A dimension did not apply; its weight was redistributed.
          </p>
        )}
      </section>

      {/* Generation gate (PRD 8.1). Shown before generating, not after. */}
      <section
        className={`rounded-lg border p-3 text-xs ${
          coverage.canGenerate
            ? 'border-stone-200 bg-white'
            : 'border-amber-300 bg-amber-50 text-amber-900'
        }`}
      >
        <p className="font-medium">{coverage.disposition === 'normal' ? 'Ready' : 'Check first'}</p>
        <p className="mt-1">{coverage.summary}</p>

        {coverageOverridden && (
          <p className="mt-2 rounded bg-stone-100 p-2 text-stone-700">
            Coverage was overridden with a recorded reason. The report will still be marked
            preliminary - an override permits the work, it does not change what is known.
          </p>
        )}

        {!coverage.canGenerate && !coverageOverridden && (
          <ReasonForm
            label="Generate anyway"
            placeholder="Why is a report worth producing on this much information?"
            submit={(reason) => overrideCoverageAction(assessmentId, reason)}
          />
        )}
      </section>

      {contradictions.contradictions.length > 0 && (
        <section className="rounded-lg border border-stone-200 bg-white p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
            Contradictions
          </p>
          <ul className="mt-2 space-y-2">
            {contradictions.contradictions.map((c) => (
              <li
                key={c.code}
                className={`rounded p-2 text-xs ${
                  dismissedCodes.includes(c.code)
                    ? 'bg-stone-100 text-stone-600'
                    : c.class === 'blocking'
                      ? 'bg-red-50 text-red-900'
                      : 'bg-amber-50 text-amber-900'
                }`}
              >
                <span className="font-medium uppercase">
                  {dismissedCodes.includes(c.code) ? 'dismissed' : c.class}
                </span>{' '}
                — {c.message}

                {/* Only blocking checks stop generation, so only they need a
                    way past. A warning is already advisory. */}
                {c.class === 'blocking' && !dismissedCodes.includes(c.code) && (
                  <ReasonForm
                    label="Dismiss"
                    placeholder="Why is this acceptable?"
                    submit={(reason) => dismissContradictionAction(assessmentId, c.code, reason)}
                  />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-lg border border-stone-200 bg-white p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Dimensions</p>
        <ul className="mt-2 divide-y divide-stone-100">
          {score.dimensions.map((d) => {
            const open = openDimension === d.id;
            return (
              <li key={d.id} className="py-2">
                <button
                  type="button"
                  onClick={() => setOpenDimension(open ? null : d.id)}
                  className="flex w-full items-baseline justify-between gap-2 text-left"
                  aria-expanded={open}
                >
                  <span>
                    <span className="font-medium">{d.id}</span>{' '}
                    <span className="text-stone-600">{d.name}</span>
                  </span>
                  <span className="tabular-nums font-medium">
                    {d.entirelyNotApplicable ? 'n/a' : formatPct(d.pct)}
                  </span>
                </button>

                <div className="mt-1 h-1.5 w-full rounded bg-stone-100">
                  <div
                    className="h-1.5 rounded bg-slate-700"
                    style={{ width: `${Math.max(0, Math.min(100, d.pct))}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-stone-500">
                  weight {Math.round(d.weight * 100)}% · coverage {Math.round(d.coverage * 100)}% ·{' '}
                  {d.confidence}
                  {d.notAssessed && ' · not assessed'}
                </p>

                {/* Sub-criterion inspection. This is the P1-04 requirement. */}
                {open && (
                  <ul className="mt-2 space-y-1.5 border-l-2 border-stone-200 pl-3">
                    {d.subCriteria.map((sub) => (
                      <li key={sub.id} className="text-xs">
                        <span className="tabular-nums font-medium">
                          {sub.score === null ? '—' : `${sub.score}/4`}
                        </span>{' '}
                        {sub.label}
                        {sub.score !== null && (
                          <span className="text-stone-500"> · {ANCHOR_LABELS[sub.score]}</span>
                        )}
                        {sub.derivation && <p className="text-stone-500">{sub.derivation}</p>}
                        {sub.naReason && <p className="text-stone-500">N/A — {sub.naReason}</p>}
                        {sub.missingInputs.length > 0 && (
                          <p className="text-stone-400">
                            not provided: {sub.missingInputs.join(', ')}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {priorities.length > 0 && (
        <section className="rounded-lg border border-stone-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
            Priority gaps
          </p>
          <p className="mt-1 text-xs text-stone-500">
            Computed from score impact against effort. The model explains this ordering; it does
            not choose it.
          </p>
          <ol className="mt-2 space-y-2">
            {priorities.map((gap) => (
              <li key={gap.subCriterionId} className="text-xs">
                <span className="font-medium">
                  {gap.rank}. {gap.label}
                </span>
                <p className="text-stone-500">
                  {gap.dimensionId} · {gap.score}/4 · {gap.effort} effort · +
                  {gap.compositePointsAvailable.toFixed(1)} points available
                </p>
              </li>
            ))}
          </ol>
        </section>
      )}
    </aside>
  );
}

/* -------------------------------------------------------------------------- */
/* Override forms                                                             */
/* -------------------------------------------------------------------------- */

/**
 * A gate with a written reason attached.
 *
 * Used for both overrides. The reason is mandatory server-side; this only
 * keeps the button disabled until something has been typed, so the refusal is
 * not the first feedback anybody gets.
 */
function ReasonForm({
  label,
  placeholder,
  submit,
}: {
  label: string;
  placeholder: string;
  submit: (reason: string) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 rounded border border-current px-2 py-1 text-xs font-medium"
      >
        {label}
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-1">
      <textarea
        rows={2}
        value={reason}
        placeholder={placeholder}
        onChange={(event) => setReason(event.target.value)}
        className="w-full rounded border border-stone-300 p-1.5 text-xs text-stone-900"
      />
      {error && <p className="text-xs font-medium">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending || reason.trim().length < 10}
          onClick={async () => {
            setPending(true);
            setError(null);
            const result = await submit(reason);
            if (result.ok) {
              setOpen(false);
            } else {
              setError(result.error);
            }
            setPending(false);
          }}
          className="rounded bg-stone-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-40"
        >
          {pending ? 'Saving...' : 'Confirm'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded border border-current px-2 py-1 text-xs"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
