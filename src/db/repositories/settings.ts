import type { MuscleGroup, Settings } from '~/domain/types'

import { db } from '../schema'
import { DEFAULT_SETTINGS } from '../seed'

/**
 * Settings is a single row — one user per device, no profiles. That assumption
 * keeps every other query free of a userId, and the cost is that export/import
 * is the only device-migration path.
 */
export async function getSettings(): Promise<Settings> {
  return (await db.settings.get('singleton')) ?? DEFAULT_SETTINGS
}

export async function updateSettings(patch: Partial<Omit<Settings, 'id'>>): Promise<void> {
  const existing = await db.settings.get('singleton')
  if (existing) {
    await db.settings.update('singleton', patch)
  } else {
    await db.settings.put({ ...DEFAULT_SETTINGS, ...patch })
  }
}

/**
 * Set or clear one muscle's weekly set target.
 *
 * Zero removes the key rather than storing it, so "no target" and "a target of
 * nothing" cannot both exist — the UI only has to handle absent.
 */
export async function setWeeklySetTarget(muscle: MuscleGroup, sets: number): Promise<void> {
  const settings = await getSettings()
  const targets = { ...(settings.weeklySetTargets ?? {}) }

  const rounded = Math.round(sets)
  if (rounded > 0) targets[muscle] = rounded
  else delete targets[muscle]

  await updateSettings({ weeklySetTargets: targets })
}
