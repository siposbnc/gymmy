import { describe, expect, it } from 'vitest'

import {
  lastTimeSummary,
  resolveDropPrefill,
  resolvePrefill,
  type PrefillSet,
} from './prefill'

const working = (setIndex: number, weightKg: number, reps: number): PrefillSet => ({
  setIndex,
  weightKg,
  reps,
  type: 'normal',
})
const warmup = (setIndex: number, weightKg: number, reps: number): PrefillSet => ({
  setIndex,
  weightKg,
  reps,
  type: 'warmup',
})

/** A working set with an identity, so drops can hang off it. */
const parent = (
  id: string,
  setIndex: number,
  weightKg: number,
  reps: number,
): PrefillSet => ({ ...working(setIndex, weightKg, reps), id })

const drop = (
  parentSetId: string,
  setIndex: number,
  weightKg: number,
  reps: number,
): PrefillSet => ({
  id: `${parentSetId}_d${setIndex}`,
  parentSetId,
  setIndex,
  weightKg,
  reps,
  type: 'dropset',
})

describe('resolvePrefill — the fallback chain', () => {
  it('carries forward what you just did, over last week and over the plan', () => {
    // Plan says 77.5, last week you did 77.5, but you just bumped to 80.
    const result = resolvePrefill({
      setIndex: 2,
      currentSessionSets: [working(1, 80, 8)],
      previousSessionSets: [working(1, 77.5, 8), working(2, 77.5, 8)],
      target: { weight: { kind: 'absolute', kg: 77.5 }, reps: 8 },
    })
    expect(result).toEqual({ weightKg: 80, reps: 8, source: 'carried_forward' })
  })

  it('uses the plan on the first set of a planned exercise', () => {
    const result = resolvePrefill({
      setIndex: 1,
      target: { weight: { kind: 'absolute', kg: 100 }, reps: 5 },
    })
    expect(result).toEqual({ weightKg: 100, reps: 5, source: 'routine_target' })
  })

  it('falls to the same set index from last session', () => {
    const result = resolvePrefill({
      setIndex: 3,
      previousSessionSets: [working(1, 80, 8), working(2, 80, 8), working(3, 80, 6)],
    })
    // Set 3 specifically — last time that set dropped to 6 reps.
    expect(result).toEqual({ weightKg: 80, reps: 6, source: 'same_set_last_time' })
  })

  it('falls to the last set ever when that index did not exist last time', () => {
    // Adding a fourth set to a session that only had three.
    const result = resolvePrefill({
      setIndex: 4,
      previousSessionSets: [working(1, 80, 8), working(2, 80, 8), working(3, 80, 6)],
    })
    expect(result).toEqual({ weightKg: 80, reps: 6, source: 'last_set_ever' })
  })

  it('is empty for an exercise with no history, rather than inventing a zero', () => {
    expect(resolvePrefill({ setIndex: 1 })).toEqual({ source: 'empty' })
    expect(resolvePrefill({ setIndex: 1, previousSessionSets: [] })).toEqual({ source: 'empty' })
  })

  it('never carries forward or copies a warm-up', () => {
    const result = resolvePrefill({
      setIndex: 1,
      currentSessionSets: [warmup(1, 20, 12), warmup(2, 60, 5)],
      previousSessionSets: [warmup(1, 20, 12), working(1, 100, 5)],
    })
    // The warm-ups in this session are ignored, so it reaches last session's
    // working set — not the 60 kg ramp-up the user just did.
    expect(result).toEqual({ weightKg: 100, reps: 5, source: 'same_set_last_time' })
  })

  it('ignores a percent target it cannot resolve without a training max', () => {
    const result = resolvePrefill({
      setIndex: 1,
      target: { weight: { kind: 'percent', pct: 85, basis: 'training_max' } },
      previousSessionSets: [working(1, 120, 3)],
    })
    expect(result.source).toBe('same_set_last_time')
    expect(result.weightKg).toBe(120)
  })

  it('takes the plan reps and the weight from history when the plan names no weight', () => {
    // Adding an exercise to a routine gives it a rep target and no weight
    // target, so this is the DEFAULT shape of a planned exercise — not an
    // edge case. A tier that answered as a unit would leave the weight blank
    // with "last time 82.5 kg × 8, 8, 8" written directly above it.
    const result = resolvePrefill({
      setIndex: 1,
      target: { reps: 8 },
      previousSessionSets: [working(1, 82.5, 8), working(2, 82.5, 8), working(3, 82.5, 8)],
    })

    expect(result.weightKg).toBe(82.5)
    expect(result.reps).toBe(8)
    // The weight is the number being justified, so that is what source names.
    expect(result.source).toBe('same_set_last_time')
  })

  it('lets the plan override reps while history supplies the weight', () => {
    // The plan asks for heavy triples; last time at this weight you did eight.
    const result = resolvePrefill({
      setIndex: 1,
      target: { reps: 3 },
      previousSessionSets: [working(1, 100, 8)],
    })

    expect(result).toEqual({ weightKg: 100, reps: 3, source: 'same_set_last_time' })
  })

  it('handles reps-only exercises with no weight', () => {
    const result = resolvePrefill({
      setIndex: 2,
      currentSessionSets: [{ setIndex: 1, reps: 9, type: 'normal' }],
    })
    expect(result).toEqual({ reps: 9, source: 'carried_forward' })
    expect(result.weightKg).toBeUndefined()
  })
})

