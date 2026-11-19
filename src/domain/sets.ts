import type { SetEntry } from './types'

/**
 * What kind of row a logged set is, and how rows relate to each other.
 *
 * Small enough to look unnecessary, and it is not: the difference between
 * "counts as work" and "counts as a set" is the whole of dropset support, and
 * it has to be decided in exactly one place or the set count on the session
 * header will disagree with the one in the weekly totals.
 *
 * Pure, like everything in `domain/` — these take plain rows and answer plain
 * questions, so the rules are unit-tested with nothing mounted.
 */

/** The minimum needed to tell what kind of row this is. */
export type SetShape = Pick<SetEntry, 'type'>

/** The minimum needed to place a row among its siblings. */
export interface OrderableSet extends SetShape {
  readonly id: string
  readonly setIndex: number
  readonly parentSetId?: string | undefined
}

/**
 * A drop: the weight came off and the set carried on without rest.
 *
 * Keyed on `type` rather than on `parentSetId` because `type` is what every
 * existing filter in the app already reads, and the two are written together —
 * see {@link SetEntry.parentSetId}.
 */
export function isDrop(set: SetShape): boolean {
  return set.type === 'dropset'
}

/**
 * Whether this row is a set in its own right.
 *
 * The one predicate behind the dropset rule. A warm-up is not a set because it
 * is not work; a drop is not a set because it is *part of* the set above it.
 * Everything that counts sets — the "3 of 4" on an exercise card, the progress
 * ribbon, the session header, hard sets per muscle per week, the shareable card
 * — asks this, which is why none of them had to learn what a dropset is.
 *
 * Note what it is not: a volume filter. `countsTowardVolume` excludes warm-ups
 * only, and that difference is the point — drops are work that does not add a
 * set to the count.
 */
export function countsAsSet(set: SetShape): boolean {
  return set.type !== 'warmup' && !isDrop(set)
}

/** The drops hanging off one working set, in the order they were taken. */
export function dropsOf<T extends OrderableSet>(
  sets: readonly T[],
  parentSetId: string,
): T[] {
  return sets
    .filter((set) => set.parentSetId === parentSetId)
    .sort((a, b) => a.setIndex - b.setIndex)
}

/** Whether any drop hangs off this set — a question delete and warm-up both ask. */
export function hasDrops(sets: readonly OrderableSet[], setId: string): boolean {
  return sets.some((set) => set.parentSetId === setId)
}

/**
 * The working set a given row hangs off, or would if it became a drop.
 *
 * The nearest working set above it, which is the only candidate that means
 * anything: a drop follows the set it came off. Null when there is nothing to
 * attach to — the first set of an exercise, a warm-up, or a set that has drops
 * of its own, because a drop of a drop is not a shape this model has and not
 * one the gym has either.
 *
 * Lives here rather than in the repository so the sheet offering "make it a
 * drop of set 2" and the write that performs it read the same rule. Two copies
 * of it would be two chances for the label to name a set the write does not use.
 */
export function dropParentOf<T extends OrderableSet>(
  sets: readonly T[],
  setId: string,
): T | null {
  const set = sets.find((candidate) => candidate.id === setId)
  if (!set || set.type === 'warmup') return null

  if (isDrop(set)) {
    return sets.find((candidate) => candidate.id === set.parentSetId) ?? null
  }
  if (hasDrops(sets, setId)) return null

  return (
    sets
      .filter((candidate) => countsAsSet(candidate) && candidate.setIndex < set.setIndex)
      .sort((a, b) => a.setIndex - b.setIndex)
      .at(-1) ?? null
  )
}

/**
 * Sets in display order: warm-ups, then working sets, each trailed by its drops.
 *
 * Sorting on `setIndex` alone is wrong, because the runs are numbered
 * independently — it interleaves them as W1, 1, D1, 2. Grouping also means a
 * warm-up added after the fact appears where it belongs rather than stranded at
 * the bottom, and a drop always sits under the set it came off rather than
 * under whichever set happens to share its number.
 *
 * Every read of a single exercise's sets goes through this, so the order is
 * decided once and every screen inherits it.
 *
 * A drop whose parent is missing is appended rather than dropped. It should not
 * be possible — the parent's deletion takes its drops with it — but a merge
 * import is not under our control, and work that silently vanishes from history
 * is a far worse outcome than a row in an odd position.
 */
export function orderSets<T extends OrderableSet>(rows: readonly T[]): T[] {
  const byIndex = (a: T, b: T) => a.setIndex - b.setIndex

  const warmups = rows.filter((row) => row.type === 'warmup').sort(byIndex)
  const working = rows.filter(countsAsSet).sort(byIndex)
  const drops = rows.filter((row) => isDrop(row))

  const parented = new Set<string>()
  const ordered = working.flatMap((set) => {
    const chain = dropsOf(drops, set.id)
    for (const drop of chain) parented.add(drop.id)
    return [set, ...chain]
  })

  const orphans = drops.filter((drop) => !parented.has(drop.id)).sort(byIndex)

  return [...warmups, ...ordered, ...orphans]
}

/**
 * Renumber every run of an exercise's sets so each counts from one.
 *
 * Returns only the rows whose number actually changed, because the caller is
 * writing them to a database and most of them have not moved.
 *
 * Expects rows in the order {@link orderSets} produces: the drop chains are
 * numbered in the order they appear, so passing an arbitrary array would hand
 * you a stable but meaningless order.
 */
export function renumberSets<T extends OrderableSet>(
  ordered: readonly T[],
): { id: string; setIndex: number }[] {
  const drops = new Map<string, number>()
  let working = 0
  let warmup = 0

  const changed: { id: string; setIndex: number }[] = []

  for (const row of ordered) {
    let setIndex: number
    if (row.parentSetId != null) {
      setIndex = (drops.get(row.parentSetId) ?? 0) + 1
      drops.set(row.parentSetId, setIndex)
    } else if (row.type === 'warmup') {
      setIndex = ++warmup
    } else {
      setIndex = ++working
    }

    if (row.setIndex !== setIndex) changed.push({ id: row.id, setIndex })
  }

  return changed
}
