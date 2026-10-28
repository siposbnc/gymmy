import { describe, expect, it } from 'vitest'

import { estimateOneRepMax } from './metrics/one-rep-max'
import { computeRecords, recordsFromSession, type RecordSet } from './records'

let clock = 1_700_000_000_000
const at = () => (clock += 60_000)

function set(
  sessionId: string,
  weightKg: number,
  reps: number,
  overrides: Partial<RecordSet> = {},
): RecordSet {
  return {
    id: `set_${Math.random().toString(36).slice(2)}`,
    sessionId,
    completedAt: at(),
    type: 'normal',
    weightKg,
    reps,
    ...overrides,
  }
}

const kinds = (records: ReturnType<typeof computeRecords>) =>
  records.map((record) => record.kind).sort()

describe('computeRecords', () => {
  it('finds the heaviest weight lifted', () => {
    const records = computeRecords('ex_squat', [
      set('s1', 100, 5),
      set('s2', 140, 3),
      set('s3', 120, 5),
    ])

    const heaviest = records.find((record) => record.kind === 'max_weight')
    expect(heaviest?.value).toBe(140)
    expect(heaviest?.sessionId).toBe('s2')
  })

  it('tracks best reps at a weight you have come back to', () => {
    const records = computeRecords('ex_bench-press', [
      set('s1', 100, 8),
      set('s2', 100, 9),
      set('s3', 80, 12),
    ])

    const repRecords = records.filter((record) => record.kind === 'max_reps_at_weight')

    // 100 kg was trained twice, so beating your reps there is an achievement.
    const at100 = repRecords.find((record) => record.atWeightKg === 100)
    expect(at100?.value).toBe(9)
    expect(at100?.sessionId).toBe('s2')

    // 80 kg was used once — that is the first time you tried it, not a record.
    expect(repRecords.find((record) => record.atWeightKg === 80)).toBeUndefined()
  })

  it('does not mint a reps record for every weight on a linear progression', () => {
    // The exact shape that buried the useful records: a new weight each week,
    // never revisited.
    const records = computeRecords(
      'ex_squat',
      [120, 125, 130, 132.5, 137.5, 140].map((weight, index) =>
        set(`week${index}`, weight, 3),
      ),
    )

    expect(records.filter((record) => record.kind === 'max_reps_at_weight')).toEqual([])
    // The records that do matter are still there.
    expect(records.map((record) => record.kind).sort()).toEqual([
      'max_session_volume',
      'max_weight',
    ])
  })

  it('finds the biggest single-session volume', () => {
    const records = computeRecords('ex_squat', [
      // s1: 100×5 + 100×5 = 1000
      set('s1', 100, 5),
      set('s1', 100, 5),
      // s2: 120×3 + 120×3 + 120×3 = 1080
      set('s2', 120, 3),
      set('s2', 120, 3),
      set('s2', 120, 3),
    ])

    const volume = records.find((record) => record.kind === 'max_session_volume')
    expect(volume?.value).toBe(1080)
    expect(volume?.sessionId).toBe('s2')
  })

  it('prefers more reps at the same top weight', () => {
    // The reported bug: 60 × 2 then 60 × 3 in one session left the record on
    // the 2-rep set, because it arrived first. You work up to your best set.
    const weaker = set('s1', 60, 2)
    const better = set('s1', 60, 3)

    const records = computeRecords('ex_squat', [weaker, better])
    const heaviest = records.find((record) => record.kind === 'max_weight')

    expect(heaviest?.setEntryId).toBe(better.id)
    expect(heaviest?.value).toBe(60)
  })

  it('lets a later session beat the record on reps alone', () => {
    const first = set('s1', 60, 3)
    const later = set('s2', 60, 5)

    const records = computeRecords('ex_squat', [first, later])
    const heaviest = records.find((record) => record.kind === 'max_weight')

    expect(heaviest?.setEntryId).toBe(later.id)
    expect(heaviest?.sessionId).toBe('s2')
  })

  it('never lets reps promote a lighter set over a heavier one', () => {
    // 60 × 10 is more total work than 100 × 1, but it is not a heavier lift.
    const heavy = set('s1', 100, 1)
    const lighter = set('s2', 60, 10)

    const records = computeRecords('ex_squat', [heavy, lighter])
    const heaviest = records.find((record) => record.kind === 'max_weight')

    expect(heaviest?.value).toBe(100)
    expect(heaviest?.setEntryId).toBe(heavy.id)
  })

  it('a tie on weight AND reps is not a record — the first keeps it', () => {
    const first = set('s1', 140, 3)
    const equal = set('s2', 140, 3)

    const records = computeRecords('ex_squat', [first, equal])
    const heaviest = records.find((record) => record.kind === 'max_weight')

    expect(heaviest?.sessionId).toBe('s1')
    expect(heaviest?.setEntryId).toBe(first.id)
  })

  it('excludes warm-ups entirely', () => {
    const records = computeRecords('ex_squat', [
      set('s1', 200, 1, { type: 'warmup' }),
      set('s1', 100, 5),
    ])

    const heaviest = records.find((record) => record.kind === 'max_weight')
    // The 200 kg "warm-up" must not become a record.
    expect(heaviest?.value).toBe(100)
  })

  it('counts dropsets and failure sets as real work', () => {
    const records = computeRecords('ex_curl', [
      set('s1', 30, 10, { type: 'dropset' }),
      set('s1', 40, 6, { type: 'failure' }),
    ])

    expect(records.find((record) => record.kind === 'max_weight')?.value).toBe(40)
  })

  it('ignores incomplete sets rather than recording a zero', () => {
    const records = computeRecords('ex_squat', [
      { id: 'a', sessionId: 's1', completedAt: at(), type: 'normal' },
      { id: 'b', sessionId: 's1', completedAt: at(), type: 'normal', weightKg: 100 },
      { id: 'c', sessionId: 's1', completedAt: at(), type: 'normal', reps: 5 },
    ])
    expect(records).toEqual([])
  })

  it('returns nothing for an exercise never logged', () => {
    expect(computeRecords('ex_squat', [])).toEqual([])
  })

  it('is idempotent — recomputing gives the same answer', () => {
    const sets = [set('s1', 100, 5), set('s2', 120, 3), set('s2', 120, 4)]
    expect(computeRecords('ex_squat', sets)).toEqual(computeRecords('ex_squat', sets))
  })

  it('does not depend on the order sets are supplied in', () => {
    const sets = [set('s1', 100, 5), set('s2', 140, 3), set('s3', 120, 8)]
    const forwards = computeRecords('ex_squat', sets)
    const backwards = computeRecords('ex_squat', [...sets].reverse())

    expect(kinds(forwards)).toEqual(kinds(backwards))
    expect(forwards.find((r) => r.kind === 'max_weight')).toEqual(
      backwards.find((r) => r.kind === 'max_weight'),
    )
  })
})

