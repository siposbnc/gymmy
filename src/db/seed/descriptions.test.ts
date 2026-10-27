import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '../schema'
import { EXERCISE_DESCRIPTIONS } from './descriptions'
import { SEED_EXERCISES } from './exercises'
import { backfillBuiltInMetadata, bootstrapDatabase } from './index'

describe('exercise descriptions', () => {
  it('covers every built-in exercise', () => {
    const missing = SEED_EXERCISES.filter((exercise) => !exercise.description)
    expect(missing.map((exercise) => exercise.id)).toEqual([])
  })

  it('has no description for an exercise that does not exist', () => {
    const slugs = new Set(SEED_EXERCISES.map((exercise) => exercise.id.replace(/^ex_/, '')))
    const orphans = Object.keys(EXERCISE_DESCRIPTIONS).filter((slug) => !slugs.has(slug))
    expect(orphans).toEqual([])
  })

  it('says something useful rather than restating the name', () => {
    for (const exercise of SEED_EXERCISES) {
      expect(exercise.description!.length).toBeGreaterThan(30)
      // A description that is just the name again helps nobody.
      expect(exercise.description!.toLowerCase()).not.toBe(exercise.name.toLowerCase())
    }
  })
})

describe('backfilling descriptions onto an existing install', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('adds descriptions to built-ins that predate them', async () => {
    // An install from before descriptions existed.
    await db.exercises.bulkAdd(
      SEED_EXERCISES.map(({ description: _description, ...rest }) => rest),
    )
    expect((await db.exercises.get('ex_squat'))?.description).toBeUndefined()

    await backfillBuiltInMetadata()

    expect((await db.exercises.get('ex_squat'))?.description).toContain('Back squat')
  })

  it('never overwrites a description the user already has', async () => {
    await db.exercises.bulkAdd(SEED_EXERCISES.map((exercise) => ({ ...exercise })))
    await db.exercises.update('ex_squat', { description: 'My own words.' })

    await backfillBuiltInMetadata()

    expect((await db.exercises.get('ex_squat'))?.description).toBe('My own words.')
  })

  it('leaves custom exercises alone', async () => {
    await db.exercises.add({
      id: 'ex_custom',
      name: 'Landmine press',
      muscleGroups: ['shoulders'],
      equipment: 'barbell',
      movementType: 'compound',
      trackingType: 'weight_reps',
      defaultRestSeconds: 120,
      isCustom: true,
    })

    await backfillBuiltInMetadata()

    expect((await db.exercises.get('ex_custom'))?.description).toBeUndefined()
  })

  it('runs as part of bootstrap, and is idempotent', async () => {
    await bootstrapDatabase()
    const first = await db.exercises.get('ex_bench-press')
    await bootstrapDatabase()
    const second = await db.exercises.get('ex_bench-press')

    expect(first?.description).toBeDefined()
    expect(second).toEqual(first)
  })
})
