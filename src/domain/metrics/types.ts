/**
 * A Metric bundles a calculation with the words that explain it.
 *
 * This is the structural guarantee behind Gymmy's "every derived number is
 * explainable in one tap" rule. The explainer copy lives in the same module as
 * the function it describes, so changing the 12-rep cap in `compute` means
 * editing the file that also holds the sentence describing the cap.
 * Documentation kept in a separate content folder always ends up lying.
 *
 * `src/domain` is pure by lint rule: no React, no Dexie, no DOM. Everything
 * here is directly unit-testable without mounting anything.
 */

/** A rendered worked example, built from the user's own numbers. */
export interface WorkedExample {
  /** What the user actually did, e.g. "100 kg × 5". */
  readonly given: string
  /** The substitution, e.g. "100 × (1 + 5 ÷ 30)". */
  readonly substitution: string
  /** The result, e.g. "117 kg". */
  readonly result: string
}

/**
 * The four-part explainer. Order is fixed and intentional: what, how, why,
 * and — never omitted — where it breaks down. An honest limit is what makes
 * the other three trustworthy.
 */
export interface Explainer {
  /** One plain sentence. No jargon. */
  readonly whatItIs: string
  /** What decision this number helps the user make. */
  readonly whyUseful: string
  /** Honest limits. At least one; a metric with no caveats is under-examined. */
  readonly caveats: readonly [string, ...string[]]
}

/**
 * Something the user can ask "what is this?" about.
 *
 * Not everything explainable is computed. The RPE scale and the warm-up
 * exclusion rule have no formula, but they need explaining more than most
 * numbers do — an unexplained 1–10 field gets filled in randomly, and a user
 * who does not know warm-ups are excluded will think the volume chart is
 * broken. Those are education, not transparency, and they belong in the same
 * registry so the reference page lists them alongside the rest.
 */
export interface Explainable {
  /** Stable id, also the key in the registry and in any stored reference. */
  readonly id: string
  /** Full name for the explainer sheet header, e.g. "Estimated 1RM". */
  readonly label: string
  /** Compact form for inline use, e.g. "est. 1RM". */
  readonly shortLabel: string
  /** Human-readable formula, e.g. "weight × (1 + reps ÷ 30)". Absent when
   *  nothing is calculated. */
  readonly formula?: string
  readonly explainer: Explainer
}

export interface Metric<TInput, TOutput = number | null> extends Explainable {
  readonly formula: string
  /** The calculation. Pure. */
  readonly compute: (input: TInput) => TOutput
  /** A worked example from real input, or null when it cannot be computed. */
  readonly example: (input: TInput) => WorkedExample | null
}

/** Any metric, for registry iteration where the input type is not known. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyMetric = Metric<any, any>

/** Narrowing helper for the generic explainer sheet. */
export function isMetric(entry: Explainable): entry is AnyMetric {
  return typeof (entry as Partial<AnyMetric>).compute === 'function'
}
