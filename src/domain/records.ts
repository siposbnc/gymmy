import type { PersonalRecord, RecordKind, SetType } from './types'

/** The minimum a logged set must expose for record detection. */
export interface RecordSet {
  readonly id: string
  readonly sessionId: string
  readonly completedAt: number
  readonly type: SetType
  readonly weightKg?: number | undefined
  readonly reps?: number | undefined
}

/** A record before the repository assigns it an id. */
export type RecordDraft = Omit<PersonalRecord, 'id'>

/**
 * A record's id is derived from what the record IS, not generated.
 *
 * Its identity is the (exercise, kind, weight) tuple — "heaviest squat",
 * "most reps at 100 kg bench". That makes recomputation stable: rebuilding
 * records after an edit, an import or a restore produces the same rows rather
 * than churning ids, so a backup round-trips byte-for-byte and a merge import
 * stays idempotent.
 */
export function recordId(draft: RecordDraft): string {
  const weight =
    draft.atWeightKg == null ? '' : `_${String(draft.atWeightKg).replace('.', '-')}`
  return `prc_${draft.exerciseId}_${draft.kind}${weight}`
}

const isWorking = (set: RecordSet) => set.type !== 'warmup'

const isCounted = (set: RecordSet) =>
  isWorking(set) && (set.reps ?? 0) > 0 && (set.weightKg ?? 0) >= 0

/**
 * Compute an exercise's current records from its complete logged history.
 *
 * Three kinds, all of them OBSERVATIONS of work that happened. There is
 * deliberately no estimated-1RM member: an estimate is a model output, so it
 * can never trigger a record, appear on the board, or fire a celebration.
 * `records.test.ts` asserts that no estimate can leak in here.
 *
 * Recomputed from scratch rather than updated incrementally. Idempotent, free
 * of the drift that incremental record-keeping accumulates, and it means
 * editing or deleting a set months later produces the correct records rather
 * than leaving a stale one behind.
 *
 * Ties do not count. You have to beat a record to take it, so when two sets
 * share the best value the earlier one keeps it — it got there first.
 */
export function computeRecords(
  exerciseId: string,
  sets: readonly RecordSet[],
): RecordDraft[] {
  const counted = sets.filter(isCounted)
  if (counted.length === 0) return []

  // Earliest first, so "first to reach this value" wins every tie naturally.
  const chronological = [...counted].sort((a, b) => a.completedAt - b.completedAt)

  const drafts: RecordDraft[] = []

  // --- Heaviest weight lifted ---------------------------------------------
  //
  // Ranked on weight FIRST, then reps. At equal weight more reps is strictly
  // the better performance, so 60 kg × 3 supersedes 60 kg × 2 and the record
  // points at the set you would actually want to see. Comparing on weight
  // alone left it stuck on whichever set came first, which was usually the
  // weakest one — you work up to your best set, not down from it.
  //
  // Reps only break a tie on weight; they never let a lighter set win. And a
  // tie on both still goes to the earlier set, because you have to beat a
  // record to take it.
  let heaviest: RecordSet | undefined
  for (const set of chronological) {
    const weight = set.weightKg ?? 0
    if (weight <= 0) continue
    if (heaviest === undefined) {
      heaviest = set
      continue
    }
    const bestWeight = heaviest.weightKg ?? 0
    const better =
      weight > bestWeight ||
      (weight === bestWeight && (set.reps ?? 0) > (heaviest.reps ?? 0))
    if (better) heaviest = set
  }
  if (heaviest) {
    drafts.push({
      exerciseId,
      kind: 'max_weight',
      value: heaviest.weightKg!,
      setEntryId: heaviest.id,
      sessionId: heaviest.sessionId,
      achievedAt: heaviest.completedAt,
    })
  }

  // --- Most reps at each weight you have actually revisited ----------------
  //
  // Per distinct weight rather than only at the current max: "I got 9 at 100
  // today, I only ever got 8 before" is real progress, and it is invisible if
  // records only track the heaviest bar you have touched.
  //
  // But only for weights trained in MORE THAN ONE session. On a linear
  // progression every weight is used once and then left behind, so without
  // this every single week would mint a "most reps at 137.5 kg" record and
  // bury the three records that mean something. Coming back to a weight and
  // doing better is an achievement; the first time you try a weight is just
  // the first time you tried it.
  const sessionsAtWeight = new Map<number, Set<string>>()
  const bestAtWeight = new Map<number, RecordSet>()

  for (const set of chronological) {
    const weight = set.weightKg ?? 0
    if (weight <= 0) continue

    const seen = sessionsAtWeight.get(weight) ?? new Set<string>()
    seen.add(set.sessionId)
    sessionsAtWeight.set(weight, seen)

    const current = bestAtWeight.get(weight)
    if (!current || (set.reps ?? 0) > (current.reps ?? 0)) bestAtWeight.set(weight, set)
  }

  for (const [weightKg, set] of bestAtWeight) {
    if ((sessionsAtWeight.get(weightKg)?.size ?? 0) < 2) continue
    drafts.push({
      exerciseId,
      kind: 'max_reps_at_weight',
      value: set.reps!,
      atWeightKg: weightKg,
      setEntryId: set.id,
      sessionId: set.sessionId,
      achievedAt: set.completedAt,
    })
  }

  // --- Biggest single-session volume --------------------------------------
  const perSession = new Map<string, { volume: number; at: number }>()
  for (const set of chronological) {
    const volume = (set.weightKg ?? 0) * (set.reps ?? 0)
    if (volume <= 0) continue
    const current = perSession.get(set.sessionId)
    perSession.set(set.sessionId, {
      volume: (current?.volume ?? 0) + volume,
      at: Math.max(current?.at ?? 0, set.completedAt),
    })
  }

  let bestSession: { sessionId: string; volume: number; at: number } | undefined
  for (const [sessionId, { volume, at }] of perSession) {
    if (!bestSession || volume > bestSession.volume) bestSession = { sessionId, volume, at }
  }
  if (bestSession && bestSession.volume > 0) {
    drafts.push({
      exerciseId,
      kind: 'max_session_volume',
      value: bestSession.volume,
      sessionId: bestSession.sessionId,
      achievedAt: bestSession.at,
    })
  }

  return drafts
}

/**
 * Which of these records were earned in a given session.
 *
 * Used for the session summary and the inline badge. Because records carry the
 * session that set them, "new today" is simply a filter rather than a diff —
 * and it stays correct even after a later edit forces a recompute.
 */
export function recordsFromSession(
  records: readonly RecordDraft[],
  sessionId: string,
): RecordDraft[] {
  return records.filter((record) => record.sessionId === sessionId)
}

/**
 * Whether a specific set holds a record.
 *
 * Only weight and reps-at-weight records point at an individual set; session
 * volume belongs to the session as a whole, so no single row wears it.
 */
export function recordForSet(
  records: readonly RecordDraft[],
  setEntryId: string,
): RecordDraft | undefined {
  return records.find((record) => record.setEntryId === setEntryId)
}

const KIND_LABEL: Record<RecordKind, string> = {
  max_weight: 'Heaviest weight',
  max_reps_at_weight: 'Most reps',
  max_session_volume: 'Biggest session volume',
}

export function describeRecordKind(kind: RecordKind, atWeightKg?: number): string {
  if (kind === 'max_reps_at_weight' && atWeightKg != null) {
    return `Most reps at ${atWeightKg} kg`
  }
  return KIND_LABEL[kind]
}
