import { describe, expect, it } from 'vitest'

import type { SetEntry } from '../types'
import { countsTowardVolume, setVolume, totalVolume } from './volume'

type TestSet = Pick<SetEntry, 'type' | 'weightKg' | 'reps'>

const working = (weightKg: number, reps: number): TestSet => ({ type: 'normal', weightKg, reps })
const warmup = (weightKg: number, reps: number): TestSet => ({ type: 'warmup', weightKg, reps })

describe('volume', () => {
  it('multiplies reps by weight', () => {
    expect(setVolume(working(80, 8))).toBe(640)
  })

  it('excludes warm-ups — the rule the whole volume chart depends on', () => {
    expect(countsTowardVolume(warmup(20, 12))).toBe(false)
    expect(setVolume(warmup(20, 12))).toBe(0)

    const sets = [warmup(20, 12), warmup(60, 5), working(100, 5), working(100, 5)]
    expect(totalVolume({ sets })).toBe(1000)
  })

  it('counts dropsets and failure sets as real work', () => {
    const sets: TestSet[] = [
      { type: 'dropset', weightKg: 60, reps: 6 },
      { type: 'failure', weightKg: 80, reps: 4 },
    ]
    expect(totalVolume({ sets })).toBe(360 + 320)
  })

  it('treats incomplete sets as zero rather than NaN', () => {
    // A set row that has been added but not filled in yet.
    expect(setVolume({ type: 'normal', reps: 8 })).toBe(0)
    expect(setVolume({ type: 'normal', weightKg: 80 })).toBe(0)
    expect(setVolume({ type: 'normal' })).toBe(0)
    expect(setVolume({ type: 'normal', weightKg: 0, reps: 8 })).toBe(0)
    expect(setVolume({ type: 'normal', weightKg: -80, reps: 8 })).toBe(0)
  })

  it('is zero for an empty session', () => {
    expect(totalVolume({ sets: [] })).toBe(0)
  })
})
