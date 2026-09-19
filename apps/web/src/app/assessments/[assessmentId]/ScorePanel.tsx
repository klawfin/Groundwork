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
import { buttonClass, Chip, fieldClass, Meter, Notice } from '../../ui';

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
      {/* THE COMPOSITE.
          Inverted on Deep Navy, because it is the one number the whole product
          exists to produce and it should look like the conclusion of the page
          rather than another field on it. Serif numeral at 56px: a judgement
          being presented, not a metric being monitored. */}
      <section className="overflow-hidden rounded-card bg-inverse text-on-inverse">
        <div className="p-5">
          <p className="text-[11px] uppercase tracking-[0.16em] text-on-inverse-muted">
            Composite
          </p>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="score-numeral text-[56px] leading-none text-on-inverse">
              {score.composite}
            </span>
            <span className="text-sm text-on-inverse-muted">/ 100</span>
          </div>
          <p className="mt-3 font-serif text-lg font-semibold">{score.band.label}</p>
          <p className="mt-1.5 text-xs leading-relaxed text-on-inverse-muted">
            {score.band.meaning}
          </p>

          {/* Mint on navy reads at 7.30:1. On the cream ground it would be
              1.69:1 and invisible - the inversion is what lets the accent
              carry the value at all. */}
          <div
            className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-on-inverse/15"
            role="img"
            aria-label={`Composite ${score.composite} out of 100`}
          >
            <div
              className="h-full rounded-full bg-positive"
              style={{ width: `${Math.max(0, Math.min(100, score.composite))}%` }}
            />
          </div>
        </div>

        <dl className="grid grid-cols-2 divide-x divide-on-inverse/15 border-t border-on-inverse/15">
          <div className="px-5 py-3">
            <dt className="text-[11px] uppercase tracking-[0.1em] text-on-inverse-muted">
              Coverage
            </dt>
            <dd className="tabular mt-0.5 font-serif text-lg font-semibold">
              {Math.round(score.overallCoverage * 100)}%
            </dd>
          </div>
          <div className="px-5 py-3">
            <dt className="text-[11px] uppercase tracking-[0.1em] text-on-inverse-muted">
              Confidence
            </dt>
            <dd className="mt-0.5 font-serif text-lg font-semibold capitalize">
              {score.overallConfidence}
            </dd>
          </div>
        </dl>

        {(score.preRevenueMode || score.weightRedistributed) && (
          <div className="flex flex-wrap gap-1.5 border-t border-on-inverse/15 px-5 py-3">
            {score.preRevenueMode && <Chip tone="warning">Pre-revenue</Chip>}
            {score.weightRedistributed && <Chip tone="info">Weight redistributed</Chip>}
          </div>
        )}
      </section>

      {(score.preRevenueMode || score.weightRedistributed) && (
        <div className="space-y-2">
          {score.preRevenueMode && (
            <Notice tone="warning">
              Traction is scored against substitute evidence — signed commitments, documented
              discovery, design partners — not against revenue.
            </Notice>
          )}
          {score.weightRedistributed && (
            <Notice tone="info">
              A dimension did not apply to this company; its weight was redistributed across the
              rest.
            </Notice>
          )}
        </div>
      )}

      {/* Generation gate (PRD 8.1). Shown before generating, not after.
          The CHIP carries the state; the card stays neutral. A flooded amber
          card for every thin intake would make the screen shout constantly and
          leave nothing louder for the cases that matter. */}
      <section className="rounded-card border border-line bg-surface p-4 text-xs">
        <Chip tone={coverage.canGenerate ? 'positive' : 'warning'}>
          {coverage.disposition === 'normal' ? 'Ready' : 'Check first'}
        </Chip>
        <p className="mt-2.5 leading-relaxed text-ink/80">{coverage.summary}</p>

        {coverageOverridden && (
          <p className="mt-2.5 rounded-control bg-ground p-2 text-ink/80">
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
        <section className="rounded-card border border-line bg-surface p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-ink/55">
            Contradictions
          </p>
          <ul className="mt-2 space-y-2">
            {contradictions.contradictions.map((c) => (
              <li
                key={c.code}
                className={`rounded-control border border-line border-l-[3px] bg-ground p-2.5 text-xs ${
                  dismissedCodes.includes(c.code)
                    ? 'border-l-line-strong text-ink/60'
                    : c.class === 'blocking'
                      ? 'border-l-critical text-ink'
                      : 'border-l-warning text-ink'
                }`}
              >
                <Chip
                  tone={
                    dismissedCodes.includes(c.code)
                      ? 'neutral'
                      : c.class === 'blocking'
                        ? 'critical'
                        : 'warning'
                  }
                >
                  {dismissedCodes.includes(c.code) ? 'dismissed' : c.class}
                </Chip>
                <p className="mt-1.5 leading-relaxed">{c.message}</p>

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

      <section className="rounded-card border border-line bg-surface p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-ink/55">Dimensions</p>
        <ul className="mt-2 divide-y divide-line">
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
                    <span className="text-ink/70">{d.name}</span>
                  </span>
                  <span className="tabular-nums font-medium">
                    {d.entirelyNotApplicable ? 'n/a' : formatPct(d.pct)}
                  </span>
                </button>

                <div className="mt-1.5">
                  <Meter pct={d.pct} tone={d.notAssessed ? 'neutral' : 'positive'} />
                </div>
                <p className="mt-1 text-xs text-ink/55">
                  weight {Math.round(d.weight * 100)}% · coverage {Math.round(d.coverage * 100)}% ·{' '}
                  {d.confidence}
                  {d.notAssessed && ' · not assessed'}
                </p>

                {/* Sub-criterion inspection. This is the P1-04 requirement. */}
                {open && (
                  <ul className="mt-2 space-y-1.5 border-l-2 border-line pl-3">
                    {d.subCriteria.map((sub) => (
                      <li key={sub.id} className="text-xs">
                        <span className="tabular-nums font-medium">
                          {sub.score === null ? '—' : `${sub.score}/4`}
                        </span>{' '}
                        {sub.label}
                        {sub.score !== null && (
                          <span className="text-ink/55"> · {ANCHOR_LABELS[sub.score]}</span>
                        )}
                        {sub.derivation && <p className="text-ink/55">{sub.derivation}</p>}
                        {sub.naReason && <p className="text-ink/55">N/A — {sub.naReason}</p>}
                        {sub.missingInputs.length > 0 && (
                          <p className="text-ink/45">
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
        <section className="rounded-card border border-line bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink/55">
            Priority gaps
          </p>
          <p className="mt-1 text-xs text-ink/55">
            Computed from score impact against effort. The model explains this ordering; it does
            not choose it.
          </p>
          <ol className="mt-2 space-y-2">
            {priorities.map((gap) => (
              <li key={gap.subCriterionId} className="text-xs">
                <span className="font-medium">
                  {gap.rank}. {gap.label}
                </span>
                <p className="text-ink/55">
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
        className={buttonClass('secondary', 'mt-2.5 !px-2.5 !py-1')}
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
        className={`${fieldClass} !py-1.5 !text-xs`}
      />
      {/* The refusal reason, in ink. Red is not in the palette and weight
          carries it: the message sits directly under the field it concerns. */}
      {error && <p className="text-xs font-semibold text-ink">{error}</p>}
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
          className={buttonClass('primary', '!px-2.5 !py-1')}
        >
          {pending ? 'Saving...' : 'Confirm'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className={buttonClass('quiet', '!px-2.5 !py-1')}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