describe('resolvePrefill — history outranks the plan on weight', () => {
  it('offers what you lifted, not what the routine was written with', () => {
    // The routine still says 100 from the day it was written; you have been
    // training it for months and are at 110. Asking the plan first would hand
    // you a stale number every session until you went and edited the routine.
    const result = resolvePrefill({
      setIndex: 1,
      previousSessionSets: [working(1, 110, 5)],
      target: { weight: { kind: 'absolute', kg: 100 }, reps: 5 },
    })
    expect(result).toEqual({ weightKg: 110, reps: 5, source: 'same_set_last_time' })
  })

  it('still seeds an exercise with no history at all', () => {
    // The plan is the last tier asked, which on the first run of a routine
    // means it is also the only one with an answer.
    const result = resolvePrefill({
      setIndex: 1,
      target: { weight: { kind: 'absolute', kg: 100 }, reps: 5 },
    })
    expect(result).toEqual({ weightKg: 100, reps: 5, source: 'routine_target' })
  })

  it('keeps the plan in charge of reps while history supplies the weight', () => {
    // Heavy triples today, at the weight you are actually lifting. Neither
    // field is guessed and neither comes from the wrong place.
    const result = resolvePrefill({
      setIndex: 1,
      previousSessionSets: [working(1, 110, 8)],
      target: { weight: { kind: 'absolute', kg: 100 }, reps: 3 },
    })
    expect(result).toEqual({ weightKg: 110, reps: 3, source: 'same_set_last_time' })
  })
})

