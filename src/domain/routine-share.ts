/**
 * Routine share codes.
 *
 * A routine is the one thing in Gymmy worth handing to another person: it is
 * a plan, not a history. So this is a deliberately narrow channel — a routine,
 * its exercises and its targets, and nothing else. No sets, no records, no
 * body weight, no settings.
 *
 * The code is text rather than a file because a file is a share-sheet dance on
 * iOS, while a string goes into any message and comes back with a paste. It
 * carries a readable marker so a wrong paste fails with a sentence rather than
 * a parse error, and a version so a future format can be told apart instead of
 * guessed at.
 *
 * ## What is hard here
 *
 * Not the encoding — exercise identity. Built-in exercises have stable slug
 * ids (`bench-press`), so they travel as ids. A custom exercise does not exist
 * on the recipient's device at all, so the code has to carry enough to rebuild
 * it. Definitions are carried for *every* referenced exercise, built-ins
 * included: the recipient may be on an older build whose seed library predates
 * one of them, and an installed PWA can sit on a cached version for weeks.
 * A routine that imports with "Unknown exercise" in it is the one failure a
 * share feature cannot afford.
 *
 * ## Why so much of this degrades rather than rejects
 *
 * The only hard gate is the version. Everything below it that *could* come
 * from a newer Gymmy — an equipment kind, a muscle group, a target-weight
 * variant — is normalised toward something sensible instead of failing the
 * whole import. Losing "this is a kettlebell" is a scratch; losing the routine
 * is the feature not working.
 *
 * Pure: bytes in, bytes out. The compression sandwich lives in `lib/compress`
 * and the database half in the repository, so everything below is testable
 * with nothing mounted.
 */

import { z } from 'zod'

import { MUSCLE_ORDER } from './muscles'
import type { RoutineExerciseDraft } from './routine-draft'
import type {
  Equipment,
  Exercise,
  Id,
  MovementType,
  MuscleGroup,
  TrackingType,
  VolumeGoal,
} from './types'

/**
 * Bytes backed by a plain `ArrayBuffer`.
 *
 * Spelled out because `Uint8Array` defaults to `ArrayBufferLike`, which
 * includes `SharedArrayBuffer` — and the compression streams these bytes feed
 * will not take one.
 */
type Bytes = Uint8Array<ArrayBuffer>

/** `GYMMY-R1.<base64url>`. The dot keeps the marker legible and URL-safe. */
export const SHARE_CODE_PREFIX = 'GYMMY-R'
export const SHARE_CODE_VERSION = 1

// ---------------------------------------------------------------------------
// The payload
// ---------------------------------------------------------------------------

/**
 * Field names are spelled out rather than shortened to single letters.
 *
 * Deflate collapses repeated keys to almost nothing — the keys are the most
 * compressible part of the whole payload — so the usual reason to obfuscate a
 * wire format does not apply, and a code that can be eyeballed after a manual
 * base64 decode is worth more than the handful of bytes.
 */
export interface SharedExercise {
  id: Id
  name: string
  muscleGroups: MuscleGroup[]
  equipment: Equipment
  movementType: MovementType
  trackingType: TrackingType
  defaultRestSeconds: number
}

export interface SharedEntry {
  exerciseId: Id
  targetSets: number
  targetRepsMin: number
  targetRepsMax?: number
  isAmrap: boolean
  targetWeight?: { kind: 'absolute'; kg: number } | { kind: 'percent'; pct: number; basis: 'training_max' }
  restSeconds?: number
  supersetGroup?: number
  notes?: string
}

export interface SharedRoutine {
  version: number
  name: string
  notes?: string
  accentColor?: string
  volumeGoal?: VolumeGoal
  /** Ordered. Position in the array *is* the order; no index is carried. */
  entries: SharedEntry[]
  /** A definition for every exercise `entries` refers to. */
  library: SharedExercise[]
}

/**
 * Tolerance lists, not a source of truth.
 *
 * An unrecognised value here is normalised to the fallback beside it rather
 * than rejected, so these falling behind `domain/types` is harmless by
 * construction — which is the only reason duplicating the unions is
 * acceptable.
 */
