import { describe, expect, it } from 'vitest'

import {
  addedWeightKg,
  describeMachineLoad,
  machineWeightKg,
  totalWeightKg,
  usesMachineWeight,
} from './machines'

describe('usesMachineWeight', () => {
  it('is true for machines and nothing else', () => {
    expect(usesMachineWeight({ equipment: 'machine' })).toBe(true)
    expect(usesMachineWeight({ equipment: 'barbell' })).toBe(false)
    expect(usesMachineWeight({ equipment: 'dumbbell' })).toBe(false)
    expect(usesMachineWeight({ equipment: 'cable' })).toBe(false)
    expect(usesMachineWeight(undefined)).toBe(false)
  })

  it('excludes the Smith machine, whose weight is a bar', () => {
    // A Smith machine's carriage holds a bar, and bars are already modelled.
    // Two ways to express the same kilograms is how they end up double-counted.
    expect(usesMachineWeight({ equipment: 'smith' })).toBe(false)
  })
})

describe('machineWeightKg', () => {
  it('reads the field off a session snapshot or an exercise', () => {
    expect(machineWeightKg({ machineWeightKg: 25 })).toBe(25)
  })

  it('treats absent as zero, which is what every pre-existing row says', () => {
    expect(machineWeightKg(undefined)).toBe(0)
    expect(machineWeightKg({})).toBe(0)
    expect(machineWeightKg({ machineWeightKg: 0 })).toBe(0)
  })

  it('ignores a negative, which cannot mean anything', () => {
    expect(machineWeightKg({ machineWeightKg: -10 })).toBe(0)
  })
})

describe('added and total', () => {
  it('round-trips', () => {
    expect(totalWeightKg(addedWeightKg(65, 25), 25)).toBe(65)
    expect(addedWeightKg(totalWeightKg(40, 25), 25)).toBe(40)
  })

  it('counts the machine as work when nothing is added', () => {
    // An unloaded leg press is not zero reps of nothing; the carriage is real.
    expect(totalWeightKg(0, 25)).toBe(25)
  })

  it('leaves weights alone when there is no machine weight', () => {
    expect(addedWeightKg(80, 0)).toBe(80)
    expect(totalWeightKg(80, 0)).toBe(80)
  })

  it('clamps rather than going negative', () => {
    // Reachable by lowering a machine weight under a total already logged. A
    // negative number in the field you are about to type into is worse than a
    // zero that reads as "nothing on it yet".
    expect(addedWeightKg(20, 25)).toBe(0)
    expect(totalWeightKg(-5, 25)).toBe(25)
  })

  it('passes a missing weight through rather than inventing one', () => {
    expect(addedWeightKg(undefined, 25)).toBeUndefined()
    // With no added weight yet there is still a machine to lift, so the total
    // is known — but with no machine either there is genuinely nothing to say.
    expect(totalWeightKg(undefined, 25)).toBe(25)
    expect(totalWeightKg(undefined, 0)).toBeUndefined()
  })
})

describe('describeMachineLoad', () => {
  it('spells out both halves of the sum', () => {
    expect(describeMachineLoad(65, 25)).toBe('+ 25 kg machine = 65 kg total')
  })

  it('converts for display units', () => {
    expect(describeMachineLoad(65, 25, 'lb')).toBe('+ 55 lb machine = 143 lb total')
  })

  it('says nothing when there is nothing to explain', () => {
    expect(describeMachineLoad(80, 0)).toBeNull()
    expect(describeMachineLoad(undefined, 25)).toBeNull()
  })
})
