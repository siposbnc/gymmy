import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '../schema'
import { bootstrapDatabase } from '../seed'
import { getSettings, setWeeklySetTarget, updateSettings } from './settings'

describe('settings', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await bootstrapDatabase()
  })

  it('starts with no weekly set targets at all', async () => {
    // Shipping fourteen defaults would be Gymmy deciding what your training
    // should look like, and would fill Progress with rows you never asked for.
    const settings = await getSettings()
    expect(settings.weeklySetTargets ?? {}).toEqual({})
  })

  it('sets a target for one muscle without touching the others', async () => {
    await setWeeklySetTarget('chest', 12)
    await setWeeklySetTarget('back', 14)

    expect((await getSettings()).weeklySetTargets).toEqual({ chest: 12, back: 14 })
  })

  it('overwrites a target rather than adding to it', async () => {
    await setWeeklySetTarget('chest', 12)
    await setWeeklySetTarget('chest', 10)
    expect((await getSettings()).weeklySetTargets).toEqual({ chest: 10 })
  })

  it('removes the key when a target is cleared to zero', async () => {
    await setWeeklySetTarget('chest', 12)
    await setWeeklySetTarget('chest', 0)

    const targets = (await getSettings()).weeklySetTargets ?? {}
    expect('chest' in targets).toBe(false)
  })

  it('treats a negative target as clearing it', async () => {
    // Reachable by holding the minus button down past zero.
    await setWeeklySetTarget('chest', 12)
    await setWeeklySetTarget('chest', -3)
    expect((await getSettings()).weeklySetTargets).toEqual({})
  })

  it('rounds a fractional target rather than storing half a set', async () => {
    await setWeeklySetTarget('quads', 10.6)
    expect((await getSettings()).weeklySetTargets).toEqual({ quads: 11 })
  })

  it('survives a settings row that predates the field', async () => {
    await updateSettings({ units: 'lb' })
    await setWeeklySetTarget('calves', 6)

    const settings = await getSettings()
    expect(settings.weeklySetTargets).toEqual({ calves: 6 })
    expect(settings.units).toBe('lb')
  })
})