const EQUIPMENT: readonly Equipment[] = [
  'barbell',
  'dumbbell',
  'machine',
  'cable',
  'bodyweight',
  'kettlebell',
  'band',
  'smith',
  'other',
]
const MOVEMENTS: readonly MovementType[] = ['compound', 'isolation']
const TRACKING: readonly TrackingType[] = ['weight_reps', 'reps_only', 'time', 'distance_time']

const targetWeightSchema = z.union([
  z.object({ kind: z.literal('absolute'), kg: z.number().positive().max(2000) }),
  z.object({
    kind: z.literal('percent'),
    pct: z.number().positive().max(200),
    basis: z.literal('training_max'),
  }),
])

const volumeGoalSchema = z.union([
  z.object({ kind: z.literal('beat_last') }),
  z.object({ kind: z.literal('absolute'), kg: z.number().positive().max(1_000_000) }),
])

/**
 * Bounds exist to catch a damaged code, not to police programming.
 *
 * Thirty sets of one exercise is absurd but possible; `1e9` sets is not a
 * routine, it is a corrupted byte — and importing it would write a row the
 * builder cannot render.
 */
const entrySchema = z.object({
  exerciseId: z.string().min(1).max(200),
  targetSets: z.number().int().min(1).max(50),
  targetRepsMin: z.number().int().min(1).max(500),
  targetRepsMax: z.number().int().min(1).max(500).optional().catch(undefined),
  isAmrap: z.boolean().catch(false),
  targetWeight: targetWeightSchema.optional().catch(undefined),
  restSeconds: z.number().int().min(0).max(3600).optional().catch(undefined),
  supersetGroup: z.number().int().min(0).max(50).optional().catch(undefined),
  notes: z.string().max(2000).optional().catch(undefined),
})

const librarySchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  // Normalised after parsing; an unknown muscle is dropped, not fatal.
  muscleGroups: z.array(z.string()).catch([]),
  equipment: z.string().catch('other'),
  movementType: z.string().catch('compound'),
  trackingType: z.string().catch('weight_reps'),
  defaultRestSeconds: z.number().int().min(0).max(3600).catch(120),
})

const payloadSchema = z.object({
  version: z.number().int().positive(),
  name: z.string().min(1).max(200),
  notes: z.string().max(4000).optional().catch(undefined),
  accentColor: z.string().max(40).optional().catch(undefined),
  volumeGoal: volumeGoalSchema.optional().catch(undefined),
  entries: z.array(entrySchema).min(1).max(100),
  library: z.array(librarySchema).max(100).catch([]),
})

/**
 * A failure with something worth showing the user.
 *
 * Every rejection path below has a sentence attached, because "unexpected
 * token < in JSON" is not a thing to put in front of someone who has just
 * pasted a message from a friend.
 */
export class ShareCodeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ShareCodeError'
  }
}

// ---------------------------------------------------------------------------
// Building a payload
// ---------------------------------------------------------------------------

/**
 * Pack a routine for sharing.
 *
 * Stripped deliberately: `barId` (bar ids are device-local, and a plate
 * calculation pointing at someone else's bar is worse than no bar at all),
 * the exercise's `notes` (documented as the user's own), and `pinnedAt` /
 * `archivedAt` / `isCustom`, which describe the sender's library rather than
 * the exercise. Routine notes *are* carried: they are plan instructions.
 *
 * `description` is left out for a different reason — size. The seeded prose is
 * two thirds of a compressed code (1067 characters down to 580 for a
 * six-exercise routine), the recipient's own library already has it for
 * anything built-in, and an exercise without one is a state the model already
 * allows for.
 */
