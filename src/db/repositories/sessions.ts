import { isUniform, stripPlanWeights, summariseSetPlan } from '~/domain/set-plan'
import {
  countsAsSet,
  dropParentOf,
  dropsOf,
  hasDrops,
  isDrop,
  orderSets,
  renumberSets,
} from '~/domain/sets'
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
 * 3. **At most one session waiting to happen**, counting a plan as well as a
 *    workout in progress — see {@link getCurrentSession}.
 */

export const STALE_SESSION_MS = 8 * 60 * 60 * 1000

export async function getActiveSession(): Promise<Session | undefined> {
  return db.sessions.where('status').equals('active').first()
}

/** A workout set up ahead of time and not yet begun. At most one exists. */
export async function getPlannedSession(): Promise<Session | undefined> {
  return db.sessions.where('status').equals('planned').first()
}

/**
 * The session the app is currently holding, planned or in progress.
 *
 * In progress wins, though the two are not meant to coexist: every path that
 * creates one checks this first, so planning while training and starting a
 * second workout on top of a plan both resolve to the session that already
 * exists rather than making another. A backup merge is the one way to end up
 * with two plans, and `first()` picks one rather than breaking.
 */
export async function getCurrentSession(): Promise<Session | undefined> {
  return (await getActiveSession()) ?? (await getPlannedSession())
}

/** True when an active session is old enough that the user probably forgot it. */
export function isStale(session: Session, now = Date.now()): boolean {
  return now - session.startedAt > STALE_SESSION_MS
}

