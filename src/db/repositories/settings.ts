import type { Settings } from '~/domain/types'

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
