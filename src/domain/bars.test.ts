import { describe, expect, it } from 'vitest'

import { describeBar, resolveBar, resolveBarWeight, usesBar, type BarContext } from './bars'
import type { Bar } from './types'

const olympic: Bar = { id: 'bar_olympic', name: 'Olympic bar', weightKg: 20 }
const technique: Bar = { id: 'bar_technique', name: 'Technique bar', weightKg: 10 }
const ez: Bar = { id: 'bar_ez', name: 'EZ bar', weightKg: 7.5 }

const gym: BarContext = {
  bars: [olympic, technique, ez],
  defaultBarId: olympic.id,
}

describe('resolveBarWeight', () => {
  it('uses the bar the exercise names', () => {
    expect(resolveBarWeight({ barId: technique.id }, gym)).toBe(10)
    expect(resolveBarWeight({ barId: ez.id }, gym)).toBe(7.5)
  })

  it('falls back to the default when the exercise names none', () => {
    expect(resolveBarWeight({}, gym)).toBe(20)
    expect(resolveBarWeight(undefined, gym)).toBe(20)
  })

  it('falls back to the default when the named bar has been deleted', () => {
    // Deleting a bar should not leave an exercise calculating against a weight
    // that is no longer in the gym.
    expect(resolveBarWeight({ barId: 'bar_sold_it' }, gym)).toBe(20)
  })

  it('uses any bar at all if the default id is stale', () => {
    expect(resolveBarWeight({}, { bars: [technique], defaultBarId: 'bar_gone' })).toBe(10)
  })

  it('falls back to the pre-v3 single bar weight', () => {
    expect(resolveBarWeight({}, { bars: [], defaultBarId: '', barWeightKg: 15 })).toBe(15)
  })

  it('ends at the standard Olympic bar rather than zero', () => {
    // Zero would silently turn the plate calculation into nonsense.
    expect(resolveBarWeight({}, { bars: [], defaultBarId: '' })).toBe(20)
  })
})

describe('resolveBar', () => {
  it('returns the bar itself, so the UI can name it', () => {
    expect(resolveBar({ barId: ez.id }, gym)).toEqual(ez)
    expect(resolveBar({}, gym)).toEqual(olympic)
  })

  it('is undefined when there are no bars at all', () => {
    expect(resolveBar({}, { bars: [], defaultBarId: '' })).toBeUndefined()
  })
})

describe('usesBar', () => {
  it('is true for the equipment that actually has a bar', () => {
    expect(usesBar({ equipment: 'barbell' })).toBe(true)
    expect(usesBar({ equipment: 'smith' })).toBe(true)
  })

  it('is false where a plate breakdown would be nonsense', () => {
    for (const equipment of ['dumbbell', 'machine', 'cable', 'bodyweight', 'band'] as const) {
      expect(usesBar({ equipment })).toBe(false)
    }
    expect(usesBar(undefined)).toBe(false)
  })
})

describe('describeBar', () => {
  it('names the bar and its weight', () => {
    expect(describeBar(ez)).toBe('EZ bar · 7.5 kg')
  })

  it('converts for the display unit', () => {
    expect(describeBar(olympic, 'lb')).toBe('Olympic bar · 44 lb')
  })

  it('says something sensible with no bar configured', () => {
    expect(describeBar(undefined)).toBe('20 kg bar')
  })
})
