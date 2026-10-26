import { describe, expect, it } from 'vitest'

import { EXPLAINABLES, explainableById, isMetric } from './index'

/**
 * The guard that makes "every derived number is explainable" structural rather
 * than aspirational. A metric cannot reach users undocumented, because this
 * fails the build first.
 */
describe('explainer registry', () => {
  it('is not empty', () => {
    expect(EXPLAINABLES.length).toBeGreaterThan(0)
  })

  it('has unique ids', () => {
    const ids = EXPLAINABLES.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it.each(EXPLAINABLES.map((entry) => [entry.id, entry] as const))(
    '%s ships with complete explainer copy',
    (_id, entry) => {
      expect(entry.label.length).toBeGreaterThan(0)
      expect(entry.shortLabel.length).toBeGreaterThan(0)

      expect(entry.explainer.whatItIs.length).toBeGreaterThan(20)
      expect(entry.explainer.whyUseful.length).toBeGreaterThan(20)

      // At least one caveat, always. A metric with no stated limits is
      // under-examined, and the honest limit is what makes the rest credible.
      expect(entry.explainer.caveats.length).toBeGreaterThan(0)
      for (const caveat of entry.explainer.caveats) {
        expect(caveat.length).toBeGreaterThan(20)
      }
    },
  )

  it.each(EXPLAINABLES.filter(isMetric).map((entry) => [entry.id, entry] as const))(
    '%s is a computable metric with a formula',
    (_id, metric) => {
      expect(metric.formula.length).toBeGreaterThan(0)
      expect(typeof metric.compute).toBe('function')
      expect(typeof metric.example).toBe('function')
    },
  )

  it('resolves entries by id and returns undefined for unknown ones', () => {
    expect(explainableById('est_1rm')?.label).toBe('Estimated 1RM')
    expect(explainableById('does_not_exist')).toBeUndefined()
  })

  it('documents estimated 1RM as never producing a record', () => {
    // This is a product guarantee, not a style preference: if the caveat is
    // ever dropped, the UI would be free to imply an estimate is an achievement.
    const oneRepMax = explainableById('est_1rm')
    const text = oneRepMax!.explainer.caveats.join(' ').toLowerCase()
    expect(text).toContain('never counts as a personal record')
  })
})
