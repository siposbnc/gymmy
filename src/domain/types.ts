/**
 * The domain model.
 *
 * Lives in `domain/` rather than `db/` because these shapes describe training,
 * not storage. The Dexie layer imports them; nothing here imports Dexie.
 *
 * See docs/PLAN.md §4 for the reasoning behind the non-obvious decisions —
 * particularly session snapshotting and canonical kilograms.
 */

import type { WeightUnit } from './units'

export type Id = string

// ---------------------------------------------------------------------------
// Exercise
// ---------------------------------------------------------------------------

export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'core'
  | 'traps'
  | 'lats'
  | 'full_body'

export type Equipment =
  | 'barbell'
  | 'dumbbell'
  | 'machine'
  | 'cable'
  | 'bodyweight'
  | 'kettlebell'
  | 'band'
  | 'smith'
  | 'other'

export type MovementType = 'compound' | 'isolation'

/**
 * v1 implements `weight_reps` and `reps_only`. `time` and `distance_time` are
 * declared now so adding cardio later is UI work rather than a migration.
 */
export type TrackingType = 'weight_reps' | 'reps_only' | 'time' | 'distance_time'

export interface Exercise {
  id: Id
  name: string
  /** First entry is the primary mover; the rest are secondary. */
  muscleGroups: MuscleGroup[]
  equipment: Equipment
  movementType: MovementType
  trackingType: TrackingType
  defaultRestSeconds: number
  /**
   * Which bar this exercise uses, when it is not the default one.
   *
   * Absent means "use the default", which is also what happens if the bar is
   * later deleted — the calculation degrades to something sensible rather
   * than breaking.
   */
  barId?: Id
  /**
   * What the exercise is and how it differs from its neighbours.
   *
   * Seeded for built-ins and backfilled on launch for installs that predate
   * it. Optional because a custom exercise does not need one.
   */
  description?: string
  /** The user's own notes — never overwritten by a seed update. */
  notes?: string
  /**
   * When this exercise was pinned to the top of the picker.
   *
   * A timestamp rather than a boolean so pins keep a stable order: the block
   * is sorted oldest-first, which means adding a pin never reshuffles the ones
   * your thumb already knows the position of.
   */
  pinnedAt?: number
  isCustom: boolean
  archivedAt?: number
}

// ---------------------------------------------------------------------------
// Routines — the training plan
// ---------------------------------------------------------------------------

/**
 * v1 implements `absolute` only. The union is declared now because the SHAPE
 * is the expensive part: retrofitting it would mean migrating every saved
 * routine, plus a new branch in prefill, a mode toggle in the builder, and a
 * snapshot-time computation. Declaring it costs one line.
 *
 * When `percent` ships, its basis is a user-entered training max — never an
 * estimated 1RM. Program weights should not be driven by a formula's guess.
 */
export type TargetWeight =
  { kind: 'absolute'; kg: number } | { kind: 'percent'; pct: number; basis: 'training_max' }

/**
 * A volume target for a session of this routine.
 *
 * Same relative-or-absolute shape as {@link TargetWeight}, and declared whole
 * for the same reason: the shape is the expensive part to retrofit.
 *
 * `beat_last` is the default because it self-calibrates — you never have to
 * guess the right number, and it cannot go stale as you get stronger.
 * `absolute` exists for a deliberate deload or a specific programme.
 */
export type VolumeGoal = { kind: 'beat_last' } | { kind: 'absolute'; kg: number }

export interface Routine {
  id: Id
  name: string
  notes?: string
  accentColor?: string
  /** Absent means no volume goal for this routine. */
  volumeGoal?: VolumeGoal
  createdAt: number
  updatedAt: number
  archivedAt?: number
}

export interface RoutineExercise {
  id: Id
  routineId: Id
  exerciseId: Id
  order: number
  targetSets: number
  targetRepsMin: number
  targetRepsMax?: number
  /** `5+` style: the last set is taken to failure. */
  isAmrap: boolean
  targetWeight?: TargetWeight
  restSeconds?: number
  /** Exercises sharing a group are performed back to back. */
  supersetGroup?: number
  notes?: string
}

// ---------------------------------------------------------------------------
// Sessions — one actual workout
// ---------------------------------------------------------------------------

export type SessionStatus = 'active' | 'completed'

