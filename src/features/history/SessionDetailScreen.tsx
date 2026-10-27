import { ChevronLeft, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'

import { useSessionDetail, useSettings } from '~/db/hooks'
import { completeSession, deleteSession } from '~/db/repositories/history'
import { deleteSet, toggleWarmup, updateSet } from '~/db/repositories/sessions'
import { totalVolume } from '~/domain/metrics'
import { describeRecordKind } from '~/domain/records'
import type { SetEntry } from '~/domain/types'
import { formatVolume, formatWeight, fromDisplayUnit, INCREMENT, toDisplayUnit } from '~/domain/units'
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

  const { session, exercises, records } = detail
  const allSets = exercises.flatMap((entry) => entry.sets)
  const workingSets = allSets.filter((set) => set.type !== 'warmup')
  const volume = totalVolume({ sets: allSets })
  const duration = session.endedAt ? (session.endedAt - session.startedAt) / 1000 : null

  /** Any edit can change what the records are, so re-settle them. */
  const resettle = () => {
    if (sessionId) void completeSession(sessionId)
  }

  const padSet = pad ? allSets.find((set) => set.id === pad.setId) : undefined

  return (
    <>
      <header className="flex items-center gap-3 border-b border-line bg-canvas px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
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
            <Stat label="Duration" value={duration == null ? '—' : formatDuration(duration)} />
            <Stat label="Sets" value={String(workingSets.length)} />
            <Stat
              label="Volume"
              value={formatVolume(volume, settings.units)}
              explainerId="volume"
              exampleInput={{ sets: allSets }}
            />
          </dl>
        </Card>

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
            <h2 className="mb-2 text-lead font-semibold tracking-tight">{entry.name}</h2>
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
          </Card>
        ))}

        {exercises.length === 0 ? (
          <p className="px-6 py-6 text-center text-[0.85rem] text-ink-muted">
            This session has no exercises in it.
          </p>
        ) : null}
      </div>

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

function Stat({
  label,
  value,
  explainerId,
  exampleInput,
}: {
  label: string
  value: string
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
