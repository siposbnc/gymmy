import { MoreVertical, TrendingUp } from 'lucide-react'
import { useMemo, useState } from 'react'

import type { SessionExerciseView } from '~/db/hooks'
import {
  deleteSet,
  logSet,
  removeSessionExercise,
  setExerciseMachineWeight,
  setExerciseRest,
  toggleWarmup,
  updateSet,
} from '~/db/repositories/sessions'
import { useRestTimer } from '~/features/rest/restTimer'
import { platform } from '~/lib/platform'
import { formatRestLength } from '~/lib/time'
import { Stepper } from '~/ui/Stepper'
import { barContext, describeBar, resolveBar, resolveBarWeight, usesBar } from '~/domain/bars'
import {
  addedWeightKg,
  machineWeightKg,
  totalWeightKg,
  usesMachineWeight,
} from '~/domain/machines'
import { describePlannedSet, setPlanUnitSuffix } from '~/domain/set-plan'
import {
  calculatePlates,
  formatPlates,
  lastTimeSummary,
  resolvePrefill,
  smallestStepKg,
  suggestProgression,
} from '~/domain/metrics'
import type { Settings, SetEntry } from '~/domain/types'
import {
  formatWeight,
  fromDisplayUnit,
  INCREMENT,
  roundForDisplay,
  toDisplayUnit,
} from '~/domain/units'
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
  /**
   * Open the exercise picker in swap mode.
   *
   * Raised to the screen rather than owned here: the picker runs live queries
   * over the exercise library, and one per card would mean a query per
   * exercise in the workout for a sheet that is closed almost always.
   */
  onSwap?: () => void
}

