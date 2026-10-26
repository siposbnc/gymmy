import type { SetEntry } from '../types'
import { formatVolume } from '../units'
import type { Metric } from './types'

/**
 * Warm-ups are kept in history but excluded from every total. Otherwise ramping
 * up with the empty bar drags the volume chart down and clutters records with
 * weights the user was not trying hard on.
 */
export function countsTowardVolume(set: Pick<SetEntry, 'type'>): boolean {
  return set.type !== 'warmup'
}

/** One set's contribution: `reps × weight`. */
export function setVolume(set: Pick<SetEntry, 'type' | 'weightKg' | 'reps'>): number {
  if (!countsTowardVolume(set)) return 0
  const { weightKg, reps } = set
  if (weightKg == null || reps == null) return 0
  if (weightKg <= 0 || reps <= 0) return 0
  return weightKg * reps
}

export interface VolumeInput {
  readonly sets: readonly Pick<SetEntry, 'type' | 'weightKg' | 'reps'>[]
}

export function totalVolume({ sets }: VolumeInput): number {
  return sets.reduce((sum, set) => sum + setVolume(set), 0)
}

export const volumeMetric: Metric<VolumeInput, number> = {
  id: 'volume',
  label: 'Volume',
  shortLabel: 'volume',
  formula: 'sets × reps × weight, added up',
  compute: totalVolume,

  explainer: {
    whatItIs: 'The total weight you moved: sets × reps × weight, added up.',
    whyUseful:
      'Volume is the main driver of muscle growth, and it catches progress your top set misses — same weights, more sets, more total work.',
    caveats: [
      'It treats all weight as equal, so it says a heavy squat session and a long dumbbell session are comparable when they are not. Use it to compare a lift against itself over time, not across different exercises.',
      'Warm-up sets are excluded.',
    ],
  },

  example: ({ sets }) => {
    const counted = sets.filter(countsTowardVolume)
    if (counted.length === 0) return null
    const excluded = sets.length - counted.length
    return {
      given: `${counted.length} working set${counted.length === 1 ? '' : 's'}${
        excluded > 0 ? ` (${excluded} warm-up excluded)` : ''
      }`,
      substitution: counted
        .slice(0, 3)
        .map((s) => `${s.weightKg ?? 0} × ${s.reps ?? 0}`)
        .join(' + ')
        .concat(counted.length > 3 ? ' + …' : ''),
      result: formatVolume(totalVolume({ sets })),
    }
  },
}
