import { Delete } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Sheet } from './Sheet'
import { cn } from './cn'

interface NumericPadProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  value: number
  onCommit: (value: number) => void
  unit?: string
  /** Context line, e.g. "Bench Press · set 3 · weight". */
  eyebrow?: string
  /** Quick-adjust buttons; follows the unit (±2.5 kg, ±5 lb). */
  increment?: number
  allowDecimal?: boolean
}

const KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3'] as const

/**
 * The custom numeric pad.
 *
 * 54px keys against the OS keyboard's ~30px number row, it carries the ±
 * increments alongside the digits, and it never covers the value being edited
 * because the readout lives in the sheet header above it.
 *
 * Key placement is deliberate: Done is double-height under the thumb, and
 * backspace sits top-right as far from it as the grid allows — an accidental
 * delete mid-entry is the common error here.
 */
export function NumericPad({
  open,
  onOpenChange,
  value,
  onCommit,
  unit,
  eyebrow,
  increment = 2.5,
  allowDecimal = true,
}: NumericPadProps) {
  const [draft, setDraft] = useState(() => String(value))
  /**
   * Whether the user has started entering a number.
   *
   * The pad opens showing the current value so you can see what you are
   * changing, but the first digit must REPLACE it rather than append — typing
   * "80" into a field already reading "80" has to give 80, not 8080. This is
   * how every calculator behaves, and getting it wrong silently corrupts a set.
   */
  const [touched, setTouched] = useState(false)

  // Re-seed whenever the pad opens for a different value.
  useEffect(() => {
    if (open) {
      setDraft(String(value))
      setTouched(false)
    }
  }, [open, value])

  const commit = () => {
    const parsed = Number.parseFloat(draft)
    onCommit(Number.isFinite(parsed) ? parsed : value)
    onOpenChange(false)
  }

  const append = (key: string) => {
    setDraft((current) => {
      // First keypress starts a new number over the seeded one.
      const base = touched ? current : ''
      if (key === '.') {
        if (!allowDecimal || base.includes('.')) return base || '0'
        return base === '' ? '0.' : `${base}.`
      }
      // A lone leading zero should be replaced, not built on.
      if (base === '0') return key
      if (base.replace('.', '').length >= 6) return base
      return base + key
    })
    setTouched(true)
  }

  const backspace = () => {
    // Backspace operates on what is shown, so it edits the seeded value rather
    // than wiping it — which is what you want when fixing a typo'd digit.
    setDraft((current) => current.slice(0, -1))
    setTouched(true)
  }

  const adjust = (delta: number) => {
    setDraft((current) => {
      const parsed = Number.parseFloat(current)
      const base = Number.isFinite(parsed) ? parsed : 0
      return String(Math.max(0, Math.round((base + delta) * 1000) / 1000))
    })
    setTouched(true)
  }

  const keyClass =
    'h-[3.375rem] cursor-pointer rounded-[0.8125rem] text-[1.375rem] font-semibold num ' +
    'bg-sunken transition-colors duration-(--dur-fast) hover:bg-accent-wash hover:text-accent ' +
    'active:scale-95'
  const utilClass =
    'h-[3.375rem] cursor-pointer rounded-[0.8125rem] text-[0.9rem] font-bold border border-line ' +
    'bg-transparent text-ink-muted transition-colors duration-(--dur-fast) hover:bg-accent-wash ' +
    'hover:text-accent active:scale-95 grid place-items-center'

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={eyebrow ?? 'Enter a value'} hideTitle>
      <div className="px-4 pb-4">
        <div className="relative py-3 text-center">
          <span
            className="pointer-events-none absolute top-1/2 left-1/2 size-[13rem] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ background: 'radial-gradient(circle, var(--glow) 0%, transparent 70%)' }}
          />
          <p className="label-caps relative text-ink-faint">{eyebrow}</p>
          <p className="num-hero relative mt-1 text-mega leading-none">
            {draft || '0'}
            <span className="ml-1 inline-block h-10 w-[3px] translate-y-[-6px] animate-[blink_1.1s_steps(1,end)_infinite] bg-accent align-middle" />
            {unit ? (
              <span className="ml-1 text-[0.95rem] font-semibold tracking-normal text-ink-muted">
                {unit}
              </span>
            ) : null}
          </p>
        </div>

        <div className="grid grid-cols-4 gap-[0.4375rem]">
          {KEYS.slice(0, 3).map((key) => (
            <button key={key} type="button" className={keyClass} onClick={() => append(key)}>
              {key}
            </button>
          ))}
          <button
            type="button"
            aria-label="Backspace"
            className={utilClass}
            onClick={backspace}
          >
            <Delete size={18} />
          </button>

          {KEYS.slice(3, 6).map((key) => (
            <button key={key} type="button" className={keyClass} onClick={() => append(key)}>
              {key}
            </button>
          ))}
          <button
            type="button"
            onClick={commit}
            className={cn(
              'row-span-2 h-auto cursor-pointer rounded-[0.8125rem] bg-accent text-[0.9rem]',
              'font-extrabold text-on-accent active:scale-95',
            )}
          >
            Done
          </button>

          {KEYS.slice(6, 9).map((key) => (
            <button key={key} type="button" className={keyClass} onClick={() => append(key)}>
              {key}
            </button>
          ))}

          <button type="button" className={utilClass} onClick={() => adjust(increment)}>
            +{increment}
          </button>
          <button type="button" className={keyClass} onClick={() => append('0')}>
            0
          </button>
          <button
            type="button"
            className={keyClass}
            onClick={() => append('.')}
            disabled={!allowDecimal}
          >
            .
          </button>
          <button type="button" className={utilClass} onClick={() => adjust(-increment)}>
            −{increment}
          </button>
        </div>
      </div>
    </Sheet>
  )
}