export function ExerciseCard({
  view,
  settings,
  active = false,
  groupedWithPrevious = false,
  onSwap,
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
          plan: sessionExercise.setPlan,
        },
      }),
    [
      nextIndex,
      sets,
      previousSets,
      sessionExercise.targetWeight,
      sessionExercise.targetRepsMin,
      sessionExercise.setPlan,
    ],
  )

  // Drafts, prefill and everything downstream deal in the TOTAL load, exactly
  // as `SetEntry.weightKg` does. The machine weight is subtracted at the one
  // point the user touches a number and added straight back on commit, so no
  // calculation in the app has to know this exercise is a machine.
  const machineKg = machineWeightKg(sessionExercise)
  const ladder = sessionExercise.setPlan ?? []

  const weightKg = draftWeight ?? prefill.weightKg
  const reps = draftReps ?? prefill.reps

  const ghost = useMemo(() => lastTimeSummary(previousSets, unit), [previousSets, unit])

  const progressionInput = useMemo(
    () => ({
      previousSessionSets: previousSets,
      target: {
        sets: sessionExercise.targetSets,
        repsMin: sessionExercise.targetRepsMin,
        repsMax: sessionExercise.targetRepsMax,
      },
      stepKg: smallestStepKg(
        usesBar(exercise),
        settings.plateInventory,
        fromDisplayUnit(INCREMENT[unit], unit),
      ),
    }),
    [previousSets, sessionExercise, exercise, settings.plateInventory, unit],
  )

  // Only before the first set of this exercise: once you have logged something,
  // what you are lifting today is settled and the advice is noise.
  const suggestion =
    settings.suggestProgression && sets.length === 0 ? suggestProgression(progressionInput) : null

  const bar = useMemo(() => resolveBar(exercise, barContext(settings)), [exercise, settings])

  const plates = useMemo(
    () =>
      weightKg == null || !usesBar(exercise)
        ? null
        : calculatePlates({
            targetKg: weightKg,
            barWeightKg: resolveBarWeight(exercise, barContext(settings)),
            inventory: settings.plateInventory,
          }),
    [weightKg, exercise, settings],
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
      // A set with a weight but no rep count is a set you did once — logging
      // it as zero would quietly drop it out of volume and records.
      reps: reps != null && reps > 0 ? reps : 1,
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

  // Only reps-only work may be logged weightless; everywhere else a zero is a
  // set that silently vanishes from volume and records.
  const weightRequired = (exercise?.trackingType ?? 'weight_reps') !== 'reps_only'

  const padConfig = (() => {
    if (!pad) return null

    if (pad.kind === 'pending-weight') {
      // The pad opens on the number the user tapped. On a machine that is what
      // they added, so it converts both ways here; `requirePositive` also has
      // to relax, because nothing on the carriage is a legitimate entry when
      // the carriage itself weighs something.
      const added = addedWeightKg(weightKg, machineKg)
      return {
        value: added == null ? 0 : toDisplayUnit(added, unit),
        unit,
        increment: INCREMENT[unit],
        allowDecimal: true,
        requirePositive: weightRequired && machineKg <= 0,
        eyebrow:
          machineKg > 0
            ? `${exercise?.name ?? 'Exercise'} · set ${nextIndex} · weight you add`
            : `${exercise?.name ?? 'Exercise'} · set ${nextIndex} · weight`,
        commit: (value: number) =>
          setDraftWeight(totalWeightKg(fromDisplayUnit(value, unit), machineKg) ?? 0),
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
        requirePositive: weightRequired,
        // A logged row shows the total, so this pad edits the total — the pad
        // always opens on the number that was tapped. Naming the machine in
        // the eyebrow is what stops that being a trap.
        eyebrow:
          machineKg > 0
            ? `${exercise?.name ?? 'Exercise'} · edit total, incl. ${formatWeight(machineKg, unit)} machine`
            : `${exercise?.name ?? 'Exercise'} · edit weight`,
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
              <span className="label-caps block text-accent-ink">Superset</span>
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

        {/* A ladder is the one plan you cannot infer from the set rows, so it
            is written out — with the rung you are on picked out, because
            reading a list to find your place between sets is a tax. */}
        {ladder.length > 0 ? (
          <p className="num mb-2.5 text-meta text-ink-muted">
            <span className="label-caps mr-1.5 text-ink-faint">plan</span>
            {ladder.map((rung, index) => (
              <span key={index}>
                {index > 0 ? <span className="text-ink-faint"> · </span> : null}
                <span
                  className={
                    index + 1 === nextIndex && !draftWarmup ? 'font-semibold text-ink' : undefined
                  }
                >
                  {describePlannedSet(rung, unit)}
                </span>
              </span>
            ))}
            <span className="text-ink-faint">{setPlanUnitSuffix(ladder, unit)}</span>
          </p>
        ) : null}

        {/* Advice, not instruction: it sits beside the plan rather than inside
            the set row, and nothing changes until it is tapped. Hidden once
            accepted, because by then the pending row says the same thing. */}
        {suggestion && weightKg !== suggestion.toKg ? (
          <div className="mb-2.5 flex items-center gap-2 rounded-md bg-accent-wash px-2.5 py-1.5">
            <TrendingUp size={14} className="shrink-0 self-start text-accent-ink" aria-hidden />
            <p className="min-w-0 flex-1 text-[0.75rem] leading-snug text-ink">
              {/* The ⓘ is display:grid, so it needs a flex row around it or it
                  takes a line of its own inside running text. */}
              <span className="flex items-center gap-1.5">
                <span>
                  Ready for{' '}
                  <strong className="num font-semibold">
                    {formatWeight(suggestion.toKg, unit)}
                  </strong>
                </span>
                <InfoAffordance explainerId="progression" exampleInput={progressionInput} />
              </span>
              <span className="mt-0.5 block text-ink-muted">
                you cleared {suggestion.sets}×{suggestion.clearedReps} at{' '}
                {formatWeight(suggestion.fromKg, unit)}
              </span>
            </p>
            <button
              type="button"
              onClick={() => {
                setDraftWeight(suggestion.toKg)
                setDraftReps(suggestion.reps)
              }}
              aria-label={`Use ${formatWeight(suggestion.toKg, unit)} for ${suggestion.reps} reps`}
              className="h-8 shrink-0 cursor-pointer rounded-full bg-accent px-3 text-[0.72rem] font-extrabold text-on-accent active:scale-95"
            >
              Use
            </button>
          </div>
        ) : null}

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
            machineWeightKg={machineKg}
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
          <p className="num mt-2.5 flex flex-wrap items-center gap-x-1.5 border-t border-dashed border-line pt-2.5 text-[0.72rem] text-ink-muted">
            <span className="label-caps text-ink-faint">plates / side</span>
            <strong className="font-semibold text-ink">{formatPlates(plates)}</strong>
            {!plates.exact ? <span className="text-ink-faint">· not exact</span> : null}
            {/* Naming the bar matters once there is more than one: the same
                plates on a 10 kg bar are a different total. */}
            <span className="text-ink-faint">· {describeBar(bar, unit)}</span>
            <InfoAffordance
              explainerId="plates"
              exampleInput={{
                targetKg: weightKg,
                barWeightKg: resolveBarWeight(exercise, barContext(settings)),
                inventory: settings.plateInventory,
              }}
            />
          </p>
        ) : null}

        {/* Stated once per card rather than on every row: the logged rows above
            read as plain weights, and this is the sentence that tells you what
            those weights include. */}
        {machineKg > 0 ? (
          <p className="num mt-2.5 flex flex-wrap items-center gap-x-1.5 border-t border-dashed border-line pt-2.5 text-[0.72rem] text-ink-muted">
            <span className="label-caps text-ink-faint">machine</span>
            <strong className="font-semibold text-ink">{formatWeight(machineKg, unit)}</strong>
            <span className="text-ink-faint">· logged weights include it</span>
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
            requirePositive={padConfig.requirePositive ?? false}
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

          {/* The session's machine weight is snapshotted, so editing the
              exercise elsewhere deliberately will not reach this workout. That
              makes this the only place a wrong value can be fixed while you
              are standing in front of the machine — so it writes both, exactly
              as the rest control above does. */}
          {usesMachineWeight(exercise) ? (
            <div className="border-b border-line px-5 py-4">
              <p className="label-caps mb-2 text-ink-faint">What the machine weighs empty</p>
              <Stepper
                value={roundForDisplay(toDisplayUnit(machineKg, unit), unit)}
                onChange={(displayValue) => {
                  if (exercise) {
                    void setExerciseMachineWeight(
                      sessionExercise.id,
                      exercise.id,
                      fromDisplayUnit(Math.max(0, displayValue), unit),
                    )
                  }
                }}
                step={INCREMENT[unit]}
                min={0}
                max={roundForDisplay(toDisplayUnit(300, unit), unit)}
                unit={unit}
                hint="Added to every set you log here"
                decreaseLabel={`Decrease machine weight by ${INCREMENT[unit]} ${unit}`}
                increaseLabel={`Increase machine weight by ${INCREMENT[unit]} ${unit}`}
              />
            </div>
          ) : null}

          <div className="pb-2">
            {/* The substitution is a normal part of training — the rack is
                taken, the machine is broken — and the alternative without it is
                delete-and-re-add, which costs the exercise its place, its
                superset grouping and its targets. The sub-label states what
                happens to sets already logged before the picker opens: they
                come along, which is to say they end up counted as the new
                exercise. */}
            <button
              type="button"
              onClick={() => {
                setExerciseMenu(false)
                onSwap?.()
              }}
              className="flex w-full cursor-pointer items-center gap-3 px-5 py-3.5 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[0.95rem] font-medium">Swap for another exercise</span>
                <span className="block text-[0.75rem] text-ink-muted">
                  {sets.length === 0
                    ? 'Keeps its place and its rep targets'
                    : `Your ${sets.length} logged set${sets.length === 1 ? '' : 's'} move${sets.length === 1 ? 's' : ''} with it`}
                </span>
              </span>
            </button>

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
