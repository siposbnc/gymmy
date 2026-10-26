import type { ReactNode } from 'react'

import { cn } from './cn'
import { InfoAffordance } from './InfoAffordance'

interface StatProps {
  label: string
  value: ReactNode
  unit?: string
  sub?: ReactNode
  /** Registry id of the explainer for this number. */
  explainerId?: string
  className?: string
}

/**
 * A single derived number.
 *
 * `explainerId` is not optional by accident: if a value is computed rather than
 * typed by the user, it should carry an ⓘ. A Stat without one is a value the
 * user entered themselves.
 */
export function Stat({ label, value, unit, sub, explainerId, className }: StatProps) {
  return (
    <div className={cn('rounded-md border border-line bg-surface p-3.5', className)}>
      <p className="label-caps flex items-center gap-1.5 text-ink-faint">
        {label}
        {explainerId ? <InfoAffordance explainerId={explainerId} /> : null}
      </p>
      <p className="num mt-1.5 text-display leading-tight font-semibold">
        {value}
        {unit ? <span className="ml-0.5 text-[0.75rem] text-ink-muted">{unit}</span> : null}
      </p>
      {sub ? <p className="mt-0.5 text-[0.7rem] text-ink-muted">{sub}</p> : null}
    </div>
  )
}
