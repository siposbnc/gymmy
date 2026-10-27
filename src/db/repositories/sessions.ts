import type { Session, SessionExercise, SetEntry, SetType } from '~/domain/types'
import { newId } from '~/lib/uuid'

import { db } from '../schema'

/**
 * Sessions and sets.
 *
 * Two invariants hold everything together:
 *
 * 1. **Every write lands immediately.** There is no "save workout" step that
 *    can be lost. The app can be killed mid-set and nothing but the half-typed
 *    number in the input goes with it.
 * 2. **At most one active session.** `status` is indexed precisely so recovery
 *    on launch is a single cheap lookup.
 */

export const STALE_SESSION_MS = 8 * 60 * 60 * 1000

export async function getActiveSession(): Promise<Session | undefined> {
  return db.sessions.where('status').equals('active').first()
}

/** True when an active session is old enough that the user probably forgot it. */
export function isStale(session: Session, now = Date.now()): boolean {
  return now - session.startedAt > STALE_SESSION_MS
}

export async function startEmptySession(name = 'Workout'): Promise<string> {
  const existing = await getActiveSession()
  if (existing) return existing.id

  const id = newId('ses')
  await db.sessions.add({
    id,
    name,
    startedAt: Date.now(),
    status: 'active',
  })
  return id
}

export async function renameSession(sessionId: string, name: string): Promise<void> {
  await db.sessions.update(sessionId, { name })
}

// ---------------------------------------------------------------------------
// Exercises within a session
// ---------------------------------------------------------------------------

export async function addExerciseToSession(
  sessionId: string,
  exerciseId: string,
): Promise<string> {
  const id = newId('sex')
  await db.transaction('rw', db.sessionExercises, db.exercises, async () => {
    const count = await db.sessionExercises.where('sessionId').equals(sessionId).count()
    const exercise = await db.exercises.get(exerciseId)
    await db.sessionExercises.add({
      id,
      sessionId,
      exerciseId,
      order: count,
      ...(exercise?.defaultRestSeconds == null
        ? {}
        : { restSeconds: exercise.defaultRestSeconds }),
    })
  })
  return id
}

export async function listSessionExercises(sessionId: string): Promise<SessionExercise[]> {
  const rows = await db.sessionExercises.where('sessionId').equals(sessionId).toArray()
  return rows.sort((a, b) => a.order - b.order)
}

/** Removes the exercise and every set under it — they cannot outlive it. */
export async function removeSessionExercise(sessionExerciseId: string): Promise<void> {
  await db.transaction('rw', db.sessionExercises, db.sets, async () => {
    await db.sets.where('sessionExerciseId').equals(sessionExerciseId).delete()
    await db.sessionExercises.delete(sessionExerciseId)
  })
}

/**
 * Change how long you rest after this exercise.
 *
 * Writes to both the session row (this workout) and the exercise row (every
 * future workout). Changing a rest length mid-session is almost always a
 * correction to a bad default rather than a one-off, so remembering it is the
 * behaviour that matches intent.
 */
export async function setExerciseRest(
  sessionExerciseId: string,
  exerciseId: string,
  seconds: number,
): Promise<void> {
  await db.transaction('rw', db.sessionExercises, db.exercises, async () => {
    await db.sessionExercises.update(sessionExerciseId, { restSeconds: seconds })
    await db.exercises.update(exerciseId, { defaultRestSeconds: seconds })
  })
}

export async function reorderSessionExercises(
  sessionId: string,
  orderedIds: readonly string[],
): Promise<void> {
  await db.transaction('rw', db.sessionExercises, async () => {
    await Promise.all(
      orderedIds.map((id, index) => db.sessionExercises.update(id, { order: index })),
    )
    // Anything not named keeps a stable position after the explicit list.
    const all = await db.sessionExercises.where('sessionId').equals(sessionId).toArray()
    const unnamed = all.filter((row) => !orderedIds.includes(row.id))
    await Promise.all(
      unnamed.map((row, index) =>
        db.sessionExercises.update(row.id, { order: orderedIds.length + index }),
      ),
    )
  })
}

// ---------------------------------------------------------------------------
// Sets
// ---------------------------------------------------------------------------

export interface LogSetInput {
  readonly weightKg?: number | undefined
  readonly reps?: number | undefined
  readonly rpe?: number | undefined
  readonly type?: SetType
}

/**
 * Sets in display order: warm-ups first, then working sets, each run by index.
 *
 * Sorting on `setIndex` alone is wrong, because the two runs are numbered
 * independently — it interleaves them as W1, 1, W2, 2. Grouping also means a
 * warm-up added after the fact still appears where it belongs rather than
 * stranded at the bottom.
 */
