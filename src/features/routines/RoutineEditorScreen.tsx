import { ChevronDown, ChevronLeft, ChevronUp, Link2, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'

import { useRoutine, useSettings } from '~/db/hooks'
import {
  addExerciseToRoutine,
  clearRoutineSetPlan,
  clearRoutineTargetWeight,
  clearRoutineVolumeGoal,
  moveRoutineExercise,
  removeRoutineExercise,
  renameRoutine,
  setRoutineSetPlan,
  setRoutineVolumeGoal,
  toggleSupersetWithPrevious,
  updateRoutineExercise,
} from '~/db/repositories/routines'
import { describePlannedSet, expandToSetPlan } from '~/domain/set-plan'
import type { Exercise, PlannedSet, Routine, RoutineExercise, Settings } from '~/domain/types'
import {
  formatVolume,
  formatWeight,
  fromDisplayUnit,
  INCREMENT,
  toDisplayUnit,
} from '~/domain/units'
import { ExercisePickerSheet } from '~/features/exercises/ExercisePickerSheet'
import { formatRestLength } from '~/lib/time'
import { Button } from '~/ui/Button'
import { Card } from '~/ui/Card'
import { InfoAffordance } from '~/ui/InfoAffordance'
import { NumericPad } from '~/ui/NumericPad'
import { Sheet } from '~/ui/Sheet'
import { cn } from '~/ui/cn'

type PadTarget =
  | { kind: 'weight'; entryId: string }
  | { kind: 'reps-min'; entryId: string }
  | { kind: 'reps-max'; entryId: string }
  // A single rung of a ladder. `row` is 0-based into `setPlan`.
  | { kind: 'rung-weight'; entryId: string; row: number }
  | { kind: 'rung-reps'; entryId: string; row: number }

type GoalMode = 'none' | 'beat_last' | 'absolute'

function goalMode(goal: Routine['volumeGoal']): GoalMode {
  return goal?.kind ?? 'none'
}

export function RoutineEditorScreen() {
  const { routineId } = useParams<{ routineId: string }>()
  const navigate = useNavigate()
  const detail = useRoutine(routineId)
  const settings = useSettings()

  const [picking, setPicking] = useState(false)
  const [pad, setPad] = useState<PadTarget | null>(null)
  const [editingName, setEditingName] = useState(false)
  const [editingGoalKg, setEditingGoalKg] = useState(false)

  if (detail === undefined) {
    return <p className="p-8 text-center text-[0.85rem] text-ink-faint">Loading…</p>
  }
  if (detail === null) {
    return (
      <div className="grid place-items-center p-8 text-center">
        <p className="font-display text-[1.5rem]">That routine is gone.</p>
        <Button className="mt-4" onClick={() => void navigate('/routines')}>
          Back to Routines
        </Button>
      </div>
    )
  }

  const { routine, entries } = detail

  const padEntry = pad ? entries.find((item) => item.entry.id === pad.entryId) : undefined

  return (
    <>
      <header className="flex items-center gap-3 border-b border-line bg-canvas px-4 pt-3 pb-3">
        <button
          type="button"
          onClick={() => void navigate('/routines')}
          aria-label="Back to Routines"
          className="grid size-[2.375rem] shrink-0 cursor-pointer place-items-center rounded-full border border-line bg-surface"
        >
          <ChevronLeft size={18} aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => setEditingName(true)}
          className="min-w-0 flex-1 cursor-pointer text-left"
        >
          <p className="label-caps text-ink-faint">Routine · tap to rename</p>
          <h1 className="truncate font-display text-[1.375rem] leading-tight">{routine.name}</h1>
        </button>
      </header>

      <div className="grid gap-2.5 px-4 pt-3.5 pb-6">
        {entries.map(({ entry, exercise }, index) => {
          const previous = entries[index - 1]
          const groupedWithPrevious =
            entry.supersetGroup != null && entry.supersetGroup === previous?.entry.supersetGroup

          return (
            <RoutineEntryCard
              key={entry.id}
              entry={entry}
              exercise={exercise}
              settings={settings}
              index={index}
              total={entries.length}
              groupedWithPrevious={groupedWithPrevious}
              canGroup={index > 0}
              onEditWeight={() => setPad({ kind: 'weight', entryId: entry.id })}
              onEditRepsMin={() => setPad({ kind: 'reps-min', entryId: entry.id })}
              onEditRepsMax={() => setPad({ kind: 'reps-max', entryId: entry.id })}
              onEditRung={(row, field) =>
                setPad({
                  kind: field === 'weight' ? 'rung-weight' : 'rung-reps',
                  entryId: entry.id,
                  row,
                })
              }
            />
          )
        })}

        <button
          type="button"
          onClick={() => setPicking(true)}
          className="w-full cursor-pointer rounded-lg border-[1.5px] border-dashed border-line-strong p-3.5 text-[0.85rem] font-bold text-ink-muted"
        >
          <Plus size={15} className="mr-1 inline align-[-2px]" aria-hidden />
          Add exercise
        </button>

        {entries.length === 0 ? (
          <p className="px-6 pt-3 text-center text-[0.85rem] leading-relaxed text-ink-muted">
            Add the exercises you do in this session, in the order you do them. Targets are a
            starting point — you can change any weight while training.
          </p>
        ) : (
          /* After the exercises, not before: the goal is a footnote on a plan,
             and nobody builds a routine by deciding its volume first. */
          <VolumeGoalCard
            routine={routine}
            settings={settings}
            onEditTarget={() => setEditingGoalKg(true)}
          />
        )}
      </div>

      <ExercisePickerSheet
        open={picking}
        onOpenChange={setPicking}
        alreadyAdded={entries.map((item) => item.entry.exerciseId)}
        onPick={(exerciseId) => {
          if (routineId) void addExerciseToRoutine(routineId, exerciseId)
          setPicking(false)
        }}
      />

      <RenameSheet
        open={editingName}
        onOpenChange={setEditingName}
        current={routine.name}
        onSave={(name) => {
          if (routineId && name.trim()) void renameRoutine(routineId, name.trim())
          setEditingName(false)
        }}
      />

      {editingGoalKg ? (
        <NumericPad
          open
          onOpenChange={(open) => !open && setEditingGoalKg(false)}
          value={toDisplayUnit(
            routine.volumeGoal?.kind === 'absolute' ? routine.volumeGoal.kg : 0,
            settings.units,
          )}
          onCommit={(value) => {
            if (!routineId) return
            // Zero is "no goal", not "lift nothing" — the same rule as a
            // target weight, so there is only ever one way to mean nothing.
            if (value <= 0) {
              void clearRoutineVolumeGoal(routineId)
              return
            }
            void setRoutineVolumeGoal(routineId, {
              kind: 'absolute',
              kg: fromDisplayUnit(value, settings.units),
            })
          }}
          unit={settings.units}
          eyebrow={`${routine.name} · volume goal`}
          // Volume is in the thousands, so a 2.5 kg step would be absurd.
          increment={settings.units === 'kg' ? 250 : 500}
          allowDecimal={false}
        />
      ) : null}

      {pad && padEntry ? (
        <NumericPad
          open
          onOpenChange={(open) => !open && setPad(null)}
          value={padValue(pad, padEntry.entry, settings)}
          onCommit={(value) => commitPad(pad, padEntry.entry, value, settings)}
          {...(isWeightPad(pad) ? { unit: settings.units } : {})}
          eyebrow={`${padEntry.exercise?.name ?? 'Exercise'} · ${padLabel(pad)}`}
          increment={isWeightPad(pad) ? INCREMENT[settings.units] : 1}
          allowDecimal={isWeightPad(pad)}
        />
      ) : null}
    </>
  )
}

