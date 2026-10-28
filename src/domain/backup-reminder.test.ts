import { describe, expect, it } from 'vitest'

import {
  backupStatus,
  describeBackup,
  DAYS_BEFORE_DUE,
  SESSIONS_BEFORE_DUE,
} from './backup-reminder'

const NOW = Date.UTC(2026, 9, 28)
const DAY = 86_400_000
const daysAgo = (days: number) => NOW - days * DAY

describe('backupStatus', () => {
  it('stays quiet when nothing has been logged since the last backup', () => {
    // The reminder that fires when it is not needed is the one that teaches
    // you to dismiss the one that is.
    const status = backupStatus({ lastExportAt: daysAgo(90), unsavedSessions: 0 }, NOW)

    expect(status.state).toBe('nothing_to_save')
    expect(status.shouldPrompt).toBe(false)
  })

  it('stays quiet on a fresh install with no history at all', () => {
    const status = backupStatus({ unsavedSessions: 0 }, NOW)

    expect(status.state).toBe('nothing_to_save')
    expect(status.shouldPrompt).toBe(false)
  })

  it('asks as soon as there is history and no backup has ever been made', () => {
    const status = backupStatus({ unsavedSessions: 1 }, NOW)

    expect(status.state).toBe('never_saved')
    expect(status.shouldPrompt).toBe(true)
    expect(status.daysSince).toBeNull()
  })

  it('holds its tongue for a workout or two', () => {
    const status = backupStatus({ lastExportAt: daysAgo(3), unsavedSessions: 2 }, NOW)

    expect(status.state).toBe('saved')
    expect(status.shouldPrompt).toBe(false)
  })

  it('asks once enough workouts are unsaved, however recent the backup', () => {
    const status = backupStatus(
      { lastExportAt: daysAgo(4), unsavedSessions: SESSIONS_BEFORE_DUE },
      NOW,
    )

    // Three sessions in four days is three sessions at risk. Days are the
    // wrong unit for what a lost phone actually costs.
    expect(status.state).toBe('due')
    expect(status.shouldPrompt).toBe(true)
  })

  it('also asks when a single workout has been unsaved for long enough', () => {
    const status = backupStatus(
      { lastExportAt: daysAgo(DAYS_BEFORE_DUE), unsavedSessions: 1 },
      NOW,
    )

    expect(status.state).toBe('due')
  })

  it('does not ask after a long break with nothing logged in it', () => {
    const status = backupStatus({ lastExportAt: daysAgo(200), unsavedSessions: 0 }, NOW)

    expect(status.shouldPrompt).toBe(false)
  })

  it('counts whole days, and never negative ones', () => {
    // A clock that has moved backwards must not produce "-2 days ago".
    expect(backupStatus({ lastExportAt: NOW + 5 * DAY, unsavedSessions: 1 }, NOW).daysSince).toBe(0)
  })
})

describe('describeBackup', () => {
  const describe_ = (lastExportAt: number | undefined, unsavedSessions: number) =>
    describeBackup(backupStatus({ lastExportAt, unsavedSessions }, NOW))

  it('leads with what is at risk, not with the date', () => {
    expect(describe_(daysAgo(9), 4)).toBe('4 workouts since your last backup, 9 days ago.')
  })

  it('says one workout, not 1 workouts', () => {
    expect(describe_(daysAgo(20), 1)).toBe('1 workout since your last backup, 20 days ago.')
  })

  it('is blunt about never having backed up', () => {
    expect(describe_(undefined, 6)).toBe('6 workouts on this device only — never backed up.')
  })

  it('says plainly when there is nothing to do', () => {
    expect(describe_(daysAgo(1), 0)).toBe('Backed up yesterday. Nothing new since.')
    expect(describe_(daysAgo(0), 0)).toBe('Backed up today. Nothing new since.')
    expect(describe_(undefined, 0)).toBe('Nothing logged yet, so there is nothing to back up.')
  })
})