describe('resolvePrefill — a plan with a weight per set', () => {
  // 60 × 10, 70 × 8, 80 × 6, written into the routine rather than inferred.
  const plan = [
    { reps: 10, weight: { kind: 'absolute' as const, kg: 60 } },
    { reps: 8, weight: { kind: 'absolute' as const, kg: 70 } },
    { reps: 6, weight: { kind: 'absolute' as const, kg: 80 } },
  ]

  it('gives each set its own rung on the first run of the routine', () => {
    // The whole reason ladders are worth storing: before there is any history,
    // nothing else can describe this.
    expect(resolvePrefill({ setIndex: 1, target: { plan, reps: 6 } })).toEqual({
      weightKg: 60,
      reps: 10,
      source: 'routine_target',
    })
    expect(resolvePrefill({ setIndex: 3, target: { plan, reps: 6 } })).toEqual({
      weightKg: 80,
      reps: 6,
      source: 'routine_target',
    })
  })

  it('falls back to the summary for a set past the end of the ladder', () => {
    // A fourth set on a three-rung plan is unplanned work. The summarised rep
    // target still applies; there is no rung to take a weight from.
    const result = resolvePrefill({ setIndex: 4, target: { plan, reps: 6 } })
    expect(result).toEqual({ reps: 6, source: 'routine_target' })
  })

  it('beats carry-forward, or it would only ever work for set one', () => {
    // Carry-forward is a stand-in for per-set information. A ladder is per-set
    // information, so it wins — otherwise set 2 of a written 60/70/80 would
    // offer 60 again, which is the whole problem ladders exist to solve.
    const result = resolvePrefill({
      setIndex: 2,
      currentSessionSets: [working(1, 60, 10)],
      target: { plan, reps: 6 },
    })
    expect(result).toEqual({ weightKg: 70, reps: 8, source: 'routine_target' })
  })

  it('carries the whole ladder up when you open heavier than it says', () => {
    // The plan contributes the shape; what you are lifting today is yours.
    const result = resolvePrefill({
      setIndex: 2,
      currentSessionSets: [working(1, 65, 10)],
      target: { plan, reps: 6 },
    })
    expect(result.weightKg).toBe(75)
  })

  it('goes quiet once you stop following it', () => {
    // Opened on the ladder, then held the weight for set 2. Set 3 is no longer
    // a ladder question, so what you just did answers.
    const result = resolvePrefill({
      setIndex: 3,
      currentSessionSets: [working(1, 60, 10), working(2, 60, 10)],
      target: { plan, reps: 6 },
    })
    expect(result).toEqual({ weightKg: 60, reps: 10, source: 'carried_forward' })
  })

  it('steps aside for what you actually lifted', () => {
    // Second run, and the ladder has been outgrown. The plan does not argue.
    const result = resolvePrefill({
      setIndex: 2,
      currentSessionSets: [working(1, 65, 10)],
      previousSessionSets: [working(1, 65, 10), working(2, 75, 8), working(3, 85, 6)],
      target: { plan, reps: 6 },
    })
    expect(result).toEqual({ weightKg: 75, reps: 8, source: 'ramp_last_time' })
  })

  it('takes the rung’s reps even where the weight comes from history', () => {
    // A ladder of straight-weight but descending reps, on an exercise whose
    // load has moved on. Each field lands where it should.
    const repsOnlyLadder = [{ reps: 12 }, { reps: 10 }, { reps: 8 }]
    const result = resolvePrefill({
      setIndex: 2,
      previousSessionSets: [working(1, 40, 12), working(2, 40, 10)],
      target: { plan: repsOnlyLadder, reps: 8 },
    })
    expect(result.reps).toBe(10)
    expect(result.weightKg).toBe(40)
  })
})

