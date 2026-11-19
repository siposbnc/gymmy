import { ArrowDown, ArrowRightLeft, Flame, Gauge, Trash2 } from 'lucide-react'

import { isDrop } from '~/domain/sets'
import type { SetEntry } from '~/domain/types'
import { Sheet } from '~/ui/Sheet'

interface SetActionsSheetProps {
  set: SetEntry | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onToggleWarmup: () => void
  onEditRpe: () => void
  onDelete: () => void
  /** Offered only where there is somewhere to move the set to. */
  onMove?: (() => void) | undefined
  /**
   * Flip this row between a set of its own and a drop of the one above it.
   *
   * The repair path for a dropset logged as separate sets — including every one
   * logged before Gymmy could record a dropset at all. Absent when there is
   * nothing above to attach to, which is also when the write would refuse.
   */
  onToggleDrop?: (() => void) | undefined
  /** The number of the set this row hangs off, or would. Names it in the label. */
  dropParentIndex?: number | undefined
  /** How many drops hang off this set — what deleting it would take with it. */
  dropCount?: number
}

function Action({
  icon,
  label,
  hint,
  destructive = false,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  hint: string
  destructive?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full cursor-pointer items-center gap-3 px-5 py-3.5 text-left"
    >
      <span className={destructive ? 'text-danger' : 'text-accent-ink'}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className={`block text-[0.95rem] font-medium ${destructive ? 'text-danger' : ''}`}>
          {label}
        </span>
        <span className="block text-[0.75rem] text-ink-muted">{hint}</span>
      </span>
    </button>
  )
}

/**
 * Actions for a logged set.
 *
 * Delete lives behind this sheet rather than on the row itself. A fat-fingered
 * tap at arm's length must never be able to destroy a set, and an explicit
 * confirm mid-workout is worse — so the gesture cost is the safeguard.
 */
export function SetActionsSheet({
  set,
  open,
  onOpenChange,
  onToggleWarmup,
  onEditRpe,
  onDelete,
  onMove,
  onToggleDrop,
  dropParentIndex,
  dropCount = 0,
}: SetActionsSheetProps) {
  const isWarmup = set?.type === 'warmup'
  const drop = set != null && isDrop(set)

  const eyebrow = !set
    ? undefined
    : isWarmup
      ? 'Warm-up set'
      : drop
        ? `Drop ${set.setIndex}${dropParentIndex == null ? '' : ` of set ${dropParentIndex}`}`
        : `Set ${set.setIndex}`

  return (
    <Sheet open={open} onOpenChange={onOpenChange} eyebrow={eyebrow} title="Set options">
      <div className="divide-y divide-line pb-2">
        {/* Not offered for a dropset from either end. A drop is the heaviest
            thing you could still move, which is the opposite of a warm-up; and
            flipping a set that has drops would quietly pull its whole chain out
            of volume and records. */}
        {drop || dropCount > 0 ? null : (
          <Action
            icon={<Flame size={19} />}
            label={isWarmup ? 'Make it a working set' : 'Mark as warm-up'}
            hint={
              isWarmup
                ? 'Counts toward volume, records and estimated 1RM again'
                : 'Kept in history, but left out of volume, records and estimated 1RM'
            }
            onClick={onToggleWarmup}
          />
        )}
        {onToggleDrop ? (
          <Action
            icon={<ArrowDown size={19} />}
            label={
              drop
                ? 'Make it a set of its own'
                : `Make it a drop of set ${dropParentIndex ?? ''}`.trim()
            }
            hint={
              drop
                ? 'Counts as a set again, in your set totals and your routines'
                : 'Keeps its volume, stops counting as a separate set'
            }
            onClick={onToggleDrop}
          />
        ) : null}
        <Action
          icon={<Gauge size={19} />}
          label={set?.rpe == null ? 'Add RPE' : `Change RPE (now ${set.rpe})`}
          hint="Rate of Perceived Exertion — how hard the set felt, 1 to 10"
          onClick={onEditRpe}
        />
        {/* A drop cannot go anywhere without its parent, so there is nowhere to
            move it to. Move the set and the chain comes along. */}
        {onMove && !drop ? (
          <Action
            icon={<ArrowRightLeft size={19} />}
            label="Move to another exercise"
            hint="For a set logged against the wrong one"
            onClick={onMove}
          />
        ) : null}
        <Action
          icon={<Trash2 size={19} />}
          label={drop ? 'Delete drop' : 'Delete set'}
          hint={
            dropCount > 0
              ? `Also deletes the ${dropCount === 1 ? 'drop' : `${dropCount} drops`} hanging off it`
              : 'Remaining sets renumber themselves'
          }
          destructive
          onClick={onDelete}
        />
      </div>
    </Sheet>
  )
}
