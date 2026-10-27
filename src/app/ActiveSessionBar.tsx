import { ChevronRight } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router'

import { useActiveSession } from '~/db/hooks'
import { formatDuration, useElapsed } from '~/features/session/useElapsed'

/**
 * The running-workout bar.
 *
 * Visible from every tab so a session can never be "lost" by wandering off to
 * look at the exercise library mid-workout. Hidden on the session screen
 * itself, where it would just be a link to where you already are.
 */
export function ActiveSessionBar() {
  const active = useActiveSession()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  if (!active || pathname === '/session') return null

  return (
    <SessionBarContent
      name={active.session.name}
      startedAt={active.session.startedAt}
      setCount={active.views.flatMap((view) => view.sets).filter((s) => s.type !== 'warmup').length}
      onOpen={() => void navigate('/session')}
    />
  )
}

function SessionBarContent({
  name,
  startedAt,
  setCount,
  onOpen,
}: {
  name: string
  startedAt: number
  setCount: number
  onOpen: () => void
}) {
  const elapsed = useElapsed(startedAt)

  return (
    <button
      type="button"
      onClick={onOpen}
      className="mx-3 mb-2 flex cursor-pointer items-center gap-3 rounded-lg bg-accent px-4 py-2.5 text-left text-on-accent shadow-(--shadow-md)"
    >
      <span
        aria-hidden
        className="size-2 shrink-0 animate-[blink_2s_var(--ease-out-soft)_infinite] rounded-full bg-on-accent"
      />
      <span className="min-w-0 flex-1">
        <span className="label-caps block opacity-70">Workout in progress</span>
        <span className="block truncate text-[0.95rem] font-bold">{name}</span>
      </span>
      <span className="num shrink-0 text-[0.85rem] font-bold opacity-90">
        {formatDuration(elapsed)} · {setCount}
      </span>
      <ChevronRight size={17} aria-hidden className="shrink-0 opacity-80" />
    </button>
  )
}
