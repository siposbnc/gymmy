import { useEffect, useState } from 'react'

import { useSettings } from '~/db/hooks'
import {
  clearExerciseBar,
  clearExerciseMachineWeight,
  createCustomExercise,
  updateExercise,
} from '~/db/repositories/exercises'
import { usesBar } from '~/domain/bars'
import { usesMachineWeight } from '~/domain/machines'
import { MUSCLE_OPTIONS } from '~/domain/muscles'
import type { Equipment, Exercise, MovementType, MuscleGroup, TrackingType } from '~/domain/types'
import { fromDisplayUnit, roundForDisplay, toDisplayUnit } from '~/domain/units'
import { formatRestLength } from '~/lib/time'
import { Button } from '~/ui/Button'
import { Sheet } from '~/ui/Sheet'
import { cn } from '~/ui/cn'

const MUSCLES = MUSCLE_OPTIONS

const EQUIPMENT: readonly { value: Equipment; label: string }[] = [
  { value: 'barbell', label: 'Barbell' },
  { value: 'dumbbell', label: 'Dumbbell' },
  { value: 'machine', label: 'Machine' },
  { value: 'cable', label: 'Cable' },
  { value: 'bodyweight', label: 'Bodyweight' },
  { value: 'kettlebell', label: 'Kettlebell' },
  { value: 'band', label: 'Band' },
  { value: 'smith', label: 'Smith machine' },
  { value: 'other', label: 'Other' },
]

interface ExerciseFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Editing an existing exercise, or undefined to create a new one. */
  existing?: Exercise | undefined
  onSaved?: (exerciseId: string) => void
}