describe('resolvePrefill — repeating a ramp', () => {
  // 60 × 10, 70 × 8, 80 × 6. The normal shape of a working exercise, and the
  // one the carry-forward tier used to get wrong on every set but the first.
  const ramp = [working(1, 60, 10), working(2, 70, 8), working(3, 80, 6)]

  it('offers the next rung instead of carrying the bottom of the ramp forward', () => {
    const result = resolvePrefill({
      setIndex: 2,
      currentSessionSets: [working(1, 60, 10)],
      previousSessionSets: ramp,
    })
    expect(result).toEqual({ weightKg: 70, reps: 8, source: 'ramp_last_time' })
  })

  it('shifts the whole ramp by what you changed on the first set', () => {
    const second = resolvePrefill({
      setIndex: 2,
      currentSessionSets: [working(1, 62.5, 10)],
      previousSessionSets: ramp,
    })
    expect(second.weightKg).toBe(72.5)
    expect(second.source).toBe('ramp_last_time')

    // And it keeps following, two sets in — no float dust from 62.5 − 60.
    const third = resolvePrefill({
      setIndex: 3,
      currentSessionSets: [working(1, 62.5, 10), working(2, 72.5, 8)],
      previousSessionSets: ramp,
    })
    expect(third.weightKg).toBe(82.5)
  })

  it('shifts down as readily as up', () => {
    const result = resolvePrefill({
      setIndex: 2,
      currentSessionSets: [working(1, 57.5, 10)],
      previousSessionSets: ramp,
    })
    expect(result.weightKg).toBe(67.5)
  })

  it('works the same on a ramp that descends', () => {
    // Reverse pyramid: the top set first, then backoffs.
    const descending = [working(1, 100, 5), working(2, 90, 7), working(3, 80, 9)]
    const result = resolvePrefill({
      setIndex: 2,
      currentSessionSets: [working(1, 102.5, 5)],
      previousSessionSets: descending,
    })
    expect(result).toEqual({ weightKg: 92.5, reps: 7, source: 'ramp_last_time' })
  })

  it('stays out of the way when you open at the top of the ramp', () => {
    // Opening at 80 is a 20 kg shift — wider than a rung. Far likelier that
    // the ramp has been abandoned for straight sets at the top than that the
    // whole thing moved up by two rungs, so carry-forward answers instead.
    const result = resolvePrefill({
      setIndex: 2,
      currentSessionSets: [working(1, 80, 6)],
      previousSessionSets: ramp,
    })
    expect(result).toEqual({ weightKg: 80, reps: 6, source: 'carried_forward' })
  })

  it('does not guess which rung you meant when you open on one of them', () => {
    // 70 is exactly rung two. A 10 kg shift is the width of a step, so this is
    // ambiguous by construction and nothing is invented.
    const result = resolvePrefill({
      setIndex: 2,
      currentSessionSets: [working(1, 70, 8)],
      previousSessionSets: ramp,
    })
    expect(result.source).toBe('carried_forward')
    expect(result.weightKg).toBe(70)
  })

  it('goes quiet once a logged set leaves the shape', () => {
    // Opened on the ramp, then held 62.5 for set 2 rather than climbing. The
    // climb is no longer what is being done, so it stops being offered.
    const result = resolvePrefill({
      setIndex: 3,
      currentSessionSets: [working(1, 62.5, 10), working(2, 62.5, 10)],
      previousSessionSets: ramp,
    })
    expect(result).toEqual({ weightKg: 62.5, reps: 10, source: 'carried_forward' })
  })

  it('never touches the first set — that one comes from history, or the plan', () => {
    const planned = resolvePrefill({
      setIndex: 1,
      previousSessionSets: ramp,
      target: { weight: { kind: 'absolute', kg: 65 }, reps: 10 },
    })
    // Set 1 is not the ramp tier's business, so it falls to the ordinary
    // chain — where what you opened on last time outranks the plan's 65.
    expect(planned).toEqual({ weightKg: 60, reps: 10, source: 'same_set_last_time' })

    const unplanned = resolvePrefill({ setIndex: 1, previousSessionSets: ramp })
    expect(unplanned.source).toBe('same_set_last_time')
    expect(unplanned.weightKg).toBe(60)
  })

  it('outranks a plan that names one weight and one rep count for every set', () => {
    // The plan cannot express a climb — one figure cannot be 10, 8 and 6 — so
    // for set 2 onward what was actually done is the better evidence. This is
    // the one tier that takes the reps as well as the weight, and the one
    // place the plan does not get the last word on reps.
    const result = resolvePrefill({
      setIndex: 2,
      currentSessionSets: [working(1, 60, 10)],
      previousSessionSets: ramp,
      target: { weight: { kind: 'absolute', kg: 60 }, reps: 10 },
    })
    expect(result).toEqual({ weightKg: 70, reps: 8, source: 'ramp_last_time' })
  })

  it('offers the rung’s own rep count, not the one from the set below it', () => {
    // The bug this prevents: 70 kg paired with the 10 reps you did at 60.
    const result = resolvePrefill({
      setIndex: 3,
      currentSessionSets: [working(1, 60, 10), working(2, 70, 8)],
      previousSessionSets: ramp,
    })
    expect(result).toEqual({ weightKg: 80, reps: 6, source: 'ramp_last_time' })
  })

  it('leaves straight sets exactly as they were', () => {
    const result = resolvePrefill({
      setIndex: 2,
      currentSessionSets: [working(1, 80, 8)],
      previousSessionSets: [working(1, 80, 8), working(2, 80, 8), working(3, 80, 7)],
    })
    expect(result).toEqual({ weightKg: 80, reps: 8, source: 'carried_forward' })
  })

  it('falls through for a set the ramp never reached', () => {
    // A fourth set on a three-set ramp has no rung to copy.
    const result = resolvePrefill({
      setIndex: 4,
      currentSessionSets: [working(1, 60, 10), working(2, 70, 8), working(3, 80, 6)],
      previousSessionSets: ramp,
    })
    expect(result).toEqual({ weightKg: 80, reps: 6, source: 'carried_forward' })
  })

  it('ignores warm-ups on both sides of the comparison', () => {
    const result = resolvePrefill({
      setIndex: 2,
      currentSessionSets: [warmup(1, 20, 12), working(1, 60, 10)],
      previousSessionSets: [warmup(1, 20, 12), ...ramp],
    })
    expect(result).toEqual({ weightKg: 70, reps: 8, source: 'ramp_last_time' })
  })
})

