import type { MuscleGroup } from './types'

/**
 * Display names for muscle groups, in anatomical reading order.
 *
 * One list rather than one per screen: a target set against "Hamstrings" in
 * Settings has to read as the same thing on Progress, and three hand-maintained
 * copies drift.
 *
 * The order is top-down, push before pull, upper before lower — the order
 * people say them in, not alphabetical, which would put Calves first.
 */
export const MUSCLE_LABEL: Readonly<Record<MuscleGroup, string>> = {
  chest: 'Chest',
  back: 'Back',
  lats: 'Lats',
  traps: 'Traps',
  shoulders: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  calves: 'Calves',
  core: 'Core',
  full_body: 'Full body',
}

export const MUSCLE_ORDER = Object.keys(MUSCLE_LABEL) as readonly MuscleGroup[]

export const MUSCLE_OPTIONS: readonly { value: MuscleGroup; label: string }[] = MUSCLE_ORDER.map(
  (value) => ({ value, label: MUSCLE_LABEL[value] }),
)

/** Falls back to the raw key so an unknown value shows as data, not as blank. */
export function muscleLabel(muscle: string): string {
  return MUSCLE_LABEL[muscle as MuscleGroup] ?? muscle
}
