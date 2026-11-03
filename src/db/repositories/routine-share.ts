import {
  buildSharedRoutine,
  bytesToPayload,
  formatShareCode,
  payloadToBytes,
  planImport,
  readShareCode,
  ShareCodeError,
  type ImportPlan,
} from '~/domain/routine-share'
import type { Exercise } from '~/domain/types'
import { deflate, inflate } from '~/lib/compress'

import { db } from '../schema'
import { createRoutineFromDraft, listRoutineExercises } from './routines'

/**
 * Sharing a routine with another person.
 *
 * The database half of `domain/routine-share`: this reads the rows, hands them
 * to the pure code, and wraps the result in deflate. Nothing here decides what
 * a share code means.
 */

/** Produce the code to copy. */
export async function buildRoutineShareCode(routineId: string): Promise<string> {
  const routine = await db.routines.get(routineId)
  if (!routine) throw new Error('Routine not found')

  const entries = await listRoutineExercises(routineId)
  if (entries.length === 0) {
    throw new ShareCodeError('Add an exercise to this routine before sharing it.')
  }

  const exercises = (
    await Promise.all(entries.map((entry) => db.exercises.get(entry.exerciseId)))
  ).filter((exercise): exercise is Exercise => exercise != null)

  const payload = buildSharedRoutine({ routine, entries, exercises })
  return formatShareCode(await deflate(payloadToBytes(payload)))
}

/**
 * Work out what a pasted code would do, without writing anything.
 *
 * The import sheet shows this and commits exactly it. Importing a plan blind
 * is how you end up with exercises you did not ask for in your library.
 */
export async function planRoutineImport(code: string): Promise<ImportPlan> {
  const compressed = readShareCode(code)

  let bytes: Uint8Array
  try {
    bytes = await inflate(compressed)
  } catch {
    // Truncated in a message, or edited by hand. Either way the user's next
    // move is "ask for the code again", which needs a sentence, not a stack.
    throw new ShareCodeError('That code is incomplete — it did not unpack. Ask for it again.')
  }

  const payload = bytesToPayload(bytes)

  // Archived exercises are included deliberately: a match against one is still
  // the same movement, and importing a duplicate of something you archived is
  // worse than pointing at it.
  const existing = await db.exercises.toArray()
  return planImport(payload, existing)
}

export interface ImportOutcome {
  routineId: string
  /** How many exercises had to be added to the library. */
  created: number
}

/**
 * Write the plan that was shown.
 *
 * One transaction covering the new exercises and the routine together —
 * `createRoutineFromDraft` asks for a subset of these tables, so Dexie nests
 * it into this one. A failure halfway cannot leave an exercise in your library
 * with no routine using it.
 */
export async function importRoutinePlan(plan: ImportPlan): Promise<ImportOutcome> {
  let created = 0
  let routineId = ''

  await db.transaction('rw', db.exercises, db.routines, db.routineExercises, async () => {
    for (const entry of plan.entries) {
      if (!entry.create) continue
      // Re-checked inside the transaction rather than trusted from the plan:
      // the same code imported twice would otherwise collide on the primary
      // key. An id that now exists is the match case, and the draft already
      // points at it.
      if ((await db.exercises.get(entry.create.id)) != null) continue

      await db.exercises.add({ ...entry.create, isCustom: true })
      created += 1
    }

    routineId = await createRoutineFromDraft({
      ...plan.routine,
      exercises: plan.entries.map((entry) => entry.draft),
    })
  })

  return { routineId, created }
}
