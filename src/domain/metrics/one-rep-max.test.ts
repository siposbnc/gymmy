import { describe, expect, it } from 'vitest'

import { estimateOneRepMax, MAX_REPS_FOR_ESTIMATE, oneRepMaxMetric } from './one-rep-max'

describe('estimateOneRepMax', () => {
  it('applies Epley across the usable range', () => {
    expect(estimateOneRepMax({ weightKg: 100, reps: 3 })).toBeCloseTo(110, 5)
    expect(estimateOneRepMax({ weightKg: 100, reps: 5 })).toBeCloseTo(116.667, 3)
    expect(estimateOneRepMax({ weightKg: 100, reps: 10 })).toBeCloseTo(133.333, 3)
    expect(estimateOneRepMax({ weightKg: 100, reps: 12 })).toBeCloseTo(140, 5)
  })

  it('returns the weight unchanged for a single', () => {
    // Plain Epley would say 103.33 — claiming a 100 kg single proves a 103 kg
    // max. An actual single IS the measurement.
    expect(estimateOneRepMax({ weightKg: 100, reps: 1 })).toBe(100)
    expect(estimateOneRepMax({ weightKg: 142.5, reps: 1 })).toBe(142.5)
  })

  it('refuses to estimate above the rep cap', () => {
    expect(estimateOneRepMax({ weightKg: 100, reps: MAX_REPS_FOR_ESTIMATE })).not.toBeNull()
    expect(estimateOneRepMax({ weightKg: 100, reps: MAX_REPS_FOR_ESTIMATE + 1 })).toBeNull()

    // The burnout set that would otherwise claim a 167 kg squat.
    expect(estimateOneRepMax({ weightKg: 100, reps: 20 })).toBeNull()
    expect(estimateOneRepMax({ weightKg: 100, reps: 30 })).toBeNull()
  })

  it('rejects nonsense input rather than returning a plausible-looking number', () => {
    expect(estimateOneRepMax({ weightKg: 0, reps: 5 })).toBeNull()
    expect(estimateOneRepMax({ weightKg: -100, reps: 5 })).toBeNull()
    expect(estimateOneRepMax({ weightKg: 100, reps: 0 })).toBeNull()
    expect(estimateOneRepMax({ weightKg: 100, reps: -3 })).toBeNull()
    expect(estimateOneRepMax({ weightKg: 100, reps: 2.5 })).toBeNull()
    expect(estimateOneRepMax({ weightKg: Number.NaN, reps: 5 })).toBeNull()
    expect(estimateOneRepMax({ weightKg: 100, reps: Number.POSITIVE_INFINITY })).toBeNull()
  })

  it('ranks sets the way the trend line relies on', () => {
    // The whole justification for the metric: comparing sets that look nothing
    // alike. 100 × 5 beats 90 × 8.
    const heavier = estimateOneRepMax({ weightKg: 100, reps: 5 })!
    const lighter = estimateOneRepMax({ weightKg: 90, reps: 8 })!
    expect(heavier).toBeGreaterThan(lighter)
  })
})

describe('oneRepMaxMetric.example', () => {
  it('builds a worked example from the user own numbers', () => {
    const example = oneRepMaxMetric.example({ weightKg: 100, reps: 5 })
    expect(example).not.toBeNull()
    expect(example!.given).toBe('100 kg × 5')
    expect(example!.substitution).toBe('100 × (1 + 5 ÷ 30)')
    expect(example!.result).toBe('116.5 kg')
  })

  it('has no example where there is no estimate', () => {
    expect(oneRepMaxMetric.example({ weightKg: 100, reps: 20 })).toBeNull()
  })
})
