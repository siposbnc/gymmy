import { ArrowDown } from 'lucide-react'

import { addedWeightKg, describeMachineLoad } from '~/domain/machines'
import type { DropPrefillSource, PrefillSource } from '~/domain/metrics'
import type { TrackingType } from '~/domain/types'
import { formatWeight, type WeightUnit } from '~/domain/units'
import { cn } from '~/ui/cn'

interface PendingSetRowProps {
  setIndex: number
  /** The total load — what gets logged, machine weight included. */
  weightKg: number | undefined
  /**
   * What the machine itself weighs, or 0.
   *
   * When this is set the row shows what you *added*, because that is the
   * number you physically change, and states the total underneath.
   */
  machineWeightKg: number
  reps: number | undefined
  /** Which prefill tier produced these values — announced, not drawn. */
  source: PrefillSource | DropPrefillSource
  isWarmup: boolean
  /**
   * This row will log a drop off the set above rather than a set of its own.
   *
   * The row itself changes — indented, labelled D, numbered within the chain —
   * because logging a drop has to look different from logging a set, in a
   * glance, while out of breath.
   */
  isDrop: boolean
  /** Which drop of the chain this will be. Only read in drop mode. */
  dropIndex: number
  /**
   * Whether there is a set to drop off at all.
   *
   * False before the first set of an exercise is logged, where a drop chip
   * would be an affordance for something that cannot be done yet.
   */
  canDrop: boolean
  unit: WeightUnit
  trackingType: TrackingType
  onEditWeight: () => void
  onEditReps: () => void
  onToggleWarmup: () => void
  onToggleDrop: () => void
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
  machineWeightKg,
  reps,
  source,
  isWarmup,
  isDrop,
  dropIndex,
  canDrop,
  unit,
  trackingType,
  onEditWeight,
  onEditReps,
  onToggleWarmup,
  onToggleDrop,
  onLog,
}: PendingSetRowProps) {
  const showsWeight = trackingType !== 'reps_only'

  // On a machine with a weight of its own, the figure in the row is what you
  // put on it; the total is spelled out below. Everywhere else the two are the
  // same number and the extra line never appears.
  const shownWeightKg =
    machineWeightKg > 0 ? addedWeightKg(weightKg, machineWeightKg) : weightKg
  const machineLine = describeMachineLoad(weightKg, machineWeightKg, unit)
  // A weight-tracked set logged without a weight is not a set: it is a hole in
  // the volume total and in every record derived from it. Reps-only work is
  // the one case where that absence is the truth, and there the field is not
  // shown at all. Reps may still be blank — `handleLog` reads that as one rep.
  const needsWeight = showsWeight && (weightKg ?? 0) <= 0
  const canLog = showsWeight ? !needsWeight : (reps ?? 0) > 0

  return (
    <>
      <div
        className={cn(
          'relative flex min-h-[3.25rem] items-center gap-2.5 rounded-md border-[1.5px] px-2.5 py-1.5',
          isWarmup ? 'border-dashed border-line-strong' : 'border-line-strong bg-raised',
          // Indented under the set it will hang off, exactly as the logged drop
          // rows are, so the row shows where the work is about to land.
          isDrop && 'ml-4',
        )}
      >
        {isDrop ? (
          <span
            aria-hidden
            className="absolute -top-2 -left-3 h-[calc(50%+0.5rem)] w-2.5 rounded-bl-md border-b-[1.5px] border-l-[1.5px] border-line-strong"
          />
        ) : null}

        <span aria-hidden className="h-9 w-1 shrink-0 rounded-full bg-rail" />

        {/* In drop mode this is a label rather than a control: a drop is never a
            warm-up, and the chip beside it is what leaves drop mode. */}
        {isDrop ? (
          <span className="num w-5 shrink-0 text-center text-[0.7rem] font-extrabold text-accent-ink">
            D
          </span>
        ) : (
          <button
            type="button"
            onClick={onToggleWarmup}
            aria-label={isWarmup ? 'Log as a working set instead' : 'Log this as a warm-up set'}
            aria-pressed={isWarmup}
            className={cn(
              'num w-5 shrink-0 cursor-pointer rounded-sm text-center text-[0.7rem] font-extrabold',
              isWarmup ? 'text-accent-ink' : 'text-ink-faint',
            )}
          >
            {isWarmup ? 'W' : setIndex}
          </button>
        )}

        {/* The whole gesture. You have logged the set, you are stripping the
            weight, and one tap turns this row into the drop — same pad, same
            prefill, same Log button where your thumb already is. Hidden before
            the first set, when there is nothing to drop off; hidden on a
            warm-up, which is not a set you drop from either. */}
        {canDrop && !isWarmup ? (
          <button
            type="button"
            onClick={onToggleDrop}
            aria-label={
              isDrop
                ? `Log set ${setIndex} instead of a drop`
                : `Add a drop off set ${setIndex - 1}`
            }
            aria-pressed={isDrop}
            className={cn(
              'grid size-7 shrink-0 cursor-pointer place-items-center rounded-full',
              'transition-transform duration-(--dur-fast) active:scale-95',
              isDrop
                ? 'bg-accent text-on-accent'
                : 'border border-line-strong bg-sunken text-ink-muted',
            )}
          >
            <ArrowDown size={14} strokeWidth={3} aria-hidden />
          </button>
        ) : null}

        <span className="flex flex-1 items-baseline gap-0.5">
          {showsWeight ? (
            <button
              type="button"
              onClick={onEditWeight}
              aria-label={
                machineWeightKg > 0
                  ? `Added weight: ${shownWeightKg == null ? 'not set' : formatWeight(shownWeightKg, unit)}${
                      weightKg == null ? '' : `, ${formatWeight(weightKg, unit)} total`
                    }. Edit.`
                  : `Weight: ${weightKg == null ? 'not set' : formatWeight(weightKg, unit)}. Edit.`
              }
              className="num cursor-pointer rounded-sm border-b-2 border-accent bg-sunken px-2 py-0.5 text-title font-semibold"
            >
              {shownWeightKg == null ? '—' : formatWeight(shownWeightKg, unit, { withUnit: false })}
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
          aria-label={needsWeight ? 'Log. Enter a weight first.' : undefined}
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
            ghost line above — and, in drop mode, the position in the chain that
            they read from the indent. */}
        <span className="sr-only">
          {isDrop ? `Drop ${dropIndex} off set ${setIndex - 1}. ` : ''}
          {source === 'empty'
            ? 'No previous data for this exercise.'
            : 'Pre-filled from your training history.'}
        </span>
      </div>

      {/* The sum, stated where the number is typed — the row says what you put
          on the machine, every total in the app says what you lifted, and the
          difference has to be visible rather than inferred. `aria-hidden`
          because the weight button's own label already carries both figures;
          announcing them twice is worse than not at all. */}
      {machineLine ? (
        <p aria-hidden className={cn('num px-2.5 text-[0.72rem] text-ink-muted', isDrop && 'ml-4')}>
          {machineLine}
        </p>
      ) : null}

      {/* A disabled button with no stated reason is a dead end, and this one
          fires on the first set of every new exercise. */}
      {needsWeight ? (
        <p className={cn('px-2.5 text-[0.72rem] text-ink-muted', isDrop && 'ml-4')}>
          Enter a weight to log this {isDrop ? 'drop' : 'set'}.
        </p>
      ) : null}
    </>
  )
}
