import { useState } from 'react'

import { cn } from './cn'
import { ExplainerSheet } from './ExplainerSheet'

interface InfoAffordanceProps {
  /** Registry id, e.g. 'est_1rm'. */
  explainerId: string
  /**
   * Input for the worked example, so the sheet shows the user's own numbers
   * rather than invented ones. Omit for guides that compute nothing.
   *
   * `unknown` rather than `any`: the metric that consumes it knows its own
   * input type, and this prop is only a conduit. Typing it `any` would let an
   * unsafe value leak outward from here.
   */
  exampleInput?: unknown
  /** Draws the one-time ring that marks a metric the user has not met yet. */
  hint?: boolean | undefined
  className?: string | undefined
}

/**
 * The ⓘ.
 *
 * Deliberately quiet: explanations are pulled, not pushed. There is no
 * first-run tutorial and nothing to dismiss — a user mid-set is counting
 * breaths, not reading onboarding.
 */
export function InfoAffordance({
  explainerId,
  exampleInput,
  hint = false,
  className,
}: InfoAffordanceProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        aria-label="How this is worked out"
        onClick={(event) => {
          // Info sits inside rows that are themselves tappable.
          event.stopPropagation()
          setOpen(true)
        }}
        className={cn(
          'grid size-[1.0625rem] shrink-0 cursor-pointer place-items-center rounded-full',
          'border-[1.2px] text-[0.6rem] leading-none font-extrabold',
          hint
            ? 'border-accent text-accent shadow-[0_0_0_4px_var(--accent-wash)]'
            : 'border-ink-faint text-ink-faint',
          className,
        )}
      >
        i
      </button>
      <ExplainerSheet
        explainerId={explainerId}
        exampleInput={exampleInput}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  )
}
