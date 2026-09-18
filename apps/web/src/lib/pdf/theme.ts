/**
 * PDF design tokens.
 *
 * react-pdf implements its own flexbox subset with its own StyleSheet - no
 * Tailwind, no shadcn (decision 0003). The report is a second design surface,
 * so its tokens live here rather than being scattered through components.
 *
 * Two constraints from PRD 7.2 shape every value below:
 *
 *   - "It must be legible printed in GREYSCALE." Nothing may rely on hue to
 *     carry meaning; the score bars use fill proportion and a printed number,
 *     not colour coding.
 *   - "Body text sized for reading a printed page across a table, not for a
 *     screen." Hence 10.5pt body rather than the 9pt that looks right on a
 *     monitor.
 */

import { StyleSheet } from '@react-pdf/renderer';

export const A4 = { width: 595.28, height: 841.89 } as const;

export const color = {
  ink: '#111827',
  body: '#1f2937',
  muted: '#6b7280',
  hairline: '#d1d5db',
  wash: '#f3f4f6',
  /** Brand accent. Replace with Klawfin's real palette when brand assets land. */
  accent: '#0f2a44',
  /** Used only for the PENDING LEGAL SIGN-OFF marker. */
  alarm: '#b91c1c',
} as const;

export const space = { xs: 4, sm: 8, md: 14, lg: 22, xl: 34 } as const;

export const type = {
  micro: 7.5,
  small: 9,
  body: 10.5,
  lead: 12,
  h3: 13,
  h2: 17,
  h1: 26,
  cover: 34,
} as const;

/**
 * Page padding.
 *
 * `paddingBottom` is oversized on purpose: the fixed footer is absolutely
 * positioned, so body content would otherwise flow underneath it on the last
 * page of a section. This is the most common way a react-pdf report looks
 * broken, and it only shows up on documents long enough to paginate.
 */
export const pagePadding = {
  paddingTop: 48,
  paddingBottom: 72,
  paddingHorizontal: 52,
} as const;

export const styles = StyleSheet.create({
  /**
   * NO `lineHeight` HERE. DO NOT ADD ONE.
   *
   * A unitless line-height on the Page style is inherited by the absolutely
   * positioned `fixed` footer, and react-pdf then lays that footer outside the
   * page box - it vanishes from every page, silently, with no error. Setting
   * an explicit lineHeight on the footer does NOT override it; only removing
   * it from the Page does.
   *
   * That failure ships a report with no disclaimer on any page, which is the
   * exact regulatory exposure PRD P1-08 exists to prevent. Line-height belongs
   * on the text styles below, where it is wanted, and nowhere else.
   */
  page: {
    ...pagePadding,
    fontFamily: 'Helvetica',
    fontSize: type.body,
    color: color.body,
  },

  /* Cover ---------------------------------------------------------------- */
  coverPage: {
    ...pagePadding,
    fontFamily: 'Helvetica',
    justifyContent: 'space-between',
  },
  coverMark: { fontSize: type.h2, fontFamily: 'Helvetica-Bold', color: color.accent },
  coverProduct: { fontSize: type.small, color: color.muted, marginTop: space.xs },
  coverTitle: { fontSize: type.cover, fontFamily: 'Helvetica-Bold', color: color.ink, lineHeight: 1.15 },
  coverClient: { fontSize: type.h2, color: color.body, marginTop: space.md },
  coverMeta: { fontSize: type.small, color: color.muted, marginTop: space.lg },

  /* Structure ------------------------------------------------------------ */
  h1: { fontSize: type.h1, fontFamily: 'Helvetica-Bold', color: color.ink, marginBottom: space.md },
  h2: { fontSize: type.h2, fontFamily: 'Helvetica-Bold', color: color.ink, marginBottom: space.sm },
  h3: { fontSize: type.h3, fontFamily: 'Helvetica-Bold', color: color.ink, marginBottom: space.xs },
  paragraph: { marginBottom: space.sm, lineHeight: 1.45 },
  lead: { fontSize: type.lead, lineHeight: 1.5, marginBottom: space.md },
  small: { fontSize: type.small, color: color.muted },
  micro: { fontSize: type.micro, color: color.muted },
  bold: { fontFamily: 'Helvetica-Bold' },

  rule: { borderBottomWidth: 1, borderBottomColor: color.hairline, marginVertical: space.md },

  /* Scorecard ------------------------------------------------------------ */
  compositeBlock: {
    backgroundColor: color.wash,
    padding: space.md,
    marginBottom: space.lg,
  },
  compositeNumber: { fontSize: 46, fontFamily: 'Helvetica-Bold', color: color.accent },
  compositeBand: { fontSize: type.h3, fontFamily: 'Helvetica-Bold', marginTop: space.xs },

  tableHead: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: color.ink,
    paddingBottom: space.xs,
    marginBottom: space.xs,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
    paddingVertical: 6,
  },
  cellDimension: { flex: 3.2 },
  cellNumber: { flex: 1, textAlign: 'right' },
  cellBar: { flex: 2, justifyContent: 'center', paddingLeft: space.sm },

  /**
   * Score bar. Greyscale-safe: meaning is carried by fill width and the
   * printed number beside it, never by hue (PRD 7.2).
   */
  barTrack: { height: 7, backgroundColor: color.hairline },
  barFill: { height: 7, backgroundColor: color.accent },

  /* Findings ------------------------------------------------------------- */
  gapBlock: {
    marginBottom: space.md,
    paddingLeft: space.sm,
    borderLeftWidth: 2,
    borderLeftColor: color.hairline,
    lineHeight: 1.4,
  },
  recBlock: { marginBottom: space.sm },
  listItem: { flexDirection: 'row', marginBottom: space.xs },
  bullet: { width: 14 },
  listBody: { flex: 1, lineHeight: 1.4 },

  badge: {
    fontSize: type.micro,
    color: color.muted,
    borderWidth: 1,
    borderColor: color.hairline,
    paddingVertical: 2,
    paddingHorizontal: 5,
  },

  /* Footer --------------------------------------------------------------- */
  footer: {
    position: 'absolute',
    bottom: 28,
    left: 52,
    right: 52,
    borderTopWidth: 1,
    borderTopColor: color.hairline,
    paddingTop: 6,
  },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between' },

  /* Markers -------------------------------------------------------------- */
  pendingMarker: {
    backgroundColor: color.alarm,
    color: '#ffffff',
    fontFamily: 'Helvetica-Bold',
    fontSize: type.small,
    padding: space.sm,
    marginBottom: space.md,
    textAlign: 'center',
  },
  watermark: {
    position: 'absolute',
    top: 18,
    left: 52,
    right: 52,
    textAlign: 'center',
    fontSize: type.small,
    fontFamily: 'Helvetica-Bold',
    color: color.alarm,
  },
});