describe('the guarantee: estimates never become records', () => {
  it('produces only the three observed kinds', () => {
    const records = computeRecords('ex_squat', [
      set('s1', 100, 5),
      set('s2', 100, 6),
      set('s2', 140, 3),
    ])
    const produced = new Set(records.map((record) => record.kind))

    expect(produced).toEqual(new Set(['max_weight', 'max_reps_at_weight', 'max_session_volume']))
    // The type system forbids it, and so does this.
    expect([...produced]).not.toContain('est_1rm')
  })

  it('a burnout set with a huge estimated 1RM sets no strength record', () => {
    // A true top set, then a light high-rep set. Epley would call the second
    // one a 167 kg squat; it is not, and it must not displace anything.
    const topSet = set('s1', 140, 3)
    const burnout = set('s1', 100, 20)

    expect(estimateOneRepMax({ weightKg: 140, reps: 3 })).toBeCloseTo(154, 0)
    expect(estimateOneRepMax({ weightKg: 100, reps: 20 })).toBeNull()

    const records = computeRecords('ex_squat', [topSet, burnout])
    const heaviest = records.find((record) => record.kind === 'max_weight')

    expect(heaviest?.value).toBe(140)
    expect(heaviest?.setEntryId).toBe(topSet.id)

    // And the burnout set's volume still counts toward the session total.
    expect(records.find((record) => record.kind === 'max_session_volume')?.value).toBe(
      140 * 3 + 100 * 20,
    )
  })

  it('still credits reps at a weight once it has been revisited', () => {
    const records = computeRecords('ex_squat', [
      set('s1', 100, 18),
      set('s2', 100, 20),
      set('s2', 140, 3),
    ])

    const at100 = records.find(
      (record) => record.kind === 'max_reps_at_weight' && record.atWeightKg === 100,
    )
    expect(at100?.value).toBe(20)
  })
})

describe('recordsFromSession', () => {
  it('picks out what was earned today', () => {
    const records = computeRecords('ex_squat', [
      set('old', 140, 2),
      set('today', 140, 3),
      set('today', 145, 1),
    ])

    const todays = recordsFromSession(records, 'today')
    expect(todays.map((record) => record.kind).sort()).toEqual([
      'max_reps_at_weight',
      'max_session_volume',
      'max_weight',
    ])
  })

  it('is empty for a session that beat nothing', () => {
    const records = computeRecords('ex_squat', [set('big', 140, 5), set('small', 60, 5)])
    expect(recordsFromSession(records, 'small')).toEqual([])
  })
})
