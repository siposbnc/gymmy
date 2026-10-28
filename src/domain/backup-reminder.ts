/**
 * When to ask for a backup.
 *
 * Gymmy holds training history that exists in exactly one place, and the
 * browser is allowed to throw it away. The export has existed since M1; what
 * was missing is anything that notices you have not used it.
 *
 * The measure is **workouts at risk, not days elapsed**. Days are the wrong
 * unit: a fortnight off costs you nothing, and three sessions in four days
 * costs you three sessions. Counting what is actually unsaved means the
 * reminder appears in proportion to what a lost phone would take with it, and
 * — just as importantly — stays silent when there is nothing new to save. An
 * app that asks for a backup it does not need teaches you to dismiss the one
 * it does.
 */

/** Unsaved workouts before Gymmy raises it. */
export const SESSIONS_BEFORE_DUE = 3

/** Or this long, if even one workout is unsaved. */
export const DAYS_BEFORE_DUE = 14

const DAY_MS = 86_400_000

export interface BackupInput {
  /** When a backup was last written, epoch ms. Absent means never. */
  readonly lastExportAt?: number | undefined
  /** Completed sessions finished since that backup. */
  readonly unsavedSessions: number
}

export type BackupState =
  /** Nothing has been logged since the last backup, so there is nothing to do. */
  | 'nothing_to_save'
  /** Something is unsaved, but not enough to interrupt anyone over. */
  | 'saved'
  /** Worth a tap now. */
  | 'due'
  /** Never backed up, and there is history to lose. */
  | 'never_saved'

export interface BackupStatus {
  readonly state: BackupState
  readonly unsavedSessions: number
  /** Whole days since the last backup. Null when there has never been one. */
  readonly daysSince: number | null
  /** Whether to put this in front of the user unprompted. */
  readonly shouldPrompt: boolean
}

export function backupStatus(input: BackupInput, now: number = Date.now()): BackupStatus {
  const { lastExportAt, unsavedSessions } = input

  const daysSince =
    lastExportAt == null ? null : Math.floor(Math.max(0, now - lastExportAt) / DAY_MS)

  const state = resolveState(unsavedSessions, daysSince)

  return {
    state,
    unsavedSessions,
    daysSince,
    shouldPrompt: state === 'due' || state === 'never_saved',
  }
}

function resolveState(unsavedSessions: number, daysSince: number | null): BackupState {
  // Silence beats accuracy here. Re-saving a file identical to the last one
  // achieves nothing and spends the user's willingness to be interrupted.
  if (unsavedSessions <= 0) return 'nothing_to_save'

  if (daysSince == null) return 'never_saved'
  if (unsavedSessions >= SESSIONS_BEFORE_DUE) return 'due'
  if (daysSince >= DAYS_BEFORE_DUE) return 'due'

  return 'saved'
}

/** The status in one sentence, counting workouts rather than days. */
export function describeBackup(status: BackupStatus): string {
  const { state, unsavedSessions, daysSince } = status
  const workouts = `${unsavedSessions} workout${unsavedSessions === 1 ? '' : 's'}`

  switch (state) {
    case 'never_saved':
      return `${workouts} on this device only — never backed up.`
    case 'due':
      return `${workouts} since your last backup, ${describeAge(daysSince)}.`
    case 'saved':
      return `${workouts} since your last backup, ${describeAge(daysSince)}.`
    case 'nothing_to_save':
      return daysSince == null
        ? 'Nothing logged yet, so there is nothing to back up.'
        : `Backed up ${describeAge(daysSince)}. Nothing new since.`
  }
}

function describeAge(daysSince: number | null): string {
  if (daysSince == null) return 'never'
  if (daysSince === 0) return 'today'
  if (daysSince === 1) return 'yesterday'
  return `${daysSince} days ago`
}
