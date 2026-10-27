import type { SessionExerciseView } from '~/db/hooks'
import { cn } from '~/ui/cn'

/**
 * The status rail at session scale.
 *
 * One tick per working set across the whole workout: filled where a set is
 * logged, accent on the one you are about to do. Progress readable in half a
 * second without parsing a number — which is the point, since the user is
 * breathing hard and holding a phone at arm's length.
 */
export function ProgressRibbon({ views }: { views: readonly SessionExerciseView[] }) {
  const ticks = views.flatMap((view) =>
    view.sets.filter((set) => set.type !== 'warmup').map(() => 'done' as const),
  )

  // One pending tick so the ribbon never reads as "finished" mid-workout.
  const cells: ('done' | 'now' | 'empty')[] =
    views.length === 0 ? [] : [...ticks, 'now', ...Array<'empty'>(Math.max(0, 6 - ticks.length))]

  if (cells.length === 0) return null

  const logged = ticks.length

  return (
    <div
      className="flex items-end gap-[3px] px-4 pt-2.5"
      role="img"
      aria-label={`${logged} set${logged === 1 ? '' : 's'} logged`}
    >
      {cells.map((cell, index) => (
        <span
          key={index}
          className={cn(
            'flex-1 rounded-full',
            cell === 'done' && 'h-[5px] bg-success',
            cell === 'now' && 'h-2 bg-accent',
            cell === 'empty' && 'h-[5px] bg-rail',
          )}
        />
      ))}
    </div>
  )
}
