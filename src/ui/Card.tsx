import type { HTMLAttributes } from 'react'

import { cn } from './cn'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Raises the surface and strengthens the border. For the focused exercise. */
  active?: boolean
}

export function Card({ active = false, className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-line bg-surface p-4',
        active ? 'border-line-strong shadow-(--shadow-md)' : 'shadow-(--shadow-sm)',
        className,
      )}
      {...props}
    />
  )
}
