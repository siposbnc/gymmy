import { MoreVertical } from 'lucide-react'
import { useMemo, useState } from 'react'

import type { SessionExerciseView } from '~/db/hooks'
import {
  deleteSet,
  logSet,
  removeSessionExercise,
  setExerciseRest,
  toggleWarmup,
  updateSet,
} from '~/db/repositories/sessions'
import { useRestTimer } from '~/features/rest/restTimer'
import { platform } from '~/lib/platform'
import { formatRestLength } from '~/lib/time'
import { Stepper } from '~/ui/Stepper'
import { calculatePlates, formatPlates, lastTimeSummary, resolvePrefill } from '~/domain/metrics'
import type { Settings, SetEntry } from '~/domain/types'
import { fromDisplayUnit, INCREMENT, toDisplayUnit } from '~/domain/units'
import { Card } from '~/ui/Card'
import { InfoAffordance } from '~/ui/InfoAffordance'
import { NumericPad } from '~/ui/NumericPad'
import { Sheet } from '~/ui/Sheet'

import { PendingSetRow } from './PendingSetRow'
import { SetActionsSheet } from './SetActionsSheet'
import { SetRow } from './SetRow'

type PadTarget =
  | { kind: 'pending-weight' }
  | { kind: 'pending-reps' }
  | { kind: 'set-weight'; setId: string }
  | { kind: 'set-reps'; setId: string }
  | { kind: 'set-rpe'; setId: string }

interface ExerciseCardProps {
  view: SessionExerciseView
  settings: Settings
  active?: boolean
  /** Shares a superset group with the exercise above it. */
  groupedWithPrevious?: boolean
}

