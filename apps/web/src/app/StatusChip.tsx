'use client';

/**
 * A status chip that can tell you what the status means.
 *
 * ---------------------------------------------------------------------------
 * WHY A RADIX PRIMITIVE RATHER THAN A `title` ATTRIBUTE OR A HOVER DIV
 *
 * `title` was the first thing tried and it is not good enough here: it takes
 * about a second to appear, cannot be opened from the keyboard at all, and is
 * not announced by several screen readers. A hand-rolled hover div is worse
 * again - it needs focus handling, escape-to-close, collision detection
 * against the viewport edge and `aria-describedby` wiring, and every one of
 * those is a thing to get subtly wrong.
 *
 * This is the case shadcn/ui exists for. The primitive underneath is Radix,
 * which handles the accessibility; the styling is ours, so nothing arrives
 * from outside the seven-colour brand kit.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT IS FOR
 *
 * Eight statuses, and three people join to do QA in Month 2 who have never
 * seen this pipeline. "Intake locked" is not self-explanatory, and the answer
 * to "what do I do about it" already exists in `statusMeaning().nextAction` -
 * it just had nowhere to be shown outside the overview.
 *
 * The chip stays readable on its own, so nothing is HIDDEN behind the hover.
 * The tooltip adds the next action, it does not carry the meaning.
 */

import * as Tooltip from '@radix-ui/react-tooltip';

import { statusMeaning } from '@/lib/status';
import type { AssessmentStatus } from '@/lib/db/types';
import { Chip } from './ui';

export function StatusChip({ status }: { status: AssessmentStatus }) {
  const meaning = statusMeaning(status);

  // Nothing useful to add for a finished or abandoned engagement, and a
  // tooltip that says nothing teaches people not to look at tooltips.
  if (!meaning.nextAction) return <Chip tone={meaning.tone}>{meaning.label}</Chip>;

  return (
    <Tooltip.Provider delayDuration={200}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          {/*
           * A button, not a span: a tooltip nobody can reach with Tab is a
           * tooltip that does not exist for a keyboard user.
           *
           * The focus indicator is an outline. The other obvious choice pulls
           * in a set of Tailwind variables whose offset colour defaults to
           * pure white - not the Soft White in the brand kit - and that
           * default lands in the stylesheet even though nothing paints it.
           *
           * NAMING THE UTILITY HERE IS WHAT CAUSED IT. Tailwind v4 scans
           * comments for candidates, so the first draft of this note emitted
           * the very thing it was explaining, and the palette check failed on
           * a file whose only mention was prose. Describe, do not spell.
           */}
          <button
            type="button"
            className="cursor-help rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <Chip tone={meaning.tone}>{meaning.label}</Chip>
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="top"
            sideOffset={6}
            collisionPadding={8}
            /* Inverse ground: navy with Soft White on it is 14.18:1, the
               strongest pairing in the kit, and it separates the tooltip from
               the cream page without inventing a surface colour. */
            className="z-50 max-w-65 rounded-control bg-inverse px-2.5 py-1.5 text-xs leading-relaxed text-on-inverse"
          >
            {meaning.nextAction}
            <Tooltip.Arrow className="fill-inverse" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
