/**
 * Shared presentational primitives.
 *
 * No hooks and no state, so these work in Server and Client Components alike.
 *
 * They exist because the status chip alone appears in seven places. Repeating
 * its classes would be more code than this file, and it would drift - one
 * component would end up with a slightly different orange and the palette
 * constraint would quietly stop being true.
 *
 * THE RULE THIS FILE ENFORCES: Mint, Orange and Sky Blue are fills with navy
 * text on them, never coloured text on a light ground. See globals.css for the
 * measurements.
 */

import type { ReactNode } from 'react';

/* -------------------------------------------------------------------------- */
/* Surfaces                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Soft White on the Warm Cream ground.
 *
 * The two differ by 1.15:1, which is far too little for text and exactly right
 * for a surface: the card reads as a change of material rather than a change
 * of colour, and needs no elevation effect to sit above the page.

 * (Worth knowing: Tailwind v4 scans these comments for class names. Writing
 * the bare word for an elevation utility here is enough to emit its rule -
 * which quietly introduced a black tint that is not in the brand kit.)
 */
export function Card({
  children,
  className = '',
  as: Tag = 'section',
}: {
  children: ReactNode;
  className?: string;
  as?: 'section' | 'div' | 'li' | 'article';
}) {
  return (
    <Tag className={`rounded-card border border-line bg-surface ${className}`}>{children}</Tag>
  );
}

export function PageHeader({
  eyebrow,
  title,
  meta,
  children,
}: {
  eyebrow?: string;
  title: string;
  meta?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="mb-7">
      {eyebrow && (
        <p className="text-[11px] uppercase tracking-[0.16em] text-ink/55">{eyebrow}</p>
      )}
      <h1 className="mt-1 font-serif text-[26px] font-semibold leading-tight tracking-tight text-ink-strong">
        {title}
      </h1>
      {meta && <div className="mt-1.5 text-sm text-ink/70">{meta}</div>}
      {children}
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/* Status                                                                     */
/* -------------------------------------------------------------------------- */

export type Tone = 'positive' | 'warning' | 'info' | 'critical' | 'neutral';

/**
 * Tone maps to a FILL, never to text colour.
 *
 * `critical` is Near Black rather than a red the palette does not contain.
 * Weight carries severity as reliably as hue, and unlike hue it survives a
 * colourblind reader and a greyscale print.
 */
const TONE_FILL: Record<Tone, string> = {
  positive: 'bg-positive text-ink',
  warning: 'bg-warning text-ink',
  info: 'bg-info text-ink',
  critical: 'bg-critical text-on-inverse',
  neutral: 'bg-ground text-ink border border-line',
};

/**
 * Just the background class for a tone.
 *
 * Exported so the animated meter in `motion.tsx` paints itself from the same
 * map rather than restating the five classes. Two copies of a colour mapping
 * is how a component ends up a shade off from the one beside it, and the
 * palette check would not catch it - both would be brand colours, just the
 * wrong one.
 */
export function toneFill(tone: Tone): string {
  // `noUncheckedIndexedAccess` is on, so the split result is possibly
  // undefined. The fallback is a real brand class rather than an empty string:
  // an unstyled bar would look like a bar at zero, which is a wrong number
  // rather than a missing one.
  const [fill] = TONE_FILL[tone].split(' ');
  return fill ?? 'bg-ink';
}

export function Chip({
  tone = 'neutral',
  children,
  className = '',
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-[0.08em] ${TONE_FILL[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/**
 * A block-level notice.
 *
 * Tinted ground plus a 3px tone-coloured rule on the leading edge. The rule is
 * what carries the tone at a glance; the tint alone would be too quiet on
 * cream, and a full flood would shout on every screen that has one.
 */
const NOTICE_EDGE: Record<Tone, string> = {
  positive: 'border-l-positive',
  warning: 'border-l-warning',
  info: 'border-l-info',
  critical: 'border-l-critical',
  neutral: 'border-l-line-strong',
};

export function Notice({
  tone = 'neutral',
  title,
  children,
  className = '',
}: {
  tone?: Tone;
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-control border border-line border-l-[3px] bg-ground px-3 py-2.5 text-xs leading-relaxed text-ink ${NOTICE_EDGE[tone]} ${className}`}
    >
      {title && <p className="font-semibold">{title}</p>}
      <div className={title ? 'mt-1' : ''}>{children}</div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Controls                                                                   */
/* -------------------------------------------------------------------------- */

type Variant = 'primary' | 'secondary' | 'quiet' | 'destructive';

const VARIANT: Record<Variant, string> = {
  // Navy flood, Soft White label. One primary action per screen.
  primary: 'bg-inverse text-on-inverse hover:bg-ink-strong',
  secondary: 'border border-line-strong bg-surface text-ink hover:bg-ground',
  quiet: 'text-ink/70 underline underline-offset-4 hover:text-ink',
  // Near Black, not red. Deliberately the heaviest control on any screen.
  destructive: 'bg-critical text-on-inverse hover:opacity-90',
};

export function buttonClass(variant: Variant = 'secondary', extra = ''): string {
  const base =
    'inline-flex items-center justify-center gap-1.5 rounded-control px-3.5 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40';
  return `${base} ${VARIANT[variant]} ${extra}`;
}

export function Button({
  variant = 'secondary',
  className = '',
  ...props
}: { variant?: Variant } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={buttonClass(variant, className)} />;
}

/** Inputs, selects and textareas share one shape so forms read as one surface. */
export const fieldClass =
  'w-full rounded-control border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink/40';

export const labelClass =
  'block text-[11px] font-medium uppercase tracking-[0.1em] text-ink/60';

/* -------------------------------------------------------------------------- */
/* Data                                                                       */
/* -------------------------------------------------------------------------- */

export function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone?: Tone;
  hint?: string;
}) {
  return (
    <div className="rounded-card border border-line bg-surface px-3.5 py-3">
      <p className="text-[11px] uppercase tracking-[0.1em] text-ink/55">{label}</p>
      <p className="tabular mt-1 font-serif text-[22px] font-semibold text-ink-strong">{value}</p>
      {tone && <span className={`mt-1.5 block h-1 w-7 rounded-full ${TONE_FILL[tone].split(' ')[0]}`} />}
      {hint && <p className="mt-1 text-[11px] text-ink/55">{hint}</p>}
    </div>
  );
}

/**
 * A 0-100 bar.
 *
 * Fill proportion carries the value, not hue - the same decision the PDF makes
 * for greyscale printing (PRD 7.2), kept here so the two surfaces agree.
 */
export function Meter({ pct, tone = 'positive' }: { pct: number; tone?: Tone }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-ground"
      role="img"
      aria-label={`${Math.round(clamped)} out of 100`}
    >
      <div
        className={`h-full rounded-full ${TONE_FILL[tone].split(' ')[0]}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
