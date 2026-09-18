/**
 * Presence primitive.
 *
 * Lives in @klawfin/core rather than in the rubric because both the rubric
 * (coverage denominators) and the validation package (contradiction checks)
 * need it. Putting it in either of those would make the two packages
 * mutually dependent.
 */

/**
 * Is a value "answered"?
 *
 * This is the denominator of every coverage figure in the system, so it is
 * worth being exact. `false` and `0` ARE answers - "no, we have no revenue"
 * is information, and treating it as missing would understate coverage and
 * push a well-documented pre-revenue company into a low-confidence band it
 * does not deserve.
 */
export function isAnswered(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  return true;
}

/** Numeric value when present, otherwise null. */
export function num(value: number | null | undefined): number | null {
  return isAnswered(value) ? (value as number) : null;
}

/** Numeric value or 0. Only safe where absence genuinely means zero. */
export function numOrZero(value: number | null | undefined): number {
  return isAnswered(value) ? (value as number) : 0;
}

/** How many of the given values are present. */
export function presentCount(...values: unknown[]): number {
  return values.filter(isAnswered).length;
}
