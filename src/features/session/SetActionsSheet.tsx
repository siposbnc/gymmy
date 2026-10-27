import { Flame, Gauge, Trash2 } from 'lucide-react'

import type { SetEntry } from '~/domain/types'
import { Sheet } from '~/ui/Sheet'

interface SetActionsSheetProps {
  set: SetEntry | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onToggleWarmup: () => void
  onEditRpe: () => void
  onDelete: () => void
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
}: SetActionsSheetProps) {
  const isWarmup = set?.type === 'warmup'

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      eyebrow={set ? (isWarmup ? 'Warm-up set' : `Set ${set.setIndex}`) : undefined}
      title="Set options"
    >
      <div className="divide-y divide-line pb-2">
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
        <Action
          icon={<Gauge size={19} />}
          label={set?.rpe == null ? 'Add RPE' : `Change RPE (now ${set.rpe})`}
          hint="Rate of Perceived Exertion — how hard the set felt, 1 to 10"
          onClick={onEditRpe}
        />
        <Action
          icon={<Trash2 size={19} />}
          label="Delete set"
          hint="Remaining sets renumber themselves"
          destructive
          onClick={onDelete}
        />
      </div>
    </Sheet>
  )
}
