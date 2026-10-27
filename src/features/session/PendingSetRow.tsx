import type { PrefillSource } from '~/domain/metrics'
import type { TrackingType } from '~/domain/types'
import { formatWeight, type WeightUnit } from '~/domain/units'
import { cn } from '~/ui/cn'

interface PendingSetRowProps {
  setIndex: number
  weightKg: number | undefined
  reps: number | undefined
  /** Which prefill tier produced these values — announced, not drawn. */
  source: PrefillSource
  isWarmup: boolean
  unit: WeightUnit
  trackingType: TrackingType
  onEditWeight: () => void
  onEditReps: () => void
  onToggleWarmup: () => void
  onLog: () => void
}

/**
 * The next set, pre-filled and waiting.
 *
 * This row is the whole product. Values arrive already correct for the common
 * case, so logging is one tap; the underline marks them editable without
 * putting a box around each. Nothing here may require the OS keyboard — it
 * eats half the screen and hides the set being edited.
 */
export function PendingSetRow({
  setIndex,
  weightKg,
  reps,
  source,
  isWarmup,
  unit,
  trackingType,
  onEditWeight,
  onEditReps,
  onToggleWarmup,
  onLog,
}: PendingSetRowProps) {
  const showsWeight = trackingType !== 'reps_only'
  const canLog = (reps ?? 0) > 0 || (showsWeight && (weightKg ?? 0) > 0)

  return (
    <div
      className={cn(
        'flex min-h-[3.25rem] items-center gap-2.5 rounded-md border-[1.5px] px-2.5 py-1.5',
        isWarmup ? 'border-dashed border-line-strong' : 'border-line-strong bg-raised',
      )}
    >
      <span aria-hidden className="h-9 w-1 shrink-0 rounded-full bg-rail" />

      <button
        type="button"
        onClick={onToggleWarmup}
        aria-label={isWarmup ? 'Log as a working set instead' : 'Log this as a warm-up set'}
        aria-pressed={isWarmup}
        className={cn(
          'num w-5 shrink-0 cursor-pointer rounded-sm text-center text-[0.7rem] font-extrabold',
          isWarmup ? 'text-accent' : 'text-ink-faint',
        )}
      >
        {isWarmup ? 'W' : setIndex}
      </button>

      <span className="flex flex-1 items-baseline gap-0.5">
        {showsWeight ? (
          <button
            type="button"
            onClick={onEditWeight}
            aria-label={`Weight: ${weightKg == null ? 'not set' : formatWeight(weightKg, unit)}. Edit.`}
            className="num cursor-pointer rounded-sm border-b-2 border-accent bg-sunken px-2 py-0.5 text-title font-semibold"
          >
            {weightKg == null ? '—' : formatWeight(weightKg, unit, { withUnit: false })}
            <span className="ml-0.5 text-[0.75rem] font-semibold text-ink-muted">{unit}</span>
          </button>
        ) : (
          <span className="text-[0.8rem] font-semibold text-ink-muted">bodyweight</span>
        )}

        <span className="mx-1.5 text-[0.9rem] text-ink-faint">×</span>

        <button
          type="button"
          onClick={onEditReps}
          aria-label={`Reps: ${reps ?? 'not set'}. Edit.`}
          className="num cursor-pointer rounded-sm border-b-2 border-accent bg-sunken px-2 py-0.5 text-title font-semibold"
        >
          {reps ?? '—'}
        </button>
      </span>

      <button
        type="button"
        onClick={onLog}
        disabled={!canLog}
        className={cn(
          'h-[2.375rem] min-w-[3.25rem] shrink-0 cursor-pointer rounded-full px-4',
          'text-[0.8rem] font-extrabold transition-transform duration-(--dur-fast)',
          'active:scale-95 disabled:pointer-events-none disabled:opacity-40',
          'bg-accent text-on-accent',
        )}
      >
        Log
      </button>

      {/* Screen readers get the provenance that sighted users read from the
          ghost line above. */}
      <span className="sr-only">
        {source === 'empty'
          ? 'No previous data for this exercise.'
          : 'Pre-filled from your training history.'}
      </span>
    </div>
  )
}