describe('lastTimeSummary — the ghost line', () => {
  it('collapses a uniform load to one figure', () => {
    expect(lastTimeSummary([working(1, 77.5, 8), working(2, 77.5, 8), working(3, 77.5, 7)])).toBe(
      '77.5 kg × 8, 8, 7',
    )
  })

  it('spells out each pairing when the load varied', () => {
    expect(lastTimeSummary([working(1, 60, 10), working(2, 80, 8), working(3, 100, 5)])).toBe(
      '60 × 10, 80 × 8, 100 × 5 kg',
    )
  })

  it('says bodyweight rather than showing nothing', () => {
    expect(
      lastTimeSummary([
        { setIndex: 1, reps: 9, type: 'normal' },
        { setIndex: 2, reps: 8, type: 'normal' },
      ]),
    ).toBe('bodyweight × 9, 8')
  })

  it('excludes warm-ups from the summary', () => {
    expect(lastTimeSummary([warmup(1, 20, 12), working(1, 100, 5), working(2, 100, 5)])).toBe(
      '100 kg × 5, 5',
    )
  })

  it('returns null when there is nothing to show', () => {
    expect(lastTimeSummary([])).toBeNull()
    expect(lastTimeSummary([warmup(1, 20, 12)])).toBeNull()
  })

  it('names a dropset rather than spelling its drops out', () => {
    expect(
      lastTimeSummary([
        parent('s1', 1, 100, 5),
        parent('s2', 2, 100, 5),
        drop('s2', 1, 70, 8),
        drop('s2', 2, 50, 10),
      ]),
    ).toBe('100 kg × 5, 5 + dropset')
  })

  it('counts the chains when more than one set was dropped', () => {
    expect(
      lastTimeSummary([
        parent('s1', 1, 100, 5),
        drop('s1', 1, 70, 8),
        parent('s2', 2, 100, 5),
        drop('s2', 1, 70, 7),
      ]),
    ).toBe('100 kg × 5, 5 + 2 dropsets')
  })

  it('does not let a drop make a uniform load look varied', () => {
    // The drops are at 70 and the sets at 100. Counted as sets, the line would
    // spell out every pairing and bury the one weight that matters.
    expect(
      lastTimeSummary([parent('s1', 1, 100, 5), parent('s2', 2, 100, 5), drop('s2', 1, 70, 8)]),
    ).toBe('100 kg × 5, 5 + dropset')
  })
})

describe('resolvePrefill — dropsets are never offered back', () => {
  it('does not carry a drop forward into the next set', () => {
    // The bug this exists to stop: you finish a dropset at 30 kg, and set 3
    // opens at 30 kg because 30 kg is the last thing you logged.
    const result = resolvePrefill({
      setIndex: 3,
      currentSessionSets: [
        parent('s1', 1, 60, 8),
        parent('s2', 2, 60, 8),
        drop('s2', 1, 45, 6),
        drop('s2', 2, 30, 8),
      ],
    })
    expect(result).toEqual({ weightKg: 60, reps: 8, source: 'carried_forward' })
  })

  it('does not let last session’s drops stand in for its sets', () => {
    const result = resolvePrefill({
      setIndex: 2,
      previousSessionSets: [parent('s1', 1, 80, 8), drop('s1', 1, 60, 6)],
    })
    // Set 2 last time does not exist, so the last SET ever — not the last row.
    expect(result).toEqual({ weightKg: 80, reps: 8, source: 'last_set_ever' })
  })

  it('does not read a drop chain as a climb to repeat', () => {
    // 60/45/30 is a chain, not a ramp: offering 45 for set two would be reading
    // a dropset as a programme.
    const result = resolvePrefill({
      setIndex: 2,
      currentSessionSets: [parent('c1', 1, 60, 8)],
      previousSessionSets: [
        parent('s1', 1, 60, 8),
        drop('s1', 1, 45, 6),
        drop('s1', 2, 30, 8),
      ],
    })
    expect(result).toEqual({ weightKg: 60, reps: 8, source: 'carried_forward' })
  })
})

