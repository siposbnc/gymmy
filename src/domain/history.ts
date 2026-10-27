import { estimateOneRepMax } from './metrics/one-rep-max'
import { setVolume } from './metrics/volume'
import type { MuscleGroup, SetType } from './types'

/**
 * Aggregations over training history.
 *
 * Pure, like everything in `domain/`: these take plain arrays and return plain
 * numbers, so the charts can be tested without rendering anything and the
 * numbers can be tested without a chart.
 */

export interface HistorySet {
  readonly sessionId: string
  readonly exerciseId: string
  readonly completedAt: number
  readonly type: SetType
  readonly weightKg?: number | undefined
  readonly reps?: number | undefined
}

export interface HistorySession {
  readonly id: string
  readonly startedAt: number
  readonly endedAt?: number | undefined
}

// ---------------------------------------------------------------------------
// Per-exercise series — what the progress charts plot
// ---------------------------------------------------------------------------

export interface ExercisePoint {
  readonly sessionId: string
  /** Start of the session, which is what the x-axis uses. */
  readonly at: number
  /** Heaviest working set that session. */
  readonly topSetKg: number
  readonly topSetReps: number
  /** Best estimate across the session's sets, or null if none qualified. */
  readonly estimatedOneRepMax: number | null
  readonly volumeKg: number
}

/**
 * One point per session for a single exercise, oldest first.
 *
 * `estimatedOneRepMax` is null whenever no set in the session was in the
 * 1–12 rep range. Null rather than zero, and rather than carrying the previous
 * value forward: a gap in the line is honest, a flat line is a lie.
 */
export function exerciseSeries(
  exerciseId: string,
  sets: readonly HistorySet[],
  sessions: readonly HistorySession[],
): ExercisePoint[] {
  const startedAt = new Map(sessions.map((session) => [session.id, session.startedAt]))
  const bySession = new Map<string, HistorySet[]>()

  for (const set of sets) {
    if (set.exerciseId !== exerciseId) continue
    if (set.type === 'warmup') continue
    if ((set.reps ?? 0) <= 0) continue
    const bucket = bySession.get(set.sessionId)
    if (bucket) bucket.push(set)
    else bySession.set(set.sessionId, [set])
  }

  const points: ExercisePoint[] = []

  for (const [sessionId, sessionSets] of bySession) {
    const at = startedAt.get(sessionId)
    if (at == null) continue

    let top = sessionSets[0]!
    for (const set of sessionSets) {
      if ((set.weightKg ?? 0) > (top.weightKg ?? 0)) top = set
    }

    let bestEstimate: number | null = null
    for (const set of sessionSets) {
      if (set.weightKg == null || set.reps == null) continue
      const estimate = estimateOneRepMax({ weightKg: set.weightKg, reps: set.reps })
      if (estimate != null && (bestEstimate == null || estimate > bestEstimate)) {
        bestEstimate = estimate
      }
    }

    points.push({
      sessionId,
      at,
      topSetKg: top.weightKg ?? 0,
      topSetReps: top.reps ?? 0,
      estimatedOneRepMax: bestEstimate,
      volumeKg: sessionSets.reduce((sum, set) => sum + setVolume(set), 0),
    })
  }

  return points.sort((a, b) => a.at - b.at)
}

// ---------------------------------------------------------------------------
// Weekly volume by muscle group
// ---------------------------------------------------------------------------

/** Start-of-week timestamp for a date, respecting the user's week start. */
export function startOfWeek(timestamp: number, weekStartsOn: 0 | 1): number {
  const date = new Date(timestamp)
  date.setHours(0, 0, 0, 0)
  const shift = (date.getDay() - weekStartsOn + 7) % 7
  date.setDate(date.getDate() - shift)
  return date.getTime()
}

export interface WeeklyVolume {
  readonly weekStart: number
  readonly totalKg: number
  readonly byMuscle: Readonly<Partial<Record<MuscleGroup, number>>>
  readonly sessionIds: readonly string[]
}

/**
 * Volume per week, split by muscle group.
 *
 * A set's volume is credited in full to its exercise's PRIMARY muscle only,
 * not divided among every muscle involved. Splitting it would make the numbers
 * look rigorous while being arbitrary — nobody knows what fraction of a bench
 * press is "chest". Whole-number attribution to the primary mover is a
 * simplification, but it is an honest one, and it is stated in the explainer.
 */
