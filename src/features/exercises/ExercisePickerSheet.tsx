import { Search, Star } from 'lucide-react'
import { useMemo, useState } from 'react'

import { useExerciseUsage, useExercises } from '~/db/hooks'
import { pinExercise, unpinExercise } from '~/db/repositories/exercises'
import { describeUsage, type ExerciseUsage } from '~/domain/exercise-usage'
import type { Exercise, MuscleGroup } from '~/domain/types'
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

/**
 * How many trained exercises get the shortcut treatment.
 *
 * Enough to cover a session's worth of work, few enough that the list below
 * still starts on the first screen — a top section you have to scroll past is
 * just a longer list.
 */
const USUAL_LIMIT = 6

interface Section {
  key: 'pinned' | 'usual' | 'rest'
  label: string
  exercises: Exercise[]
  /** Pinned and recent rows drop the description; see {@link ExerciseRow}. */
  compact: boolean
}

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
  const usage = useExerciseUsage(open)

  const searching = search.trim().length > 0

  const { sections, usageById } = useMemo(() => {
    const byId = new Map((usage ?? []).map((entry, rank) => [entry.exerciseId, { entry, rank }]))
    const all = exercises ?? []

    const pinned = all
      .filter((exercise) => exercise.pinnedAt != null)
      // Oldest pin first, so adding one never moves the others.
      .sort((a, b) => (a.pinnedAt ?? 0) - (b.pinnedAt ?? 0))

    const unpinned = all.filter((exercise) => exercise.pinnedAt == null)
    const trained = unpinned
      .filter((exercise) => byId.has(exercise.id))
      .sort((a, b) => (byId.get(a.id)?.rank ?? 0) - (byId.get(b.id)?.rank ?? 0))

    // While searching you are after one specific name, so every match stays on
    // screen — the ranking only decides what order they arrive in.
    const usual = searching ? trained : trained.slice(0, USUAL_LIMIT)
    const usualIds = new Set(usual.map((exercise) => exercise.id))
    // `exercises` arrives alphabetical, and the remainder keeps that order.
    const rest = unpinned.filter((exercise) => !usualIds.has(exercise.id))

    const built: Section[] = [
      { key: 'pinned', label: 'Pinned', exercises: pinned, compact: true },
      { key: 'usual', label: 'Your usual', exercises: usual, compact: true },
      { key: 'rest', label: 'Everything else', exercises: rest, compact: false },
    ]

    return { sections: built.filter((section) => section.exercises.length > 0), usageById: byId }
  }, [exercises, usage, searching])

  // Headers earn their space only when there is something above the main list
  // to separate it from. A fresh install, or a search with three hits, gets a
  // plain list instead of a heading announcing one section.
  const showHeadings = !searching && sections.length > 1

  return (
    // Full height: this sheet exists to browse a list, and once you are
    // searching every visible row is worth more than the backdrop behind it.
    <Sheet open={open} onOpenChange={onOpenChange} title="Add exercise" fullHeight>
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

        {/* The fade tells you the row scrolls — there are more groups than
            fit, and without it the list looks like it simply ends. */}
        <div
          className="-mx-5 mt-2.5 flex gap-2 overflow-x-auto px-5 pb-2"
          style={{
            maskImage:
              'linear-gradient(to right, transparent, black 16px, black calc(100% - 16px), transparent)',
            WebkitMaskImage:
              'linear-gradient(to right, transparent, black 16px, black calc(100% - 16px), transparent)',
          }}
        >
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

      <div className="px-5 pt-2 pb-4">
        {sections.map((section) => (
          <section key={section.key}>
            {showHeadings ? (
              // `text-ink-faint` is the natural choice for a section label and
              // the wrong one: against the sheet's raised background it comes
              // out at 4.1:1 in dark theme, which axe is right to reject.
              <h3 className="label-caps pt-3 pb-1 text-ink-muted">
                {section.label}
                {/* No opacity here: dimming text that is already the faintest
                    in the system puts it under 3:1. */}
                {section.key === 'rest' ? ' · A–Z' : null}
              </h3>
            ) : null}

            <ul className="divide-y divide-line">
              {section.exercises.map((exercise) => (
                <ExerciseRow
                  key={exercise.id}
                  exercise={exercise}
                  usage={usageById.get(exercise.id)?.entry}
                  compact={section.compact}
                  added={alreadyAdded.includes(exercise.id)}
                  onPick={() => onPick(exercise.id)}
                />
              ))}
            </ul>
          </section>
        ))}

        {exercises?.length === 0 ? (
          <p className="py-10 text-center font-display text-[1.3rem] text-ink-muted">
            Nothing matches that.
          </p>
        ) : null}
      </div>
    </Sheet>
  )
}

interface ExerciseRowProps {
  exercise: Exercise
  usage: ExerciseUsage | undefined
  /** Drop the description: at the top of the list you already know what it is. */
  compact: boolean
  added: boolean
  onPick: () => void
}

/**
 * One row.
 *
 * The star is a sibling of the pick button rather than inside it — a button
 * cannot contain a button, and more to the point, pinning something must never
 * be one mis-tap away from adding it to the workout you are in the middle of.
 */
function ExerciseRow({ exercise, usage, compact, added, onPick }: ExerciseRowProps) {
  const pinned = exercise.pinnedAt != null

  return (
    <li className="flex items-center gap-1">
      <button
        type="button"
        onClick={onPick}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-3 text-left"
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
            {exercise.movementType} · {exercise.muscleGroups[0]} · {exercise.equipment}
          </span>
          {/* The count is what explains the order, so it travels with the rows
              that were ordered by it. */}
          {usage && compact ? (
            <span className="num block text-[0.72rem] text-ink-muted">{describeUsage(usage)}</span>
          ) : null}
          {/* The description earns its place here most of all: this is the
              moment you are choosing between an incline press and a decline
              one. Above, among exercises you train every week, it does not. */}
          {exercise.description && !compact ? (
            // Also raised off `text-ink-faint`, for the same contrast reason as
            // the headings — this one has been under the threshold since the
            // sheet was written, and nothing was looking at it until now.
            <span className="mt-0.5 line-clamp-2 block text-[0.72rem] leading-relaxed text-ink-muted">
              {exercise.description}
            </span>
          ) : null}
        </span>
        {added ? (
          <span className="label-caps shrink-0 rounded-full bg-sunken px-2 py-1 text-ink-faint">
            added
          </span>
        ) : null}
      </button>

      <button
        type="button"
        onClick={() => void (pinned ? unpinExercise(exercise.id) : pinExercise(exercise.id))}
        aria-pressed={pinned}
        aria-label={pinned ? `Unpin ${exercise.name}` : `Pin ${exercise.name} to the top`}
        className={cn(
          'grid size-11 shrink-0 cursor-pointer place-items-center rounded-full',
          pinned ? 'text-accent-ink' : 'text-ink-faint',
        )}
      >
        <Star size={17} fill={pinned ? 'currentColor' : 'none'} aria-hidden />
      </button>
    </li>
  )
}
