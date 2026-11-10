import type { Exercise, SessionExercise } from './types'
import { formatWeight, type WeightUnit } from './units'

/**
 * Machines that carry weight of their own.
 *
 * A plate-loaded leg press, a pendulum squat, a hack squat: the carriage
 * already weighs something before you hang a single plate on it. "40 kg" on
 * such a machine is not 40 kg of work, and logging it as though it were
 * understates every total that reads off it.
 *
 * The shape of the solution is the same as {@link ./bars}, deliberately. A bar
 * weighs 20 kg and `weightKg` on a set has always meant plates *plus* the bar;
 * a machine's own weight is the identical idea with a different noun. So:
 *
 * - **`weightKg` on a set stays the total load.** Records, volume, estimated
 *   1RM and every chart keep reading one field that means one thing. Had
 *   stored weight become "what you added", every one of them would need the
 *   machine threaded through it, and an unloaded leg press would read as no
 *   work at all.
 * - **The session screen converts.** You type what you added, because that is
 *   what you physically do; the total is shown beside it, derived.
 *
 * The functions below are that conversion and nothing more. They are the only
 * place the two numbers are turned into each other.
 */

/**
 * Whether this exercise can carry a weight of its own.
 *
 * Machines only. A Smith machine has a bar, so its own weight is already
 * modelled as a {@link ./bars} entry, and cables pull against a stack that is
 * labelled with what it is. Widening this later is one line here rather than a
 * search through the UI, which is the reason it is a predicate.
 */
export function usesMachineWeight(exercise: Pick<Exercise, 'equipment'> | undefined): boolean {
  return exercise?.equipment === 'machine'
}

/**
 * What the machine itself contributes, in kilograms.
 *
 * Read from the session's snapshot, never from the exercise, once a session has
 * started — correcting a machine's weight in November must not silently change
 * how March's sets split into "added" and "machine". Absent means zero, which
 * is the correct answer for every exercise that has no machine weight set and
 * for every row written before this existed.
 */
export function machineWeightKg(
  source: Pick<SessionExercise, 'machineWeightKg'> | Pick<Exercise, 'machineWeightKg'> | undefined,
): number {
  const value = source?.machineWeightKg
  return value != null && value > 0 ? value : 0
}

/** What the user put on the machine: the total minus what the machine weighs. */
export function addedWeightKg(totalKg: number | undefined, machineKg: number): number | undefined {
  if (totalKg == null) return undefined
  // Clamped: a total below the machine's own weight is impossible, and a
  // negative number in the field you are about to type into is worse than a
  // zero that reads as "nothing on it yet".
  return Math.max(0, totalKg - machineKg)
}

/** What is actually being lifted: what you added plus what the machine weighs. */
export function totalWeightKg(addedKg: number | undefined, machineKg: number): number | undefined {
  if (addedKg == null) return machineKg > 0 ? machineKg : undefined
  return Math.max(0, addedKg) + machineKg
}

/**
 * "+ 25 kg machine = 65 kg total", the line under the set being entered.
 *
 * Spelling out both halves is the whole point: the number you typed and the
 * number every record is based on are different, and the user has to be able
 * to see why without being told twice.
 */
export function describeMachineLoad(
  totalKg: number | undefined,
  machineKg: number,
  unit: WeightUnit = 'kg',
): string | null {
  if (machineKg <= 0 || totalKg == null) return null
  return `+ ${formatWeight(machineKg, unit)} machine = ${formatWeight(totalKg, unit)} total`
}
