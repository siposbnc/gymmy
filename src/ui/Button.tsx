import type { ButtonHTMLAttributes, ReactNode } from 'react'

import { cn } from './cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'success' | 'danger'
export type ButtonSize = 'lg' | 'md' | 'sm' | 'xs'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Icon-only buttons MUST pass aria-label; TypeScript cannot enforce it. */
  iconOnly?: boolean
  children?: ReactNode
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-bright',
  secondary: 'bg-surface text-ink border-line-strong shadow-(--shadow-sm) hover:bg-sunken',
  ghost: 'bg-transparent text-accent hover:bg-accent-wash',
  success: 'bg-success text-on-success',
  danger: 'bg-transparent text-danger border-danger hover:bg-danger-wash',
}

/**
 * `xs` is 38px, the one size below the 44px touch minimum. It is allowed only
 * inside a 52px set row, where the row itself is the real touch target.
 */
const SIZES: Record<ButtonSize, string> = {
  lg: 'h-14 px-7 text-base',
  md: 'h-12 px-6 text-[0.9rem]',
  sm: 'h-11 px-[1.125rem] text-meta',
  xs: 'h-[2.375rem] px-4 text-[0.8rem]',
}

const ICON_SIZES: Record<ButtonSize, string> = {
  lg: 'size-14 p-0',
  md: 'size-12 p-0',
  sm: 'size-11 p-0',
  xs: 'size-[2.375rem] p-0',
}

export function Button({
  variant = 'primary',
  size = 'md',
  iconOnly = false,
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        // Press feedback is scale, not colour: at arm's length in bad lighting
        // a 4% shrink registers where a hover tint does not.
        'inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 border-[1.5px]',
        'border-transparent font-bold tracking-[-0.01em] transition-[transform,background-color]',
        'duration-(--dur-fast) ease-(--ease-out-soft) active:scale-[0.96]',
        'disabled:pointer-events-none disabled:opacity-40',
        iconOnly ? 'rounded-full' : 'rounded-full',
        iconOnly ? ICON_SIZES[size] : SIZES[size],
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  )
}