export function ExerciseFormSheet({
  open,
  onOpenChange,
  existing,
  onSaved,
}: ExerciseFormSheetProps) {
  const [name, setName] = useState('')
  const [muscle, setMuscle] = useState<MuscleGroup>('chest')
  const [equipment, setEquipment] = useState<Equipment>('barbell')
  const [movementType, setMovementType] = useState<MovementType>('compound')
  const [trackingType, setTrackingType] = useState<TrackingType>('weight_reps')
  const [restSeconds, setRestSeconds] = useState(120)
  const [description, setDescription] = useState('')
  /** Empty string means "follow the default bar". */
  const [barId, setBarId] = useState('')
  /**
   * What the machine weighs, as typed, in display units.
   *
   * Kept as a string rather than a number so the field can be empty — "this
   * machine has no weight of its own" and "it weighs zero" are the same thing
   * here, and a 0 sitting in the box reads as neither.
   */
  const [machineWeight, setMachineWeight] = useState('')

  const settings = useSettings()
  const unit = settings.units

  // Re-seed from the exercise being edited each time the sheet opens.
  useEffect(() => {
    if (!open) return
    setName(existing?.name ?? '')
    setMuscle(existing?.muscleGroups[0] ?? 'chest')
    setEquipment(existing?.equipment ?? 'barbell')
    setMovementType(existing?.movementType ?? 'compound')
    setTrackingType(existing?.trackingType ?? 'weight_reps')
    setRestSeconds(existing?.defaultRestSeconds ?? 120)
    setDescription(existing?.description ?? '')
    setBarId(existing?.barId ?? '')
    setMachineWeight(
      existing?.machineWeightKg == null
        ? ''
        : String(roundForDisplay(toDisplayUnit(existing.machineWeightKg, unit), unit)),
    )
  }, [open, existing, unit])

  const trimmed = name.trim()
  const defaultBarName =
    settings.bars.find((bar) => bar.id === settings.defaultBarId)?.name ?? 'none set'

  // Blank, zero or nonsense all mean "no weight of its own".
  const typedMachineKg = (() => {
    if (!usesMachineWeight({ equipment })) return null
    const value = Number.parseFloat(machineWeight.replace(',', '.'))
    if (!Number.isFinite(value) || value <= 0) return null
    return fromDisplayUnit(value, unit)
  })()

  async function save() {
    if (!trimmed) return

    const shared = {
      name: trimmed,
      muscleGroups: [muscle],
      equipment,
      movementType,
      trackingType,
      defaultRestSeconds: restSeconds,
      ...(description.trim() ? { description: description.trim() } : {}),
      ...(barId && usesBar({ equipment }) ? { barId } : {}),
      ...(typedMachineKg == null ? {} : { machineWeightKg: typedMachineKg }),
    }

    if (existing) {
      // Clearing the bar has to remove the field, not set it to empty, or the
      // exercise would stay pinned to a bar that no longer applies.
      if (!barId || !usesBar({ equipment })) await clearExerciseBar(existing.id)
      // Same for the machine weight, and for the same reason: switching the
      // equipment away from a machine must not leave kilograms behind that
      // every future set would silently be credited with.
      if (typedMachineKg == null) await clearExerciseMachineWeight(existing.id)
      await updateExercise(existing.id, shared)
      onSaved?.(existing.id)
    } else {
      const id = await createCustomExercise(shared)
      onSaved?.(id)
    }
    onOpenChange(false)
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      eyebrow={existing ? 'Edit exercise' : 'Your own exercise'}
      title={existing ? existing.name : 'New exercise'}
      footer={
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" className="flex-1" disabled={!trimmed} onClick={() => void save()}>
            {existing ? 'Save changes' : 'Create exercise'}
          </Button>
        </div>
      }
    >
      <div className="grid gap-5 px-5 py-4">
        <Field label="Name" htmlFor="exercise-name">
          <input
            id="exercise-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Landmine press"
            autoComplete="off"
            className="w-full rounded-md border border-line bg-surface px-3.5 py-3 text-[1rem] outline-none focus-visible:border-accent"
          />
        </Field>

        <Field label="Main muscle" hint="What this counts toward in your weekly volume">
          <Chips
            options={MUSCLES}
            value={muscle}
            onChange={setMuscle}
            ariaLabel="Main muscle worked"
          />
        </Field>

        <Field
          label="Equipment"
          hint="Barbell and Smith machine exercises get the plate calculator"
        >
          <Chips
            options={EQUIPMENT}
            value={equipment}
            onChange={setEquipment}
            ariaLabel="Equipment used"
          />
        </Field>

        <Field
          label="Movement type"
          hint="Compound means several joints move at once — it is why squats rest longer than curls"
        >
          <Chips
            options={[
              { value: 'compound' as const, label: 'Compound' },
              { value: 'isolation' as const, label: 'Isolation' },
            ]}
            value={movementType}
            onChange={(next) => {
              setMovementType(next)
              // Follow the convention unless the user has already set rest.
              if (!existing) setRestSeconds(next === 'compound' ? 150 : 60)
            }}
            ariaLabel="Movement type"
          />
        </Field>

        {usesBar({ equipment }) ? (
          <Field
            label="Bar"
            hint="Which bar this is loaded on, so the plate calculator subtracts the right weight"
          >
            <Chips
              options={[
                { value: '', label: `Default (${defaultBarName})` },
                ...settings.bars.map((bar) => ({
                  value: bar.id,
                  label: `${bar.name} · ${bar.weightKg} kg`,
                })),
              ]}
              value={barId}
              onChange={setBarId}
              ariaLabel="Bar used"
            />
          </Field>
        ) : null}

        {usesMachineWeight({ equipment }) ? (
          <Field
            label={`Machine weight — ${unit}`}
            hint="What the carriage weighs with nothing on it, on a leg press or pendulum squat. Added to every set you log, so your totals are what you actually moved. Leave blank if it has none."
            htmlFor="exercise-machine-weight"
          >
            <input
              id="exercise-machine-weight"
              value={machineWeight}
              onChange={(event) => setMachineWeight(event.target.value)}
              inputMode="decimal"
              placeholder="e.g. 25"
              autoComplete="off"
              className="num w-full rounded-md border border-line bg-surface px-3.5 py-3 text-[1rem] outline-none focus-visible:border-accent"
            />
          </Field>
        ) : null}

        <Field label="What you track" hint="Reps only suits bodyweight work like pull-ups">
          <Chips
            options={[
              { value: 'weight_reps' as const, label: 'Weight & reps' },
              { value: 'reps_only' as const, label: 'Reps only' },
            ]}
            value={trackingType}
            onChange={setTrackingType}
            ariaLabel="What you track"
          />
        </Field>

        <Field label={`Rest between sets — ${formatRestLength(restSeconds)}`}>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              aria-label="Decrease rest by 15 seconds"
              onClick={() => setRestSeconds((current) => Math.max(0, current - 15))}
            >
              −15s
            </Button>
            <Button
              variant="secondary"
              size="sm"
              aria-label="Increase rest by 15 seconds"
              onClick={() => setRestSeconds((current) => Math.min(600, current + 15))}
            >
              +15s
            </Button>
          </div>
        </Field>

        <Field label="Description" hint="Optional — a note to your future self">
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            aria-label="Description"
            placeholder="Bar in the corner, one end on the shoulder, pressed up and across."
            className="w-full resize-none rounded-md border border-line bg-surface px-3.5 py-3 text-[0.9rem] leading-relaxed outline-none focus-visible:border-accent"
          />
        </Field>
      </div>
    </Sheet>
  )
}

function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string
  hint?: string
  htmlFor?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="label-caps mb-1.5 block text-ink-muted">
        {label}
      </label>
      {hint ? <p className="mb-2 text-[0.75rem] leading-relaxed text-ink-muted">{hint}</p> : null}
      {children}
    </div>
  )
}

function Chips<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: readonly { value: T; label: string }[]
  value: T
  onChange: (next: T) => void
  ariaLabel: string
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex flex-wrap gap-1.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'h-9 cursor-pointer rounded-full border px-3 text-[0.78rem] font-bold',
            value === option.value
              ? 'border-accent bg-accent text-on-accent'
              : 'border-line-strong bg-surface text-ink-muted',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