export async function listSets(sessionExerciseId: string): Promise<SetEntry[]> {
  const rows = await db.sets.where('sessionExerciseId').equals(sessionExerciseId).toArray()
  const rank = (set: SetEntry) => (set.type === 'warmup' ? 0 : 1)
  return rows.sort((a, b) => rank(a) - rank(b) || a.setIndex - b.setIndex)
}

/**
 * Append a set.
 *
 * `setIndex` numbers working sets independently of warm-ups, so the row labels
 * read W, W, 1, 2, 3 — which is how lifters actually count them.
 */
export async function logSet(
  sessionExerciseId: string,
  input: LogSetInput,
): Promise<string> {
  const id = newId('set')
  const type = input.type ?? 'normal'

  await db.transaction('rw', db.sets, async () => {
    const existing = await listSets(sessionExerciseId)
    const sameKind = existing.filter((set) =>
      type === 'warmup' ? set.type === 'warmup' : set.type !== 'warmup',
    )
    await db.sets.add({
      id,
      sessionExerciseId,
      setIndex: sameKind.length + 1,
      type,
      completedAt: Date.now(),
      ...(input.weightKg == null ? {} : { weightKg: input.weightKg }),
      ...(input.reps == null ? {} : { reps: input.reps }),
      ...(input.rpe == null ? {} : { rpe: input.rpe }),
    })
  })

  return id
}

export async function updateSet(
  setId: string,
  patch: Partial<Pick<SetEntry, 'weightKg' | 'reps' | 'rpe' | 'type'>>,
): Promise<void> {
  await db.sets.update(setId, patch)
}

/** Deletes a set and renumbers its siblings so indices stay contiguous. */
export async function deleteSet(setId: string): Promise<void> {
  await db.transaction('rw', db.sets, async () => {
    const set = await db.sets.get(setId)
    if (!set) return
    await db.sets.delete(setId)

    const remaining = await listSets(set.sessionExerciseId)
    let working = 0
    let warmup = 0
    await Promise.all(
      remaining.map((row) => {
        const nextIndex = row.type === 'warmup' ? ++warmup : ++working
        return row.setIndex === nextIndex
          ? Promise.resolve(0)
          : db.sets.update(row.id, { setIndex: nextIndex })
      }),
    )
  })
}

/** Flip a set between warm-up and working, renumbering both runs. */
export async function toggleWarmup(setId: string): Promise<void> {
  await db.transaction('rw', db.sets, async () => {
    const set = await db.sets.get(setId)
    if (!set) return
    await db.sets.update(setId, { type: set.type === 'warmup' ? 'normal' : 'warmup' })

    const remaining = await listSets(set.sessionExerciseId)
    let working = 0
    let warmup = 0
    await Promise.all(
      remaining.map((row) => {
        const nextIndex = row.type === 'warmup' ? ++warmup : ++working
        return row.setIndex === nextIndex
          ? Promise.resolve(0)
          : db.sets.update(row.id, { setIndex: nextIndex })
      }),
    )
  })
}

// ---------------------------------------------------------------------------
// Finishing
// ---------------------------------------------------------------------------

export async function finishSession(sessionId: string): Promise<void> {
  await db.sessions.update(sessionId, { status: 'completed', endedAt: Date.now() })
}

/** Throws away an active session and everything under it. */
export async function discardSession(sessionId: string): Promise<void> {
  await db.transaction('rw', db.sessions, db.sessionExercises, db.sets, async () => {
    const exercises = await db.sessionExercises.where('sessionId').equals(sessionId).toArray()
    await Promise.all(
      exercises.map((row) => db.sets.where('sessionExerciseId').equals(row.id).delete()),
    )
    await db.sessionExercises.where('sessionId').equals(sessionId).delete()
    await db.sessions.delete(sessionId)
  })
}

// ---------------------------------------------------------------------------
// History — what prefill and the ghost line read from
// ---------------------------------------------------------------------------

/**
 * The working sets of the most recent *other* session containing this exercise.
 *
 * Deliberately excludes the current session: prefill's carry-forward tier
 * already handles "what you just did", and mixing the two here would make this
 * function's result depend on how far through the workout you are.
 */
export async function getPreviousSets(
  exerciseId: string,
  excludeSessionId?: string,
): Promise<SetEntry[]> {
  const links = await db.sessionExercises.where('exerciseId').equals(exerciseId).toArray()
  const candidates = links.filter((link) => link.sessionId !== excludeSessionId)
  if (candidates.length === 0) return []

  const sessions = await db.sessions.bulkGet(candidates.map((link) => link.sessionId))
  const pairs = candidates
    .map((link, index) => ({ link, session: sessions[index] }))
    .filter(
      (pair): pair is { link: SessionExercise; session: Session } =>
        pair.session != null && pair.session.status === 'completed',
    )
    .sort((a, b) => b.session.startedAt - a.session.startedAt)

  const mostRecent = pairs[0]
  if (!mostRecent) return []

  return listSets(mostRecent.link.id)
}
