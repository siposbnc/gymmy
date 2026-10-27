import type { Bar, Exercise, Settings } from './types'
import { formatWeight, type WeightUnit } from './units'

/**
 * Which bar an exercise is loaded on, and what it weighs.
 *
 * The resolution order is deliberately forgiving, because the plate
 * calculator must always produce something usable:
 *
 *   1. the bar the exercise names, if it still exists
 *   2. the user's default bar
 *   3. the legacy single bar weight, for a settings row written before v3
 *   4. 20 kg, the standard Olympic bar
 *
 * Step 1 checks the bar still exists on purpose: deleting a bar that some
 * exercise pointed at should quietly fall back to the default, not leave a
 * calculation stuck on a weight that is no longer in the gym.
 */

export const STANDARD_BAR_KG = 20

export interface BarContext {
  readonly bars: readonly Bar[]
  readonly defaultBarId: string
  /** Pre-v3 fallback. */
  readonly barWeightKg?: number | undefined
}

export function resolveBar(
  exercise: Pick<Exercise, 'barId'> | undefined,
  settings: BarContext,
): Bar | undefined {
  const named = exercise?.barId
    ? settings.bars.find((bar) => bar.id === exercise.barId)
    : undefined
  if (named) return named

  return settings.bars.find((bar) => bar.id === settings.defaultBarId) ?? settings.bars[0]
}

export function resolveBarWeight(
  exercise: Pick<Exercise, 'barId'> | undefined,
  settings: BarContext,
): number {
  const bar = resolveBar(exercise, settings)
  if (bar) return bar.weightKg
  return settings.barWeightKg ?? STANDARD_BAR_KG
}

/** "20 kg bar" / "EZ bar · 7.5 kg", for the hint under a set row. */
export function describeBar(bar: Bar | undefined, unit: WeightUnit = 'kg'): string {
  if (!bar) return `${STANDARD_BAR_KG} kg bar`
  return `${bar.name} · ${formatWeight(bar.weightKg, unit)}`
}

/**
 * Whether this exercise is loaded on a bar at all.
 *
 * Dumbbells and machines have no bar to subtract, so showing a plate
 * breakdown for them would be nonsense.
 */
export function usesBar(exercise: Pick<Exercise, 'equipment'> | undefined): boolean {
  return exercise?.equipment === 'barbell' || exercise?.equipment === 'smith'
}

/** Settings-shaped convenience wrapper. */
export function barContext(settings: Settings): BarContext {
  return {
    bars: settings.bars,
    defaultBarId: settings.defaultBarId,
    barWeightKg: settings.barWeightKg,
  }
}
