import { ChevronDown, ChevronLeft, ChevronUp, Link2, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'

import { useRoutine, useSettings } from '~/db/hooks'
import {
  addExerciseToRoutine,
  clearRoutineTargetWeight,
  moveRoutineExercise,
  removeRoutineExercise,
  renameRoutine,
  toggleSupersetWithPrevious,
  updateRoutineExercise,
} from '~/db/repositories/routines'
import type { Exercise, RoutineExercise, Settings } from '~/domain/types'
import { formatWeight, fromDisplayUnit, INCREMENT, toDisplayUnit } from '~/domain/units'
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

export function RoutineEditorScreen() {
  const { routineId } = useParams<{ routineId: string }>()
  const navigate = useNavigate()
  const detail = useRoutine(routineId)
  const settings = useSettings()

  const [picking, setPicking] = useState(false)
  const [pad, setPad] = useState<PadTarget | null>(null)
  const [editingName, setEditingName] = useState(false)

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
        ) : null}
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

      {pad && padEntry ? (
        <NumericPad
          open
          onOpenChange={(open) => !open && setPad(null)}
          value={padValue(pad, padEntry.entry, settings)}
          onCommit={(value) => commitPad(pad, padEntry.entry, value, settings)}
          {...(pad.kind === 'weight' ? { unit: settings.units } : {})}
          eyebrow={`${padEntry.exercise?.name ?? 'Exercise'} · ${padLabel(pad)}`}
          increment={pad.kind === 'weight' ? INCREMENT[settings.units] : 1}
          allowDecimal={pad.kind === 'weight'}
        />
      ) : null}
    </>
  )
}

function padLabel(pad: PadTarget): string {
  if (pad.kind === 'weight') return 'target weight'
  return pad.kind === 'reps-min' ? 'target reps' : 'top of rep range'
}

function padValue(pad: PadTarget, entry: RoutineExercise, settings: Settings): number {
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
      ...(entry.targetRepsMax != null && entry.targetRepsMax < reps
        ? { targetRepsMax: reps }
        : {}),
    })
  } else {
    void updateRoutineExercise(entry.id, {
      targetRepsMax: Math.max(reps, entry.targetRepsMin),
    })
  }
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
}) {
  const targetKg = entry.targetWeight?.kind === 'absolute' ? entry.targetWeight.kg : null
  const restSeconds = entry.restSeconds ?? exercise?.defaultRestSeconds ?? 120

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

          <button
            type="button"
            onClick={onEditRepsMax}
            className="rounded-full border border-line px-2.5 py-1.5 text-[0.7rem] font-bold text-ink-muted"
          >
            {entry.targetRepsMax == null ? 'Rep range' : 'Change range'}
          </button>

          <button
            type="button"
            aria-pressed={entry.isAmrap}
            aria-label="Take the last set to failure, as many reps as possible"
            onClick={() => void updateRoutineExercise(entry.id, { isAmrap: !entry.isAmrap })}
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
}: {
  label: string
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  destructive?: boolean
  active?: boolean
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
