import { Search } from 'lucide-react'
import { useState } from 'react'

import { useExercises } from '~/db/hooks'
import type { MuscleGroup } from '~/domain/types'
import { Sheet } from '~/ui/Sheet'
import { cn } from '~/ui/cn'

interface ExercisePickerSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (exerciseId: string) => void
  /** Already in the session — shown but marked, since repeats are legitimate. */
  alreadyAdded?: readonly string[]
}

const GROUPS: readonly { value: MuscleGroup | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'chest', label: 'Chest' },
  { value: 'back', label: 'Back' },
  { value: 'lats', label: 'Lats' },
  { value: 'shoulders', label: 'Shoulders' },
  { value: 'biceps', label: 'Biceps' },
  { value: 'triceps', label: 'Triceps' },
  { value: 'quads', label: 'Quads' },
  { value: 'hamstrings', label: 'Hamstrings' },
  { value: 'glutes', label: 'Glutes' },
  { value: 'calves', label: 'Calves' },
  { value: 'core', label: 'Core' },
]

export function ExercisePickerSheet({
  open,
  onOpenChange,
  onPick,
  alreadyAdded = [],
}: ExercisePickerSheetProps) {
  const [search, setSearch] = useState('')
  const [group, setGroup] = useState<MuscleGroup | 'all'>('all')

  const exercises = useExercises({
    search,
    ...(group === 'all' ? {} : { muscleGroup: group }),
  })

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Add exercise" className="max-h-[90dvh]">
      <div className="sticky top-0 z-10 bg-raised px-5 pt-3 pb-2">
        <label className="flex items-center gap-2.5 rounded-md border border-line bg-surface px-3.5 py-2.5">
          <Search size={17} className="shrink-0 text-ink-faint" aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search exercises"
            aria-label="Search exercises"
            className="w-full bg-transparent text-[0.95rem] outline-none placeholder:text-ink-faint"
          />
        </label>

        <div className="-mx-5 mt-2.5 flex gap-2 overflow-x-auto px-5 pb-1">
          {GROUPS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setGroup(option.value)}
              className={cn(
                'h-9 shrink-0 cursor-pointer rounded-full border px-3.5 text-[0.8rem] font-bold',
                group === option.value
                  ? 'border-accent bg-accent text-on-accent'
                  : 'border-line-strong bg-surface text-ink-muted',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <ul className="divide-y divide-line px-5 pb-4">
        {(exercises ?? []).map((exercise) => {
          const added = alreadyAdded.includes(exercise.id)
          return (
            <li key={exercise.id}>
              <button
                type="button"
                onClick={() => onPick(exercise.id)}
                className="flex w-full cursor-pointer items-center gap-3 py-3 text-left"
              >
                <span
                  aria-hidden
                  className={cn(
                    'h-7 w-1 shrink-0 rounded-full',
                    exercise.movementType === 'compound' ? 'bg-accent' : 'bg-rail',
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.95rem] font-medium">{exercise.name}</span>
                  <span className="block text-[0.72rem] text-ink-muted">
                    {exercise.muscleGroups[0]} · {exercise.equipment}
                  </span>
                </span>
                {added ? (
                  <span className="label-caps shrink-0 rounded-full bg-sunken px-2 py-1 text-ink-faint">
                    added
                  </span>
                ) : null}
              </button>
            </li>
          )
        })}

        {exercises?.length === 0 ? (
          <li className="py-10 text-center font-display text-[1.3rem] text-ink-muted">
            Nothing matches that.
          </li>
        ) : null}
      </ul>
    </Sheet>
  )
}
