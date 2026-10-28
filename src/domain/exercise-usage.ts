/**
 * Which exercises you actually train.
 *
 * The picker holds over a hundred exercises and you use perhaps fifteen of
 * them. Nothing needs to be recorded for this: every completed session already
 * says what you did, so the ranking is derived and can never drift out of step
 * with your training the way a hand-kept favourites list does.
 *
 * Ranking is recency-weighted frequency rather than a raw count. A raw count
 * is a monument to whatever you trained hardest two years ago — it ranks the
 * programme you have abandoned above the one you are running now, and it only
 * gets more wrong as history accumulates. Pure recency has the opposite fault:
 * one curious attempt at an exercise yesterday would outrank the bench press
 * you have done weekly for a year. Weighting each appearance by its age fixes
 * both at once, and settles down as sessions pile up.
 */

/** One appearance of an exercise in a finished session. */
export interface ExerciseAppearance {
  readonly exerciseId: string
  /** When that session happened, epoch ms. */
  readonly at: number
}

export interface ExerciseUsage {
  readonly exerciseId: string
  /** Sessions this exercise appears in. Shown to the user, so it is the plain count. */
  readonly sessions: number
  /** Most recent of those sessions, epoch ms. */
  readonly lastUsedAt: number
  /** Recency-weighted session count. Orders the list; never displayed. */
  readonly score: number
}

/**
 * How long it takes an appearance to count for half of a fresh one.
 *
 * Two months is roughly a training block. Shorter and the order twitches
 * whenever you take a week off; longer and a finished programme lingers at the
 * top of the list for a season after you stopped running it.
 */
export const USAGE_HALF_LIFE_DAYS = 60

const DAY_MS = 86_400_000

/**
 * Rank exercises by how much you train them, most-used first.
 *
 * Appearances in the future — a clock that was wrong, an import from a device
 * in another timezone — are clamped to full weight rather than allowed to
 * score above 1, which would quietly promote them above everything real.
 */
export function rankExerciseUsage(
  appearances: readonly ExerciseAppearance[],
  now: number = Date.now(),
): ExerciseUsage[] {
  const totals = new Map<string, { sessions: number; lastUsedAt: number; score: number }>()

  for (const { exerciseId, at } of appearances) {
    const ageDays = Math.max(0, (now - at) / DAY_MS)
    const weight = 0.5 ** (ageDays / USAGE_HALF_LIFE_DAYS)

    const total = totals.get(exerciseId)
    if (total) {
      total.sessions += 1
      total.lastUsedAt = Math.max(total.lastUsedAt, at)
      total.score += weight
    } else {
      totals.set(exerciseId, { sessions: 1, lastUsedAt: at, score: weight })
    }
  }

  return [...totals.entries()]
    .map(([exerciseId, total]) => ({ exerciseId, ...total }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.lastUsedAt - a.lastUsedAt ||
        a.exerciseId.localeCompare(b.exerciseId),
    )
}

/** Compact "12 sessions · 3d" for a ranked row. */
export function describeUsage(usage: ExerciseUsage, now: number = Date.now()): string {
  const sessions = `${usage.sessions} session${usage.sessions === 1 ? '' : 's'}`
  return `${sessions} · ${describeAge(usage.lastUsedAt, now)}`
}

/**
 * How long ago, at the precision that matters here.
 *
 * Days up to a fortnight, then weeks, then months — "today" and "3d" are worth
 * telling apart when choosing what to train; "47d" and "52d" are not.
 */
function describeAge(at: number, now: number): string {
  const days = Math.floor(Math.max(0, now - at) / DAY_MS)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 14) return `${days}d`
  if (days < 60) return `${Math.round(days / 7)}w`
  return `${Math.round(days / 30)}mo`
}