export function buildSharedRoutine(input: {
  routine: { name: string; notes?: string | undefined; accentColor?: string | undefined; volumeGoal?: VolumeGoal | undefined }
  entries: readonly {
    exerciseId: Id
    targetSets: number
    targetRepsMin: number
    targetRepsMax?: number | undefined
    isAmrap: boolean
    targetWeight?: SharedEntry['targetWeight'] | undefined
    restSeconds?: number | undefined
    supersetGroup?: number | undefined
    notes?: string | undefined
  }[]
  exercises: readonly Exercise[]
}): SharedRoutine {
  const referenced = new Set(input.entries.map((entry) => entry.exerciseId))

  return {
    version: SHARE_CODE_VERSION,
    name: input.routine.name,
    ...(input.routine.notes ? { notes: input.routine.notes } : {}),
    ...(input.routine.accentColor ? { accentColor: input.routine.accentColor } : {}),
    ...(input.routine.volumeGoal == null ? {} : { volumeGoal: input.routine.volumeGoal }),
    entries: input.entries.map((entry) => ({
      exerciseId: entry.exerciseId,
      targetSets: entry.targetSets,
      targetRepsMin: entry.targetRepsMin,
      ...(entry.targetRepsMax == null ? {} : { targetRepsMax: entry.targetRepsMax }),
      isAmrap: entry.isAmrap,
      ...(entry.targetWeight == null ? {} : { targetWeight: entry.targetWeight }),
      ...(entry.restSeconds == null ? {} : { restSeconds: entry.restSeconds }),
      ...(entry.supersetGroup == null ? {} : { supersetGroup: entry.supersetGroup }),
      ...(entry.notes ? { notes: entry.notes } : {}),
    })),
    library: input.exercises
      .filter((exercise) => referenced.has(exercise.id))
      .map((exercise) => ({
        id: exercise.id,
        name: exercise.name,
        muscleGroups: [...exercise.muscleGroups],
        equipment: exercise.equipment,
        movementType: exercise.movementType,
        trackingType: exercise.trackingType,
        defaultRestSeconds: exercise.defaultRestSeconds,
      })),
  }
}

// ---------------------------------------------------------------------------
// Encoding
// ---------------------------------------------------------------------------

/** JSON → UTF-8 bytes. The caller compresses; this stays pure. */
export function payloadToBytes(payload: SharedRoutine): Bytes {
  return new TextEncoder().encode(JSON.stringify(payload))
}

/**
 * Bytes → a validated payload.
 *
 * The version gate is the one hard rejection, and it comes first: a newer
 * format could parse *partially* under this schema, and a routine that
 * imports with half its targets missing is worse than one that refuses.
 */
export function bytesToPayload(bytes: Uint8Array): SharedRoutine {
  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw new ShareCodeError('That code is damaged — it did not decode to anything readable.')
  }

  const version = (parsed as { version?: unknown } | null)?.version
  if (typeof version === 'number' && version > SHARE_CODE_VERSION) {
    throw new ShareCodeError(
      'That routine was shared from a newer version of Gymmy. Update the app, then import it again.',
    )
  }

  const result = payloadSchema.safeParse(parsed)
  if (!result.success) {
    throw new ShareCodeError('That code is damaged — it is not a routine Gymmy can read.')
  }

  const payload = result.data
  return {
    version: payload.version,
    name: payload.name,
    ...(payload.notes ? { notes: payload.notes } : {}),
    ...(payload.accentColor ? { accentColor: payload.accentColor } : {}),
    ...(payload.volumeGoal == null ? {} : { volumeGoal: payload.volumeGoal }),
    entries: payload.entries.map((entry) => ({
      exerciseId: entry.exerciseId,
      targetSets: entry.targetSets,
      targetRepsMin: entry.targetRepsMin,
      // A max below the min is nonsense rather than a range, so it goes.
      ...(entry.targetRepsMax != null && entry.targetRepsMax > entry.targetRepsMin
        ? { targetRepsMax: entry.targetRepsMax }
        : {}),
      isAmrap: entry.isAmrap,
      ...(entry.targetWeight == null ? {} : { targetWeight: entry.targetWeight }),
      ...(entry.restSeconds == null ? {} : { restSeconds: entry.restSeconds }),
      ...(entry.supersetGroup == null ? {} : { supersetGroup: entry.supersetGroup }),
      ...(entry.notes ? { notes: entry.notes } : {}),
    })),
    library: payload.library.map(normaliseSharedExercise),
  }
}

