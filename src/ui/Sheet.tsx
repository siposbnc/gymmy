import * as Dialog from '@radix-ui/react-dialog'
import type { ReactNode } from 'react'

import { cn } from './cn'

interface SheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** Shown above the title in small caps. */
  eyebrow?: string | undefined
  /** Hide the visual title but keep it for screen readers. */
  hideTitle?: boolean | undefined
  children: ReactNode
  footer?: ReactNode | undefined
  className?: string | undefined
}

/**
 * A bottom sheet.
 *
 * Bottom, not centre, and not negotiable: a centre modal on a phone puts its
 * actions in the middle of the screen where a thumb cannot reach them
 * one-handed. Radix handles focus trapping, escape, and scroll locking.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  eyebrow,
  hideTitle = false,
  children,
  footer,
  className,
}: SheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            'fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px]',
            'data-[state=open]:animate-[fade-in_var(--dur)_var(--ease-out-soft)]',
          )}
        />
        <Dialog.Content
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[88dvh] w-full max-w-[32rem]',
            'flex-col overflow-hidden rounded-t-[1.375rem] border border-line bg-raised',
            'shadow-(--shadow-lg) focus:outline-none',
            'data-[state=open]:animate-[sheet-up_var(--dur-slow)_var(--ease-out-soft)]',
            className,
          )}
        >
          {/* Grabber: signals "drag me down", and gives the eye somewhere to land. */}
          <div className="mx-auto mt-3.5 h-1 w-9 shrink-0 rounded-full bg-line-strong" />

          <div className="shrink-0 border-b border-line px-5 pt-3.5 pb-4">
            {eyebrow ? <p className="label-caps mb-1 text-ink-faint">{eyebrow}</p> : null}
            <Dialog.Title
              className={cn(
                'font-display text-[1.7rem] leading-tight font-normal',
                hideTitle && 'sr-only',
              )}
            >
              {title}
            </Dialog.Title>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>

          {footer ? (
            <div className="shrink-0 border-t border-line bg-surface px-5 py-3">{footer}</div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
