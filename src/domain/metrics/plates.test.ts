import { describe, expect, it } from 'vitest'

import { DEFAULT_PLATE_INVENTORY } from '~/db/seed/plates'

import { calculatePlates, formatPlates } from './plates'

const FULL_GYM = { barWeightKg: 20, inventory: DEFAULT_PLATE_INVENTORY }

describe('calculatePlates', () => {
  it('decomposes a loadable weight heaviest-first', () => {
    const result = calculatePlates({ targetKg: 100, ...FULL_GYM })
    // (100 − 20) / 2 = 40 per side
    expect(result.perSide).toEqual([25, 15])
    expect(result.exact).toBe(true)
    expect(result.achievedKg).toBe(100)
  })

  it('handles the half-plate case', () => {
    const result = calculatePlates({ targetKg: 142.5, ...FULL_GYM })
    // 61.25 per side
    expect(result.exact).toBe(true)
    expect(result.achievedKg).toBeCloseTo(142.5, 5)
    expect(result.perSide.reduce((a, b) => a + b, 0)).toBeCloseTo(61.25, 5)
  })

  it('reports bar-only honestly', () => {
    const result = calculatePlates({ targetKg: 20, ...FULL_GYM })
    expect(result.perSide).toEqual([])
    expect(result.exact).toBe(true)
    expect(formatPlates(result)).toBe('bar only')
  })

  it('refuses to load less than the bar', () => {
    const result = calculatePlates({ targetKg: 15, ...FULL_GYM })
    expect(result.exact).toBe(false)
    expect(result.achievedKg).toBe(20)
  })

  it('respects a limited home-gym inventory instead of inventing plates', () => {
    // Two pairs of 20s is all this gym owns: 140 kg needs 60 per side, but
    // only 40 can be loaded. Report the shortfall rather than conjuring plates.
    const result = calculatePlates({
      targetKg: 140,
      barWeightKg: 20,
      inventory: [{ weightKg: 20, pairs: 2 }],
    })
    expect(result.exact).toBe(false)
    expect(result.perSide).toEqual([20, 20])
    expect(result.achievedKg).toBe(100)
  })

  it('is exact when a small inventory happens to cover the target', () => {
    const result = calculatePlates({
      targetKg: 100,
      barWeightKg: 20,
      inventory: [{ weightKg: 20, pairs: 2 }],
    })
    expect(result.exact).toBe(true)
    expect(result.perSide).toEqual([20, 20])
    expect(result.achievedKg).toBe(100)
  })

  it('reports the nearest achievable weight when the target cannot be made', () => {
    const result = calculatePlates({
      targetKg: 105,
      barWeightKg: 20,
      inventory: [{ weightKg: 20, pairs: 3 }],
    })
    // 42.5 needed per side; only 40 is achievable from 20s.
    expect(result.exact).toBe(false)
    expect(result.perSide).toEqual([20, 20])
    expect(result.achievedKg).toBe(100)
  })

  it('never exceeds the pairs actually owned', () => {
    const result = calculatePlates({
      targetKg: 500,
      barWeightKg: 20,
      inventory: [{ weightKg: 25, pairs: 2 }],
    })
    expect(result.perSide).toEqual([25, 25])
    expect(result.exact).toBe(false)
  })

  it('does not accumulate float dust into a phantom plate', () => {
    const result = calculatePlates({
      targetKg: 62.5,
      barWeightKg: 20,
      inventory: [
        { weightKg: 10, pairs: 4 },
        { weightKg: 1.25, pairs: 4 },
      ],
    })
    // 21.25 per side = 10 + 10 + 1.25
    expect(result.perSide).toEqual([10, 10, 1.25])
    expect(result.exact).toBe(true)
  })

  it('ignores zero-count and zero-weight entries', () => {
    const result = calculatePlates({
      targetKg: 60,
      barWeightKg: 20,
      inventory: [
        { weightKg: 25, pairs: 0 },
        { weightKg: 0, pairs: 5 },
        { weightKg: 20, pairs: 2 },
      ],
    })
    expect(result.perSide).toEqual([20])
    expect(result.exact).toBe(true)
  })
})
