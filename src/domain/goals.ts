import { formatVolume, type WeightUnit } from './units'
import type { MuscleGroup, VolumeGoal } from './types'

/**
 * Training goals.
 *
 * Two deliberate constraints run through this file.
 *
 * Nothing here reports a failure. Gymmy's voice throughout is that it reports
 * and does not judge, so a missed goal is a number next to another number —
 * not a red state, not a broken streak.
 *
 * And a goal is never invented. If there is nothing to compare against, the
 * answer is "no target yet" rather than a guess, for the same reason the
 * estimated 1RM shows a dash above twelve reps.
 */

export interface VolumeGoalInput {
  readonly goal: VolumeGoal | undefined
  /** Working-set volume of the session just finished, in kilograms. */
  readonly actualKg: number
  /** Volume of the last completed session of this routine, if there was one. */
  readonly previousKg?: number | undefined
}

export interface VolumeGoalResult {
  readonly targetKg: number | null
  readonly actualKg: number
  /** Null when there is no target to measure against. */
  readonly ratio: number | null
  readonly met: boolean
  readonly kind: 'beat_last' | 'absolute' | 'none'
}

export function resolveVolumeGoal({
  goal,
  actualKg,
  previousKg,
}: VolumeGoalInput): VolumeGoalResult {
  const none: VolumeGoalResult = {
    targetKg: null,
    actualKg,
    ratio: null,
    met: false,
    kind: 'none',
  }

  if (!goal) return none

  if (goal.kind === 'absolute') {
    if (goal.kg <= 0) return none
    return {
      targetKg: goal.kg,
      actualKg,
      ratio: actualKg / goal.kg,
      // Hitting the number you set counts. You asked for that much, you did
      // that much.
      met: actualKg >= goal.kg,
      kind: 'absolute',
    }
  }

  // beat_last — and the first time you run a routine there is nothing to beat.
  if (previousKg == null || previousKg <= 0) return { ...none, kind: 'beat_last' }

  return {
    targetKg: previousKg,
    actualKg,
    ratio: actualKg / previousKg,
    // Strictly greater: matching last time is not beating it.
    met: actualKg > previousKg,
    kind: 'beat_last',
  }
}

/** "104% of last time" / "8,420 of 8,000 kg" / "no target yet". */
export function describeVolumeGoal(result: VolumeGoalResult, unit: WeightUnit = 'kg'): string {
  if (result.targetKg == null) {
    return result.kind === 'beat_last' ? 'First time — nothing to beat yet' : 'No volume goal set'
  }
  const percent = Math.round((result.ratio ?? 0) * 100)
  return result.kind === 'beat_last'
    ? `${percent}% of last time (${formatVolume(result.targetKg, unit)})`
    : `${percent}% of ${formatVolume(result.targetKg, unit)}`
}

// ---------------------------------------------------------------------------
// Weekly hard sets per muscle
// ---------------------------------------------------------------------------

export interface MuscleSetProgress {
  readonly muscle: MuscleGroup
  readonly sets: number
  /** Null when no target has been set for this muscle. */
  readonly target: number | null
  readonly met: boolean
}

/**
 * This week's set counts lined up against their targets.
 *
 * Muscles you trained appear whether or not they have a target, and muscles
 * with a target appear even at zero sets — otherwise the one you are
 * neglecting, which is the whole reason to set a target, would be the one
 * that stays invisible.
 */
export function muscleSetProgress(
  setsByMuscle: Readonly<Partial<Record<MuscleGroup, number>>>,
  targets: Readonly<Partial<Record<MuscleGroup, number>>> = {},
): MuscleSetProgress[] {
  const muscles = new Set<MuscleGroup>([
    ...(Object.keys(setsByMuscle) as MuscleGroup[]),
    ...(Object.keys(targets) as MuscleGroup[]),
  ])

  return [...muscles]
    .map((muscle) => {
      const sets = setsByMuscle[muscle] ?? 0
      const target = targets[muscle] ?? null
      return { muscle, sets, target, met: target != null && sets >= target }
    })
    .sort((a, b) => {
      // Under-target first — that is the information you came for. Then by
      // volume of work, so the busiest muscles lead the rest.
      const aShort = a.target != null && !a.met
      const bShort = b.target != null && !b.met
      if (aShort !== bShort) return aShort ? -1 : 1
      return b.sets - a.sets
    })
}

/**
 * A starting point when someone asks for one, not a prescription.
 *
 * Ten is the low end of the range usually cited for growth; the explainer says
 * so and says it is a heuristic rather than a rule.
 */
export const SUGGESTED_WEEKLY_SETS = 10