export async function startEmptySession(name = 'Workout'): Promise<string> {
  const existing = await getCurrentSession()
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

/**
 * Set up an empty workout to start later.
 *
 * The same row an empty workout would create, minus the clock: you add the
 * exercises on the sofa and the session begins when you tap Start at the gym.
 */
export async function planEmptySession(name = 'Workout'): Promise<string> {
  const existing = await getCurrentSession()
  if (existing) return existing.id

  const now = Date.now()
  const id = newId('ses')
  await db.sessions.add({
    id,
    name,
    // Provisional — `startPlannedSession` overwrites it. Set rather than left
    // out because every query that sorts sessions reads it.
    startedAt: now,
    plannedAt: now,
    status: 'planned',
  })
  return id
}

/**
 * Begin a workout that was planned earlier.
 *
 * **The clock starts here**, not when the plan was made: `startedAt` is
 * rewritten, so an hour on the sofa and a drive to the gym never land in the
 * duration of the session. Nothing else about the row changes — the routine
 * snapshot, the exercises and their targets are already exactly as planned.
 *
 * Returns false when there is nothing to start, or when a workout is somehow
 * already in progress; the caller has navigated somewhere by then and the
 * screen it lands on reads the database rather than a return value.
 */
export async function startPlannedSession(sessionId: string): Promise<boolean> {
  return db.transaction('rw', db.sessions, async () => {
    const session = await db.sessions.get(sessionId)
    if (!session || session.status !== 'planned') return false
    if (await getActiveSession()) return false

    await db.sessions.update(sessionId, { status: 'active', startedAt: Date.now() })
    return true
  })
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
      // Snapshotted like the targets are: re-measuring the machine later must
      // not change how this session's sets split into added and machine.
      ...(exercise?.machineWeightKg == null
        ? {}
        : { machineWeightKg: exercise.machineWeightKg }),
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

/**
 * Correct what this machine weighs, mid-workout.
 *
 * Writes both rows for the same reason `setExerciseRest` does — you are
 * standing in front of the machine, so this is a correction to a bad value
 * rather than a one-off — but it matters more here: the session's snapshot is
 * deliberately immune to later edits of the exercise, so without this there
 * would be no way to fix a wrong machine weight in the session you noticed it.
 *
 * Only the split changes. Sets already logged keep the totals they were logged
 * with, because that is what you lifted; what moves is how the *next* set
 * converts what you add.
 */
export async function setExerciseMachineWeight(
  sessionExerciseId: string,
  exerciseId: string,
  kg: number,
): Promise<void> {
  await db.transaction('rw', db.sessionExercises, db.exercises, async () => {
    await db.sessionExercises.update(sessionExerciseId, { machineWeightKg: kg })
    await db.exercises.update(exerciseId, { machineWeightKg: kg })
  })
}

/** Which target fields a swap rewrites. Everything else about a row survives. */
type TargetFields = Partial<
  Pick<
    SessionExercise,
    'targetSets' | 'targetRepsMin' | 'targetRepsMax' | 'isAmrap' | 'setPlan' | 'targetWeight'
  >
>

/**
 * The plan the replacement exercise inherits: the shape, minus the loads.
 *
 * Stripping the weights can turn a climb into straight sets — 60×8/70×8
 * becomes 8/8 — and a uniform ladder is never stored, so there the summary
 * alone describes it. No targets at all is a legitimate answer: a freestyle
 * exercise has none to carry.
 */
function carriedPlan(row: SessionExercise): TargetFields {
  if (row.setPlan && row.setPlan.length > 0) {
    const rungs = stripPlanWeights(row.setPlan)
    return {
      ...summariseSetPlan(rungs),
      ...(isUniform(rungs) ? {} : { setPlan: rungs }),
    }
  }

  if (row.targetSets == null) return {}

  return {
    targetSets: row.targetSets,
    targetRepsMin: row.targetRepsMin ?? 1,
    ...(row.targetRepsMax == null ? {} : { targetRepsMax: row.targetRepsMax }),
    isAmrap: row.isAmrap ?? false,
  }
}

/**
 * Swap an exercise for another one, mid-workout.
 *
 * The rack is taken, the machine is broken, your shoulder says no: the
 * substitution is a normal part of training, and without this the only way out
 * is to delete the exercise and add another, losing its place, its grouping and
 * its targets.
 *
 * **One row, re-pointed.** Sets hang off `sessionExerciseId`, so changing which
 * exercise that row names takes the sets with it — the card simply becomes the
 * new exercise, wherever you are in the workout. That is a decision about
 * history and not only about convenience: two sets logged on the bench become
 * two sets of what you swapped to, in the volume split, the charts and the
 * records path. It is what the swap is *for*; the alternative — stranding them
 * under an exercise you are no longer doing — reads as an add, not a swap.
 *
 * **What travels: the position and the shape of the work.** Order, superset
 * group, rest and the rep prescription. Not the absolute loads — see
 * {@link stripPlanWeights} — and not the notes, which described a setup for a
 * movement you are no longer doing.
 *
 * Returns the row id, or null when the row is gone.
 */
export async function swapSessionExercise(
  sessionExerciseId: string,
  exerciseId: string,
): Promise<string | null> {
  return db.transaction('rw', db.sessionExercises, db.exercises, async () => {
    const row = await db.sessionExercises.get(sessionExerciseId)
    if (!row) return null
    if (row.exerciseId === exerciseId) return row.id

    const replacement = await db.exercises.get(exerciseId)

    // Rest belongs to the exercise, so the replacement brings its own default
    // and only falls back to what this row was carrying. The machine weight is
    // snapshotted exactly as `addExerciseToSession` does it, and must be
    // ABSENT rather than stale when the new exercise is not a machine.
    //
    // `put` rather than `update`: the fields that must disappear — that stale
    // machine weight, the old exercise's notes, a target weight for a bar this
    // movement does not use — only go away if the row is rewritten whole.
    await db.sessionExercises.put({
      id: row.id,
      sessionId: row.sessionId,
      exerciseId,
      order: row.order,
      ...(replacement?.defaultRestSeconds != null
        ? { restSeconds: replacement.defaultRestSeconds }
        : row.restSeconds == null
          ? {}
          : { restSeconds: row.restSeconds }),
      ...(replacement?.machineWeightKg == null
        ? {}
        : { machineWeightKg: replacement.machineWeightKg }),
      ...(row.supersetGroup == null ? {} : { supersetGroup: row.supersetGroup }),
      ...carriedPlan(row),
    })

    return row.id
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
  /**
   * Log this as a drop off an existing working set rather than as a set.
   *
   * Sets `type` to `dropset` on its own — the two always travel together, so
   * the caller never has to state both and cannot state them inconsistently.
   */
  readonly parentSetId?: string | undefined
}

/**
 * Sets in display order: warm-ups, then working sets, each trailed by its drops.
 *
 * The rule itself lives in `domain/sets.ts` so it can be tested without a
 * database open. Every read of one exercise's sets comes through here, which is
 * why no screen has to sort them and no screen can sort them differently.
 */
export async function listSets(sessionExerciseId: string): Promise<SetEntry[]> {
  const rows = await db.sets.where('sessionExerciseId').equals(sessionExerciseId).toArray()
  return orderSets(rows)
}

/**
 * Append a set, or a drop off one.
 *
 * `setIndex` numbers each run independently — warm-ups, working sets, and the
 * drops of a single set — so the rows read W, W, 1, 2, D, D, 3, which is how
 * lifters actually count them.
 */
export async function logSet(
  sessionExerciseId: string,
  input: LogSetInput,
): Promise<string> {
  const id = newId('set')

  await db.transaction('rw', db.sets, async () => {
    const existing = await listSets(sessionExerciseId)

    // A drop needs a working set of this exercise to hang off. If it has none —
    // the parent was deleted on another tab mid-dropset, say — the rep still
    // happened, so it is logged as a set of its own rather than discarded.
    // Losing work is the one outcome worse than filing it in the wrong place.
    const parent = existing.find(
      (set) => set.id === input.parentSetId && countsAsSet(set),
    )
    const requested = input.type ?? 'normal'
    // A `dropset` with no parent is a row nothing can render in its right place,
    // so it is not a state this function will write.
    const type: SetType = parent ? 'dropset' : requested === 'dropset' ? 'normal' : requested

    const run = parent
      ? dropsOf(existing, parent.id)
      : existing.filter((set) => (type === 'warmup' ? set.type === 'warmup' : countsAsSet(set)))

    await db.sets.add({
      id,
      sessionExerciseId,
      setIndex: run.length + 1,
      type,
      completedAt: Date.now(),
      ...(parent ? { parentSetId: parent.id } : {}),
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

/**
 * Deletes a set and renumbers its siblings so indices stay contiguous.
 *
 * **A set's drops go with it.** They are part of that set rather than sets of
 * their own, so leaving them behind would strand 45 × 6 and 30 × 8 under an
 * exercise with nothing above them to explain where they came from — and they
 * would go on counting toward volume as work you had just said never happened.
 */
export async function deleteSet(setId: string): Promise<void> {
  await db.transaction('rw', db.sets, async () => {
    const set = await db.sets.get(setId)
    if (!set) return

    const siblings = await listSets(set.sessionExerciseId)
    const doomed = [setId, ...dropsOf(siblings, setId).map((drop) => drop.id)]
    await db.sets.bulkDelete(doomed)

    await renumber(set.sessionExerciseId)
  })
}

/**
 * Move a set to a different exercise.
 *
 * For the case where a set was logged against the wrong exercise — which is
 * easy to do mid-workout and otherwise only fixable by deleting and retyping
 * it. Both the old and new homes are renumbered, so neither is left with a
 * gap or a duplicate index.
 *
 * A dropset moves whole: the drops follow their parent, keeping the chain
 * intact. A drop cannot be moved on its own, because a drop that is not hanging
 * off anything is not a thing — the actions sheet does not offer it.
 */
export async function moveSetToExercise(
  setId: string,
  targetSessionExerciseId: string,
): Promise<void> {
  await db.transaction('rw', db.sets, async () => {
    const set = await db.sets.get(setId)
    if (!set || set.sessionExerciseId === targetSessionExerciseId) return
    if (isDrop(set)) return

    const from = set.sessionExerciseId
    const siblings = await listSets(from)
    const chain = dropsOf(siblings, setId)

    const target = await listSets(targetSessionExerciseId)
    const sameKind = target.filter((candidate) =>
      set.type === 'warmup' ? candidate.type === 'warmup' : countsAsSet(candidate),
    )

    await db.sets.update(setId, {
      sessionExerciseId: targetSessionExerciseId,
      setIndex: sameKind.length + 1,
    })
    await Promise.all(
      chain.map((drop) =>
        db.sets.update(drop.id, { sessionExerciseId: targetSessionExerciseId }),
      ),
    )

    await renumber(from)
    await renumber(targetSessionExerciseId)
  })
}

/**
 * Rewrite set indices so every run counts from one.
 *
 * One function rather than the copy that used to sit inside each caller: with
 * three runs to keep straight instead of two, three near-identical loops is
 * three chances to number drops differently depending on how you got there.
 */
async function renumber(sessionExerciseId: string): Promise<void> {
  const ordered = await listSets(sessionExerciseId)
  await Promise.all(
    renumberSets(ordered).map((row) => db.sets.update(row.id, { setIndex: row.setIndex })),
  )
}

/**
 * Flip a set between warm-up and working, renumbering both runs.
 *
 * Refused for anything to do with a dropset. A drop is not a warm-up by
 * definition — it is the heaviest thing you could still move — and a set with
 * drops hanging off it cannot become a ramp-up without taking real work out of
 * every total with it. The actions sheet hides the option in both cases; this
 * is the guard behind it.
 */
export async function toggleWarmup(setId: string): Promise<void> {
  await db.transaction('rw', db.sets, async () => {
    const set = await db.sets.get(setId)
    if (!set || isDrop(set)) return

    const siblings = await listSets(set.sessionExerciseId)
    if (hasDrops(siblings, setId)) return

    await db.sets.update(setId, { type: set.type === 'warmup' ? 'normal' : 'warmup' })
    await renumber(set.sessionExerciseId)
  })
}

/**
 * Turn a logged set into a drop of the one above it, or back into a set.
 *
 * The repair path, and the reason it exists: a dropset logged before Gymmy could
 * record one is sitting in history as three separate sets, and so is one logged
 * by someone who forgot to tap the drop chip. Both read as more hard sets than
 * were done, and there was no way to say so without deleting and retyping the
 * work.
 *
 * The parent is the nearest working set above it, which is the only candidate
 * that means anything: a drop follows the set it came off.
 *
 * Refused for a set that has drops of its own, because a drop of a drop is not
 * a shape this model has — or anything the gym has either.
 */
export async function toggleDrop(setId: string): Promise<void> {
  await db.transaction('rw', db.sets, async () => {
    const set = await db.sets.get(setId)
    if (!set) return

    const siblings = await listSets(set.sessionExerciseId)

    if (isDrop(set)) {
      // `put` rather than `update`: `parentSetId` has to be gone from the row,
      // not present and undefined, or the row stays a drop as far as every
      // query that looks for one is concerned.
      const { parentSetId: _promoted, ...rest } = set
      await db.sets.put({ ...rest, type: 'normal' })
      await renumber(set.sessionExerciseId)
      return
    }

    // The same rule the actions sheet reads to name the set in its label, so
    // what it says is what this writes.
    const above = dropParentOf(siblings, setId)
    if (!above) return

    await db.sets.update(setId, { type: 'dropset', parentSetId: above.id })
    await renumber(set.sessionExerciseId)
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
 * Every set of the most recent *other* session containing this exercise.
 *
 * Warm-ups and drops included — the callers filter. Prefill wants the working
 * sets, the drop row wants last session's chain, and handing each of them the
 * whole picture is what lets both read the same history rather than two
 * different queries that can disagree.
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
