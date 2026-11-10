import type { PlannedSet, RoutineExercise } from './types'
import { formatWeight, type WeightUnit } from './units'

/**
 * Ladders — a weight and a rep count per set.
 *
 * A routine used to hold one weight and one rep figure for a whole exercise,
 * which cannot describe the shape most working sets actually take: 60 × 10,
 * 70 × 8, 80 × 6. A {@link PlannedSet} per rung can.
 *
 * ## The summary is not optional
 *
 * A ladder always travels with the flat fields it summarises — `targetSets`,
 * `targetRepsMin`, `targetRepsMax`, `isAmrap` — kept in step by
 * {@link summariseSetPlan} at every write. That is what kept this change
 * small: the progress ribbon, the "2 of 4" in the session header, weekly set
 * counts, the volume goal and the records path all keep reading the summary
 * and never learn ladders exist.
 *
 * Only three places read the rungs: prefill, the routine editor, and the two
 * previews that show a plan nobody has agreed to yet.
 *
 * ## A ladder is a starting point, not an instruction
 *
 * It seeds the first run of a routine and fills in rungs history cannot
 * answer. It does not outrank what you actually lifted — see the chain in
 * `metrics/prefill`. A routine is a group of exercises with some useful
 * defaults attached; progression is driven by training, not by the plan.
 *
 * Pure: no React, no Dexie, every rule below unit-tested.
 */

/** The flat fields a ladder summarises. Kept in sync at every write. */
export interface SetPlanSummary {
  targetSets: number
  targetRepsMin: number
  targetRepsMax?: number
  isAmrap: boolean
}

/** 1-based, because set indices are 1-based everywhere a user can see them. */
export function plannedSetAt(
  plan: readonly PlannedSet[] | undefined,
  setIndex: number,
): PlannedSet | undefined {
  if (!plan || setIndex < 1) return undefined
  return plan[setIndex - 1]
}

/**
 * What a ladder looks like to everything that has not heard of ladders.
 *
 * The rep range spans the rungs, so a 10/8/6 ladder reads as "3 × 6–10" in
 * every summary — not the whole truth, but true, and the shape of the work is
 * what those places are actually asking about.
 */
export function summariseSetPlan(plan: readonly PlannedSet[]): SetPlanSummary {
  const reps = plan.map((rung) => rung.reps).filter((value) => value > 0)
  const min = reps.length > 0 ? Math.min(...reps) : 1
  const max = reps.length > 0 ? Math.max(...reps) : 1

  return {
    targetSets: Math.max(1, plan.length),
    targetRepsMin: min,
    // A range of one is not a range; the editor renders a bare minimum right.
    ...(max > min ? { targetRepsMax: max } : {}),
    isAmrap: plan.some((rung) => rung.isAmrap === true),
  }
}

/**
 * Straight sets → a ladder of identical rungs.
 *
 * Switching an exercise to per-set must never cost you the targets you already
 * set, or the toggle is a trap: you arrive at three rows holding exactly what
 * the three boxes held, and edit the two you want to differ.
 *
 * `isAmrap` lands on the last rung alone, because that is what the flag has
 * always meant — "take the last set to failure".
 */
export function expandToSetPlan(
  entry: Pick<RoutineExercise, 'targetSets' | 'targetRepsMin' | 'isAmrap'> & {
    targetWeight?: RoutineExercise['targetWeight']
  },
): PlannedSet[] {
  const rungs = Math.max(1, Math.round(entry.targetSets))
  const reps = Math.max(1, Math.round(entry.targetRepsMin))

  return Array.from({ length: rungs }, (_unused, index) => ({
    reps,
    ...(entry.targetWeight == null ? {} : { weight: entry.targetWeight }),
    ...(entry.isAmrap && index === rungs - 1 ? { isAmrap: true } : {}),
  }))
}

