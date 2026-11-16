import { setVolume } from './metrics/volume'
import type { SetEntry } from './types'

/**
 * What a shareable session card says.
 *
 * Pure, and separate from the drawing, for the usual reason: choosing the top
 * set of an exercise is a decision worth being correct about and testable
 * without a canvas, while the drawing is pixels and cannot be asserted on
 * meaningfully.
 *
 * It reads the session that was logged and nothing else. No body weight, no
 * settings, no notes, nothing device-local — the same stance a share code
 * takes, for the same reason: a picture that leaves your phone is a decision
 * about what leaves your phone.
 */

/** One exercise's heaviest working set. */
export interface SessionCardLine {
  readonly name: string
  /** Absent for bodyweight work, which the card says in words. */
  readonly weightKg?: number | undefined
  readonly reps: number
  /** This exercise set a record in this session. */
  readonly isRecord: boolean
}

export interface SessionCardData {
  readonly title: string
  /** Session start, epoch ms. Formatted by the caller, which knows the locale. */
  readonly at: number
  readonly durationSeconds: number | null
  readonly workingSets: number
  readonly volumeKg: number
  readonly lines: SessionCardLine[]
  /** Exercises that did not fit, as a count. Zero means the card is complete. */
  readonly hiddenExercises: number
  readonly recordCount: number
}

/**
 * How many exercise rows fit before the card stops being glanceable.
 *
 * Five, then a "+2 more". A card is read in the second someone spends
 * scrolling past it, and a full twelve-row workout log is a spreadsheet.
 */
export const CARD_LINE_LIMIT = 5

export interface SessionCardInput {
  readonly session: {
    readonly name: string
    readonly startedAt: number
    readonly endedAt?: number | undefined
  }
  /** In the order they were performed, which is the order the card shows. */
  readonly exercises: readonly {
    readonly exerciseId: string
    readonly name: string
    readonly sets: readonly SetEntry[]
  }[]
  /** Exercises that earned a record in this session. */
  readonly recordExerciseIds: readonly string[]
}

/**
 * The card's contents, from a session that has been logged.
 *
 * **The top set, not the last one.** What you would tell someone about an
 * exercise is the heaviest set you took it to; a drop set or a back-off would
 * otherwise be the number on the card. Ties on weight go to the one with more
 * reps, because at the same load that is the better set.
 *
 * Warm-ups are excluded, exactly as they are from volume and records — a ramp
 * is real data about how you got there, not a thing to show. An exercise with
 * nothing but warm-ups contributes no row at all rather than a row saying
 * nothing.
 *
 * Exercises keep the order they were trained in. Sorting by weight would make
 * the card a leaderboard of your own session and lose the shape of the workout.
 */
export function buildSessionCard(input: SessionCardInput): SessionCardData {
  const { session, exercises, recordExerciseIds } = input
  const records = new Set(recordExerciseIds)

  const allLines: SessionCardLine[] = []
  let workingSets = 0
  let volumeKg = 0

  for (const exercise of exercises) {
    const working = exercise.sets.filter(
      (set) => set.type !== 'warmup' && (set.reps ?? 0) > 0,
    )
    workingSets += working.length
    for (const set of working) volumeKg += setVolume(set)

    const top = working.reduce<SetEntry | null>((best, set) => {
      if (best == null) return set
      const heavier = (set.weightKg ?? 0) - (best.weightKg ?? 0)
      if (heavier > 0) return set
      if (heavier < 0) return best
      return (set.reps ?? 0) > (best.reps ?? 0) ? set : best
    }, null)

    if (top == null) continue

    allLines.push({
      name: exercise.name,
      ...(top.weightKg == null ? {} : { weightKg: top.weightKg }),
      reps: top.reps ?? 0,
      isRecord: records.has(exercise.exerciseId),
    })
  }

  return {
    title: session.name,
    at: session.startedAt,
    durationSeconds:
      session.endedAt == null ? null : Math.max(0, (session.endedAt - session.startedAt) / 1000),
    workingSets,
    volumeKg,
    lines: allLines.slice(0, CARD_LINE_LIMIT),
    hiddenExercises: Math.max(0, allLines.length - CARD_LINE_LIMIT),
    recordCount: records.size,
  }
}