describe('resolveDropPrefill — the next rung of a chain', () => {
  it('offers the weight you are dropping from, with no opinion about how far', () => {
    const result = resolveDropPrefill({
      parentSetId: 's1',
      currentSessionSets: [parent('s1', 1, 60, 8)],
    })
    expect(result).toEqual({ weightKg: 60, reps: 8, source: 'dropping_from' })
  })

  it('offers the last drop once a chain is under way', () => {
    const result = resolveDropPrefill({
      parentSetId: 's1',
      currentSessionSets: [parent('s1', 1, 60, 8), drop('s1', 1, 45, 6)],
    })
    expect(result).toEqual({ weightKg: 45, reps: 6, source: 'dropping_from' })
  })

  it('repeats last session’s chain, rung by rung', () => {
    const previous = [parent('p1', 1, 60, 8), drop('p1', 1, 45, 6), drop('p1', 2, 30, 9)]

    const first = resolveDropPrefill({
      parentSetId: 's1',
      currentSessionSets: [parent('s1', 1, 60, 8)],
      previousSessionSets: previous,
    })
    expect(first).toEqual({ weightKg: 45, reps: 6, source: 'same_drop_last_time' })

    const second = resolveDropPrefill({
      parentSetId: 's1',
      currentSessionSets: [parent('s1', 1, 60, 8), drop('s1', 1, 45, 6)],
      previousSessionSets: previous,
    })
    expect(second).toEqual({ weightKg: 30, reps: 9, source: 'same_drop_last_time' })
  })

  it('moves the whole chain by whatever you opened the set at', () => {
    // 60 → 45 → 30 last week, opened at 62.5 today: the same dropset, heavier.
    const result = resolveDropPrefill({
      parentSetId: 's1',
      currentSessionSets: [parent('s1', 1, 62.5, 8)],
      previousSessionSets: [parent('p1', 1, 60, 8), drop('p1', 1, 45, 6), drop('p1', 2, 30, 9)],
    })
    expect(result).toEqual({ weightKg: 47.5, reps: 6, source: 'same_drop_last_time' })
  })

  it('goes quiet when the shift is as wide as the chain’s own step', () => {
    // 60 → 45 → 30 steps by 15. Opening at 80 is a 20 kg move, so where you
    // would drop to from there is a guess, and Gymmy does not make it.
    const result = resolveDropPrefill({
      parentSetId: 's1',
      currentSessionSets: [parent('s1', 1, 80, 5)],
      previousSessionSets: [parent('p1', 1, 60, 8), drop('p1', 1, 45, 6), drop('p1', 2, 30, 9)],
    })
    expect(result).toEqual({ weightKg: 80, reps: 5, source: 'dropping_from' })
  })

  it('prefers the chain you did four minutes ago to the one you did last week', () => {
    const result = resolveDropPrefill({
      parentSetId: 's2',
      currentSessionSets: [
        parent('s1', 1, 60, 8),
        drop('s1', 1, 40, 7),
        parent('s2', 2, 60, 8),
      ],
      previousSessionSets: [parent('p1', 1, 60, 8), drop('p1', 1, 45, 6), drop('p1', 2, 30, 9)],
    })
    expect(result).toEqual({ weightKg: 40, reps: 7, source: 'same_drop_this_session' })
  })

  it('matches last session on the set number, not on the first chain it finds', () => {
    const result = resolveDropPrefill({
      parentSetId: 's2',
      currentSessionSets: [parent('s1', 1, 60, 8), parent('s2', 2, 50, 10)],
      previousSessionSets: [
        parent('p1', 1, 60, 8),
        drop('p1', 1, 45, 6),
        parent('p2', 2, 50, 10),
        drop('p2', 1, 35, 9),
      ],
    })
    expect(result).toEqual({ weightKg: 35, reps: 9, source: 'same_drop_last_time' })
  })

  it('says nothing for a parent that is gone', () => {
    expect(
      resolveDropPrefill({ parentSetId: 'missing', currentSessionSets: [parent('s1', 1, 60, 8)] }),
    ).toEqual({ source: 'empty' })
  })
})
