import { ChevronRight, Plus, Search } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'

import { useExercises } from '~/db/hooks'
import type { MuscleGroup } from '~/domain/types'
import { Button } from '~/ui/Button'
import { ScreenHeader } from '~/ui/ScreenHeader'
import { cn } from '~/ui/cn'

import { ExerciseFormSheet } from './ExerciseFormSheet'

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
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [group, setGroup] = useState<MuscleGroup | 'all'>('all')
  const [creating, setCreating] = useState(false)

  const exercises = useExercises({
    search,
    ...(group === 'all' ? {} : { muscleGroup: group }),
  })

  return (
    <>
      <ScreenHeader
        eyebrow="More"
        title="Exercises"
        action={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus size={16} aria-hidden />
            New
          </Button>
        }
      />

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
          <div className="py-10 text-center">
            <p className="font-display text-[1.4rem] text-ink-muted">Nothing matches that.</p>
            <Button variant="secondary" className="mt-4" onClick={() => setCreating(true)}>
              <Plus size={17} aria-hidden />
              Add it yourself
            </Button>
          </div>
        ) : (
          <>
            <p className="label-caps mb-2 text-ink-faint">
              {exercises.length} exercise{exercises.length === 1 ? '' : 's'}
            </p>
            <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
              {exercises.map((exercise) => (
                <li key={exercise.id}>
                  <button
                    type="button"
                    onClick={() => void navigate(`/more/exercises/${exercise.id}`)}
                    className="flex w-full cursor-pointer items-center gap-3 px-3.5 py-3 text-left"
                  >
                    {/* The rail is a fast visual grouping cue, but the word
                        below carries the meaning — colour is never the only
                        encoding. */}
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
                        {exercise.isCustom ? (
                          <span className="label-caps ml-1.5 rounded-full bg-sunken px-1.5 py-0.5 align-[1px] text-ink-muted">
                            yours
                          </span>
                        ) : null}
                      </span>
                      <span className="block truncate text-[0.72rem] text-ink-muted">
                        {exercise.movementType} · {exercise.muscleGroups[0]} ·{' '}
                        {exercise.equipment}
                        {exercise.trackingType === 'reps_only' ? ' · reps only' : ''}
                      </span>
                    </span>
                    <ChevronRight size={15} className="shrink-0 text-ink-faint" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <ExerciseFormSheet
        open={creating}
        onOpenChange={setCreating}
        onSaved={(id) => void navigate(`/more/exercises/${id}`)}
      />
    </>
  )
}
