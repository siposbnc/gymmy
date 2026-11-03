/**
 * Turning a workout you did into a plan you can repeat.
 *
 * The honest source for every target is the work that was actually logged, not
 * the targets the session was started with: the point of the feature is "do
 * that again", and what you did is the only thing on the screen you were
 * looking at when you decided it was worth keeping.
 *
 * Carried over from the session's snapshot rather than re-derived: rest
 * lengths, superset grouping and the AMRAP flag. None of those leave a trace
 * in the set rows, so there is nothing to derive them from — and the snapshot
 * is already the right answer whether the session came from a routine or was
 * logged freestyle.
 *
 * Pure, so the rules below are unit-tested with no database open.
 */

import type { Id, RoutineExercise, SetEntry } from './types'
import { formatWeight, type WeightUnit } from './units'

/**
 * What one exercise of a finished session contributes to the draft.
 *
 * `| undefined` on every optional field because `exactOptionalPropertyTypes`
 * is on and the caller builds this from rows that may legitimately hold
 * undefined — see the note on `ExerciseFilter`.
 */
export interface DraftSource {
  exerciseId: Id
  /** Only used for the "these were left out" line; never stored. */
  name: string
  sets: readonly SetEntry[]
  restSeconds?: number | undefined
  supersetGroup?: number | undefined
  targetSets?: number | undefined
  targetRepsMin?: number | undefined
  targetRepsMax?: number | undefined
  isAmrap?: boolean | undefined
}

/** A routine exercise with no identity yet — the repository assigns the ids. */
export type RoutineExerciseDraft = Omit<RoutineExercise, 'id' | 'routineId'>

export interface RoutineDraft {
  name: string
  exercises: RoutineExerciseDraft[]
  /**
   * Names of exercises that were dropped for having no logged work.
   *
   * Surfaced rather than silently discarded: a plan quietly missing an
   * exercise you thought you added is a bug you only find mid-workout.
   */
  skipped: string[]
}

/**
 * The fallback rep target, matching `addExerciseToRoutine`.
 *
 * Only reachable for an exercise whose sets carry no reps at all — a logging
 * mode that does not exist yet, but the field is required and inventing 0
 * would read as a plan asking for nothing.
 */
const FALLBACK_REPS_MIN = 8

export function deriveRoutineDraft(input: {
  name: string
  exercises: readonly DraftSource[]
}): RoutineDraft {
  const skipped: string[] = []
  const drafts: RoutineExerciseDraft[] = []

  for (const source of input.exercises) {
    // Warm-ups are excluded here for the same reason they are excluded from
    // volume and records: ramping up to the work is not the work.
    const working = source.sets.filter((set) => set.type !== 'warmup')

    // An exercise that was added and never logged against was not part of what
    // you did, so it is not part of what you are planning to repeat.
    if (working.length === 0) {
      skipped.push(source.name)
      continue
    }

    const reps = working.map((set) => set.reps).filter((value): value is number => value != null && value > 0)
    const min = reps.length > 0 ? Math.min(...reps) : (source.targetRepsMin ?? FALLBACK_REPS_MIN)
    const max = reps.length > 0 ? Math.max(...reps) : undefined
    const weightKg = commonWeightKg(working)

    drafts.push({
      exerciseId: source.exerciseId,
      order: drafts.length,
      targetSets: working.length,
      targetRepsMin: min,
      // Only when the range is actually a range. A single-value "8–8" is
      // noise, and the editor already renders a bare minimum correctly.
      ...(max != null && max > min ? { targetRepsMax: max } : {}),
      isAmrap: source.isAmrap ?? false,
      ...(weightKg == null ? {} : { targetWeight: { kind: 'absolute' as const, kg: weightKg } }),
      ...(source.restSeconds == null ? {} : { restSeconds: source.restSeconds }),
      ...(source.supersetGroup == null ? {} : { supersetGroup: source.supersetGroup }),
    })
  }

  return {
    name: input.name.trim() || 'New routine',
    exercises: pruneLoneSupersets(drafts),
    skipped,
  }
}

/**
 * One line summarising what an exercise is being asked for.
 *
 * Shared by the two screens that show a plan nobody has agreed to yet —
 * saving a session as a routine, and importing a shared one. Both need the
 * same sentence, and a preview that describes the targets differently from the
 * builder would be a preview you cannot trust.
 */
export function describeTarget(entry: RoutineExerciseDraft, unit: WeightUnit): string {
  const reps =
    entry.targetRepsMax != null && entry.targetRepsMax !== entry.targetRepsMin
      ? `${entry.targetRepsMin}–${entry.targetRepsMax}`
      : String(entry.targetRepsMin)

  const weight =
    entry.targetWeight == null
      ? ''
      : entry.targetWeight.kind === 'absolute'
        ? ` @ ${formatWeight(entry.targetWeight.kg, unit)}`
        : ` @ ${entry.targetWeight.pct}% of training max`

  return `${entry.targetSets} × ${reps}${entry.isAmrap ? '+' : ''}${weight}`
}

/**
 * The weight to plan for, when the sets did not all use the same one.
 *
 * The most frequently used working weight, ties broken toward the heavier.
 * Straight sets give the obvious answer; a drop set at the end does not drag
 * the plan down; a pyramid lands on its middle rather than on a top set you
 * hit once and would then be asked to repeat five times.
 *
 * Non-positive weights are ignored. A zero is how an unweighted set reads, and
 * a plan asking for 0 kg is worse than a plan asking for nothing.
 */
function commonWeightKg(sets: readonly SetEntry[]): number | undefined {
  const counts = new Map<number, number>()
  for (const set of sets) {
    if (set.weightKg == null || set.weightKg <= 0) continue
    counts.set(set.weightKg, (counts.get(set.weightKg) ?? 0) + 1)
  }

  let best: number | undefined
  let bestCount = 0
  for (const [weightKg, count] of counts) {
    if (count > bestCount || (count === bestCount && weightKg > (best ?? 0))) {
      best = weightKg
      bestCount = count
    }
  }
  return best
}

/**
 * Drop group numbers that ended up with only one member.
 *
 * Skipping an unlogged exercise can leave its superset partner alone in a
 * group, and "performed back to back" with nothing to pair against is a state
 * the builder would render as a superset of one.
 */
function pruneLoneSupersets(drafts: RoutineExerciseDraft[]): RoutineExerciseDraft[] {
  const sizes = new Map<number, number>()
  for (const draft of drafts) {
    if (draft.supersetGroup == null) continue
    sizes.set(draft.supersetGroup, (sizes.get(draft.supersetGroup) ?? 0) + 1)
  }

  return drafts.map((draft) => {
    if (draft.supersetGroup == null || (sizes.get(draft.supersetGroup) ?? 0) > 1) return draft
    const { supersetGroup: _dropped, ...rest } = draft
    return rest
  })
}
