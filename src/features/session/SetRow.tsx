import { Check } from 'lucide-react'

import type { SetEntry, TrackingType } from '~/domain/types'
import { formatWeight, type WeightUnit } from '~/domain/units'
import { cn } from '~/ui/cn'

interface SetRowProps {
  set: SetEntry
  unit: WeightUnit
  trackingType: TrackingType
  onEditWeight: () => void
  onEditReps: () => void
  onOpenActions: () => void
}

/**
 * A logged set.
 *
 * The status rail on the left edge is the signature element: hollow when
 * pending, emerald once logged, gold on a record (M4). Glance down the column
 * and you know how much of the session is done without reading a number.
 *
 * Warm-ups are visibly not working sets — dashed border, dotted rail, smaller
 * numerals, hollow check — so a set excluded from volume and records never
 * looks like a bug.
 */
export function SetRow({
  set,
  unit,
  trackingType,
  onEditWeight,
  onEditReps,
  onOpenActions,
}: SetRowProps) {
  const isWarmup = set.type === 'warmup'
  const showsWeight = trackingType !== 'reps_only'

  const label = isWarmup ? 'W' : String(set.setIndex)
  const describe = isWarmup ? `Warm-up set` : `Set ${set.setIndex}`

  return (
    <div
      className={cn(
        'relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5',
        isWarmup
          ? 'min-h-[2.75rem] border border-dashed border-line-strong'
          : 'min-h-[3.25rem] bg-success-wash',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'w-1 shrink-0 rounded-full',
          isWarmup ? 'h-7 border-l-4 border-dotted border-rail' : 'h-9 bg-success',
        )}
      />

      <span
        className={cn(
          'num w-4 shrink-0 text-center font-extrabold text-ink-faint',
          isWarmup ? 'text-[0.6rem]' : 'text-[0.7rem]',
        )}
      >
        {label}
      </span>

      <span className="flex flex-1 items-baseline gap-0.5">
        {showsWeight ? (
          <button
            type="button"
            onClick={onEditWeight}
            aria-label={`${describe}: ${set.weightKg == null ? 'no weight' : formatWeight(set.weightKg, unit)}. Edit weight.`}
            className={cn(
              'num cursor-pointer rounded-sm px-1 font-semibold',
              isWarmup ? 'text-[1.05rem] font-medium text-ink-muted' : 'text-title',
            )}
          >
            {set.weightKg == null ? '—' : formatWeight(set.weightKg, unit, { withUnit: false })}
            <span
              className={cn(
                'ml-0.5 font-semibold',
                isWarmup ? 'text-[0.65rem] text-ink-faint' : 'text-[0.75rem] text-ink-muted',
              )}
            >
              {unit}
            </span>
          </button>
        ) : (
          <span className="text-[0.8rem] font-semibold text-ink-muted">bodyweight</span>
        )}

        <span className={cn('mx-1.5 text-ink-faint', isWarmup ? 'text-[0.8rem]' : 'text-[0.9rem]')}>
          ×
        </span>

        <button
          type="button"
          onClick={onEditReps}
          aria-label={`${describe}: ${set.reps ?? 0} reps. Edit reps.`}
          className={cn(
            'num cursor-pointer rounded-sm px-1 font-semibold',
            isWarmup ? 'text-[1.05rem] font-medium text-ink-muted' : 'text-title',
          )}
        >
          {set.reps ?? '—'}
        </button>
      </span>

      {set.rpe != null ? (
        <span className="num shrink-0 rounded-sm border border-line bg-surface px-1.5 py-0.5 text-[0.625rem] font-extrabold text-ink-muted">
          RPE {set.rpe}
        </span>
      ) : null}

      {/* The check doubles as the row's menu. Keeping it a single trailing
          target preserves the approved layout and avoids a third tap zone in a
          row that is already pressed with a shaking hand. */}
      <button
        type="button"
        onClick={onOpenActions}
        aria-label={`${describe} options`}
        className={cn(
          'grid shrink-0 cursor-pointer place-items-center rounded-full',
          isWarmup
            ? 'size-6 border-[1.5px] border-line-strong text-ink-faint'
            : 'size-8 bg-success text-on-success',
        )}
      >
        <Check size={isWarmup ? 12 : 16} strokeWidth={3} aria-hidden />
      </button>
    </div>
  )
}
