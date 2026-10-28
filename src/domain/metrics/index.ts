import {
  amrapGuide,
  muscleVolumeGuide,
  recordsGuide,
  restTimerGuide,
  rpeGuide,
  streakGuide,
  unitsGuide,
  volumeGoalGuide,
  warmupGuide,
  warmupVsWorkingGuide,
  weeklySetsGuide,
} from './guides'
import { oneRepMaxMetric } from './one-rep-max'
import { platesMetric } from './plates'
import { prefillMetric } from './prefill'
import { progressionMetric } from './progression'
import type { Explainable } from './types'
import { volumeMetric } from './volume'

export * from './types'
export * from './guides'
export * from './one-rep-max'
export * from './plates'
export * from './prefill'
export * from './progression'
export * from './volume'

/**
 * The explainer registry.
 *
 * Everything the app derives or asks the user to understand is listed here.
 * The "How Gymmy works out your numbers" reference page renders this array;
 * contextual ⓘ sheets look entries up by id.
 *
 * A registry test iterates this and fails the build if any entry ships without
 * explainer copy — that is what stops a metric reaching users undocumented.
 */
export const EXPLAINABLES: readonly Explainable[] = [
  prefillMetric,
  progressionMetric,
  oneRepMaxMetric,
  volumeMetric,
  platesMetric,
  muscleVolumeGuide,
  volumeGoalGuide,
  weeklySetsGuide,
  recordsGuide,
  rpeGuide,
  amrapGuide,
  warmupGuide,
  warmupVsWorkingGuide,
  restTimerGuide,
  streakGuide,
  unitsGuide,
]

const BY_ID = new Map(EXPLAINABLES.map((entry) => [entry.id, entry]))

export function explainableById(id: string): Explainable | undefined {
  return BY_ID.get(id)
}
