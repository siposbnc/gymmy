/**
 * How long ago — the one question the Today screen exists to answer.
 *
 * Deciding what to train is mostly arithmetic on dates: you trained chest on
 * Monday, your hamstrings not for a fortnight, so today is legs. Nothing new is
 * recorded for this. Every logged set already carries the time it happened and
 * the exercise it belonged to, so the answer is derived — and therefore cannot
 * drift from training the way a hand-kept "last trained" field would.
 *
 * Reporting, not prescribing. This module says how long it has been; it never
 * says a muscle is recovered, ready, or overdue. Recovery depends on the load,
 * the lifter and the week, and a number of days is the honest part of it. The
 * ordering is the whole recommendation, and the user can disagree with it by
 * tapping something else.
 *
 * Pure, like everything in `domain/`.
 */

import { MUSCLE_ORDER } from './muscles'
import type { MuscleGroup, SetType } from './types'

const DAY_MS = 86_400_000

/**
 * How far back the caller is expected to look.
 *
 * Reading every set ever logged to answer "how long ago" is the wrong shape of
 * query: the answer is recent by definition, and the Today screen is the one
 * screen whose cost is paid on every launch. Six months is long enough that
 * anything older is better described as "a long time" than as a figure, which
 * is exactly what {@link describeRecency} does with it.
 *
 * Exported so the query cutoff and the copy describing it cannot disagree.
 */
export const RECENCY_WINDOW_DAYS = 180

/** The minimum a set needs to expose to date a muscle. */
export interface RecencySet {
  readonly exerciseId: string
  readonly completedAt: number
  readonly type: SetType
  readonly reps?: number | undefined
}

export interface MuscleRecency {
  readonly muscle: MuscleGroup
  /**
   * The most recent working set for this muscle, epoch ms.
   *
   * Null means "trained at some point, but not inside the window" — which is
   * still worth showing, because a muscle you have not touched in half a year
   * is the strongest possible answer to what to train today.
   */
  readonly lastTrainedAt: number | null
  /** Whole days since, floored. Null travels with a null timestamp. */
  readonly daysSince: number | null
}

/**
 * How long since each muscle was last trained, longest-rested first.
 *
 * Attribution matches `weeklySets` in `domain/history`: a set is credited to its
 * exercise's primary mover, warm-ups do not count, and neither does a set with
 * no reps. A muscle's date therefore means "the last time you did real work for
 * it", not "the last time an exercise mentioning it appeared in a session".
 *
 * `trainedExerciseIds` is every exercise that has ever appeared in a session,
 * which is what lets a muscle last trained before the window still be listed —
 * as a null date rather than as a guess. Exercises added to a session and never
 * logged are included there, so a muscle can show up having only been intended;
 * that is a cheaper error than silently dropping a muscle you trained in March.
 *
 * Muscles with no history at all are absent entirely. A fresh install has
 * nothing to say about where to start, and fourteen "never" rows would be
 * noise dressed up as information.
 */
export function muscleRecency(
  sets: readonly RecencySet[],
  primaryMuscleByExercise: ReadonlyMap<string, MuscleGroup>,
  trainedExerciseIds: Iterable<string> = [],
  now: number = Date.now(),
): MuscleRecency[] {
  const latest = new Map<MuscleGroup, number>()

  for (const set of sets) {
    if (set.type === 'warmup') continue
    if ((set.reps ?? 0) <= 0) continue

    const muscle = primaryMuscleByExercise.get(set.exerciseId)
    if (!muscle) continue

    const current = latest.get(muscle)
    if (current == null || set.completedAt > current) latest.set(muscle, set.completedAt)
  }

  const known = new Set<MuscleGroup>(latest.keys())
  for (const exerciseId of trainedExerciseIds) {
    const muscle = primaryMuscleByExercise.get(exerciseId)
    if (muscle) known.add(muscle)
  }

  const rank = (muscle: MuscleGroup) => {
    const index = MUSCLE_ORDER.indexOf(muscle)
    return index === -1 ? MUSCLE_ORDER.length : index
  }

  return [...known]
    .map((muscle): MuscleRecency => {
      const lastTrainedAt = latest.get(muscle) ?? null
      return {
        muscle,
        lastTrainedAt,
        daysSince:
          lastTrainedAt == null ? null : Math.floor(Math.max(0, now - lastTrainedAt) / DAY_MS),
      }
    })
    .sort(
      (a, b) =>
        // Longest rested first, and "longer ago than the window" is longest of
        // all — it is the entry most worth seeing at the top.
        (a.daysSince == null ? -1 : 0) - (b.daysSince == null ? -1 : 0) ||
        (b.daysSince ?? 0) - (a.daysSince ?? 0) ||
        rank(a.muscle) - rank(b.muscle),
    )
}

/**
 * The last completed run of each routine, by routine id.
 *
 * Answers "have I already done Push A this week?" where the decision is made,
 * which is the same question as the muscle dates from the other end. Only
 * finished sessions count: an abandoned one is not a workout you did.
 */
export function lastRunByRoutine(
  sessions: readonly {
    readonly routineId?: string | undefined
    readonly startedAt: number
    readonly endedAt?: number | undefined
  }[],
): Map<string, number> {
  const latest = new Map<string, number>()

  for (const session of sessions) {
    if (session.routineId == null) continue
    if (session.endedAt == null) continue

    const current = latest.get(session.routineId)
    if (current == null || session.startedAt > current) {
      latest.set(session.routineId, session.startedAt)
    }
  }

  return latest
}

/**
 * How long ago, at the precision that matters when choosing what to train.
 *
 * Days up to a fortnight, then weeks, then months. "today" and "3d" are worth
 * telling apart; "47d" and "52d" are not, and showing them implies a precision
 * the decision does not have.
 */
export function describeAge(at: number, now: number = Date.now()): string {
  const days = Math.floor(Math.max(0, now - at) / DAY_MS)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 14) return `${days}d`
  if (days < 60) return `${Math.round(days / 7)}w`
  return `${Math.round(days / 30)}mo`
}

/**
 * `today` · `yesterday` · `5d ago` — a routine's last run, as a label.
 *
 * "ago" is added only where it reads: "5d ago" needs it and "today ago" is not
 * English, which is the whole reason this is a function rather than a template
 * at the call site.
 */
export function describeLastRun(at: number | undefined, now: number = Date.now()): string | null {
  if (at == null) return null
  const age = describeAge(at, now)
  return age === 'today' || age === 'yesterday' ? age : `${age} ago`
}

/** `today` · `4d` · `3w` · `6mo+` for a muscle beyond the window. */
export function describeRecency(entry: MuscleRecency, now: number = Date.now()): string {
  if (entry.lastTrainedAt == null) return `${Math.round(RECENCY_WINDOW_DAYS / 30)}mo+`
  return describeAge(entry.lastTrainedAt, now)
}
