import { formatWeight } from '../units'
import type { Metric } from './types'

/**
 * Above this many reps, rep-max formulas stop describing strength and start
 * describing muscular endurance, breathing and pain tolerance — and that
 * relationship varies enormously between people and exercises. Nobody who
 * benches 100 kg × 20 can bench the 167 kg Epley would claim.
 */
export const MAX_REPS_FOR_ESTIMATE = 12

export interface OneRepMaxInput {
  readonly weightKg: number
  readonly reps: number
}

/**
 * Epley: `weight × (1 + reps / 30)`.
 *
 * Returns null above {@link MAX_REPS_FOR_ESTIMATE}, and for non-positive input.
 *
 * Note the single-rep special case: plain Epley returns `w × 1.033` at one rep,
 * which would claim a 100 kg single proves a 103 kg max. An actual single IS
 * the measurement — there is nothing to estimate.
 *
 * This value is analysis only. It can never produce a PersonalRecord; see
 * `domain/records.ts`. A record is something you did, not something a formula
 * says you could do.
 */
export function estimateOneRepMax({ weightKg, reps }: OneRepMaxInput): number | null {
  if (!Number.isFinite(weightKg) || !Number.isFinite(reps)) return null
  if (weightKg <= 0 || reps <= 0) return null
  if (!Number.isInteger(reps)) return null
  if (reps > MAX_REPS_FOR_ESTIMATE) return null
  if (reps === 1) return weightKg
  return weightKg * (1 + reps / 30)
}

export const oneRepMaxMetric: Metric<OneRepMaxInput, number | null> = {
  id: 'est_1rm',
  label: 'Estimated 1RM',
  shortLabel: 'est. 1RM',
  formula: 'weight × (1 + reps ÷ 30)',
  compute: estimateOneRepMax,

  explainer: {
    whatItIs:
      'An estimate of the heaviest weight you could lift for a single rep, worked out from a set you actually did. You never have to test a true max to track it.',
    whyUseful:
      'It is the only fair way to compare sets that look nothing alike. Was 100 kg × 5 better than 90 kg × 8? Estimated 1RM says yes — 117 against 114. That comparison is what the trend line tracks.',
    caveats: [
      `Reliable to about 10–12 reps. Past that you are limited by endurance rather than strength and the formula returns fantasy numbers, so Gymmy shows nothing above ${MAX_REPS_FOR_ESTIMATE} reps.`,
      'It never counts as a personal record. Records are only for weight you genuinely lifted.',
    ],
  },

  example: (input) => {
    const result = estimateOneRepMax(input)
    if (result === null) return null
    const { weightKg, reps } = input
    return {
      given: `${formatWeight(weightKg)} × ${reps}`,
      substitution:
        reps === 1
          ? `a single is already the measurement — no estimate needed`
          : `${weightKg} × (1 + ${reps} ÷ 30)`,
      result: formatWeight(result),
    }
  },
}