export function weeklyVolume(
  sets: readonly HistorySet[],
  primaryMuscleByExercise: ReadonlyMap<string, MuscleGroup>,
  weekStartsOn: 0 | 1,
): WeeklyVolume[] {
  const weeks = new Map<
    number,
    { total: number; byMuscle: Partial<Record<MuscleGroup, number>>; sessions: Set<string> }
  >()

  for (const set of sets) {
    const volume = setVolume(set)
    if (volume <= 0) continue

    const weekStart = startOfWeek(set.completedAt, weekStartsOn)
    const week = weeks.get(weekStart) ?? { total: 0, byMuscle: {}, sessions: new Set<string>() }

    week.total += volume
    week.sessions.add(set.sessionId)

    const muscle = primaryMuscleByExercise.get(set.exerciseId)
    if (muscle) week.byMuscle[muscle] = (week.byMuscle[muscle] ?? 0) + volume

    weeks.set(weekStart, week)
  }

  return [...weeks.entries()]
    .map(([weekStart, week]) => ({
      weekStart,
      totalKg: week.total,
      byMuscle: week.byMuscle,
      sessionIds: [...week.sessions],
    }))
    .sort((a, b) => a.weekStart - b.weekStart)
}

// ---------------------------------------------------------------------------
// Streak
// ---------------------------------------------------------------------------

export interface Streak {
  /** Consecutive completed weeks that met the goal, not counting this one. */
  readonly weeks: number
  /** Sessions logged in the current week so far. */
  readonly thisWeek: number
  readonly goal: number
  /** True once this week has met the goal too. */
  readonly currentWeekMet: boolean
}

/**
 * How many weeks in a row you hit your session goal.
 *
 * Counted in WEEKS, not days. Rest days are part of training, not a failure,
 * and a day-based streak punishes the programme working as intended.
 *
 * The current week never breaks the streak — it has not finished yet, so a
 * Tuesday cannot fail a three-session week.
 */
export function computeStreak(
  sessions: readonly HistorySession[],
  goal: number,
  weekStartsOn: 0 | 1,
  now = Date.now(),
): Streak {
  const completed = sessions.filter((session) => session.endedAt != null)
  const perWeek = new Map<number, number>()

  for (const session of completed) {
    const week = startOfWeek(session.startedAt, weekStartsOn)
    perWeek.set(week, (perWeek.get(week) ?? 0) + 1)
  }

  const currentWeek = startOfWeek(now, weekStartsOn)
  const thisWeek = perWeek.get(currentWeek) ?? 0
  const safeGoal = Math.max(1, goal)

  // Step by calendar date, not by a fixed 7×24h. A week spanning a DST change
  // is 23 or 25 hours longer, so subtracting a constant lands an hour off the
  // week boundary and silently misses that week entirely — which would reset a
  // real streak to zero twice a year.
  let weeks = 0
  const cursor = new Date(currentWeek)
  cursor.setDate(cursor.getDate() - 7)

  while ((perWeek.get(startOfWeek(cursor.getTime(), weekStartsOn)) ?? 0) >= safeGoal) {
    weeks += 1
    cursor.setDate(cursor.getDate() - 7)
  }

  return {
    weeks,
    thisWeek,
    goal: safeGoal,
    currentWeekMet: thisWeek >= safeGoal,
  }
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

/** Local-midnight timestamp, used as a stable per-day key. */
export function startOfDay(timestamp: number): number {
  const date = new Date(timestamp)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

/** Which days have a completed session, for dotting the calendar. */
export function trainingDays(sessions: readonly HistorySession[]): Set<number> {
  const days = new Set<number>()
  for (const session of sessions) {
    if (session.endedAt == null) continue
    days.add(startOfDay(session.startedAt))
  }
  return days
}

/** The days of a month, padded to whole weeks for a 7-column grid. */
export function monthGrid(year: number, month: number, weekStartsOn: 0 | 1): number[] {
  const first = new Date(year, month, 1)
  const start = startOfWeek(first.getTime(), weekStartsOn)

  const last = new Date(year, month + 1, 0)
  const end = startOfWeek(last.getTime(), weekStartsOn) + 6 * 24 * 60 * 60 * 1000

  const days: number[] = []
  // Step by calendar date rather than by 24h, so DST transitions cannot drop
  // or duplicate a day.
  const cursor = new Date(start)
  while (cursor.getTime() <= end) {
    days.push(startOfDay(cursor.getTime()))
    cursor.setDate(cursor.getDate() + 1)
  }
  return days
}
