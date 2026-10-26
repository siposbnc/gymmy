import { describe, expect, it } from 'vitest'

import {
  formatVolume,
  formatWeight,
  fromDisplayUnit,
  INCREMENT,
  kgToLb,
  lbToKg,
  roundForDisplay,
} from './units'

describe('unit conversion', () => {
  it('round-trips without drift', () => {
    for (const kg of [20, 82.5, 100, 142.5, 180]) {
      expect(lbToKg(kgToLb(kg))).toBeCloseTo(kg, 10)
    }
  })

  it('converts a bar to the familiar 45 lb', () => {
    expect(Math.round(kgToLb(20))).toBe(44)
    expect(roundForDisplay(kgToLb(20.4), 'lb')).toBe(45)
  })

  it('uses the right stepper increment per unit', () => {
    expect(INCREMENT.kg).toBe(2.5)
    expect(INCREMENT.lb).toBe(5)
  })
})

describe('display rounding', () => {
  it('snaps kilograms to half steps and pounds to whole', () => {
    expect(roundForDisplay(82.4, 'kg')).toBe(82.5)
    expect(roundForDisplay(82.3, 'kg')).toBe(82.5)
    expect(roundForDisplay(82.1, 'kg')).toBe(82)
    expect(roundForDisplay(181.4, 'lb')).toBe(181)
  })

  it('drops a trailing .0 so columns stay readable', () => {
    expect(formatWeight(80)).toBe('80 kg')
    expect(formatWeight(82.5)).toBe('82.5 kg')
    expect(formatWeight(80, 'kg', { withUnit: false })).toBe('80')
  })

  it('formats totals with thousands separators', () => {
    expect(formatVolume(8420)).toBe('8,420 kg')
  })
})

describe('the display boundary', () => {
  it('only converts at the edge — storage stays canonical', () => {
    // What a user typing "180 lb" actually stores.
    const stored = fromDisplayUnit(180, 'lb')
    expect(stored).toBeCloseTo(81.6466, 3)

    // And what they see back, in their own unit.
    expect(formatWeight(stored, 'lb')).toBe('180 lb')
  })

  it('shows a kg-entered weight sensibly in pounds', () => {
    expect(formatWeight(100, 'lb')).toBe('220 lb')
  })
})
