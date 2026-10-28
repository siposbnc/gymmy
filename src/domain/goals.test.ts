import { describe, expect, it } from 'vitest'

import {
  describeVolumeGoal,
  muscleSetProgress,
  resolveVolumeGoal,
  SUGGESTED_WEEKLY_SETS,
} from './goals'

describe('resolveVolumeGoal — beat last time', () => {
  const goal = { kind: 'beat_last' } as const

  it('targets the previous session', () => {
    const result = resolveVolumeGoal({ goal, actualKg: 8420, previousKg: 8000 })
    expect(result.targetKg).toBe(8000)
    expect(result.met).toBe(true)
    expect(result.ratio).toBeCloseTo(1.0525, 4)
  })

  it('requires beating it, not matching it', () => {
    // "Beat last time" means exactly that.
    const result = resolveVolumeGoal({ goal, actualKg: 8000, previousKg: 8000 })
    expect(result.met).toBe(false)
    expect(result.ratio).toBe(1)
  })

  it('reports a shortfall without calling it a failure', () => {
    const result = resolveVolumeGoal({ goal, actualKg: 6000, previousKg: 8000 })
    expect(result.met).toBe(false)
    expect(result.targetKg).toBe(8000)
    expect(Math.round((result.ratio ?? 0) * 100)).toBe(75)
  })

  it('has no target the first time a routine is run', () => {
    // Inventing one would be a guess, and Gymmy does not guess at numbers.
    const result = resolveVolumeGoal({ goal, actualKg: 8420 })
    expect(result.targetKg).toBeNull()
    expect(result.ratio).toBeNull()
    expect(result.met).toBe(false)
    expect(result.kind).toBe('beat_last')
  })

  it('treats a zero previous session as nothing to beat', () => {
    expect(resolveVolumeGoal({ goal, actualKg: 100, previousKg: 0 }).targetKg).toBeNull()
  })
})

describe('resolveVolumeGoal — absolute', () => {
  it('counts hitting the number exactly as met', () => {
    // You asked for that much and did that much.
    const result = resolveVolumeGoal({
      goal: { kind: 'absolute', kg: 8000 },
      actualKg: 8000,
    })
    expect(result.met).toBe(true)
    expect(result.targetKg).toBe(8000)
  })

  it('ignores a nonsense target rather than dividing by it', () => {
    const result = resolveVolumeGoal({ goal: { kind: 'absolute', kg: 0 }, actualKg: 500 })
    expect(result.kind).toBe('none')
    expect(result.ratio).toBeNull()
  })

  it('does not consult the previous session', () => {
    const result = resolveVolumeGoal({
      goal: { kind: 'absolute', kg: 5000 },
      actualKg: 6000,
      previousKg: 9000,
    })
    expect(result.targetKg).toBe(5000)
    expect(result.met).toBe(true)
  })
})

describe('resolveVolumeGoal — no goal', () => {
  it('is inert when the routine has none', () => {
    const result = resolveVolumeGoal({ goal: undefined, actualKg: 8420, previousKg: 8000 })
    expect(result).toMatchObject({ targetKg: null, ratio: null, met: false, kind: 'none' })
  })
})

describe('describeVolumeGoal', () => {
  it('frames a relative goal against last time', () => {
    const result = resolveVolumeGoal({
      goal: { kind: 'beat_last' },
      actualKg: 8400,
      previousKg: 8000,
    })
    expect(describeVolumeGoal(result)).toBe('105% of last time (8,000 kg)')
  })

  it('frames an absolute goal against the number', () => {
    const result = resolveVolumeGoal({ goal: { kind: 'absolute', kg: 8000 }, actualKg: 4000 })
    expect(describeVolumeGoal(result)).toBe('50% of 8,000 kg')
  })

  it('says plainly when there is nothing to compare against', () => {
    const result = resolveVolumeGoal({ goal: { kind: 'beat_last' }, actualKg: 8000 })
    expect(describeVolumeGoal(result)).toBe('First time — nothing to beat yet')
  })

  it('converts for the display unit', () => {
    const result = resolveVolumeGoal({ goal: { kind: 'absolute', kg: 1000 }, actualKg: 500 })
    expect(describeVolumeGoal(result, 'lb')).toContain('lb')
  })
})

describe('muscleSetProgress', () => {
  it('pairs each muscle with its target', () => {
    const progress = muscleSetProgress({ chest: 12, quads: 8 }, { chest: 10, quads: 12 })

    expect(progress.find((row) => row.muscle === 'chest')).toMatchObject({ sets: 12, met: true })
    expect(progress.find((row) => row.muscle === 'quads')).toMatchObject({ sets: 8, met: false })
  })

  it('shows a muscle with a target even at zero sets', () => {
    // The muscle you are neglecting is the whole reason to set a target; it
    // must not be the one that disappears.
    const progress = muscleSetProgress({ chest: 12 }, { chest: 10, back: 10 })
    expect(progress.find((row) => row.muscle === 'back')).toMatchObject({ sets: 0, met: false })
  })

  it('shows a muscle you trained without a target', () => {
    const progress = muscleSetProgress({ calves: 4 }, {})
    expect(progress).toEqual([{ muscle: 'calves', sets: 4, target: null, met: false }])
  })

  it('puts whatever is short of target first', () => {
    const progress = muscleSetProgress({ chest: 20, back: 2, quads: 15 }, { chest: 10, back: 10 })
    expect(progress[0]?.muscle).toBe('back')
  })

  it('never claims a muscle without a target was met', () => {
    const progress = muscleSetProgress({ chest: 99 }, {})
    expect(progress[0]?.met).toBe(false)
  })

  it('is empty with nothing trained and nothing targeted', () => {
    expect(muscleSetProgress({}, {})).toEqual([])
  })
})

describe('the suggested starting target', () => {
  it('is the low end of the usual range, not a prescription', () => {
    expect(SUGGESTED_WEEKLY_SETS).toBe(10)
  })
})
