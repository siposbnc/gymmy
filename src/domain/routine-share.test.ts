import { describe, expect, it } from 'vitest'

import {
  buildSharedRoutine,
  bytesToPayload,
  formatShareCode,
  fromBase64Url,
  payloadToBytes,
  planImport,
  readShareCode,
  ShareCodeError,
  toBase64Url,
  type SharedRoutine,
} from './routine-share'
import type { Exercise } from './types'

const exercise = (overrides: Partial<Exercise> = {}): Exercise => ({
  id: 'bench-press',
  name: 'Bench Press',
  muscleGroups: ['chest', 'triceps'],
  equipment: 'barbell',
  movementType: 'compound',
  trackingType: 'weight_reps',
  defaultRestSeconds: 180,
  isCustom: false,
  ...overrides,
})

const payload = (overrides: Partial<SharedRoutine> = {}): SharedRoutine => ({
  version: 1,
  name: 'Push A',
  entries: [
    {
      exerciseId: 'bench-press',
      targetSets: 3,
      targetRepsMin: 6,
      targetRepsMax: 8,
      isAmrap: false,
      targetWeight: { kind: 'absolute', kg: 80 },
    },
  ],
  library: [
    {
      id: 'bench-press',
      name: 'Bench Press',
      muscleGroups: ['chest', 'triceps'],
      equipment: 'barbell',
      movementType: 'compound',
      trackingType: 'weight_reps',
      defaultRestSeconds: 180,
    },
  ],
  ...overrides,
})

