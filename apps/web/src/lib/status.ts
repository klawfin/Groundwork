/**
 * One vocabulary for where an engagement is.
 *
 * `assessment_status` is an eight-value enum and it is the whole business
 * process, but until now it reached the screen raw: the client page rendered
 * `{assessment.status}` and a reader saw the literal string `intake_locked`.
 *
 * The reason this is a module rather than a `switch` in each page is drift.
 * Four surfaces show this state - overview, client list, client detail,
 * assessment header - and four independent mappings would disagree within a
 * week about whether `review` is "In review", "Awaiting review" or "Ready".
 * The one that matters most is the one everyone would get subtly wrong:
 * `review` is not a state the tool is working through, it is a state where the
 * tool is WAITING FOR A PERSON, and the label has to say so.
 *
 * TONE IS A FILL, NEVER TEXT (docs/DESIGN.md). Mint, orange and light blue all
 * fail contrast as text on cream and all pass comfortably as a fill with navy
 * on top, so `Chip` paints the background. `critical` is Near Black rather
 * than a red the brand kit does not contain.
 *
 * The tones here encode ATTENTION, not sentiment:
 *
 *   warning   something is waiting on you
 *   critical  something failed and money may already be spent
 *   info      the tool is working, nothing for you to do
 *   positive  finished
 *   neutral   inert, no claim either way
 */

import { coverageDisposition } from '@klawfin/rubric';

import type { Tone } from '@/app/ui';
import type { AssessmentStatus } from '@/lib/db/types';

export interface StatusMeaning {
  /** Sentence case, for a chip. */
  label: string;
  tone: Tone;
  /**
   * What the operator does next, phrased as an instruction.
   *
   * Null where the answer is "nothing" - a delivered or abandoned assessment
   * needs no prompting, and inventing one would add noise to the queue that
   * exists precisely to be short.
   */
  nextAction: string | null;
  /** True for the states that belong in an action queue on the overview. */
  needsAttention: boolean;
}

const MEANINGS: Record<AssessmentStatus, StatusMeaning> = {
  draft: {
    label: 'Draft',
    tone: 'neutral',
    nextAction: 'Finish the intake, then lock it to score',
    needsAttention: false,
  },
  intake_locked: {
    label: 'Intake locked',
    tone: 'info',
    nextAction: 'Score the locked intake',
    needsAttention: false,
  },
  scored: {
    label: 'Scored',
    tone: 'info',
    nextAction: 'Generate the narrative',
    needsAttention: false,
  },
  generating: {
    label: 'Generating',
    tone: 'info',
    nextAction: null,
    needsAttention: false,
  },
  review: {
    // The money step. A narrative exists, it cost real money to produce, and
    // it cannot become a report until a human approves it. Anything sitting
    // here is work already paid for and not yet delivered.
    label: 'Awaiting review',
    tone: 'warning',
    nextAction: 'Review the narrative and approve or edit it',
    needsAttention: true,
  },
  delivered: {
    label: 'Delivered',
    tone: 'positive',
    nextAction: null,
    needsAttention: false,
  },
  abandoned: {
    label: 'Abandoned',
    tone: 'neutral',
    nextAction: null,
    needsAttention: false,
  },
  failed: {
    // Previously invisible on every screen. A failed generation has usually
    // spent money and produced nothing, which is the one outcome that should
    // never be discovered by accident weeks later.
    label: 'Failed',
    tone: 'critical',
    nextAction: 'Check the cost ledger, then retry or abandon',
    needsAttention: true,
  },
};

export function statusMeaning(status: AssessmentStatus): StatusMeaning {
  // Defensive: a status added to the enum in a migration but not here would
  // otherwise render `undefined` rather than fail visibly in review.
  return MEANINGS[status] ?? { label: status, tone: 'neutral', nextAction: null, needsAttention: false };
}

/* -------------------------------------------------------------------------- */
/* Coverage                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * How coverage reads at a glance.
 *
 * READS THE GATES FROM THE ENGINE rather than restating them. The first draft
 * of this hardcoded 0.8 and 0.6 next to a comment claiming it mirrored
 * `coverageDisposition`, which is exactly how a screen ends up drawing the
 * line somewhere the engine does not - and a coverage bar that turns green
 * just below the gate is worse than no bar, because it is confidently wrong.
 */
export function coverageTone(coverage: number): Tone {
  const disposition = coverageDisposition(coverage);
  if (disposition === 'normal') return 'positive';
  if (disposition === 'preliminary') return 'warning';
  return 'critical';
}

/** Whole percent, for display. Coverage is stored 0-1. */
export function coveragePct(coverage: number | null): number | null {
  return coverage === null ? null : Math.round(coverage * 100);
}
