import type { ReactNode } from 'react'

interface ScreenHeaderProps {
  title: string
  /** Small caps line above the title. */
  eyebrow?: string
  /** Trailing action, e.g. a button. */
  action?: ReactNode
}

export function ScreenHeader({ title, eyebrow, action }: ScreenHeaderProps) {
  return (
    <header className="flex items-end gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-4">
      <div className="min-w-0 flex-1">
        {eyebrow ? <p className="label-caps mb-1 text-ink-faint">{eyebrow}</p> : null}
        {/* The editorial serif, used on titles and empty states — never data. */}
        <h1 className="font-display text-[1.875rem] leading-none font-normal">{title}</h1>
      </div>
      {action}
    </header>
  )
}
