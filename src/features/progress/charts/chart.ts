/**
 * Shared chart geometry and conventions.
 *
 * Charts here are hand-rolled SVG rather than a charting library. Three
 * reasons, in order: the mark specs below (rounded data-ends anchored to the
 * baseline, a 2px surface gap between bars, a surface ring on overlapping
 * marks) are fiddly to force out of a library; a chart library is ~100KB in a
 * PWA that has to work offline in a basement; and these forms are simple
 * enough that the library would be the complicated part.
 *
 * COLOR POLICY — every chart here is SINGLE-SERIES, on purpose.
 *
 * Three measures of different scale (top set, estimated 1RM, volume) must
 * never share an axis, so the per-exercise chart shows one at a time behind a
 * segmented control. Volume by muscle is magnitude across categories, so
 * identity is carried by the axis labels, not by 14 categorical hues.
 *
 * That leaves one data hue: the accent. Records are NOT a second hue — the
 * palette validator measured accent against the brass PR colour at ΔE 2.8
 * under protanopia (and 12.8 for normal vision, below the floor of 15), so a
 * gold marker on an orange line would be invisible to a red-green colourblind
 * reader and marginal for everyone else. Records are encoded by FORM instead:
 * a larger ring with a surface-coloured gap and an ink stroke, plus a direct
 * label. Secondary encoding, which is both accessible and unambiguous.
 */

export const CHART = {
  /** Mark specs. */
  barRadius: 4,
  barGap: 2,
  lineWidth: 2,
  markerRadius: 3.5,
  recordRadius: 5.5,
  ringWidth: 2,

  /** Plot padding, in SVG user units. */
  padTop: 10,
  padBottom: 18,
  padLeft: 0,
  padRight: 0,
} as const

/**
 * A round upper bound for the axis.
 *
 * The steps are deliberately fine-grained. A coarse 1/2/5/10 ramp rounds 5,256
 * up to 10,000, which leaves the tallest bar at barely half height and makes a
 * real difference between weeks look like no difference at all.
 */
const NICE_STEPS = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10] as const

export function niceMax(value: number): number {
  if (value <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const normalised = value / magnitude
  const step = NICE_STEPS.find((candidate) => normalised <= candidate) ?? 10
  return step * magnitude
}

/** Full value with separators: 8420 → "8,420". For labels with room. */
export function fullNumber(value: number): string {
  return Math.round(value).toLocaleString('en-US')
}

/** Compact axis/label form: 8420 → "8.4k". */
export function compactNumber(value: number): string {
  if (Math.abs(value) >= 1000) {
    const thousands = value / 1000
    return `${thousands >= 10 ? Math.round(thousands) : thousands.toFixed(1)}k`
  }
  return String(Math.round(value))
}

/** Short date for an x-axis tick: "26 Oct". */
export function shortDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}
