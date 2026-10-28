import type { PlatePair, SetEntry } from '../types'
import { formatWeight } from '../units'
import type { Metric } from './types'

/** What a set needs to expose for the progression rule to reason about it. */
export type ProgressionSet = Pick<SetEntry, 'type' | 'weightKg' | 'reps'>

export interface ProgressionInput {
  /** Working sets from the most recent previous session of this exercise. */
  readonly previousSessionSets?: readonly ProgressionSet[] | undefined
  /** The targets snapshotted onto this session's exercise, when it came from a plan. */
  readonly target?:
    | {
        readonly sets?: number | undefined
        readonly repsMin?: number | undefined
        readonly repsMax?: number | undefined
      }
    | undefined
  /** The smallest weight increase this exercise can actually take, in kilograms. */
  readonly stepKg: number
}

export interface ProgressionSuggestion {
  /** What every set was at last time. */
  readonly fromKg: number
  /** What to try now. */
  readonly toKg: number
  /** Reps to aim for at the new weight — the bottom of the range again. */
  readonly reps: number
  /** How many working sets were cleared to earn this. */
  readonly sets: number
  /** The rep count every one of them reached. */
  readonly clearedReps: number
}

const isWorking = (set: ProgressionSet) => set.type !== 'warmup'

/**
 * When to add weight — double progression.
 *
 * You add reps until every working set reaches the top of the rep range your
 * plan asks for; then you add the smallest weight you can load and start again
 * at the bottom of the range. It is the simplest rule that keeps working after
 * linear progression stalls, and it needs nothing from the user beyond the
 * range they already wrote into the routine.
 *
 * Three refusals, each deliberate:
 *
 * **No rep range, no suggestion.** A freestyle exercise has nothing to have
 * cleared. Gymmy could invent a range — ten reps, say — but asserting what
 * your training ought to look like is not its place, the same reason weekly
 * set targets start empty and the first run of a routine shows no volume goal.
 *
 * **Mixed weights, no suggestion.** If last session ramped 60/70/80 there is no
 * single number to add to, and picking one would be a guess dressed up as
 * advice.
 *
 * **Short of the plan, no suggestion.** Two sets of a planned three is not a
 * cleared range, however good those two were.
 *
 * Note what this does NOT do: it never says "hold" or "deload". Silence is the
 * whole of the negative case. A suggestion that appears only when earned is
 * information; one that appears every session to tell you that you did not
 * progress is a scoreboard, and Gymmy does not keep score.
 */
export function suggestProgression(input: ProgressionInput): ProgressionSuggestion | null {
  const { previousSessionSets = [], target, stepKg } = input

  if (!target || !(stepKg > 0)) return null

  const { repsMin, repsMax, sets: targetSets } = target
  if (repsMin == null || repsMin <= 0) return null

  // A range of one is linear progression, which is the same rule with the top
  // and the bottom in the same place.
  const top = repsMax != null && repsMax > repsMin ? repsMax : repsMin

  const working = previousSessionSets.filter(isWorking)
  if (working.length === 0) return null
  if (targetSets != null && working.length < targetSets) return null

  const first = working[0]?.weightKg
  if (first == null || first <= 0) return null
  if (!working.every((set) => set.weightKg === first)) return null
  if (!working.every((set) => (set.reps ?? 0) >= top)) return null

  return {
    fromKg: first,
    toKg: first + stepKg,
    reps: repsMin,
    sets: working.length,
    clearedReps: top,
  }
}

/**
 * The smallest increase that can actually be loaded.
 *
 * For a barbell that is twice the lightest plate pair owned, because plates go
 * on in pairs — suggesting 1.25 kg to someone whose lightest plate is 2.5 is
 * advice they cannot take. Everything else falls back to the stepper's
 * increment, which is what a dumbbell rack or a machine stack moves in anyway.
 */
export function smallestStepKg(
  usesBar: boolean,
  inventory: readonly PlatePair[],
  fallbackKg: number,
): number {
  if (!usesBar) return fallbackKg

  const lightest = inventory
    .filter((plate) => plate.pairs > 0 && plate.weightKg > 0)
    .reduce<number | null>(
      (min, plate) => (min == null || plate.weightKg < min ? plate.weightKg : min),
      null,
    )

  return lightest == null ? fallbackKg : lightest * 2
}

export const progressionMetric: Metric<ProgressionInput, ProgressionSuggestion | null> = {
  id: 'progression',
  label: 'When to add weight',
  shortLabel: 'next weight',
  formula: 'every working set at the top of your rep range → add the smallest weight you can load',
  compute: suggestProgression,

  explainer: {
    whatItIs:
      'A nudge to go heavier, shown only when your last session cleared every working set at the top of the rep range your routine asks for.',
    whyUseful:
      'It is double progression: add reps until you reach the top of the range, then add weight and start again at the bottom. That keeps you moving once simply adding weight every week stops working, and it means the decision is already made when you walk up to the bar.',
    caveats: [
      'It is a suggestion and nothing else. It changes no number until you tap it, and ignoring it costs you nothing anywhere in the app.',
      'It needs a rep range, which comes from a routine. Freestyle work gets no suggestion rather than a made-up range.',
      'It does not read RPE, so it cannot tell a comfortable set at the top of the range from one that nearly buried you.',
      'If your sets last time were at different weights, there is no single weight to add to, so nothing is suggested.',
      'Accepting it does not rewrite your routine — the plan still says what it said.',
    ],
  },

  example: (input) => {
    const result = suggestProgression(input)
    if (!result) return null

    return {
      given: `${result.sets} × ${result.clearedReps} at ${formatWeight(result.fromKg)}`,
      substitution: `every set reached ${result.clearedReps} reps → ${result.fromKg} + ${
        input.stepKg
      }`,
      result: `${formatWeight(result.toKg)} × ${result.reps}`,
    }
  },
}
