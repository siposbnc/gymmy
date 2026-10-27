import { describe, expect, it } from 'vitest'

import { csvFilename, escapeCsvField, toCsv, type CsvSetRow } from './csv'

const at = new Date(2026, 9, 26, 21, 30).getTime()

const row = (overrides: Partial<CsvSetRow> = {}): CsvSetRow => ({
  sessionId: 's1',
  sessionName: 'Push A',
  startedAt: at,
  exerciseName: 'Bench Press',
  setIndex: 1,
  setType: 'normal',
  weightKg: 80,
  reps: 8,
  ...overrides,
})

describe('escapeCsvField', () => {
  it('leaves ordinary values alone', () => {
    expect(escapeCsvField('Bench Press')).toBe('Bench Press')
    expect(escapeCsvField('80')).toBe('80')
  })

  it('quotes fields containing a comma', () => {
    // Exercise names are user-editable, so this is realistic input.
    expect(escapeCsvField('Bench Press, close grip')).toBe('"Bench Press, close grip"')
  })

  it('doubles inner quotes', () => {
    expect(escapeCsvField('The "big" three')).toBe('"The ""big"" three"')
  })

  it('quotes fields containing newlines', () => {
    expect(escapeCsvField('line one\nline two')).toBe('"line one\nline two"')
  })
})

describe('toCsv', () => {
  it('writes a header and one row per set', () => {
    const csv = toCsv([row(), row({ setIndex: 2, reps: 7 })], 'kg')
    const lines = csv.trim().split('\n')

    expect(lines[0]).toBe('date,session,exercise,set,type,weight_kg,weight,unit,reps,rpe,volume_kg')
    expect(lines).toHaveLength(3)
  })

  it('uses the local date, so a late workout does not shift a day', () => {
    // 21:30 local would be the next day in UTC for positive offsets.
    expect(toCsv([row()], 'kg')).toContain('2026-10-26')
  })

  it('carries both the canonical and the displayed weight', () => {
    const csv = toCsv([row({ weightKg: 100 })], 'lb')
    const line = csv.trim().split('\n')[1]!

    // Canonical kilograms, then the same weight in the unit being read.
    expect(line).toContain('100,220.46,lb')
  })

  it('computes volume per row', () => {
    expect(toCsv([row({ weightKg: 80, reps: 8 })], 'kg').trim().split('\n')[1]).toMatch(/,640$/)
  })

  it('leaves blanks rather than zeros for missing values', () => {
    const line = toCsv([row({ weightKg: undefined, reps: undefined, rpe: undefined })], 'kg')
      .trim()
      .split('\n')[1]!

    expect(line).toBe('2026-10-26,Push A,Bench Press,1,normal,,,kg,,,')
  })

  it('escapes a session name containing a comma', () => {
    const csv = toCsv([row({ sessionName: 'Push, heavy' })], 'kg')
    expect(csv).toContain('"Push, heavy"')
  })

  it('marks warm-ups so they can be filtered out in a spreadsheet', () => {
    expect(toCsv([row({ setType: 'warmup' })], 'kg')).toContain(',warmup,')
  })

  it('still emits a header when there is nothing to export', () => {
    expect(toCsv([], 'kg')).toBe(
      'date,session,exercise,set,type,weight_kg,weight,unit,reps,rpe,volume_kg\n',
    )
  })

  it('ends with a newline so tools do not drop the last row', () => {
    expect(toCsv([row()], 'kg').endsWith('\n')).toBe(true)
  })
})

describe('csvFilename', () => {
  it('names the file by date', () => {
    expect(csvFilename(new Date(2026, 9, 26))).toBe('gymmy-sets-2026-10-26.csv')
  })
})