/**
 * The same ladder, with the loads taken off.
 *
 * What a swap mid-session carries from one exercise to the other. Reps survive
 * the change — "three sets of eight" is a prescription about the work, and it
 * means the same thing on a barbell and on dumbbells. Weights do not: 80 kg of
 * bench press is not 80 kg of dumbbell press, and prefill's ladder tier sits
 * above carry-forward, so a load carried across would be offered as today's
 * opening set on a movement it was never lifted on.
 *
 * `isAmrap` travels, because "the last one to failure" is also a statement
 * about the work rather than about the bar.
 */
export function stripPlanWeights(plan: readonly PlannedSet[]): PlannedSet[] {
  return plan.map((rung) => ({
    reps: rung.reps,
    ...(rung.isAmrap === true ? { isAmrap: true } : {}),
  }))
}

/**
 * A ladder → straight sets.
 *
 * Lossy by definition, which is why the editor asks first. The first rung wins
 * because it is the one you open on, and because taking the heaviest would
 * turn a ramp into a plan asking for your top set five times.
 */
export function collapseSetPlan(plan: readonly PlannedSet[]): SetPlanSummary & {
  targetWeight?: RoutineExercise['targetWeight']
} {
  const first = plan[0]
  const rungs = Math.max(1, plan.length)

  return {
    targetSets: rungs,
    targetRepsMin: Math.max(1, first?.reps ?? 1),
    isAmrap: plan.some((rung) => rung.isAmrap === true),
    ...(first?.weight == null ? {} : { targetWeight: first.weight }),
  }
}

/**
 * "60 × 10 · 70 × 8 · 80 × 6" — one line describing a ladder.
 *
 * Used by the session card and by both previews, so a ladder is described the
 * same way everywhere it is shown. A rung with no weight shows its reps alone
 * rather than inventing a figure.
 */
export function describeSetPlan(
  plan: readonly PlannedSet[],
  unit: WeightUnit = 'kg',
): string {
  return plan
    .map((rung) => describePlannedSet(rung, unit))
    .join(' · ')
    .concat(setPlanUnitSuffix(plan, unit))
}

/**
 * One rung: `70 × 8`.
 *
 * Separate from the line above so the session card can emphasise the rung you
 * are on without reimplementing the formatting and drifting from it.
 */
export function describePlannedSet(rung: PlannedSet, unit: WeightUnit = 'kg'): string {
  const reps = `${rung.reps}${rung.isAmrap ? '+' : ''}`
  if (rung.weight == null) return reps
  if (rung.weight.kind === 'percent') return `${rung.weight.pct}% × ${reps}`
  return `${formatWeight(rung.weight.kg, unit, { withUnit: false })} × ${reps}`
}

/** `" kg"`, once at the end of a ladder — or nothing, if no rung names a weight. */
export function setPlanUnitSuffix(plan: readonly PlannedSet[], unit: WeightUnit = 'kg'): string {
  return plan.some((rung) => rung.weight?.kind === 'absolute') ? ` ${unit}` : ''
}

/**
 * Whether the rungs actually differ.
 *
 * A ladder whose rungs are all identical is straight sets wearing a hat: it
 * should not be stored, because then two states mean the same thing and the
 * editor has to guess which mode to open in.
 */
export function isUniform(plan: readonly PlannedSet[]): boolean {
  const first = plan[0]
  if (!first || plan.length < 2) return true

  return plan.every(
    (rung) =>
      rung.reps === first.reps &&
      (rung.isAmrap ?? false) === (first.isAmrap ?? false) &&
      sameWeight(rung.weight, first.weight),
  )
}

function sameWeight(
  a: RoutineExercise['targetWeight'],
  b: RoutineExercise['targetWeight'],
): boolean {
  if (a == null || b == null) return a == null && b == null
  if (a.kind === 'absolute' && b.kind === 'absolute') return a.kg === b.kg
  if (a.kind === 'percent' && b.kind === 'percent') return a.pct === b.pct
  return false
}