describe('base64url', () => {
  it('round-trips bytes of every length modulo 3', () => {
    for (let length = 0; length < 12; length += 1) {
      const bytes = new Uint8Array(Array.from({ length }, (_, index) => (index * 37) % 256))
      expect(Array.from(fromBase64Url(toBase64Url(bytes)))).toEqual(Array.from(bytes))
    }
  })

  it('emits nothing a URL or a chat app would mangle', () => {
    const bytes = new Uint8Array(Array.from({ length: 256 }, (_, index) => index))
    expect(toBase64Url(bytes)).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('survives text btoa cannot encode', () => {
    // The reason this is hand-rolled: btoa throws above U+00FF.
    const text = 'Láb nap 💪'
    const bytes = new TextEncoder().encode(text)
    expect(new TextDecoder().decode(fromBase64Url(toBase64Url(bytes)))).toBe(text)
  })

  it('refuses characters that are not part of a code', () => {
    expect(() => fromBase64Url('abc$def')).toThrow(ShareCodeError)
  })
})

describe('the code envelope', () => {
  it('round-trips through the marker', () => {
    const bytes = new Uint8Array([1, 2, 3, 250, 251])
    expect(Array.from(readShareCode(formatShareCode(bytes)))).toEqual([1, 2, 3, 250, 251])
  })

  it('tolerates what a chat app does to a pasted string', () => {
    const bytes = new Uint8Array([9, 8, 7, 6, 5, 4])
    const mangled = `\n  ${formatShareCode(bytes).replace(/(.{8})/g, '$1\n')}  \n`
    expect(Array.from(readShareCode(mangled))).toEqual([9, 8, 7, 6, 5, 4])
  })

  it('says what is wrong when the paste is not a code at all', () => {
    expect(() => readShareCode('have you tried squatting more')).toThrow(/does not look like/i)
    expect(() => readShareCode('')).toThrow(ShareCodeError)
    expect(() => readShareCode('GYMMY-R1.')).toThrow(/does not look like/i)
  })

  it('names the real problem when the code is from a newer Gymmy', () => {
    expect(() => readShareCode('GYMMY-R7.AAAA')).toThrow(/newer version/i)
  })
})

describe('bytesToPayload', () => {
  it('round-trips a payload', () => {
    const original = payload()
    expect(bytesToPayload(payloadToBytes(original))).toEqual(original)
  })

  it('rejects a newer payload version even when it would parse', () => {
    const bytes = payloadToBytes({ ...payload(), version: 99 })
    expect(() => bytesToPayload(bytes)).toThrow(/newer version/i)
  })

  it('rejects bytes that are not a routine', () => {
    expect(() => bytesToPayload(new TextEncoder().encode('{"version":1}'))).toThrow(/damaged/i)
    expect(() => bytesToPayload(new TextEncoder().encode('not json'))).toThrow(/damaged/i)
  })

  describe('degrading rather than refusing', () => {
    it('keeps the routine when an exercise has a kind of equipment it has never heard of', () => {
      const bytes = payloadToBytes({
        ...payload(),
        library: [{ ...payload().library[0]!, equipment: 'sandbag' as never }],
      })

      const parsed = bytesToPayload(bytes)
      expect(parsed.library[0]?.equipment).toBe('other')
      expect(parsed.entries).toHaveLength(1)
    })

    it('keeps the muscle groups it recognises and falls back when none are left', () => {
      const bytes = payloadToBytes({
        ...payload(),
        library: [
          { ...payload().library[0]!, muscleGroups: ['chest', 'adductors' as never] },
          { ...payload().library[0]!, id: 'x', muscleGroups: ['adductors' as never] },
        ],
      })

      const parsed = bytesToPayload(bytes)
      expect(parsed.library[0]?.muscleGroups).toEqual(['chest'])
      expect(parsed.library[1]?.muscleGroups).toEqual(['full_body'])
    })

    it('drops a target weight of an unrecognised kind rather than the whole entry', () => {
      const bytes = payloadToBytes({
        ...payload(),
        entries: [
          { ...payload().entries[0]!, targetWeight: { kind: 'vibes', amount: 9 } as never },
        ],
      })

      const parsed = bytesToPayload(bytes)
      expect(parsed.entries[0]).not.toHaveProperty('targetWeight')
      expect(parsed.entries[0]?.targetSets).toBe(3)
    })

    it('drops a rep maximum that is below the minimum', () => {
      const bytes = payloadToBytes({
        ...payload(),
        entries: [{ ...payload().entries[0]!, targetRepsMin: 8, targetRepsMax: 5 }],
      })

      expect(bytesToPayload(bytes).entries[0]).not.toHaveProperty('targetRepsMax')
    })
  })

  it('refuses a set count that is not a routine', () => {
    const bytes = payloadToBytes({
      ...payload(),
      entries: [{ ...payload().entries[0]!, targetSets: 1e9 }],
    })
    expect(() => bytesToPayload(bytes)).toThrow(/damaged/i)
  })
})

describe('buildSharedRoutine', () => {
  const routine = { name: 'Push A', notes: 'Slow eccentrics' }
  const entries = [
    { exerciseId: 'bench-press', targetSets: 3, targetRepsMin: 8, isAmrap: false },
  ]

  it('carries a definition for every exercise it references', () => {
    const shared = buildSharedRoutine({
      routine,
      entries,
      exercises: [exercise(), exercise({ id: 'squat', name: 'Squat' })],
    })

    // Only the referenced one, and it is carried even though it is a built-in:
    // the recipient may be on a build whose seed library predates it.
    expect(shared.library.map((item) => item.id)).toEqual(['bench-press'])
  })

  it('leaves behind everything that describes the sender rather than the exercise', () => {
    const shared = buildSharedRoutine({
      routine,
      entries,
      exercises: [
        exercise({
          barId: 'bar_mine',
          machineWeightKg: 25,
          notes: 'Bench feels better with the thumbless grip',
          pinnedAt: 1_700_000_000_000,
          archivedAt: 1_700_000_000_000,
        }),
      ],
    })

    const carried = shared.library[0]!
    expect(carried).not.toHaveProperty('barId')
    // What the leg press in your gym weighs is not a fact about the plan, and
    // carrying it would add kilograms to every set the recipient logs.
    expect(carried).not.toHaveProperty('machineWeightKg')
    expect(carried).not.toHaveProperty('notes')
    expect(carried).not.toHaveProperty('pinnedAt')
    expect(carried).not.toHaveProperty('archivedAt')
    expect(carried).not.toHaveProperty('isCustom')
    // Routine notes are plan instructions, so those do travel.
    expect(shared.notes).toBe('Slow eccentrics')
  })

  it('carries a ladder, because the shape of the work is the plan', () => {
    const ladder = [
      { reps: 10, weight: { kind: 'absolute' as const, kg: 60 } },
      { reps: 8, weight: { kind: 'absolute' as const, kg: 70 } },
      { reps: 6, weight: { kind: 'absolute' as const, kg: 80 }, isAmrap: true },
    ]

    const shared = buildSharedRoutine({
      routine,
      entries: [{ ...entries[0]!, setPlan: ladder }],
      exercises: [exercise()],
    })

    expect(shared.entries[0]?.setPlan).toEqual(ladder)
    // Alongside the flat targets, never instead of them: a recipient whose
    // build predates ladders drops the field and imports straight sets.
    expect(shared.entries[0]?.targetSets).toBe(3)
    expect(shared.entries[0]?.targetRepsMin).toBe(8)
  })

  it('survives the round trip through bytes', () => {
    const ladder = [
      { reps: 10, weight: { kind: 'absolute' as const, kg: 60 } },
      { reps: 6, weight: { kind: 'absolute' as const, kg: 80 } },
    ]

    const shared = buildSharedRoutine({
      routine,
      entries: [{ ...entries[0]!, setPlan: ladder }],
      exercises: [exercise()],
    })

    expect(bytesToPayload(payloadToBytes(shared)).entries[0]?.setPlan).toEqual(ladder)
  })
})

describe('planImport', () => {
  const custom = {
    id: 'ex_abc',
    name: 'Landmine Press',
    muscleGroups: ['shoulders' as const],
    equipment: 'barbell' as const,
    movementType: 'compound' as const,
    trackingType: 'weight_reps' as const,
    defaultRestSeconds: 120,
  }

  it('points at the exercise it already has, by id', () => {
    const plan = planImport(payload(), [exercise()])

    expect(plan.entries[0]?.exerciseId).toBe('bench-press')
    expect(plan.entries[0]).not.toHaveProperty('create')
  })

  it('imports a ladder as a ladder, and drops the flat weight beside it', () => {
    const shared = payload({
      entries: [
        {
          exerciseId: 'bench-press',
          targetSets: 3,
          targetRepsMin: 6,
          targetRepsMax: 10,
          isAmrap: false,
          // A sender on a build that writes both; the ladder is the live one.
          targetWeight: { kind: 'absolute', kg: 70 },
          setPlan: [
            { reps: 10, weight: { kind: 'absolute', kg: 60 } },
            { reps: 8, weight: { kind: 'absolute', kg: 70 } },
            { reps: 6, weight: { kind: 'absolute', kg: 80 } },
          ],
        },
      ],
    })

    const draft = planImport(shared, [exercise()]).entries[0]?.draft
    expect(draft?.setPlan).toHaveLength(3)
    expect(draft).not.toHaveProperty('targetWeight')
    expect(draft?.targetSets).toBe(3)
  })

  it('treats a ladder of identical rungs as the straight sets it is', () => {
    const shared = payload({
      entries: [
        {
          exerciseId: 'bench-press',
          targetSets: 2,
          targetRepsMin: 8,
          isAmrap: false,
          targetWeight: { kind: 'absolute', kg: 80 },
          setPlan: [
            { reps: 8, weight: { kind: 'absolute', kg: 80 } },
            { reps: 8, weight: { kind: 'absolute', kg: 80 } },
          ],
        },
      ],
    })

    const draft = planImport(shared, [exercise()]).entries[0]?.draft
    expect(draft).not.toHaveProperty('setPlan')
    expect(draft?.targetWeight).toEqual({ kind: 'absolute', kg: 80 })
  })

  it('matches by name when the local copy was renamed', () => {
    const shared = payload({
      entries: [{ exerciseId: 'ex_abc', targetSets: 3, targetRepsMin: 10, isAmrap: false }],
      library: [custom],
    })

    // Same movement, built independently on this device under the same name.
    const plan = planImport(shared, [exercise({ id: 'ex_mine', name: 'landmine press ' })])

    expect(plan.entries[0]?.exerciseId).toBe('ex_mine')
    expect(plan.entries[0]).not.toHaveProperty('create')
  })

  it('prefers a live exercise over an archived one of the same name', () => {
    const shared = payload({
      entries: [{ exerciseId: 'ex_abc', targetSets: 3, targetRepsMin: 10, isAmrap: false }],
      library: [custom],
    })

    const plan = planImport(shared, [
      exercise({ id: 'ex_old', name: 'Landmine Press', archivedAt: 1 }),
      exercise({ id: 'ex_live', name: 'Landmine Press' }),
    ])

    expect(plan.entries[0]?.exerciseId).toBe('ex_live')
  })

  it("keeps the sender's id when it has to create the exercise, so a second import is a no-op", () => {
    const shared = payload({
      entries: [{ exerciseId: 'ex_abc', targetSets: 3, targetRepsMin: 10, isAmrap: false }],
      library: [custom],
    })

    const first = planImport(shared, [])
    expect(first.entries[0]?.create?.name).toBe('Landmine Press')
    expect(first.entries[0]?.exerciseId).toBe('ex_abc')

    // Replay with that exercise now present: nothing left to create.
    const second = planImport(shared, [exercise({ id: 'ex_abc', name: 'Landmine Press' })])
    expect(second.entries[0]).not.toHaveProperty('create')
  })

  it('drops an entry it can neither match nor build', () => {
    const shared = payload({
      entries: [
        payload().entries[0]!,
        { exerciseId: 'ex_missing', targetSets: 3, targetRepsMin: 10, isAmrap: false },
      ],
    })

    const plan = planImport(shared, [exercise()])
    expect(plan.entries).toHaveLength(1)
    expect(plan.entries.map((entry) => entry.draft.order)).toEqual([0])
  })

  it('refuses a code with nothing left in it', () => {
    const shared = payload({
      entries: [{ exerciseId: 'ex_missing', targetSets: 3, targetRepsMin: 10, isAmrap: false }],
      library: [],
    })

    expect(() => planImport(shared, [])).toThrow(ShareCodeError)
  })

  it('carries the plan, targets and all', () => {
    const shared = payload({
      notes: 'Rest 3 min on the first two',
      volumeGoal: { kind: 'beat_last' },
      entries: [
        {
          exerciseId: 'bench-press',
          targetSets: 4,
          targetRepsMin: 5,
          targetRepsMax: 8,
          isAmrap: true,
          targetWeight: { kind: 'absolute', kg: 82.5 },
          restSeconds: 210,
          supersetGroup: 2,
          notes: 'Pause on the chest',
        },
      ],
    })

    const plan = planImport(shared, [exercise()])

    expect(plan.routine).toEqual({
      name: 'Push A',
      notes: 'Rest 3 min on the first two',
      volumeGoal: { kind: 'beat_last' },
    })
    expect(plan.entries[0]?.draft).toEqual({
      exerciseId: 'bench-press',
      order: 0,
      targetSets: 4,
      targetRepsMin: 5,
      targetRepsMax: 8,
      isAmrap: true,
      targetWeight: { kind: 'absolute', kg: 82.5 },
      restSeconds: 210,
      supersetGroup: 2,
      notes: 'Pause on the chest',
    })
  })
})
