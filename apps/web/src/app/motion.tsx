'use client';

/**
 * The animated parts, kept in their own client module.
 *
 * `ui.tsx` deliberately carries no `'use client'`: `Card`, `PageHeader`,
 * `Stat` and `Chip` are rendered on the server on every page, which is why the
 * overview ships 162 bytes of route JavaScript. Putting a motion import into
 * that file would pull the whole component set into the browser bundle to
 * animate one bar.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS ANIMATED, AND WHY ONLY THIS
 *
 * Two things, both of which say something:
 *
 *   the score bar   fills from zero to the composite. This is the number the
 *                   whole product exists to produce, and it is read across a
 *                   table in a client meeting. Movement is what makes an eye
 *                   land on it.
 *
 *   queue rows      arrive in sequence rather than as a block, so a list of
 *                   four things reads as four things.
 *
 * Nothing else moves. This is a tool someone uses to tell a founder their
 * company is not ready to raise; animation that draws attention to the
 * furniture would undercut that, and animation on every hover becomes noise by
 * the second week of use.
 *
 * ---------------------------------------------------------------------------
 * REDUCED MOTION IS HONOURED, NOT APPROXIMATED
 *
 * `useReducedMotion` reads the OS-level setting. When it is on, both of these
 * render at their final state immediately - no shortened duration, no fade
 * instead of a slide. Someone who has asked for no motion has usually asked
 * because motion makes them ill, and a politer animation is still an animation.
 */

import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';

import { toneFill, type Tone } from './ui';

/** Matches the static `Meter` in ui.tsx; only the fill differs. */
export function AnimatedMeter({ pct, tone = 'positive' }: { pct: number; tone?: Tone }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const still = useReducedMotion();

  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-ground"
      role="img"
      aria-label={`${Math.round(clamped)} out of 100`}
    >
      <motion.div
        className={`h-full rounded-full ${toneFill(tone)}`}
        initial={still ? false : { width: 0 }}
        animate={{ width: `${clamped}%` }}
        // Decelerating, and slow enough to be followed rather than noticed.
        transition={still ? { duration: 0 } : { duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * A list whose rows arrive one after another.
 *
 * Children are passed in rather than generated here, so the rows themselves
 * stay server-rendered - this wrapper adds the timing, not the content.
 */
export function StaggerList({ children, className }: { children: ReactNode; className?: string }) {
  const still = useReducedMotion();

  return (
    <motion.ul
      className={className}
      initial={still ? false : 'hidden'}
      animate="shown"
      variants={{
        hidden: {},
        // 35ms apart: enough to read as a sequence, short enough that a list
        // of eight has finished before anyone notices it started.
        shown: { transition: { staggerChildren: still ? 0 : 0.035 } },
      }}
    >
      {children}
    </motion.ul>
  );
}

export function StaggerItem({ children }: { children: ReactNode }) {
  const still = useReducedMotion();

  return (
    <motion.li
      variants={{
        hidden: { opacity: 0, y: still ? 0 : 4 },
        shown: { opacity: 1, y: 0, transition: { duration: still ? 0 : 0.22 } },
      }}
    >
      {children}
    </motion.li>
  );
}
