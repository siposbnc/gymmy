import { ChevronLeft, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'

import { useSessionDetail, useSettings } from '~/db/hooks'
import {
  deleteSession,
  recomputeRecordsForSession,
  setSessionDuration,
} from '~/db/repositories/history'
import {
  addExerciseToSession,
  deleteSet,
  logSet,
  moveSetToExercise,
  removeSessionExercise,
  toggleWarmup,
  updateSet,
} from '~/db/repositories/sessions'
import { ExercisePickerSheet } from '~/features/exercises/ExercisePickerSheet'
import { describeVolumeGoal, resolveVolumeGoal, type VolumeGoalResult } from '~/domain/goals'
import { totalVolume } from '~/domain/metrics'
import { describeRecordKind } from '~/domain/records'
import type { SetEntry } from '~/domain/types'
import {
  formatVolume,
  formatWeight,
  fromDisplayUnit,
  INCREMENT,
  toDisplayUnit,
  type WeightUnit,
} from '~/domain/units'
import { SetActionsSheet } from '~/features/session/SetActionsSheet'
import { SetRow } from '~/features/session/SetRow'
import { formatDuration } from '~/lib/time'
import { Button } from '~/ui/Button'
import { Card } from '~/ui/Card'
import { InfoAffordance } from '~/ui/InfoAffordance'
import { NumericPad } from '~/ui/NumericPad'
import { Sheet } from '~/ui/Sheet'

type PadTarget =
  | { kind: 'weight'; setId: string }
  | { kind: 'reps'; setId: string }
  | { kind: 'rpe'; setId: string }

/**
 * A past session, fully editable.
 *
 * Read-only history is a lie people stop trusting: everyone forgets a set or
 * fat-fingers a weight. Every edit here re-settles records, so correcting a
 * typo six weeks later produces the right PR board rather than leaving a
 * record pointing at work that never happened.
 */
export function SessionDetailScreen() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const detail = useSessionDetail(sessionId)
  const settings = useSettings()

  const [pad, setPad] = useState<PadTarget | null>(null)
  const [actionsFor, setActionsFor] = useState<SetEntry | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [picking, setPicking] = useState(false)
  const [movingSet, setMovingSet] = useState<SetEntry | null>(null)
  const [editingDuration, setEditingDuration] = useState(false)
  /** Only set for an exercise that still has sets — an empty one just goes. */
  const [removingExercise, setRemovingExercise] = useState<{
    sessionExerciseId: string
    name: string
    sets: SetEntry[]
  } | null>(null)

  /**
   * Append a set, seeded from the last one logged for that exercise.
   *
   * A forgotten set is nearly always more of what you were already doing, so
   * copying the previous values means the usual case needs no editing at all.
   */
  async function addForgottenSet(sessionExerciseId: string, existing: SetEntry[]) {
    const last = [...existing].filter((set) => set.type !== 'warmup').at(-1)
    await logSet(sessionExerciseId, {
      weightKg: last?.weightKg,
      reps: last?.reps ?? 1,
    })
    resettle()
  }

  if (detail === undefined) {
    return <p className="p-8 text-center text-[0.85rem] text-ink-faint">Loading…</p>
  }
  if (detail === null) {
    return (
      <div className="grid place-items-center p-8 text-center">
        <p className="font-display text-[1.5rem]">That session is gone.</p>
        <Button className="mt-4" onClick={() => void navigate('/history')}>
          Back to History
        </Button>
      </div>
    )
  }

  const { session, exercises, records, previousKg } = detail
  const allSets = exercises.flatMap((entry) => entry.sets)
  const workingSets = allSets.filter((set) => set.type !== 'warmup')
  const volume = totalVolume({ sets: allSets })
  const duration = session.endedAt ? (session.endedAt - session.startedAt) / 1000 : null

  const goal = resolveVolumeGoal({
    goal: session.volumeGoalSnapshot,
    actualKg: volume,
    previousKg,
  })

  /**
   * Any edit can change what the records are, so re-settle them.
   *
   * NOT `completeSession` — that also stamps `endedAt` with the current time,
   * which is correct when you finish a workout and badly wrong when you fix a
   * typo in it hours later. Doing so stretched a two-hour session into a
   * six-hour one. This only recomputes records.
   */
  const resettle = () => {
    if (sessionId) void recomputeRecordsForSession(sessionId)
  }

  const padSet = pad ? allSets.find((set) => set.id === pad.setId) : undefined

  return (
    <>
      <header className="flex items-center gap-3 border-b border-line bg-canvas px-4 pt-3 pb-3">
        <button
          type="button"
          onClick={() => void navigate('/history')}
          aria-label="Back to History"
          className="grid size-[2.375rem] shrink-0 cursor-pointer place-items-center rounded-full border border-line bg-surface"
        >
          <ChevronLeft size={18} aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          <p className="label-caps text-ink-faint">
            {new Date(session.startedAt).toLocaleDateString(undefined, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </p>
          <h1 className="truncate font-display text-[1.375rem] leading-tight">{session.name}</h1>
        </div>
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          aria-label="Delete this session"
          className="grid size-[2.375rem] shrink-0 cursor-pointer place-items-center rounded-full text-danger"
        >
          <Trash2 size={17} aria-hidden />
        </button>
      </header>

      <div className="grid gap-3 px-4 pt-3.5 pb-6">
        <Card>
          <dl className="grid grid-cols-3 gap-3">
            {/* Tappable: duration is recorded rather than entered, so it can
                be wrong — a forgotten finish, or an app bug that once stamped
                the wrong end time. */}
            <button
              type="button"
              onClick={() => setEditingDuration(true)}
              className="cursor-pointer text-left"
            >
              <Stat
                label="Duration"
                value={
                  <span className="border-b-2 border-accent">
                    {duration == null ? '—' : formatDuration(duration)}
                  </span>
                }
              />
            </button>
            <Stat label="Sets" value={String(workingSets.length)} />
            <Stat
              label="Volume"
              value={formatVolume(volume, settings.units)}
              explainerId="volume"
              exampleInput={{ sets: allSets }}
            />
          </dl>
        </Card>

        {goal.kind === 'none' ? null : <VolumeGoalRow goal={goal} unit={settings.units} />}

        {records.length > 0 ? (
          <div className="rounded-lg bg-pr-fill p-3.5">
            <p className="label-caps mb-1.5 flex items-center gap-1.5 text-on-pr">
              ★ Records set this session
              <InfoAffordance explainerId="records" className="border-on-pr text-on-pr" />
            </p>
            <ul className="grid gap-1">
              {records.map((record) => (
                <li key={record.id} className="num text-[0.82rem] leading-relaxed text-on-pr">
                  <strong className="font-bold">
                    {exercises.find((entry) => entry.exerciseId === record.exerciseId)?.name ??
                      'Exercise'}
                  </strong>{' '}
                  — {describeRecordKind(record.kind, record.atWeightKg).toLowerCase()},{' '}
                  {record.kind === 'max_session_volume'
                    ? formatVolume(record.value, settings.units)
                    : record.kind === 'max_weight'
                      ? formatWeight(record.value, settings.units)
                      : `${record.value} reps`}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {exercises.map((entry) => (
          <Card key={entry.sessionExerciseId}>
            <div className="mb-2 flex items-center gap-2">
              <h2 className="min-w-0 flex-1 truncate text-lead font-semibold tracking-tight">
                {entry.name}
              </h2>
              {/* Moving sets elsewhere leaves the old exercise behind empty,
                  and there was no way to clear it out. */}
              <button
                type="button"
                aria-label={`Remove ${entry.name} from this session`}
                onClick={() => {
                  if (entry.sets.length === 0) {
                    void removeSessionExercise(entry.sessionExerciseId).then(resettle)
                  } else {
                    setRemovingExercise(entry)
                  }
                }}
                className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-ink-faint"
              >
                <Trash2 size={15} aria-hidden />
              </button>
            </div>
            {entry.sets.length === 0 ? (
              <p className="text-[0.8rem] text-ink-faint">No sets logged.</p>
            ) : (
              <div className="grid gap-1.5">
                {entry.sets.map((set) => (
                  <SetRow
                    key={set.id}
                    set={set}
                    unit={settings.units}
                    trackingType="weight_reps"
                    onEditWeight={() => setPad({ kind: 'weight', setId: set.id })}
                    onEditReps={() => setPad({ kind: 'reps', setId: set.id })}
                    onOpenActions={() => setActionsFor(set)}
                  />
                ))}
              </div>
            )}

            {/* Forgetting a set is normal; so is remembering it later. */}
            <button
              type="button"
              onClick={() => void addForgottenSet(entry.sessionExerciseId, entry.sets)}
              className="mt-2 w-full cursor-pointer rounded-md border border-dashed border-line-strong py-2 text-[0.78rem] font-bold text-ink-muted"
            >
              <Plus size={14} className="mr-1 inline align-[-2px]" aria-hidden />
              Add a set
            </button>
          </Card>
        ))}

        <button
          type="button"
          onClick={() => setPicking(true)}
          className="w-full cursor-pointer rounded-lg border-[1.5px] border-dashed border-line-strong p-3.5 text-[0.85rem] font-bold text-ink-muted"
        >
          <Plus size={15} className="mr-1 inline align-[-2px]" aria-hidden />
          Add an exercise
        </button>

        {exercises.length === 0 ? (
          <p className="px-6 pt-2 text-center text-[0.85rem] leading-relaxed text-ink-muted">
            This session has no exercises in it. Add one if you logged this workout somewhere else
            and want it here.
          </p>
        ) : null}
      </div>

      <ExercisePickerSheet
        open={picking}
        onOpenChange={setPicking}
        alreadyAdded={exercises.map((entry) => entry.exerciseId)}
        onPick={(exerciseId) => {
          if (sessionId) {
            void addExerciseToSession(sessionId, exerciseId).then(resettle)
          }
          setPicking(false)
        }}
      />

      {editingDuration ? (
        <NumericPad
          open
          onOpenChange={(open) => !open && setEditingDuration(false)}
          // Minutes, not seconds: nobody remembers a workout to the second,
          // and a four-digit second count would be absurd to type.
          value={duration == null ? 0 : Math.round(duration / 60)}
          onCommit={(minutes) => {
            if (sessionId) void setSessionDuration(sessionId, Math.max(0, minutes) * 60)
          }}
          unit="min"
          eyebrow={`${session.name} · how long it took`}
          increment={5}
          allowDecimal={false}
        />
      ) : null}

      <Sheet
        open={removingExercise !== null}
        onOpenChange={(open) => !open && setRemovingExercise(null)}
        eyebrow={removingExercise?.name}
        title="Remove this exercise?"
        footer={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setRemovingExercise(null)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              size="sm"
              className="flex-1"
              onClick={() => {
                if (removingExercise) {
                  void removeSessionExercise(removingExercise.sessionExerciseId).then(resettle)
                }
                setRemovingExercise(null)
              }}
            >
              Remove
            </Button>
          </div>
        }
      >
        <p className="px-5 py-4 text-[0.9rem] leading-relaxed text-ink-muted">
          This also deletes the {removingExercise?.sets.length} set
          {removingExercise?.sets.length === 1 ? '' : 's'} logged against it. If you meant to keep
          them, move them to another exercise first from the set menu.
        </p>
      </Sheet>

      <Sheet
        open={movingSet !== null}
        onOpenChange={(open) => !open && setMovingSet(null)}
        eyebrow="Move set"
        title="Which exercise was it?"
      >
        <ul className="divide-y divide-line pb-2">
          {exercises
            .filter((entry) => entry.sessionExerciseId !== movingSet?.sessionExerciseId)
            .map((entry) => (
              <li key={entry.sessionExerciseId}>
                <button
                  type="button"
                  onClick={() => {
                    if (movingSet) {
                      void moveSetToExercise(movingSet.id, entry.sessionExerciseId).then(resettle)
                    }
                    setMovingSet(null)
                  }}
                  className="w-full cursor-pointer px-5 py-3.5 text-left text-[0.95rem] font-medium"
                >
                  {entry.name}
                </button>
              </li>
            ))}
        </ul>
      </Sheet>

      {pad && padSet ? (
        <NumericPad
          open
          onOpenChange={(open) => !open && setPad(null)}
          value={
            pad.kind === 'weight'
              ? toDisplayUnit(padSet.weightKg ?? 0, settings.units)
              : pad.kind === 'reps'
                ? (padSet.reps ?? 0)
                : (padSet.rpe ?? 8)
          }
          onCommit={(value) => {
            if (pad.kind === 'weight') {
              void updateSet(padSet.id, { weightKg: fromDisplayUnit(value, settings.units) })
            } else if (pad.kind === 'reps') {
              void updateSet(padSet.id, { reps: Math.max(0, Math.round(value)) })
            } else {
              void updateSet(padSet.id, { rpe: Math.min(10, Math.max(1, Math.round(value))) })
            }
            resettle()
          }}
          {...(pad.kind === 'weight' ? { unit: settings.units } : {})}
          eyebrow={`Edit ${pad.kind === 'rpe' ? 'RPE' : pad.kind}`}
          increment={pad.kind === 'weight' ? INCREMENT[settings.units] : 1}
          allowDecimal={pad.kind === 'weight'}
        />
      ) : null}

      <SetActionsSheet
        set={actionsFor}
        open={actionsFor !== null}
        onOpenChange={(open) => !open && setActionsFor(null)}
        onToggleWarmup={() => {
          if (actionsFor) {
            void toggleWarmup(actionsFor.id).then(resettle)
          }
          setActionsFor(null)
        }}
        onEditRpe={() => {
          if (actionsFor) setPad({ kind: 'rpe', setId: actionsFor.id })
          setActionsFor(null)
        }}
        onDelete={() => {
          if (actionsFor) {
            void deleteSet(actionsFor.id).then(resettle)
          }
          setActionsFor(null)
        }}
        // Only offered when there is somewhere else in this session to put it.
        onMove={
          exercises.length > 1
            ? () => {
                setMovingSet(actionsFor)
                setActionsFor(null)
              }
            : undefined
        }
      />

      <Sheet
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        eyebrow={session.name}
        title="Delete this session?"
        footer={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              size="sm"
              className="flex-1"
              onClick={() => {
                if (sessionId) {
                  void deleteSession(sessionId).then(() => navigate('/history'))
                }
              }}
            >
              Delete
            </Button>
          </div>
        }
      >
        <p className="px-5 py-4 text-[0.9rem] leading-relaxed text-ink-muted">
          This removes {workingSets.length} logged set
          {workingSets.length === 1 ? '' : 's'} and cannot be undone. Any records this session held
          will fall back to your next best.
        </p>
      </Sheet>
    </>
  )
}

/**
 * How the session measured against its volume goal.
 *
 * Deliberately not scored. There is no green tick and no red cross: going
 * lighter for a deload, or heavier for fewer reps, both read as "less volume"
 * and neither is a failure. It states the two numbers and lets you decide what
 * they mean, which is the same stance records take.
 *
 * The bar is scaled so the target notch stays visible when you overshoot —
 * a fill pinned at 100% would throw away the interesting part.
 */
function VolumeGoalRow({ goal, unit }: { goal: VolumeGoalResult; unit: WeightUnit }) {
  const ratio = goal.ratio
  const scale = Math.max(ratio ?? 1, 1)

  return (
    <Card>
      <p className="label-caps flex items-center gap-1.5 text-ink-faint">
        Volume goal
        <InfoAffordance explainerId="volume_goal" />
      </p>

      <p className="num mt-1 text-[1.05rem] font-semibold">
        {goal.targetKg == null ? (
          <span className="text-ink-muted">{describeVolumeGoal(goal, unit)}</span>
        ) : (
          <>
            {formatVolume(goal.actualKg, unit)}
            <span className="ml-1.5 text-[0.8rem] font-medium text-ink-muted">
              {describeVolumeGoal(goal, unit)}
            </span>
          </>
        )}
      </p>

      {ratio == null ? null : (
        <div
          className="relative mt-2.5 h-2 overflow-hidden rounded-full bg-sunken"
          role="img"
          aria-label={describeVolumeGoal(goal, unit)}
        >
          <span
            className="absolute inset-y-0 left-0 rounded-full bg-accent"
            style={{ width: `${(ratio / scale) * 100}%` }}
          />
          {/* The target, marked rather than coloured — the line is the fact. */}
          <span
            aria-hidden
            className="absolute inset-y-0 w-0.5 bg-ink"
            style={{ left: `calc(${(1 / scale) * 100}% - 1px)` }}
          />
        </div>
      )}
    </Card>
  )
}

function Stat({
  label,
  value,
  explainerId,
  exampleInput,
}: {
  label: string
  value: React.ReactNode
  explainerId?: string
  exampleInput?: unknown
}) {
  return (
    <div>
      <dt className="label-caps flex items-center gap-1.5 text-ink-faint">
        {label}
        {explainerId ? (
          <InfoAffordance explainerId={explainerId} exampleInput={exampleInput} />
        ) : null}
      </dt>
      <dd className="num mt-0.5 text-title font-semibold">{value}</dd>
    </div>
  )
}
