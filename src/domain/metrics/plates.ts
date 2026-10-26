import type { PlatePair } from '../types'
import { formatWeight } from '../units'
import type { Metric } from './types'

export interface PlateInput {
  readonly targetKg: number
  readonly barWeightKg: number
  readonly inventory: readonly PlatePair[]
}

export interface PlateResult {
  /** Plates for ONE side, heaviest first. */
  readonly perSide: readonly number[]
  /** True when the target is loadable exactly from the inventory. */
  readonly exact: boolean
  /** What the bar actually weighs with `perSide` loaded on both sides. */
  readonly achievedKg: number
}

/**
 * Greedy decomposition, heaviest plate first.
 *
 * Greedy is correct here rather than merely convenient: real plate sets are
 * "canonical" (each denomination divides into the next), so the greedy choice
 * is provably optimal. It also matches how people actually load a bar.
 *
 * Honesty matters more than cleverness: when a target cannot be made from the
 * plates the user owns, this reports the nearest achievable weight rather than
 * inventing plates. An app that silently lies about loading is worse than one
 * that says "closest I can do is 137.5".
 */
export function calculatePlates({ targetKg, barWeightKg, inventory }: PlateInput): PlateResult {
  const empty: PlateResult = { perSide: [], exact: false, achievedKg: barWeightKg }

  if (!Number.isFinite(targetKg) || !Number.isFinite(barWeightKg)) return empty
  if (targetKg < barWeightKg) return empty
  if (targetKg === barWeightKg) return { perSide: [], exact: true, achievedKg: barWeightKg }

  // Everything is computed per side; the bar is loaded symmetrically.
  const perSideTarget = (targetKg - barWeightKg) / 2

  const available = inventory
    .filter((p) => p.weightKg > 0 && p.pairs > 0)
    .sort((a, b) => b.weightKg - a.weightKg)

  const perSide: number[] = []
  let remaining = perSideTarget

  for (const { weightKg, pairs } of available) {
    // `pairs` counts pairs owned, which is exactly how many fit on one side.
    let used = 0
    // Guard against float dust accumulating into a phantom extra plate.
    while (used < pairs && remaining >= weightKg - 1e-9) {
      perSide.push(weightKg)
      remaining -= weightKg
      used += 1
    }
  }

  const loadedPerSide = perSide.reduce((sum, w) => sum + w, 0)
  const achievedKg = barWeightKg + loadedPerSide * 2

  return {
    perSide,
    exact: Math.abs(remaining) < 1e-9,
    achievedKg,
  }
}

/** "20 + 10 + 2.5", or "bar only". */
export function formatPlates(result: PlateResult): string {
  if (result.perSide.length === 0) return 'bar only'
  return result.perSide.map((w) => (Number.isInteger(w) ? String(w) : w.toFixed(2).replace(/0$/, ''))).join(' + ')
}

export const platesMetric: Metric<PlateInput, PlateResult> = {
  id: 'plates',
  label: 'Plates per side',
  shortLabel: 'plates / side',
  formula: 'subtract the bar, halve the rest, then take the largest plates first',
  compute: calculatePlates,

  explainer: {
    whatItIs: 'Which plates to load on each side of the bar to reach your target weight.',
    whyUseful:
      'Saves doing arithmetic with a loaded bar waiting and your heart rate up.',
    caveats: [
      'It only uses plates you have told Gymmy you own, in Settings.',
      'If a weight cannot be made exactly, Gymmy says so and offers the nearest weight you can load instead of guessing.',
    ],
  },

  example: (input) => {
    const result = calculatePlates(input)
    if (result.perSide.length === 0 && !result.exact) return null
    return {
      given: formatWeight(input.targetKg),
      substitution: `(${input.targetKg} − ${input.barWeightKg}) ÷ 2 = ${
        (input.targetKg - input.barWeightKg) / 2
      } per side`,
      result: result.exact
        ? formatPlates(result)
        : `${formatPlates(result)} — closest is ${formatWeight(result.achievedKg)}`,
    }
  },
}
