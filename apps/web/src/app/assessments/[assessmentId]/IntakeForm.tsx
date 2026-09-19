'use client';

/**
 * Intake form (P1-03).
 *
 * Sectioned by rubric dimension, in rubric order. Autosaves on blur. Every
 * field maps to at least one sub-criterion.
 *
 * TWO KINDS OF INPUT, and the split is decision 0002:
 *
 *   structured fields  - hand-written below, per section. Feed the `derived`
 *                        rules, which compute their own 0-4 level.
 *   anchored judgments - rendered FROM `definitions.ts`. Dhruv picks the level
 *                        against the printed anchor text. Generated rather
 *                        than hand-written because the anchor wording must
 *                        match the rubric exactly - a drifted anchor makes the
 *                        score indefensible in the room.
 *
 * Not a form framework. The generated part is 11 sub-criteria whose text must
 * track a single source of truth; everything else is a plain input.
 */

import { useCallback, useRef, useState, useTransition } from 'react';

import { FREE_TEXT_MAX, type Intake } from '@klawfin/core';
import { ALL_SUB_CRITERIA, DIMENSIONS, type AnchorScore } from '@klawfin/rubric';

import { saveIntakeAction } from '../../actions';
import { ScorePanel } from './ScorePanel';

/** Debounce for autosave. Long enough not to write on every keystroke. */
const AUTOSAVE_MS = 800;

/**
 * The object-valued sections of the intake.
 *
 * Named explicitly rather than using `keyof Intake`, because that also admits
 * `schema_version` (a string) and `accepted_warnings` (an array), neither of
 * which can be spread into a patch.
 */
type IntakeSection = 'team' | 'market' | 'traction' | 'product' | 'cap_table_legal' | 'ask';

