/**
 * The status vocabulary is shared by four screens, so it has to be total.
 *
 * `assessment_status` is a Postgres enum. Adding a value to it is a one-line
 * migration, and nothing in TypeScript would notice: the new state would reach
 * the overview, the client list and the client page, and each would render
 * whatever the lookup returned for a key it had never heard of.
 *
 * The exhaustiveness test below is the only thing that turns that into a red
 * build rather than a raw `intake_locked` on screen in front of a client.
 */

import { describe, expect, it } from 'vitest';

import { COVERAGE_GATES } from '@klawfin/rubric';

import { coveragePct, coverageTone, statusMeaning } from '../src/lib/status';
import type { AssessmentStatus } from '../src/lib/db/types';

/** Every value in the database enum, listed by hand so the test is the check. */
const ALL_STATUSES: AssessmentStatus[] = [
  'draft',
  'intake_locked',
  'scored',
  'generating',
  'review',
  'delivered',
  'abandoned',
  'failed',
];

describe('status vocabulary', () => {
  it('has a human label for every status, and never leaks the enum value', () => {
    for (const status of ALL_STATUSES) {
      const meaning = statusMeaning(status);
      expect(meaning.label, `${status} has no label`).toBeTruthy();
      // The failure this catches: a label that is just the raw key, which is
      // what the fallback returns and what the client page used to render.
      expect(meaning.label).not.toBe(status);
    }
  });

  it('flags exactly the two states that need a person', () => {
    // If this list grows, the overview grows a queue with it - which is the
    // intended coupling. It should never grow by accident.
    const attention = ALL_STATUSES.filter((s) => statusMeaning(s).needsAttention);
    expect(attention.sort()).toEqual(['failed', 'review']);
  });

  it('gives an instruction wherever there is something to do', () => {
    for (const status of ALL_STATUSES) {
      const meaning = statusMeaning(status);
      if (meaning.needsAttention) {
        expect(meaning.nextAction, `${status} needs attention but says nothing`).toBeTruthy();
      }
    }
    // And stays silent where there genuinely is nothing, rather than inventing
    // busywork for a finished engagement.
    expect(statusMeaning('delivered').nextAction).toBeNull();
    expect(statusMeaning('abandoned').nextAction).toBeNull();
  });

  it('paints a failure with weight, not with a colour the brand kit lacks', () => {
    // docs/DESIGN.md: there is no red in the seven. `critical` is Near Black,
    // which survives greyscale and colour blindness where a red would not.
    expect(statusMeaning('failed').tone).toBe('critical');
    expect(statusMeaning('review').tone).toBe('warning');
    expect(statusMeaning('delivered').tone).toBe('positive');
  });
});

describe('coverage display', () => {
  it('changes tone exactly where the engine changes disposition', () => {
    // The point of the test: these boundaries are not the UI's to choose.
    expect(coverageTone(COVERAGE_GATES.normal)).toBe('positive');
    expect(coverageTone(COVERAGE_GATES.normal - 0.001)).toBe('warning');
    expect(coverageTone(COVERAGE_GATES.preliminary)).toBe('warning');
    expect(coverageTone(COVERAGE_GATES.preliminary - 0.001)).toBe('critical');
  });

  it('renders coverage as whole percent, and nothing as nothing', () => {
    expect(coveragePct(0.9783)).toBe(98);
    expect(coveragePct(0)).toBe(0);
    // Not 0. An unscored assessment has no coverage, and "0%" would read as a
    // measured result rather than an absent one.
    expect(coveragePct(null)).toBeNull();
  });
});
