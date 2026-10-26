import { Minus, Plus } from 'lucide-react'

import { cn } from './cn'

interface StepperProps {
  value: number
  onChange: (value: number) => void
  /** Tapping the readout opens the numeric pad. */
  onRequestPad?: () => void
  step?: number
  min?: number
  max?: number
  unit?: string
  /** Shown under the unit, e.g. "±2.5 · hold to repeat". */
  hint?: string
  decreaseLabel: string
  increaseLabel: string
  className?: string
}

/**
 * The default path for entering a number.
 *
 * 52px targets either side of the value — `--touch-comfortable`, because this
 * is pressed with a shaking hand between sets. The OS keyboard never opens in
 * a session: it eats half the screen, hides the set being edited, and its
 * number row is a third the size of these.
 */
export function Stepper({
  value,
  onChange,
  onRequestPad,
  step = 2.5,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  unit,
  hint,
  decreaseLabel,
  increaseLabel,
  className,
}: StepperProps) {
  const clamp = (next: number) => Math.min(max, Math.max(min, next))

  // Float dust: 82.5 - 2.5 must be 80, not 79.99999999999999.
  const round = (next: number) => Math.round(next * 1000) / 1000

  return (
    <div
      className={cn(
        'flex items-stretch overflow-hidden rounded-md border border-line bg-surface',
        'shadow-(--shadow-sm)',
        className,
      )}
    >
      <button
        type="button"
        aria-label={decreaseLabel}
        onClick={() => onChange(round(clamp(value - step)))}
        className="touch-comfortable grid w-13 shrink-0 cursor-pointer place-items-center bg-sunken transition-colors duration-(--dur-fast) hover:bg-accent-wash hover:text-accent active:scale-95"
      >
        <Minus size={22} strokeWidth={2.5} />
      </button>

      <button
        type="button"
        onClick={onRequestPad}
        disabled={!onRequestPad}
        className="flex-1 cursor-pointer px-1.5 py-2.5 text-center disabled:cursor-default"
      >
        <span className="num block text-[1.875rem] leading-tight font-semibold">{value}</span>
        {unit ? <span className="label-caps block text-ink-faint">{unit}</span> : null}
        {hint ? <span className="mt-px block text-[0.625rem] text-ink-faint">{hint}</span> : null}
      </button>

      <button
        type="button"
        aria-label={increaseLabel}
        onClick={() => onChange(round(clamp(value + step)))}
        className="touch-comfortable grid w-13 shrink-0 cursor-pointer place-items-center bg-sunken transition-colors duration-(--dur-fast) hover:bg-accent-wash hover:text-accent active:scale-95"
      >
        <Plus size={22} strokeWidth={2.5} />
      </button>
    </div>
  )
}