/** Weight pads take decimals and a unit; rep pads take neither. */
function isWeightPad(pad: PadTarget): boolean {
  return pad.kind === 'weight' || pad.kind === 'rung-weight'
}

function padLabel(pad: PadTarget): string {
  if (pad.kind === 'weight') return 'target weight'
  if (pad.kind === 'rung-weight') return `set ${pad.row + 1} · weight`
  if (pad.kind === 'rung-reps') return `set ${pad.row + 1} · reps`
  return pad.kind === 'reps-min' ? 'target reps' : 'top of rep range'
}

function padValue(pad: PadTarget, entry: RoutineExercise, settings: Settings): number {
  if (pad.kind === 'rung-weight' || pad.kind === 'rung-reps') {
    const rung = entry.setPlan?.[pad.row]
    if (pad.kind === 'rung-reps') return rung?.reps ?? entry.targetRepsMin
    const kg = rung?.weight?.kind === 'absolute' ? rung.weight.kg : 0
    return toDisplayUnit(kg, settings.units)
  }
  if (pad.kind === 'weight') {
    const kg = entry.targetWeight?.kind === 'absolute' ? entry.targetWeight.kg : 0
    return toDisplayUnit(kg, settings.units)
  }
  if (pad.kind === 'reps-min') return entry.targetRepsMin
  return entry.targetRepsMax ?? entry.targetRepsMin
}