function normaliseSharedExercise(raw: z.infer<typeof librarySchema>): SharedExercise {
  const muscles = raw.muscleGroups.filter((value): value is MuscleGroup =>
    (MUSCLE_ORDER as readonly string[]).includes(value),
  )

  return {
    id: raw.id,
    name: raw.name,
    // Something has to count toward weekly volume, and `full_body` is the one
    // group that claims nothing specific.
    muscleGroups: muscles.length > 0 ? muscles : ['full_body'],
    equipment: pick(EQUIPMENT, raw.equipment, 'other'),
    movementType: pick(MOVEMENTS, raw.movementType, 'compound'),
    trackingType: pick(TRACKING, raw.trackingType, 'weight_reps'),
    defaultRestSeconds: raw.defaultRestSeconds,
  }
}

function pick<T extends string>(allowed: readonly T[], value: string, fallback: T): T {
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

// ---------------------------------------------------------------------------
// base64url
// ---------------------------------------------------------------------------

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

/**
 * Hand-rolled rather than `btoa`.
 *
 * `btoa` throws on any code point above U+00FF, so the first routine called
 * "Láb nap" would have broken it — and it produces `+/=`, which a messaging
 * app may line-wrap and a URL must escape. This emits the URL-safe alphabet
 * with no padding, over bytes, so the input is already UTF-8 by the time it
 * gets here.
 */
export function toBase64Url(bytes: Uint8Array): string {
  let out = ''
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index]!
    const b = bytes[index + 1]
    const c = bytes[index + 2]

    out += ALPHABET[a >> 2]
    out += ALPHABET[((a & 0b11) << 4) | ((b ?? 0) >> 4)]
    if (b === undefined) break
    out += ALPHABET[((b & 0b1111) << 2) | ((c ?? 0) >> 6)]
    if (c === undefined) break
    out += ALPHABET[c & 0b111111]
  }
  return out
}

export function fromBase64Url(text: string): Bytes {
  const bits: number[] = []
  for (const character of text) {
    const value = ALPHABET.indexOf(character)
    if (value < 0) {
      throw new ShareCodeError('That code has characters in it that are not part of a routine code.')
    }
    bits.push(value)
  }

  // Four base64 characters carry three bytes; a trailing one or two carry the
  // remainder. A single leftover character cannot encode a byte at all.
  const bytes: Bytes = new Uint8Array(Math.floor((bits.length * 6) / 8))
  let at = 0
  for (let index = 0; index < bits.length; index += 4) {
    const [a, b, c, d] = [bits[index]!, bits[index + 1], bits[index + 2], bits[index + 3]]
    if (b === undefined) break
    bytes[at++] = (a << 2) | (b >> 4)
    if (c === undefined) break
    bytes[at++] = ((b & 0b1111) << 4) | (c >> 2)
    if (d === undefined) break
    bytes[at++] = ((c & 0b11) << 6) | d
  }
  return bytes
}

// ---------------------------------------------------------------------------
// The code itself
// ---------------------------------------------------------------------------

/** Wrap compressed bytes in the marker. */
export function formatShareCode(compressed: Uint8Array): string {
  return `${SHARE_CODE_PREFIX}${SHARE_CODE_VERSION}.${toBase64Url(compressed)}`
}

/**
 * Unwrap a pasted code back to compressed bytes.
 *
 * Forgiving about everything that happens to a string on its way through a
 * chat app: surrounding whitespace, line wrapping, and the case of the marker.
 * Strict about the marker itself, so pasting the wrong thing — a backup file,
 * a URL, a sentence — says so instead of failing deep inside a decoder.
 */
export function readShareCode(code: string): Bytes {
  const compact = code.replace(/\s+/g, '')
  const dot = compact.indexOf('.')
  const marker = dot < 0 ? '' : compact.slice(0, dot)
  const body = dot < 0 ? '' : compact.slice(dot + 1)

  if (!marker.toUpperCase().startsWith(SHARE_CODE_PREFIX) || body.length === 0) {
    throw new ShareCodeError(
      `That does not look like a routine code. They start with ${SHARE_CODE_PREFIX}${SHARE_CODE_VERSION}.`,
    )
  }

  const version = Number(marker.slice(SHARE_CODE_PREFIX.length))
  if (!Number.isInteger(version) || version < 1) {
    throw new ShareCodeError('That code has a version marker Gymmy does not recognise.')
  }
  if (version > SHARE_CODE_VERSION) {
    throw new ShareCodeError(
      'That routine was shared from a newer version of Gymmy. Update the app, then import it again.',
    )
  }

  return fromBase64Url(body)
}

