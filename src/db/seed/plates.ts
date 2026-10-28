import type { Bar, PlatePair } from '~/domain/types'

/**
 * A standard metric commercial gym, seeded so the plate calculator works the
 * moment the app opens. Fully editable in Settings — a home gym with three
 * plate pairs gets correct maths because the decomposition honours the
 * inventory rather than assuming an infinite rack.
 *
 * Counts are PAIRS, which is also how many fit on one side of the bar.
 */
export const DEFAULT_BAR_WEIGHT_KG = 20

export const DEFAULT_BAR_ID = 'bar_olympic'

/**
 * A standard rack of bars, seeded like the plate inventory — a sensible
 * starting point to edit rather than a claim about what you own.
 *
 * Ids are stable slugs so an exercise pointing at one survives app updates.
 */
/**
 * The conventional name for a bar of a given weight.
 *
 * 20 kg is the men's Olympic bar and 15 kg the women's — both are "Olympic",
 * which is why the seeded rack lists them separately. Anything unrecognised
 * gets a neutral name rather than a wrong one.
 */
export function standardBarName(weightKg: number): string {
  switch (weightKg) {
    case 20:
      return 'Olympic bar'
    case 15:
      return "Women's bar"
    case 10:
      return 'Technique bar'
    case 7.5:
      return 'EZ bar'
    default:
      return 'Your bar'
  }
}

export const DEFAULT_BARS: Bar[] = [
  { id: DEFAULT_BAR_ID, name: 'Olympic bar', weightKg: 20 },
  { id: 'bar_womens', name: "Women's bar", weightKg: 15 },
  { id: 'bar_technique', name: 'Technique bar', weightKg: 10 },
  { id: 'bar_ez', name: 'EZ bar', weightKg: 7.5 },
]

export const DEFAULT_PLATE_INVENTORY: PlatePair[] = [
  { weightKg: 25, pairs: 4 },
  { weightKg: 20, pairs: 4 },
  { weightKg: 15, pairs: 2 },
  { weightKg: 10, pairs: 2 },
  { weightKg: 5, pairs: 2 },
  { weightKg: 2.5, pairs: 2 },
  { weightKg: 1.25, pairs: 2 },
]