function commitPad(
  pad: PadTarget,
  entry: RoutineExercise,
  value: number,
  settings: Settings,
): void {
  if (pad.kind === 'rung-weight' || pad.kind === 'rung-reps') {
    // The ladder is always written whole. A rung is not a row in the database
    // — the array is — and sending a partial update would mean two code paths
    // that have to agree about the summary fields.
    const ladder = entry.setPlan ?? expandToSetPlan(entry)
    const next = ladder.map((rung, index) => {
      if (index !== pad.row) return rung
      if (pad.kind === 'rung-reps') return { ...rung, reps: Math.max(1, Math.round(value)) }

      // Zero means "no target for this rung", as it does for a flat target:
      // the set falls through to what you actually lifted.
      const { weight: _dropped, ...rest } = rung
      return value <= 0
        ? rest
        : {
            ...rest,
            weight: {
              kind: 'absolute' as const,
              kg: fromDisplayUnit(value, settings.units),
            },
          }
    })
    void setRoutineSetPlan(entry.id, next)
    return
  }

  if (pad.kind === 'weight') {
    // Zero means "no target" rather than "lift nothing" — clearing it lets
    // prefill fall through to what you actually did last time.
    if (value <= 0) {
      void clearRoutineTargetWeight(entry.id)
      return
    }
    void updateRoutineExercise(entry.id, {
      targetWeight: { kind: 'absolute', kg: fromDisplayUnit(value, settings.units) },
    })
    return
  }

  const reps = Math.max(1, Math.round(value))
  if (pad.kind === 'reps-min') {
    void updateRoutineExercise(entry.id, {
      targetRepsMin: reps,
      // Keep the range coherent rather than letting min overtake max.
      ...(entry.targetRepsMax != null && entry.targetRepsMax < reps ? { targetRepsMax: reps } : {}),
    })
  } else {
    void updateRoutineExercise(entry.id, {
      targetRepsMax: Math.max(reps, entry.targetRepsMin),
    })
  }
}

/**
 * The session volume goal for a routine.
 *
 * "Beat last time" leads because it is the one that keeps working: it needs no
 * number from you and it cannot go stale as you get stronger. A fixed figure is
 * offered for the cases where beating last time is the wrong aim — a deload, or
 * a programme that names a number.
 */