// ---------------------------------------------------------------------------
// Resolving the payload against this device's library
// ---------------------------------------------------------------------------

export interface PlannedEntry {
  /** The local exercise this entry will point at, existing or about to exist. */
  exerciseId: Id
  name: string
  /** Set only when the exercise is not here yet and import must create it. */
  create?: SharedExercise
  draft: RoutineExerciseDraft
}

export interface ImportPlan {
  routine: {
    name: string
    notes?: string
    accentColor?: string
    volumeGoal?: VolumeGoal
  }
  entries: PlannedEntry[]
}

/**
 * Work out what importing this code would actually do, without doing it.
 *
 * Three steps per exercise, in order:
 *
 * 1. **Same id.** Built-ins share slug ids across every install, and a custom
 *    exercise created by an earlier import of the same sender's code kept its
 *    id — so re-importing is idempotent rather than duplicating.
 * 2. **Same name.** Catches the case the id cannot: you renamed "Bench Press"
 *    to what your gym calls it, or the sender's custom "Landmine Press" is a
 *    custom you already built yourself. Unarchived matches win over archived
 *    ones.
 * 3. **Create it.** From the carried definition, keeping the sender's id so
 *    step 1 recognises it next time.
 *
 * The caller fetches the library and passes it in — `domain/` opens no
 * database.
 */
export function planImport(payload: SharedRoutine, existing: readonly Exercise[]): ImportPlan {
  const byId = new Map(existing.map((exercise) => [exercise.id, exercise]))
  const byName = new Map<string, Exercise>()
  for (const exercise of existing) {
    const key = exercise.name.trim().toLowerCase()
    const held = byName.get(key)
    // An archived match is still the same movement, but a live one is the
    // better answer when the library holds both.
    if (!held || (held.archivedAt != null && exercise.archivedAt == null)) {
      byName.set(key, exercise)
    }
  }

  const library = new Map(payload.library.map((exercise) => [exercise.id, exercise]))
  const entries: PlannedEntry[] = []

  for (const entry of payload.entries) {
    const shared = library.get(entry.exerciseId)
    const match =
      byId.get(entry.exerciseId) ??
      (shared ? byName.get(shared.name.trim().toLowerCase()) : undefined)

    // No local match and no carried definition: there is nothing to point at
    // and nothing to build, so the entry is dropped rather than written as a
    // row that renders "Unknown exercise" forever.
    if (!match && !shared) continue

    const draft: RoutineExerciseDraft = {
      exerciseId: match?.id ?? entry.exerciseId,
      order: entries.length,
      targetSets: entry.targetSets,
      targetRepsMin: entry.targetRepsMin,
      ...(entry.targetRepsMax == null ? {} : { targetRepsMax: entry.targetRepsMax }),
      isAmrap: entry.isAmrap,
      ...(entry.targetWeight == null ? {} : { targetWeight: entry.targetWeight }),
      ...(entry.restSeconds == null ? {} : { restSeconds: entry.restSeconds }),
      ...(entry.supersetGroup == null ? {} : { supersetGroup: entry.supersetGroup }),
      ...(entry.notes ? { notes: entry.notes } : {}),
    }

    entries.push({
      exerciseId: draft.exerciseId,
      name: match?.name ?? shared?.name ?? 'Exercise',
      ...(match || !shared ? {} : { create: shared }),
      draft,
    })
  }

  if (entries.length === 0) {
    throw new ShareCodeError('That code decoded, but there were no exercises in it.')
  }

  return {
    routine: {
      name: payload.name,
      ...(payload.notes ? { notes: payload.notes } : {}),
      ...(payload.accentColor ? { accentColor: payload.accentColor } : {}),
      ...(payload.volumeGoal == null ? {} : { volumeGoal: payload.volumeGoal }),
    },
    entries,
  }
}