export function ExerciseCard({
  view,
  settings,
  active = false,
  groupedWithPrevious = false,
}: ExerciseCardProps) {
  const { sessionExercise, exercise, sets, previousSets } = view
  const unit = settings.units

  const [pad, setPad] = useState<PadTarget | null>(null)
  const [actionsFor, setActionsFor] = useState<string | null>(null)
  const [exerciseMenu, setExerciseMenu] = useState(false)

  // Draft values for the row that has not been logged yet. `null` means
  // "follow the prefill chain"; a number means the user has overridden it.
  const [draftWeight, setDraftWeight] = useState<number | null>(null)
  const [draftReps, setDraftReps] = useState<number | null>(null)
  const [draftWarmup, setDraftWarmup] = useState(false)

  const workingSets = sets.filter((set) => set.type !== 'warmup')
  const warmupSets = sets.filter((set) => set.type === 'warmup')
  const nextIndex = draftWarmup ? warmupSets.length + 1 : workingSets.length + 1

  const prefill = useMemo(
    () =>
      resolvePrefill({
        setIndex: nextIndex,
        currentSessionSets: sets,
        previousSessionSets: previousSets,
        // Snapshotted at session start, so editing the routine mid-workout
        // cannot change what the remaining sets ask for.
        target: {
          weight: sessionExercise.targetWeight,
          reps: sessionExercise.targetRepsMin,
        },
      }),
    [nextIndex, sets, previousSets, sessionExercise.targetWeight, sessionExercise.targetRepsMin],
  )

  const weightKg = draftWeight ?? prefill.weightKg
  const reps = draftReps ?? prefill.reps

  const ghost = useMemo(() => lastTimeSummary(previousSets, unit), [previousSets, unit])

  const plates = useMemo(
    () =>
      weightKg == null || exercise?.equipment !== 'barbell'
        ? null
        : calculatePlates({
            targetKg: weightKg,
            barWeightKg: settings.barWeightKg,
            inventory: settings.plateInventory,
          }),
    [weightKg, exercise?.equipment, settings.barWeightKg, settings.plateInventory],
  )

  const activeSet: SetEntry | null = sets.find((set) => set.id === actionsFor) ?? null

  const startRest = useRestTimer((state) => state.start)

  const restSeconds =
    sessionExercise.restSeconds ?? exercise?.defaultRestSeconds ?? settings.defaultRestSeconds

  async function handleLog() {
    // iOS will not let audio play unless it has been unlocked from a user
    // gesture. The Log tap is the only gesture guaranteed to precede a rest
    // timer, so this is the right place to do it.
    void platform.audio.unlock()

    await logSet(sessionExercise.id, {
      weightKg,
      reps,
      type: draftWarmup ? 'warmup' : 'normal',
    })

    // Auto-start removes a tap from a loop that repeats thirty times a session.
    if (settings.autoStartRest && restSeconds > 0) {
      startRest(restSeconds, exercise?.name ?? 'Rest')
    }

    // Clear the overrides so the next row follows the chain again — which now
    // carries forward what was just logged.
    setDraftWeight(null)
    setDraftReps(null)
    setDraftWarmup(false)
  }

  // --- numeric pad plumbing ------------------------------------------------

  const padConfig = (() => {
    if (!pad) return null

    if (pad.kind === 'pending-weight') {
      return {
        value: weightKg == null ? 0 : toDisplayUnit(weightKg, unit),
        unit,
        increment: INCREMENT[unit],
        allowDecimal: true,
        eyebrow: `${exercise?.name ?? 'Exercise'} · set ${nextIndex} · weight`,
        commit: (value: number) => setDraftWeight(fromDisplayUnit(value, unit)),
      }
    }
    if (pad.kind === 'pending-reps') {
      return {
        value: reps ?? 0,
        increment: 1,
        allowDecimal: false,
        eyebrow: `${exercise?.name ?? 'Exercise'} · set ${nextIndex} · reps`,
        commit: (value: number) => setDraftReps(Math.round(value)),
      }
    }

    const target = sets.find((set) => set.id === pad.setId)
    if (!target) return null

    if (pad.kind === 'set-weight') {
      return {
        value: target.weightKg == null ? 0 : toDisplayUnit(target.weightKg, unit),
        unit,
        increment: INCREMENT[unit],
        allowDecimal: true,
        eyebrow: `${exercise?.name ?? 'Exercise'} · edit weight`,
        commit: (value: number) =>
          void updateSet(target.id, { weightKg: fromDisplayUnit(value, unit) }),
      }
    }
    if (pad.kind === 'set-reps') {
      return {
        value: target.reps ?? 0,
        increment: 1,
        allowDecimal: false,
        eyebrow: `${exercise?.name ?? 'Exercise'} · edit reps`,
        commit: (value: number) => void updateSet(target.id, { reps: Math.round(value) }),
      }
    }
    return {
      value: target.rpe ?? 8,
      increment: 1,
      allowDecimal: false,
      eyebrow: `${exercise?.name ?? 'Exercise'} · RPE, 1–10`,
      commit: (value: number) =>
        void updateSet(target.id, { rpe: Math.min(10, Math.max(1, Math.round(value))) }),
    }
  })()

  return (
    <div className={groupedWithPrevious ? 'relative ml-4' : undefined}>
      {groupedWithPrevious ? (
        // Same elbow connector as the routine editor: the grouping has to be
        // visible where you train it, not only where you planned it.
        <span
          aria-hidden
          className="absolute -top-3 -left-3.5 h-[calc(50%+0.75rem)] w-3 rounded-bl-md border-b-[1.5px] border-l-[1.5px] border-line-strong"
        />
      ) : null}

      <Card active={active}>
        <div className="mb-0.5 flex items-center gap-2">
          <h2 className="min-w-0 flex-1">
            {groupedWithPrevious ? (
              <span className="label-caps block text-accent">Superset</span>
            ) : null}
            <span className="block truncate text-lead font-semibold tracking-tight">
              {exercise?.name ?? 'Unknown exercise'}
            </span>
          </h2>
          <span className="num shrink-0 text-[0.7rem] font-extrabold tracking-wide text-ink-faint">
            {sessionExercise.targetSets == null
              ? `${workingSets.length} set${workingSets.length === 1 ? '' : 's'}`
              : `${workingSets.length} of ${sessionExercise.targetSets}`}{' '}
            · rest {formatRestLength(restSeconds)}
          </span>
          <button
            type="button"
            onClick={() => setExerciseMenu(true)}
            aria-label={`${exercise?.name ?? 'Exercise'} options`}
            className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-full text-ink-faint"
          >
            <MoreVertical size={16} aria-hidden />
          </button>
        </div>

        {/* The most-read text in the app, so it is never behind a tap. */}
        <p className="num mb-2.5 text-meta text-ink-muted">
          <span className="label-caps mr-1.5 text-ink-faint">last time</span>
          {ghost ?? <span className="text-ink-faint italic">first time — no history yet</span>}
        </p>

        <div className="grid gap-1.5">
          {sets.map((set) => (
            <SetRow
              key={set.id}
              set={set}
              unit={unit}
              trackingType={exercise?.trackingType ?? 'weight_reps'}
              onEditWeight={() => setPad({ kind: 'set-weight', setId: set.id })}
              onEditReps={() => setPad({ kind: 'set-reps', setId: set.id })}
              onOpenActions={() => setActionsFor(set.id)}
            />
          ))}

          <PendingSetRow
            setIndex={nextIndex}
            weightKg={weightKg}
            reps={reps}
            source={prefill.source}
            isWarmup={draftWarmup}
            unit={unit}
            trackingType={exercise?.trackingType ?? 'weight_reps'}
            onEditWeight={() => setPad({ kind: 'pending-weight' })}
            onEditReps={() => setPad({ kind: 'pending-reps' })}
            onToggleWarmup={() => setDraftWarmup((current) => !current)}
            onLog={() => void handleLog()}
          />
        </div>

        {plates ? (
          <p className="num mt-2.5 flex items-center gap-1.5 border-t border-dashed border-line pt-2.5 text-[0.72rem] text-ink-muted">
            <span className="label-caps text-ink-faint">plates / side</span>
            <strong className="font-semibold text-ink">{formatPlates(plates)}</strong>
            {!plates.exact ? <span className="text-ink-faint">· not exact</span> : null}
            <InfoAffordance
              explainerId="plates"
              exampleInput={{
                targetKg: weightKg,
                barWeightKg: settings.barWeightKg,
                inventory: settings.plateInventory,
              }}
            />
          </p>
        ) : null}

        {padConfig ? (
          <NumericPad
            open
            onOpenChange={(open) => !open && setPad(null)}
            value={padConfig.value}
            onCommit={padConfig.commit}
            {...(padConfig.unit ? { unit: padConfig.unit } : {})}
            eyebrow={padConfig.eyebrow}
            increment={padConfig.increment}
            allowDecimal={padConfig.allowDecimal}
          />
        ) : null}

        <SetActionsSheet
          set={activeSet}
          open={actionsFor !== null}
          onOpenChange={(open) => !open && setActionsFor(null)}
          onToggleWarmup={() => {
            if (activeSet) void toggleWarmup(activeSet.id)
            setActionsFor(null)
          }}
          onEditRpe={() => {
            if (activeSet) setPad({ kind: 'set-rpe', setId: activeSet.id })
            setActionsFor(null)
          }}
          onDelete={() => {
            if (activeSet) void deleteSet(activeSet.id)
            setActionsFor(null)
          }}
        />

        <Sheet
          open={exerciseMenu}
          onOpenChange={setExerciseMenu}
          eyebrow={exercise?.name}
          title="Exercise options"
        >
          <div className="border-b border-line px-5 py-4">
            <p className="label-caps mb-2 text-ink-faint">Rest after each set</p>
            <Stepper
              value={restSeconds}
              onChange={(seconds) => {
                if (exercise) void setExerciseRest(sessionExercise.id, exercise.id, seconds)
              }}
              step={15}
              min={0}
              max={600}
              unit={formatRestLength(restSeconds)}
              hint="Remembered for this exercise next time"
              decreaseLabel="Decrease rest by 15 seconds"
              increaseLabel="Increase rest by 15 seconds"
            />
          </div>

          <div className="pb-2">
            <button
              type="button"
              onClick={() => {
                void removeSessionExercise(sessionExercise.id)
                setExerciseMenu(false)
              }}
              className="flex w-full cursor-pointer items-center gap-3 px-5 py-3.5 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[0.95rem] font-medium text-danger">
                  Remove from this workout
                </span>
                <span className="block text-[0.75rem] text-ink-muted">
                  {sets.length > 0
                    ? `Deletes ${sets.length} logged set${sets.length === 1 ? '' : 's'}`
                    : 'Nothing logged yet'}
                </span>
              </span>
            </button>
          </div>
        </Sheet>
      </Card>
    </div>
  )
}
