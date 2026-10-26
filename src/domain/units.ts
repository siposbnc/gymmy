/**
 * Weight is stored canonically in kilograms. Pounds are a display concern only.
 *
 * Storing as-entered plus a unit flag means every aggregate — volume, 1RM,
 * charts — has to convert at read time, and lb → kg → lb round-trips drift.
 * Conversion happens here, at the display boundary, and nowhere else.
 */

export type WeightUnit = 'kg' | 'lb'

const LB_PER_KG = 2.20462262185

/** Smallest change a user can make in each unit — also the stepper increment. */
export const INCREMENT: Record<WeightUnit, number> = {
  kg: 2.5,
  lb: 5,
}

/** Display precision. Half-kilos exist; half-pounds do not, in practice. */
const DISPLAY_STEP: Record<WeightUnit, number> = {
  kg: 0.5,
  lb: 1,
}

export function kgToLb(kg: number): number {
  return kg * LB_PER_KG
}

export function lbToKg(lb: number): number {
  return lb / LB_PER_KG
}

/** Convert a canonical kg value into the user's display unit. */
export function toDisplayUnit(kg: number, unit: WeightUnit): number {
  return unit === 'kg' ? kg : kgToLb(kg)
}

/** Convert a value the user typed in their unit back to canonical kg. */
export function fromDisplayUnit(value: number, unit: WeightUnit): number {
  return unit === 'kg' ? value : lbToKg(value)
}

/** Round to the nearest displayable step for the unit. */
export function roundForDisplay(value: number, unit: WeightUnit): number {
  const step = DISPLAY_STEP[unit]
  return Math.round(value / step) * step
}

/**
 * Format a canonical kg weight for display.
 *
 * Trailing `.0` is dropped — "80 kg" not "80.0 kg" — because a column of
 * weights reads better without noise, and tabular figures keep it aligned
 * anyway.
 */
export function formatWeight(
  kg: number,
  unit: WeightUnit = 'kg',
  options: { readonly withUnit?: boolean } = {},
): string {
  const { withUnit = true } = options
  const rounded = roundForDisplay(toDisplayUnit(kg, unit), unit)
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
  return withUnit ? `${text} ${unit}` : text
}

/** Format a total, e.g. session volume: "8,420 kg". */
export function formatVolume(kg: number, unit: WeightUnit = 'kg'): string {
  const converted = toDisplayUnit(kg, unit)
  return `${Math.round(converted).toLocaleString('en-US')} ${unit}`
}
