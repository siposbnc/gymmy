import { describe, expect, it } from 'vitest'

import {
  countsAsSet,
  dropParentOf,
  dropsOf,
  hasDrops,
  isDrop,
  orderSets,
  renumberSets,
  type OrderableSet,
} from './sets'

const working = (id: string, setIndex: number): OrderableSet => ({
  id,
  setIndex,
  type: 'normal',
})

const warmup = (id: string, setIndex: number): OrderableSet => ({
  id,
  setIndex,
  type: 'warmup',
})

const drop = (id: string, parentSetId: string, setIndex: number): OrderableSet => ({
  id,
  setIndex,
  type: 'dropset',
  parentSetId,
})

describe('countsAsSet', () => {
  it('is the rule a dropset exists for: work that is not a set of its own', () => {
    expect(countsAsSet(working('s1', 1))).toBe(true)
    expect(countsAsSet(drop('d1', 's1', 1))).toBe(false)
    expect(countsAsSet(warmup('w1', 1))).toBe(false)
  })

  it('counts a set taken to failure — it is a working set that happened to end', () => {
    expect(countsAsSet({ type: 'failure' })).toBe(true)
  })

  it('identifies a drop by its type', () => {
    expect(isDrop({ type: 'dropset' })).toBe(true)
    expect(isDrop({ type: 'normal' })).toBe(false)
  })
})

describe('orderSets', () => {
  it('puts warm-ups first, then working sets, each trailed by its own drops', () => {
    // Deliberately shuffled: this is the order Dexie hands back, which is to
    // say no order at all.
    const rows = [
      drop('d2', 's2', 2),
      working('s2', 2),
      warmup('w1', 1),
      drop('d1', 's2', 1),
      working('s1', 1),
      warmup('w2', 2),
    ]

    expect(orderSets(rows).map((row) => row.id)).toEqual([
      'w1',
      'w2',
      's1',
      's2',
      'd1',
      'd2',
    ])
  })

  it('does not interleave the runs on setIndex, which is the bug it exists to stop', () => {
    // Every one of these is numbered 1 — a warm-up, a working set and a drop
    // each count from one — so a naive sort on setIndex has no idea what to do.
    const rows = [drop('d1', 's1', 1), warmup('w1', 1), working('s1', 1)]
    expect(orderSets(rows).map((row) => row.id)).toEqual(['w1', 's1', 'd1'])
  })

  it('keeps a drop under the set it came off, not under the one sharing its number', () => {
    const rows = [working('s1', 1), working('s2', 2), drop('d1', 's1', 1)]
    expect(orderSets(rows).map((row) => row.id)).toEqual(['s1', 'd1', 's2'])
  })

  it('appends an orphaned drop rather than losing the work', () => {
    // Should be unreachable — deleting a set takes its drops with it — but a
    // merge import is not under our control, and vanishing history is worse.
    const rows = [working('s1', 1), drop('d1', 'gone', 1)]
    expect(orderSets(rows).map((row) => row.id)).toEqual(['s1', 'd1'])
  })

  it('is empty for an exercise with nothing logged', () => {
    expect(orderSets([])).toEqual([])
  })
})

describe('dropsOf / hasDrops', () => {
  const rows = [
    working('s1', 1),
    drop('d2', 's1', 2),
    drop('d1', 's1', 1),
    working('s2', 2),
  ]

  it('returns one set’s chain in the order it was taken', () => {
    expect(dropsOf(rows, 's1').map((row) => row.id)).toEqual(['d1', 'd2'])
    expect(dropsOf(rows, 's2')).toEqual([])
  })

  it('answers the question delete and warm-up both have to ask', () => {
    expect(hasDrops(rows, 's1')).toBe(true)
    expect(hasDrops(rows, 's2')).toBe(false)
  })
})

describe('dropParentOf', () => {
  it('is the nearest working set above, not the first one', () => {
    const rows = [working('s1', 1), working('s2', 2), working('s3', 3)]
    expect(dropParentOf(rows, 's3')?.id).toBe('s2')
  })

  it('is null for the first set of an exercise — nothing to drop off', () => {
    expect(dropParentOf([working('s1', 1)], 's1')).toBeNull()
  })

  it('reports the parent a drop already has', () => {
    const rows = [working('s1', 1), drop('d1', 's1', 1)]
    expect(dropParentOf(rows, 'd1')?.id).toBe('s1')
  })

  it('refuses a set that has drops of its own, because drops do not nest', () => {
    const rows = [working('s1', 1), working('s2', 2), drop('d1', 's2', 1)]
    expect(dropParentOf(rows, 's2')).toBeNull()
  })

  it('refuses a warm-up, which is not a set you drop from', () => {
    const rows = [working('s1', 1), warmup('w1', 1)]
    expect(dropParentOf(rows, 'w1')).toBeNull()
  })

  it('skips over warm-ups when looking upward', () => {
    // A warm-up numbered 2 sits between nothing: the runs are independent, so
    // only working sets are candidates.
    const rows = [warmup('w1', 1), warmup('w2', 2), working('s1', 1), working('s2', 2)]
    expect(dropParentOf(rows, 's2')?.id).toBe('s1')
  })

  it('is null for a set that is not there', () => {
    expect(dropParentOf([working('s1', 1)], 'gone')).toBeNull()
  })
})

describe('renumberSets', () => {
  it('numbers each run from one, independently', () => {
    const ordered = orderSets([
      warmup('w1', 3),
      working('s1', 7),
      drop('d1', 's1', 4),
      drop('d2', 's1', 9),
      working('s2', 8),
    ])

    expect(renumberSets(ordered)).toEqual([
      { id: 'w1', setIndex: 1 },
      { id: 's1', setIndex: 1 },
      { id: 'd1', setIndex: 1 },
      { id: 'd2', setIndex: 2 },
      { id: 's2', setIndex: 2 },
    ])
  })

  it('reports only the rows that moved — the rest are not worth a write', () => {
    const ordered = orderSets([working('s1', 1), working('s2', 5), drop('d1', 's1', 1)])
    expect(renumberSets(ordered)).toEqual([{ id: 's2', setIndex: 2 }])
  })

  it('closes the gap a deleted set leaves behind, drops included', () => {
    // Set 2 of three has been deleted, and so has the first of its drops.
    const ordered = orderSets([working('s1', 1), working('s3', 3), drop('d2', 's3', 2)])
    expect(renumberSets(ordered)).toEqual([
      { id: 's3', setIndex: 2 },
      { id: 'd2', setIndex: 1 },
    ])
  })
})