export interface Session {
  id: Id
  /** Kept for navigation only. The name below is the historical truth. */
  routineId?: Id
  /**
   * Snapshotted at start. Editing "Push A" next month must not rewrite what
   * you did in March — the most common data bug in workout apps.
   */
  routineNameSnapshot?: string
  name: string
  startedAt: number
  endedAt?: number
  status: SessionStatus
  /**
   * The routine's volume goal, copied at session start.
   *
   * Snapshotted for the same reason the name and the targets are: raising the
   * goal in November must not retroactively turn a session you beat in March
   * into one you missed. Absent means there was no goal — which is the correct
   * value for every session logged before goals existed, so no migration.
   */
  volumeGoalSnapshot?: VolumeGoal
  notes?: string
  bodyweightKg?: number
  perceivedEffort?: number
}

export interface SessionExercise {
  id: Id
  sessionId: Id
  exerciseId: Id
  order: number
  restSeconds?: number
  supersetGroup?: number
  notes?: string

  /**
   * The routine's targets, copied at session start.
   *
   * Snapshotted rather than read live through `routineId` for the same reason
   * the session name is: editing "Push A" halfway through training it must not
   * change what the remaining sets are asking for. Absent for freestyle
   * workouts, which is why every field is optional — and why adding them
   * needed no migration. Unlike the v2 settings fields, "missing" is the
   * correct value for every row written before M3.
   */
  targetSets?: number
  targetRepsMin?: number
  targetRepsMax?: number
  targetWeight?: TargetWeight
  isAmrap?: boolean
}

/**
 * `warmup` is excluded from volume, records and 1RM estimates — but kept, since
 * it is real data about how you ramp.
 */
export type SetType = 'normal' | 'warmup' | 'dropset' | 'failure'

export interface SetEntry {
  id: Id
  sessionExerciseId: Id
  setIndex: number
  /** Canonical kilograms. Always. */
  weightKg?: number
  reps?: number
  durationSeconds?: number
  distanceM?: number
  /** 1–10, where 10 is "could not have done another rep". Optional. */
  rpe?: number
  type: SetType
  completedAt: number
}

// ---------------------------------------------------------------------------
// Records — observations, never inferences
// ---------------------------------------------------------------------------

/**
 * Three kinds, all of them things that happened. There is deliberately no
 * `est_1rm` member: an estimate is a model output, so it can never trigger a
 * record, appear on the PR board, or fire a celebration.
 */
export type RecordKind = 'max_weight' | 'max_reps_at_weight' | 'max_session_volume'

export interface PersonalRecord {
  id: Id
  exerciseId: Id
  kind: RecordKind
  value: number
  /** For `max_reps_at_weight`, the weight the reps were performed at. */
  atWeightKg?: number
  setEntryId?: Id
  sessionId: Id
  achievedAt: number
}

// ---------------------------------------------------------------------------
// Settings — single row. One user per device, no profiles.
// ---------------------------------------------------------------------------

export type ThemePreference = 'system' | 'light' | 'dark'

/** A pair of plates the user owns. Counts are pairs, not individual plates. */
export interface PlatePair {
  weightKg: number
  pairs: number
}

/**
 * A bar the user owns.
 *
 * Most gyms have more than one — a 20 kg Olympic bar, a lighter technique bar,
 * a curl bar — and loading the same plates on a different bar gives a
 * different total. Exercises can point at a specific bar; anything that does
 * not falls back to the default.
 */
export interface Bar {
  id: Id
  name: string
  weightKg: number
}

export interface Settings {
  id: 'singleton'
  units: WeightUnit
  theme: ThemePreference
  /** 0 = Sunday, 1 = Monday. */
  weekStartsOn: 0 | 1
  defaultRestSeconds: number
  /**
   * Legacy single-bar weight, kept so a pre-v3 export still imports.
   * `bars` and `defaultBarId` are the live values — read them through
   * `resolveBarWeight` rather than touching this.
   */
  barWeightKg: number
  /** Every bar the user owns. Added in schema v3. */
  bars: Bar[]
  /** Which bar to assume when an exercise does not name one. */
  defaultBarId: Id
  plateInventory: PlatePair[]
  weeklySessionGoal: number
  showStreak: boolean
  showRpe: boolean

  /**
   * Target hard sets per muscle per week.
   *
   * Deliberately empty until you set one: Gymmy will show what you actually
   * did either way, and asserting that you *should* do ten sets of chest is
   * not its place. Absent muscles simply have no target.
   */
  weeklySetTargets?: Partial<Record<MuscleGroup, number>>

  /** Rest timer behaviour. Added in schema v2. */
  autoStartRest: boolean
  restSound: boolean
  restVibrate: boolean

  /**
   * Whether to suggest adding weight. Added in schema v4.
   *
   * On by default, and it is the one place Gymmy advises rather than reports —
   * which is exactly why it can be switched off.
   */
  suggestProgression: boolean

  schemaVersion: number
  lastExportAt?: number
}