function VolumeGoalCard({
  routine,
  settings,
  onEditTarget,
}: {
  routine: Routine
  settings: Settings
  onEditTarget: () => void
}) {
  const mode = goalMode(routine.volumeGoal)

  const options: readonly { value: GoalMode; label: string }[] = [
    { value: 'none', label: 'Off' },
    { value: 'beat_last', label: 'Beat last time' },
    { value: 'absolute', label: 'Fixed' },
  ]

  return (
    <div className="mt-1.5">
      <p className="label-caps mb-2 flex items-center gap-1.5 px-1 text-ink-faint">
        Session goal
        <InfoAffordance explainerId="volume_goal" />
      </p>

      <Card>
        <div role="radiogroup" aria-label="Session volume goal" className="flex gap-1.5">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={mode === option.value}
              onClick={() => {
                if (option.value === 'none') {
                  void clearRoutineVolumeGoal(routine.id)
                } else if (option.value === 'beat_last') {
                  void setRoutineVolumeGoal(routine.id, { kind: 'beat_last' })
                } else {
                  onEditTarget()
                }
              }}
              className={cn(
                'touch-min flex-1 cursor-pointer rounded-md px-2 text-[0.75rem] font-bold',
                mode === option.value ? 'bg-accent text-on-accent' : 'bg-sunken text-ink-muted',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        {routine.volumeGoal?.kind === 'absolute' ? (
          <button
            type="button"
            onClick={onEditTarget}
            className="mt-2 w-full cursor-pointer rounded-md bg-sunken px-3 py-2.5 text-left"
          >
            <span className="label-caps block text-ink-faint">Target volume</span>
            <span className="num mt-0.5 block text-title font-semibold">
              {formatVolume(routine.volumeGoal.kg, settings.units)}
            </span>
          </button>
        ) : null}

        <p className="mt-2 text-[0.75rem] leading-relaxed text-ink-muted">
          {mode === 'none'
            ? 'No goal. The summary will still show what the session came to.'
            : mode === 'beat_last'
              ? 'Each session is measured against the last time you ran this routine. Shown on the summary when you finish — warm-ups do not count.'
              : 'Measured against this figure every session, whatever you did last time.'}
        </p>
      </Card>
    </div>
  )
}

function RoutineEntryCard({
  entry,
  exercise,
  settings,
  index,
  total,
  groupedWithPrevious,
  canGroup,
  onEditWeight,
  onEditRepsMin,
  onEditRepsMax,
  onEditRung,
}: {
  entry: RoutineExercise
  exercise: Exercise | undefined
  settings: Settings
  index: number
  total: number
  groupedWithPrevious: boolean
  canGroup: boolean
  onEditWeight: () => void
  onEditRepsMin: () => void
  onEditRepsMax: () => void
  onEditRung: (row: number, field: 'weight' | 'reps') => void
}) {
  const targetKg = entry.targetWeight?.kind === 'absolute' ? entry.targetWeight.kg : null
  const restSeconds = entry.restSeconds ?? exercise?.defaultRestSeconds ?? 120

  /**
   * Per-set mode without a stored ladder.
   *
   * A ladder whose rungs are identical is not stored — it would be a second
   * way of saying what the three boxes already say. So asking for per-set mode
   * shows the rows immediately and the first edit that makes them differ is
   * what writes anything. Local state can only turn the mode *on*; a stored
   * ladder turns it on by itself.
   */
  const [wantsPerSet, setWantsPerSet] = useState(false)
  const [confirmCollapse, setConfirmCollapse] = useState(false)

  const perSet = entry.setPlan != null || wantsPerSet
  const ladder: PlannedSet[] = entry.setPlan ?? expandToSetPlan(entry)

  return (
    <div className={cn(groupedWithPrevious && 'relative ml-4')}>
      {groupedWithPrevious ? (
        // An elbow connector: the grouping is structural, not something you
        // have to remember from a badge.
        <span
          aria-hidden
          className="absolute -top-3.5 -left-3.5 h-[calc(50%+0.875rem)] w-3 rounded-bl-md border-b-[1.5px] border-l-[1.5px] border-line-strong"
        />
      ) : null}

      <Card>
        <div className="mb-2.5 flex items-center gap-2">
          <span className="min-w-0 flex-1">
            {groupedWithPrevious ? (
              <span className="label-caps block text-accent-ink">Superset</span>
            ) : null}
            <span className="block truncate text-lead font-semibold tracking-tight">
              {exercise?.name ?? 'Unknown exercise'}
            </span>
          </span>

          <div className="flex shrink-0 items-center gap-0.5">
            <IconButton
              label={`Move ${exercise?.name ?? 'exercise'} up`}
              disabled={index === 0}
              onClick={() => void moveRoutineExercise(entry.id, -1)}
            >
              <ChevronUp size={16} aria-hidden />
            </IconButton>
            <IconButton
              label={`Move ${exercise?.name ?? 'exercise'} down`}
              disabled={index === total - 1}
              onClick={() => void moveRoutineExercise(entry.id, 1)}
            >
              <ChevronDown size={16} aria-hidden />
            </IconButton>
            <IconButton
              label={
                groupedWithPrevious
                  ? 'Split out of the superset'
                  : 'Superset with the exercise above'
              }
              disabled={!canGroup}
              active={groupedWithPrevious}
              onClick={() => void toggleSupersetWithPrevious(entry.id)}
            >
              <Link2 size={16} aria-hidden />
            </IconButton>
            <IconButton
              label={`Remove ${exercise?.name ?? 'exercise'} from this routine`}
              destructive
              onClick={() => void removeRoutineExercise(entry.id)}
            >
              <Trash2 size={15} aria-hidden />
            </IconButton>
          </div>
        </div>

        {/* The mode is a property of this exercise, not of the routine: a push
            day can have a ramped squat and three straight sets of curls. */}
        <div
          role="radiogroup"
          aria-label={`How ${exercise?.name ?? 'this exercise'} is planned`}
          className="mb-2 flex gap-1.5"
        >
          {[
            { value: false, label: 'Same every set' },
            { value: true, label: 'Per set' },
          ].map((option) => (
            <button
              key={String(option.value)}
              type="button"
              role="radio"
              aria-checked={perSet === option.value}
              onClick={() => {
                if (option.value) {
                  setWantsPerSet(true)
                  return
                }
                // Dropping a stored ladder is lossy, so it is asked about.
                // Leaving a mode nobody has typed into yet is not.
                if (entry.setPlan) setConfirmCollapse(true)
                else setWantsPerSet(false)
              }}
              className={cn(
                // Sized like the secondary chips below rather than like the
                // target boxes: this is a mode switch, not the thing you came
                // to the card to do.
                'h-8 flex-1 cursor-pointer rounded-md px-2 text-[0.72rem] font-bold',
                perSet === option.value ? 'bg-accent text-on-accent' : 'bg-sunken text-ink-muted',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        {perSet ? (
          <div className="grid gap-1.5">
            {ladder.map((rung, row) => (
              <div
                key={row}
                className="flex items-center gap-2 rounded-md bg-sunken px-2 py-1.5"
              >
                <span className="num w-4 shrink-0 text-center text-[0.7rem] font-extrabold text-ink-faint">
                  {row + 1}
                </span>

                <button
                  type="button"
                  onClick={() => onEditRung(row, 'weight')}
                  aria-label={`Set ${row + 1} weight: ${
                    rung.weight?.kind === 'absolute'
                      ? formatWeight(rung.weight.kg, settings.units)
                      : 'not set'
                  }. Edit.`}
                  className="num cursor-pointer rounded-sm border-b-2 border-accent bg-surface px-2 py-0.5 text-[1.0625rem] font-semibold"
                >
                  {rung.weight?.kind === 'absolute' ? (
                    <>
                      {formatWeight(rung.weight.kg, settings.units, { withUnit: false })}
                      <span className="ml-0.5 text-[0.7rem] font-semibold text-ink-muted">
                        {settings.units}
                      </span>
                    </>
                  ) : (
                    <span className="text-ink-faint">—</span>
                  )}
                </button>

                <span className="text-[0.85rem] text-ink-faint">×</span>

                <button
                  type="button"
                  onClick={() => onEditRung(row, 'reps')}
                  aria-label={`Set ${row + 1} reps: ${rung.reps}. Edit.`}
                  className="num min-w-12 cursor-pointer rounded-sm border-b-2 border-accent bg-surface px-2 py-0.5 text-center text-[1.0625rem] font-semibold"
                >
                  {rung.reps}
                  {rung.isAmrap ? <span className="text-accent-ink">+</span> : null}
                </button>

                <IconButton
                  className="ml-auto"
                  label={`Remove set ${row + 1}`}
                  disabled={ladder.length <= 1}
                  destructive
                  onClick={() =>
                    void setRoutineSetPlan(
                      entry.id,
                      ladder.filter((_unused, candidate) => candidate !== row),
                    )
                  }
                >
                  <Trash2 size={14} aria-hidden />
                </IconButton>
              </div>
            ))}

            <button
              type="button"
              onClick={() =>
                // A copy of the last rung: a ladder is usually extended at the
                // top, and starting from the heaviest set is one edit closer
                // than starting from an empty row.
                void setRoutineSetPlan(entry.id, [
                  ...ladder,
                  { ...(ladder.at(-1) ?? { reps: entry.targetRepsMin }) },
                ])
              }
              className="cursor-pointer rounded-md border border-dashed border-line-strong py-2 text-[0.75rem] font-bold text-ink-muted"
            >
              <Plus size={13} className="mr-1 inline align-[-2px]" aria-hidden />
              Add set
            </button>
          </div>
        ) : (
        <div className="grid grid-cols-3 gap-2">
          <TargetField
            label="Sets"
            value={String(entry.targetSets)}
            onDecrease={() =>
              void updateRoutineExercise(entry.id, {
                targetSets: Math.max(1, entry.targetSets - 1),
              })
            }
            onIncrease={() =>
              void updateRoutineExercise(entry.id, { targetSets: entry.targetSets + 1 })
            }
            decreaseLabel="One fewer set"
            increaseLabel="One more set"
          />

          <button
            type="button"
            onClick={onEditRepsMin}
            className="cursor-pointer rounded-md bg-sunken px-2 py-2 text-center"
          >
            <span className="label-caps block text-ink-faint">Reps</span>
            <span className="num mt-0.5 block text-title font-semibold">
              {entry.targetRepsMax != null && entry.targetRepsMax !== entry.targetRepsMin
                ? `${entry.targetRepsMin}–${entry.targetRepsMax}`
                : entry.targetRepsMin}
              {entry.isAmrap ? <span className="text-accent-ink">+</span> : null}
            </span>
          </button>

          <button
            type="button"
            onClick={onEditWeight}
            className="cursor-pointer rounded-md bg-sunken px-2 py-2 text-center"
          >
            <span className="label-caps block text-ink-faint">Weight</span>
            <span className="num mt-0.5 block text-title font-semibold">
              {targetKg == null ? (
                <span className="text-ink-faint">—</span>
              ) : (
                formatWeight(targetKg, settings.units, { withUnit: false })
              )}
            </span>
          </button>
        </div>
        )}

        {/* Secondary controls stay secondary. Rest is a compact inline stepper
            rather than a full-width one: it matters, but not more than the sets
            and reps above it, and a card per exercise has to stay scannable. */}
        <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-dashed border-line pt-2.5">
          <span className="flex items-center gap-1 rounded-full border border-line px-1 py-0.5">
            <button
              type="button"
              aria-label={`Decrease rest for ${exercise?.name ?? 'this exercise'}`}
              onClick={() =>
                void updateRoutineExercise(entry.id, {
                  restSeconds: Math.max(0, restSeconds - 15),
                })
              }
              className="grid size-6 cursor-pointer place-items-center rounded-full text-[0.95rem] font-semibold text-ink-muted"
            >
              −
            </button>
            <span className="num w-11 text-center text-[0.72rem] font-bold text-ink">
              {formatRestLength(restSeconds)}
            </span>
            <button
              type="button"
              aria-label={`Increase rest for ${exercise?.name ?? 'this exercise'}`}
              onClick={() =>
                void updateRoutineExercise(entry.id, {
                  restSeconds: Math.min(600, restSeconds + 15),
                })
              }
              className="grid size-6 cursor-pointer place-items-center rounded-full text-[0.95rem] font-semibold text-ink-muted"
            >
              +
            </button>
          </span>

          {/* A range is the straight-sets way of saying "between 6 and 8".
              A ladder says it per rung, so the chip would be a second, worse
              answer to the same question. */}
          {perSet ? null : (
            <button
              type="button"
              onClick={onEditRepsMax}
              className="rounded-full border border-line px-2.5 py-1.5 text-[0.7rem] font-bold text-ink-muted"
            >
              {entry.targetRepsMax == null ? 'Rep range' : 'Change range'}
            </button>
          )}

          <button
            type="button"
            aria-pressed={entry.isAmrap}
            aria-label="Take the last set to failure, as many reps as possible"
            onClick={() => {
              // In per-set mode the flag belongs to the last rung, which is
              // what "the last set" has always meant. Writing the ladder also
              // keeps the summarised `isAmrap` right, so the chip stays lit.
              if (perSet) {
                const flag = !entry.isAmrap
                void setRoutineSetPlan(
                  entry.id,
                  ladder.map((rung, row) => {
                    const { isAmrap: _was, ...rest } = rung
                    return flag && row === ladder.length - 1 ? { ...rest, isAmrap: true } : rest
                  }),
                )
                return
              }
              void updateRoutineExercise(entry.id, { isAmrap: !entry.isAmrap })
            }}
            className={cn(
              'rounded-full border px-2.5 py-1.5 text-[0.7rem] font-bold',
              entry.isAmrap
                ? 'border-accent bg-accent text-on-accent'
                : 'border-line text-ink-muted',
            )}
          >
            Last set to failure
          </button>

          <InfoAffordance explainerId="amrap" className="ml-auto" />
        </div>
      </Card>

      <Sheet
        open={confirmCollapse}
        onOpenChange={setConfirmCollapse}
        eyebrow={exercise?.name}
        title="Back to the same weight every set?"
        footer={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setConfirmCollapse(false)}>
              Keep the ladder
            </Button>
            <Button
              variant="danger"
              size="sm"
              className="flex-1"
              onClick={() => {
                void clearRoutineSetPlan(entry.id)
                setWantsPerSet(false)
                setConfirmCollapse(false)
              }}
            >
              Collapse it
            </Button>
          </div>
        }
      >
        <p className="px-5 py-4 text-[0.9rem] leading-relaxed text-ink-muted">
          The {ladder.length} sets you have written will be replaced by set one’s numbers,{' '}
          <strong className="num font-semibold text-ink">
            {describePlannedSet(ladder[0] ?? { reps: entry.targetRepsMin }, settings.units)}
          </strong>
          , repeated. Sessions you have already logged are not affected.
        </p>
      </Sheet>
    </div>
  )
}

function TargetField({
  label,
  value,
  onDecrease,
  onIncrease,
  decreaseLabel,
  increaseLabel,
}: {
  label: string
  value: string
  onDecrease: () => void
  onIncrease: () => void
  decreaseLabel: string
  increaseLabel: string
}) {
  return (
    <div className="rounded-md bg-sunken px-1 py-2 text-center">
      <span className="label-caps block text-ink-faint">{label}</span>
      <span className="mt-0.5 flex items-center justify-center gap-1">
        <button
          type="button"
          aria-label={decreaseLabel}
          onClick={onDecrease}
          className="grid size-6 cursor-pointer place-items-center rounded-sm text-[1rem] font-semibold text-ink-muted"
        >
          −
        </button>
        <span className="num w-6 text-title font-semibold">{value}</span>
        <button
          type="button"
          aria-label={increaseLabel}
          onClick={onIncrease}
          className="grid size-6 cursor-pointer place-items-center rounded-sm text-[1rem] font-semibold text-ink-muted"
        >
          +
        </button>
      </span>
    </div>
  )
}

function IconButton({
  label,
  children,
  onClick,
  disabled = false,
  destructive = false,
  active = false,
  className,
}: {
  label: string
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  destructive?: boolean
  active?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'grid size-8 cursor-pointer place-items-center rounded-full',
        'disabled:pointer-events-none disabled:opacity-30',
        destructive ? 'text-danger' : active ? 'text-accent-ink' : 'text-ink-muted',
        className,
      )}
    >
      {children}
    </button>
  )
}

function RenameSheet({
  open,
  onOpenChange,
  current,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  current: string
  onSave: (name: string) => void
}) {
  const [draft, setDraft] = useState(current)

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next) setDraft(current)
        onOpenChange(next)
      }}
      title="Name this routine"
      footer={
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" className="flex-1" onClick={() => onSave(draft)}>
            Save
          </Button>
        </div>
      }
    >
      <div className="px-5 py-4">
        {/* The one place the OS keyboard is correct: this is text, not a number. */}
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          aria-label="Routine name"
          autoComplete="off"
          className="w-full rounded-md border border-line bg-surface px-3.5 py-3 text-[1rem] outline-none focus-visible:border-accent"
          placeholder="Push A"
        />
        <p className="mt-2 text-[0.75rem] leading-relaxed text-ink-muted">
          Sessions keep the name they were started with, so renaming this will not change what your
          past workouts are called.
        </p>
      </div>
    </Sheet>
  )
}
