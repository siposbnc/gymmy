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
  notes?: string
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
  | { kind: 'absolute'; kg: number }
  | { kind: 'percent'; pct: number; basis: 'training_max' }

export interface Routine {
  id: Id
  name: string
  notes?: string
  accentColor?: string
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

export interface Settings {
  id: 'singleton'
  units: WeightUnit
  theme: ThemePreference
  /** 0 = Sunday, 1 = Monday. */
  weekStartsOn: 0 | 1
  defaultRestSeconds: number
  barWeightKg: number
  plateInventory: PlatePair[]
  weeklySessionGoal: number
  showStreak: boolean
  showRpe: boolean

  /** Rest timer behaviour. Added in schema v2. */
  autoStartRest: boolean
  restSound: boolean
  restVibrate: boolean

  schemaVersion: number
  lastExportAt?: number
}
