/**
 * Narrative edit magnitude - metric M4.
 *
 * PRD 9: "Median < 20% of characters changed... M4 is the most important
 * quality metric in this document. If Dhruv rewrites most of what the model
 * produces, the generation is not working and no amount of it being fast
 * matters."
 *
 * Measured per section between the RAW generation and the EDITED version.
 * That is why `raw_response` is immutable in the database: collapsing the two
 * would make this unmeasurable, and a database trigger enforces it.
 *
 * Pure. No I/O.
 */

import type { NarrativeResponse } from './schema';

/** Per-section edit ratio, 0 = untouched, 1 = completely rewritten. */
export interface EditMagnitude {
  /** Keyed by section path, e.g. 'executive_summary', 'dimensions[2]'. */
  bySection: Record<string, number>;
  /** Character-weighted ratio across the whole narrative. */
  overall: number;
}

/**
 * Levenshtein distance, capped.
 *
 * Two rows rather than a full matrix: sections run to a few thousand
 * characters and the full matrix is wasted memory at that size.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  let current = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1);
      const insertion = current[j - 1]! + 1;
      const deletion = previous[j]! + 1;
      current[j] = Math.min(substitution, insertion, deletion);
    }
    [previous, current] = [current, previous];
  }

  return previous[b.length]!;
}

/** Edit ratio between two strings, normalised by the longer one. */
export function editRatio(before: string, after: string): number {
  const longest = Math.max(before.length, after.length);
  if (longest === 0) return 0;
  return Math.min(1, levenshtein(before, after) / longest);
}

/**
 * Compare a raw generation against its edited version.
 *
 * Only the sections Dhruv can actually edit are measured (PRD 7.4). Scores and
 * the disclaimer are not editable, so including them would dilute the metric
 * with text nobody could have changed.
 */
export function editMagnitude(
  raw: NarrativeResponse,
  edited: NarrativeResponse | null,
): EditMagnitude {
  if (!edited) return { bySection: {}, overall: 0 };

  const bySection: Record<string, number> = {};
  let weightedDistance = 0;
  let totalLength = 0;

  const compare = (path: string, before: string, after: string) => {
    bySection[path] = editRatio(before, after);
    const longest = Math.max(before.length, after.length);
    weightedDistance += levenshtein(before, after);
    totalLength += longest;
  };

  compare('executive_summary', raw.executive_summary, edited.executive_summary);
  compare('overall_assessment', raw.overall_assessment, edited.overall_assessment);

  raw.dimensions.forEach((dimension, i) => {
    const editedDimension = edited.dimensions[i];
    if (!editedDimension) return;
    compare(
      `dimensions[${i}].what_we_observed`,
      dimension.what_we_observed,
      editedDimension.what_we_observed,
    );
  });

  return {
    bySection,
    overall: totalLength === 0 ? 0 : Math.min(1, weightedDistance / totalLength),
  };
}