export function IntakeForm({
  assessmentId,
  initialIntake,
  asOf,
}: {
  assessmentId: string;
  initialIntake: Intake;
  asOf: string;
}) {
  const [intake, setIntake] = useState<Intake>(initialIntake);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persist = useCallback(
    (next: Intake) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        setStatus('saving');
        startTransition(async () => {
          const result = await saveIntakeAction(assessmentId, next);
          setStatus(result.ok ? 'saved' : 'error');
          setMessage(result.ok ? null : result.error);
        });
      }, AUTOSAVE_MS);
    },
    [assessmentId],
  );

  /** Update one section of the intake and schedule a save. */
  const update = useCallback(
    <K extends IntakeSection>(section: K, patch: Partial<Intake[K]>) => {
      setIntake((current) => {
        const next = { ...current, [section]: { ...current[section], ...patch } } as Intake;
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const setJudgment = useCallback(
    (id: string, patch: { anchor?: AnchorScore | null; na_reason?: string | null }) => {
      setIntake((current) => {
        const next: Intake = {
          ...current,
          judgments: {
            ...current.judgments,
            [id]: { ...current.judgments[id], ...patch },
          },
        };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-8">
        <SaveStatus status={status} message={message} />

        {DIMENSIONS.map((dimension) => (
          <section key={dimension.id} className="rounded-lg border border-stone-200 bg-white p-5">
            <h2 className="text-base font-semibold">
              {dimension.id} · {dimension.name}
            </h2>
            <p className="mt-0.5 text-xs text-stone-500">
              Weight {Math.round(dimension.weight * 100)}% — {dimension.rationale}
            </p>

            <div className="mt-4 space-y-4">
              <StructuredFields dimensionId={dimension.id} intake={intake} update={update} />
            </div>

            {/* Anchored judgments, rendered from the rubric. */}
            <div className="mt-6 space-y-5 border-t border-stone-100 pt-4">
              {dimension.subCriteria
                .filter((s) => s.scoringKind === 'anchored')
                .map((sub) => (
                  <AnchorPicker
                    key={sub.id}
                    subCriterionId={sub.id}
                    value={intake.judgments[sub.id]?.anchor ?? null}
                    naReason={intake.judgments[sub.id]?.na_reason ?? null}
                    onChange={setJudgment}
                  />
                ))}
            </div>
          </section>
        ))}
      </div>

      <div className="lg:sticky lg:top-6 lg:self-start">
        <ScorePanel intake={intake} asOf={asOf} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Anchored judgment                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Anchor picker for one sub-criterion.
 *
 * Shows the anchor text for all five levels, because a level chosen without
 * reading its definition is a number nobody can defend. N/A requires a reason
 * (PRD 5.4) and the reason reaches the model as context.
 */
function AnchorPicker({
  subCriterionId,
  value,
  naReason,
  onChange,
}: {
  subCriterionId: string;
  value: AnchorScore | null;
  naReason: string | null;
  onChange: (id: string, patch: { anchor?: AnchorScore | null; na_reason?: string | null }) => void;
}) {
  const sub = ALL_SUB_CRITERIA.find((s) => s.id === subCriterionId);
  if (!sub) return null;

  const isNa = Boolean(naReason);

  return (
    <fieldset>
      <legend className="text-sm font-medium">
        {sub.id} {sub.label}
      </legend>
      <p className="mt-0.5 text-xs text-stone-500">A 4 looks like: {sub.strongLooksLike}</p>

      <div className="mt-2 space-y-1">
        {([0, 1, 2, 3, 4] as AnchorScore[]).map((level) => (
          <label
            key={level}
            className={`flex cursor-pointer gap-2 rounded border p-2 text-xs ${
              value === level && !isNa
                ? 'border-slate-700 bg-slate-50'
                : 'border-stone-200 hover:bg-stone-50'
            } ${isNa ? 'opacity-40' : ''}`}
          >
            <input
              type="radio"
              name={sub.id}
              checked={value === level && !isNa}
              disabled={isNa}
              onChange={() => onChange(sub.id, { anchor: level, na_reason: null })}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium tabular-nums">{level}</span> — {sub.anchors[level]}
            </span>
          </label>
        ))}
      </div>

      <div className="mt-2">
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={isNa}
            onChange={(e) =>
              onChange(sub.id, {
                na_reason: e.target.checked ? '' : null,
                anchor: e.target.checked ? null : value,
              })
            }
          />
          Not applicable to this company
        </label>
        {isNa && (
          <input
            type="text"
            value={naReason ?? ''}
            placeholder="Why does this not apply? (required)"
            onChange={(e) => onChange(sub.id, { na_reason: e.target.value })}
            className="mt-1 w-full rounded border border-stone-300 px-2 py-1 text-xs"
          />
        )}
      </div>
    </fieldset>
  );
}

/* -------------------------------------------------------------------------- */
/* Structured fields                                                          */
/* -------------------------------------------------------------------------- */

type Update = <K extends IntakeSection>(section: K, patch: Partial<Intake[K]>) => void;

function StructuredFields({
  dimensionId,
  intake,
  update,
}: {
  dimensionId: string;
  intake: Intake;
  update: Update;
}) {
  switch (dimensionId) {
    case 'D1':
      return (
        <>
          <Text
            label="Founder-market fit notes"
            value={intake.team.founder_market_fit_notes}
            onChange={(v) => update('team', { founder_market_fit_notes: v })}
          />
          <Check
            label="Has a technical co-founder"
            checked={intake.team.has_technical_cofounder}
            onChange={(v) => update('team', { has_technical_cofounder: v })}
          />
          <Text
            label="Key hires"
            value={intake.team.key_hires}
            onChange={(v) => update('team', { key_hires: v })}
          />
          <Text
            label="Shipping history"
            value={intake.team.shipping_history}
            onChange={(v) => update('team', { shipping_history: v })}
          />
        </>
      );

    case 'D2':
      return (
        <>
          <Text
            label="Ideal customer profile"
            value={intake.market.icp_description}
            onChange={(v) => update('market', { icp_description: v })}
          />
          <div className="grid grid-cols-3 gap-3">
            <Num label="TAM" value={intake.market.tam} onChange={(v) => update('market', { tam: v })} />
            <Num label="SAM" value={intake.market.sam} onChange={(v) => update('market', { sam: v })} />
            <Num label="SOM" value={intake.market.som} onChange={(v) => update('market', { som: v })} />
          </div>
          <Select
            label="Sizing method"
            value={intake.market.sizing_method}
            options={['none', 'top_down', 'mixed', 'bottom_up']}
            onChange={(v) => update('market', { sizing_method: v as never })}
          />
          <Text
            label="Sizing sources"
            value={intake.market.sizing_sources}
            onChange={(v) => update('market', { sizing_sources: v })}
          />
          <Text
            label="Differentiation claim"
            value={intake.market.differentiation_claim}
            onChange={(v) => update('market', { differentiation_claim: v })}
          />
        </>
      );

    case 'D3':
      return (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Num
              label="Current MRR"
              value={intake.traction.mrr_current}
              onChange={(v) => update('traction', { mrr_current: v })}
            />
            <Num
              label="Paying customers"
              value={intake.traction.paying_customers_count}
              onChange={(v) => update('traction', { paying_customers_count: v })}
            />
            <Num
              label="Referenceable logos"
              value={intake.traction.logos_referenceable}
              onChange={(v) => update('traction', { logos_referenceable: v })}
            />
            <Num
              label="Design partners committed"
              value={intake.traction.design_partners_committed}
              onChange={(v) => update('traction', { design_partners_committed: v })}
            />
          </div>
          <Text
            label="Revenue recognition basis"
            value={intake.traction.revenue_recognition_basis}
            onChange={(v) => update('traction', { revenue_recognition_basis: v })}
          />
          <Check
            label="Cohort retention data available"
            checked={intake.traction.retention_cohorts_available}
            onChange={(v) => update('traction', { retention_cohorts_available: v })}
          />
        </>
      );

    case 'D4':
      return (
        <>
          <Select
            label="Product stage"
            value={intake.product.product_stage}
            options={['idea', 'prototype', 'beta', 'live', 'scaling']}
            onChange={(v) => update('product', { product_stage: v as never })}
          />
          <Num
            label="Live users"
            value={intake.product.live_users_count}
            onChange={(v) => update('product', { live_users_count: v })}
          />
          <div className="grid grid-cols-3 gap-3">
            <Num label="CAC" value={intake.product.cac} onChange={(v) => update('product', { cac: v })} />
            <Num label="LTV" value={intake.product.ltv} onChange={(v) => update('product', { ltv: v })} />
            <Num
              label="Gross margin %"
              value={intake.product.gross_margin_pct}
              onChange={(v) => update('product', { gross_margin_pct: v })}
            />
          </div>
          <Text
            label="Unit economics basis"
            value={intake.product.unit_econ_basis}
            onChange={(v) => update('product', { unit_econ_basis: v })}
          />
        </>
      );

    case 'D5':
      return (
        <>
          <Select
            label="Entity type"
            value={intake.cap_table_legal.entity_type}
            options={[
              'not_incorporated',
              'sole_proprietorship',
              'partnership',
              'llp',
              'private_limited',
              'c_corp',
              'other',
            ]}
            onChange={(v) => update('cap_table_legal', { entity_type: v as never })}
          />
          <Select
            label="Founder vesting in place"
            value={intake.cap_table_legal.founder_vesting_in_place}
            options={['yes', 'partial', 'no']}
            onChange={(v) => update('cap_table_legal', { founder_vesting_in_place: v as never })}
          />
          <Select
            label="IP assignment signed"
            value={intake.cap_table_legal.ip_assignment_signed}
            options={['yes', 'partial', 'no']}
            onChange={(v) => update('cap_table_legal', { ip_assignment_signed: v as never })}
          />
          <Check
            label="Data room exists"
            checked={intake.cap_table_legal.data_room_exists}
            onChange={(v) => update('cap_table_legal', { data_room_exists: v })}
          />
          <Num
            label="Data room completeness %"
            value={intake.cap_table_legal.data_room_completeness_pct}
            onChange={(v) => update('cap_table_legal', { data_room_completeness_pct: v })}
          />
          <p className="rounded bg-stone-50 p-2 text-xs text-stone-600">
            Cap-table holders are recorded as refs (F1, A1, ESOP) — never names. Klawfin must not
            hold personal financial data about people who never interacted with it.
          </p>
        </>
      );

    case 'D6':
      return (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Num
              label="Ask amount"
              value={intake.ask.ask_amount}
              onChange={(v) => update('ask', { ask_amount: v })}
            />
            <Num
              label="Monthly burn"
              value={intake.ask.current_burn_monthly}
              onChange={(v) => update('ask', { current_burn_monthly: v })}
            />
            <Num
              label="Current runway (months)"
              value={intake.ask.current_runway_months}
              onChange={(v) => update('ask', { current_runway_months: v })}
            />
            <Num
              label="Target runway (months)"
              value={intake.ask.target_runway_months}
              onChange={(v) => update('ask', { target_runway_months: v })}
            />
          </div>
          <Text
            label="Next-round criteria"
            value={intake.ask.next_round_criteria}
            onChange={(v) => update('ask', { next_round_criteria: v })}
          />
        </>
      );

    default:
      return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Inputs                                                                     */
/* -------------------------------------------------------------------------- */

function Text({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (v: string) => void;
}) {
  const used = value?.length ?? 0;
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <textarea
        rows={3}
        value={value ?? ''}
        maxLength={FREE_TEXT_MAX}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
      />
      {/* Visible counter (PRD 8.6). Truncation is never silent. */}
      <span className="text-xs text-stone-400">
        {used}/{FREE_TEXT_MAX}
      </span>
    </label>
  );
}

function Num({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null | undefined;
  onChange: (v: number | null) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        type="number"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-sm tabular-nums"
      />
    </label>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean | null | undefined;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={checked ?? false} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | null | undefined;
  options: readonly string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
      >
        <option value="">Not recorded</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o.replace(/_/g, ' ')}
          </option>
        ))}
      </select>
    </label>
  );
}

function SaveStatus({ status, message }: { status: string; message: string | null }) {
  if (status === 'error') {
    return <p className="rounded bg-red-50 p-2 text-sm text-red-900">{message}</p>;
  }
  return (
    <p className="text-xs text-stone-500">
      {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Draft saved' : 'Autosaves as you type'}
    </p>
  );
}
