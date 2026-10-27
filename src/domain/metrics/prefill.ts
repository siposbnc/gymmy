import type { SetEntry, TargetWeight } from '../types'
import { formatWeight } from '../units'
import type { Metric } from './types'

/** The minimum a set needs to expose for prefill to reason about it. */
export type PrefillSet = Pick<SetEntry, 'type' | 'weightKg' | 'reps' | 'setIndex'>

/** Which tier of the chain produced the values. Drives nothing but honesty. */
export type PrefillSource =
  | 'carried_forward'
  | 'routine_target'
  | 'same_set_last_time'
  | 'last_set_ever'
  | 'empty'

export interface PrefillInput {
  /** Which set is being filled, 1-based among working sets. */
  readonly setIndex: number
  /** Working sets already logged for this exercise in THIS session. */
  readonly currentSessionSets?: readonly PrefillSet[] | undefined
  /** Working sets from the most recent previous session of this exercise. */
  readonly previousSessionSets?: readonly PrefillSet[] | undefined
  /** The routine's target, when the session came from a plan. */
  readonly target?:
    | { readonly weight?: TargetWeight | undefined; readonly reps?: number | undefined }
    | undefined
}

export interface PrefillResult {
  readonly weightKg?: number
  readonly reps?: number
  readonly source: PrefillSource
}

const isWorking = (set: PrefillSet) => set.type !== 'warmup'

/**
 * Resolve what a new set row should already contain.
 *
 * This is the feature the app lives or dies on: if logging a set takes more
 * than one tap when nothing changed, people stop logging and every other
 * feature becomes worthless because the data dries up.
 *
 * The chain, strongest signal first:
 *
 * 1. **Carried forward** — the last working set you logged for this exercise in
 *    this session. If you bumped to 80 kg on set 1, set 2 should say 80, not
 *    last week's 77.5 and not the plan's stale number. What you just did is the
 *    best evidence of what you are about to do.
 * 2. **Routine target** — what the plan asks for. Only reachable on the first
 *    set, since after that tier 1 has an answer.
 * 3. **Same set index last time** — set 3 prefills from last session's set 3,
 *    which matters when a lifter ramps or drops across a session.
 * 4. **Last set ever** — the final working set of the previous session.
 * 5. **Empty** — a genuinely new exercise. Say so rather than inventing a zero.
 *
 * Percent-based targets are deliberately not resolved here: they need a
 * training max this function has no business knowing about, so the caller
 * converts to kilograms first. See docs/PLAN.md §4.
 */
export function resolvePrefill(input: PrefillInput): PrefillResult {
  const { setIndex, currentSessionSets = [], previousSessionSets = [], target } = input

  // 1 — carry forward within the session
  const carried = [...currentSessionSets].filter(isWorking).at(-1)
  if (carried && (carried.weightKg != null || carried.reps != null)) {
    return {
      ...(carried.weightKg == null ? {} : { weightKg: carried.weightKg }),
      ...(carried.reps == null ? {} : { reps: carried.reps }),
      source: 'carried_forward',
    }
  }

  // 2 — the plan
  if (target && (target.weight?.kind === 'absolute' || target.reps != null)) {
    const weightKg = target.weight?.kind === 'absolute' ? target.weight.kg : undefined
    if (weightKg != null || target.reps != null) {
      return {
        ...(weightKg == null ? {} : { weightKg }),
        ...(target.reps == null ? {} : { reps: target.reps }),
        source: 'routine_target',
      }
    }
  }

  const previousWorking = previousSessionSets.filter(isWorking)

  // 3 — same position last time
  const sameIndex = previousWorking.find((set) => set.setIndex === setIndex)
  if (sameIndex && (sameIndex.weightKg != null || sameIndex.reps != null)) {
    return {
      ...(sameIndex.weightKg == null ? {} : { weightKg: sameIndex.weightKg }),
      ...(sameIndex.reps == null ? {} : { reps: sameIndex.reps }),
      source: 'same_set_last_time',
    }
  }

  // 4 — whatever you finished on
  const lastEver = previousWorking.at(-1)
  if (lastEver && (lastEver.weightKg != null || lastEver.reps != null)) {
    return {
      ...(lastEver.weightKg == null ? {} : { weightKg: lastEver.weightKg }),
      ...(lastEver.reps == null ? {} : { reps: lastEver.reps }),
      source: 'last_set_ever',
    }
  }

  // 5 — nothing to go on
  return { source: 'empty' }
}

/**
 * The ghost line: `77.5 kg × 8, 8, 7`.
 *
 * The most-read text in the app, which is why it is never behind a tap. Weights
 * collapse to one figure when every set used the same load, because that is the
 * common case and repeating it three times is noise.
 */
export function lastTimeSummary(
  sets: readonly PrefillSet[],
  unit: 'kg' | 'lb' = 'kg',
): string | null {
  const working = sets.filter(isWorking)
  if (working.length === 0) return null

  const reps = working.map((set) => set.reps).filter((value): value is number => value != null)
  if (reps.length === 0) return null

  const weights = working
    .map((set) => set.weightKg)
    .filter((value): value is number => value != null)

  const repsText = reps.join(', ')

  if (weights.length === 0) return `bodyweight × ${repsText}`

  const uniform = weights.every((weight) => weight === weights[0])
  if (uniform && weights.length === working.length) {
    return `${formatWeight(weights[0]!, unit)} × ${repsText}`
  }

  // Loads varied — show each pairing rather than a misleading single figure.
  return working
    .map((set) =>
      set.weightKg == null
        ? `bw × ${set.reps ?? '?'}`
        : `${formatWeight(set.weightKg, unit, { withUnit: false })} × ${set.reps ?? '?'}`,
    )
    .join(', ')
    .concat(` ${unit}`)
}

export const prefillMetric: Metric<PrefillInput, PrefillResult> = {
  id: 'prefill',
  label: 'Pre-filled weights and reps',
  shortLabel: 'pre-fill',
  formula: 'this session → your plan → the same set last time → your last set',
  compute: resolvePrefill,

  explainer: {
    whatItIs: 'The numbers already in a new set row before you touch it.',
    whyUseful:
      'Most sets repeat what you just did, so logging becomes one tap. The "last time" line under the exercise always shows what you actually did, so you can see what you are matching.',
    caveats: [
      'It is a starting point, not a recommendation — Gymmy is not telling you to lift that. Change it freely.',
      'Editing a pre-filled value only affects the set you are logging. It never changes past sessions.',
    ],
  },

  example: (input) => {
    const result = resolvePrefill(input)
    if (result.source === 'empty') return null

    const reason: Record<Exclude<PrefillSource, 'empty'>, string> = {
      carried_forward: 'carried forward from your last set in this session',
      routine_target: "your plan's target for this exercise",
      same_set_last_time: `set ${input.setIndex} from your last session`,
      last_set_ever: 'the last set you logged for this exercise',
    }

    const parts: string[] = []
    if (result.weightKg != null) parts.push(formatWeight(result.weightKg))
    if (result.reps != null) parts.push(`${result.reps} reps`)

    return {
      given: `set ${input.setIndex}`,
      substitution: reason[result.source],
      result: parts.join(' × ') || '—',
    }
  },
}
