import { Search } from 'lucide-react'
import { useState } from 'react'

import { useExercises } from '~/db/hooks'
import type { MuscleGroup } from '~/domain/types'
import { ScreenHeader } from '~/ui/ScreenHeader'
import { cn } from '~/ui/cn'

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

export function ExercisesScreen() {
  const [search, setSearch] = useState('')
  const [group, setGroup] = useState<MuscleGroup | 'all'>('all')

  const exercises = useExercises({
    search,
    ...(group === 'all' ? {} : { muscleGroup: group }),
  })

  return (
    <>
      <ScreenHeader eyebrow="More" title="Exercises" />

      <div className="px-4">
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
      </div>

      {/* Horizontal filter rail — scrolls inside itself, never the page. */}
      <div className="mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
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

      <div className="mt-3 px-4 pb-6">
        {exercises === undefined ? (
          <p className="py-8 text-center text-[0.85rem] text-ink-faint">Loading…</p>
        ) : exercises.length === 0 ? (
          <p className="py-10 text-center font-display text-[1.4rem] text-ink-muted">
            Nothing matches that.
          </p>
        ) : (
          <>
            <p className="label-caps mb-2 text-ink-faint">
              {exercises.length} exercise{exercises.length === 1 ? '' : 's'}
            </p>
            <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
              {exercises.map((exercise) => (
                <li key={exercise.id} className="flex items-center gap-3 px-3.5 py-3">
                  {/* The status rail, reused as a movement-type marker. */}
                  <span
                    className={cn(
                      'h-7 w-1 shrink-0 rounded-full',
                      exercise.movementType === 'compound' ? 'bg-accent' : 'bg-rail',
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.95rem] font-medium">
                      {exercise.name}
                    </span>
                    <span className="block text-[0.72rem] text-ink-muted">
                      {exercise.muscleGroups[0]} · {exercise.equipment}
                      {exercise.trackingType === 'reps_only' ? ' · reps only' : ''}
                    </span>
                  </span>
                  <span className="num shrink-0 text-[0.75rem] font-bold text-ink-faint">
                    {Math.floor(exercise.defaultRestSeconds / 60)}:
                    {String(exercise.defaultRestSeconds % 60).padStart(2, '0')}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </>
  )
}
