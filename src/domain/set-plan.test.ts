import { describe, expect, it } from 'vitest'

import {
  collapseSetPlan,
  describeSetPlan,
  expandToSetPlan,
  isUniform,
  plannedSetAt,
  stripPlanWeights,
  summariseSetPlan,
} from './set-plan'
import type { PlannedSet } from './types'

const rung = (kg: number | undefined, reps: number, isAmrap = false): PlannedSet => ({
  reps,
  ...(kg == null ? {} : { weight: { kind: 'absolute' as const, kg } }),
  ...(isAmrap ? { isAmrap: true } : {}),
})

/** 60 × 10, 70 × 8, 80 × 6. */
const ladder = [rung(60, 10), rung(70, 8), rung(80, 6)]

describe('plannedSetAt', () => {
  it('is 1-based, like every set index a user can see', () => {
    expect(plannedSetAt(ladder, 1)?.reps).toBe(10)
    expect(plannedSetAt(ladder, 3)?.reps).toBe(6)
  })

  it('has nothing to say past the end of the ladder', () => {
    // A fourth set on a three-rung plan is unplanned work, not a zero.
    expect(plannedSetAt(ladder, 4)).toBeUndefined()
    expect(plannedSetAt(ladder, 0)).toBeUndefined()
    expect(plannedSetAt(undefined, 1)).toBeUndefined()
  })
})

describe('summariseSetPlan — what everything else keeps reading', () => {
  it('counts the rungs and spans their reps', () => {
    expect(summariseSetPlan(ladder)).toEqual({
      targetSets: 3,
      targetRepsMin: 6,
      targetRepsMax: 10,
      isAmrap: false,
    })
  })

  it('drops a range of one rather than writing 8–8', () => {
    expect(summariseSetPlan([rung(80, 8), rung(80, 8)])).toEqual({
      targetSets: 2,
      targetRepsMin: 8,
      isAmrap: false,
    })
  })

  it('is amrap if any rung is', () => {
    expect(summariseSetPlan([rung(80, 8), rung(80, 8, true)]).isAmrap).toBe(true)
  })
})

describe('expandToSetPlan — switching to per-set', () => {
  it('costs you nothing: the rungs start as what the boxes held', () => {
    const plan = expandToSetPlan({
      targetSets: 3,
      targetRepsMin: 8,
      isAmrap: false,
      targetWeight: { kind: 'absolute', kg: 100 },
    })

    expect(plan).toHaveLength(3)
    expect(plan.every((set) => set.reps === 8)).toBe(true)
    expect(plan.every((set) => set.weight?.kind === 'absolute' && set.weight.kg === 100)).toBe(true)
  })

  it('leaves the weight unset when the plan never named one', () => {
    const plan = expandToSetPlan({ targetSets: 2, targetRepsMin: 5, isAmrap: false })
    expect(plan[0]).not.toHaveProperty('weight')
  })

  it('puts "to failure" on the last rung only, which is what the flag meant', () => {
    const plan = expandToSetPlan({ targetSets: 3, targetRepsMin: 5, isAmrap: true })
    expect(plan.map((set) => set.isAmrap ?? false)).toEqual([false, false, true])
  })

  it('round-trips a uniform plan back to the same targets', () => {
    const entry = {
      targetSets: 4,
      targetRepsMin: 5,
      isAmrap: false,
      targetWeight: { kind: 'absolute' as const, kg: 90 },
    }
    expect(collapseSetPlan(expandToSetPlan(entry))).toEqual({
      targetSets: 4,
      targetRepsMin: 5,
      isAmrap: false,
      targetWeight: { kind: 'absolute', kg: 90 },
    })
  })
})

describe('collapseSetPlan — going back to straight sets', () => {
  it('keeps the rung you open on, not the heaviest', () => {
    // Taking the top set would turn a ramp into a plan asking for your best
    // single three more times.
    expect(collapseSetPlan(ladder)).toEqual({
      targetSets: 3,
      targetRepsMin: 10,
      isAmrap: false,
      targetWeight: { kind: 'absolute', kg: 60 },
    })
  })

  it('survives an empty ladder rather than writing a zero-set plan', () => {
    expect(collapseSetPlan([])).toEqual({ targetSets: 1, targetRepsMin: 1, isAmrap: false })
  })
})

describe('describeSetPlan — the line both previews show', () => {
  it('reads as a ladder', () => {
    expect(describeSetPlan(ladder)).toBe('60 × 10 · 70 × 8 · 80 × 6 kg')
  })

  it('marks the rung taken to failure', () => {
    expect(describeSetPlan([rung(80, 5), rung(80, 5, true)])).toBe('80 × 5 · 80 × 5+ kg')
  })

  it('shows reps alone when no rung names a weight', () => {
    expect(describeSetPlan([rung(undefined, 12), rung(undefined, 10)])).toBe('12 · 10')
  })

  it('converts for display units', () => {
    expect(describeSetPlan([rung(100, 5)], 'lb')).toBe('220 × 5 lb')
  })
})

describe('stripPlanWeights — what a swap carries across', () => {
  it('keeps the reps and drops the loads', () => {
    expect(stripPlanWeights(ladder)).toEqual([{ reps: 10 }, { reps: 8 }, { reps: 6 }])
  })

  it('carries the AMRAP flag, which describes the work rather than the bar', () => {
    expect(stripPlanWeights([rung(80, 5, true)])).toEqual([{ reps: 5, isAmrap: true }])
  })

  it('drops a percent rung as readily as an absolute one', () => {
    const percent: PlannedSet = { reps: 5, weight: { kind: 'percent', pct: 85, basis: 'training_max' } }
    expect(stripPlanWeights([percent])).toEqual([{ reps: 5 }])
  })

  it('can leave a ladder uniform — which is why callers check', () => {
    expect(isUniform(stripPlanWeights([rung(60, 8), rung(70, 8)]))).toBe(true)
  })

  it('does not mutate the plan it was given', () => {
    const original = [rung(60, 10)]
    stripPlanWeights(original)
    expect(original[0]?.weight).toEqual({ kind: 'absolute', kg: 60 })
  })
})

describe('isUniform — a ladder with identical rungs is not a ladder', () => {
  it('spots straight sets wearing a hat', () => {
    expect(isUniform([rung(80, 8), rung(80, 8), rung(80, 8)])).toBe(true)
    expect(isUniform([])).toBe(true)
    expect(isUniform([rung(80, 8)])).toBe(true)
  })

  it('spots a real difference in weight, reps or failure', () => {
    expect(isUniform(ladder)).toBe(false)
    expect(isUniform([rung(80, 8), rung(80, 6)])).toBe(false)
    expect(isUniform([rung(80, 8), rung(80, 8, true)])).toBe(false)
    expect(isUniform([rung(undefined, 8), rung(80, 8)])).toBe(false)
  })
})
