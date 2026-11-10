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

import { describeSetPlan, isUniform } from './set-plan'
import type { Id, PlannedSet, RoutineExercise, SetEntry } from './types'
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

    // A session that climbed is kept as the climb. Collapsing 60 × 10,
    // 70 × 8, 80 × 6 into "3 × 6–10 at 70" describes a workout nobody did and
    // produces a routine that cannot reproduce the one you chose to keep.
    const ladder = deriveLadder(working, min)

    drafts.push({
      exerciseId: source.exerciseId,
      order: drafts.length,
      targetSets: working.length,
      targetRepsMin: min,
      // Only when the range is actually a range. A single-value "8–8" is
      // noise, and the editor already renders a bare minimum correctly.
      ...(max != null && max > min ? { targetRepsMax: max } : {}),
      isAmrap: source.isAmrap ?? false,
      // The ladder owns the weights when there is one, so the flat target is
      // written only for straight sets — two answers would be one too many.
      ...(ladder
        ? { setPlan: ladder }
        : weightKg == null
          ? {}
          : { targetWeight: { kind: 'absolute' as const, kg: weightKg } }),
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
 * The ladder a set of logged work describes, or null for straight sets.
 *
 * **A ladder is about load, not reps.** Varying weights are a decision — a
 * ramp up to a top set, a backoff, a drop set — and worth keeping exactly.
 * Varying reps at one weight are usually just fatigue: 80 × 8, 8, 7 is three
 * straight sets where the last one ran out, and writing it down as a plan
 * would ask you to *aim* for seven next time. That case is already described
 * properly by the rep range, so it stays straight sets.
 *
 * A set logged without a weight becomes a rung without one: "do this for ten"
 * is a legitimate plan, and inventing a zero would not be.
 */
function deriveLadder(
  sets: readonly SetEntry[],
  fallbackReps: number,
): PlannedSet[] | null {
  const loads = sets.map((set) => (set.weightKg != null && set.weightKg > 0 ? set.weightKg : null))
  if (loads.every((load) => load === loads[0])) return null

  const ladder = sets.map((set, index) => {
    const kg = loads[index]
    return {
      reps: set.reps != null && set.reps > 0 ? set.reps : fallbackReps,
      ...(kg == null ? {} : { weight: { kind: 'absolute' as const, kg } }),
    }
  })

  // Belt and braces: the repository refuses to store a uniform ladder, so a
  // preview must never promise one.
  return isUniform(ladder) ? null : ladder
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
  // A ladder describes itself rung by rung. Summarising it here would make the
  // preview disagree with what the editor shows a moment later.
  if (entry.setPlan != null && entry.setPlan.length > 0) {
    return describeSetPlan(entry.setPlan, unit)
  }

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
 * The weight to plan for, when every set used the same one.
 *
 * This used to be a vote — most frequently used weight, ties toward the
 * heavier — because a single target had to stand in for a session that
 * climbed, and every answer it could give was wrong in some way: a pyramid
 * landed on its middle, and nothing reproduced what you actually did. Varied
 * loads are now kept as a ladder instead, so the only remaining question is
 * the easy one, and the vote is gone with the problem it was solving.
 *
 * Non-positive weights are ignored. A zero is how an unweighted set reads, and
 * a plan asking for 0 kg is worse than a plan asking for nothing.
 */
function commonWeightKg(sets: readonly SetEntry[]): number | undefined {
  const loaded = sets
    .map((set) => set.weightKg)
    .filter((weightKg): weightKg is number => weightKg != null && weightKg > 0)

  return loaded[0]
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
