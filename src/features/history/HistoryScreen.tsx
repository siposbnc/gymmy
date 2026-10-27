import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'

import { useCompletedSessions, useSettings } from '~/db/hooks'
import { monthGrid, startOfDay, trainingDays } from '~/domain/history'
import { ScreenHeader } from '~/ui/ScreenHeader'
import { cn } from '~/ui/cn'
import { formatDuration } from '~/lib/time'

const WEEKDAYS_MONDAY = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const WEEKDAYS_SUNDAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

export function HistoryScreen() {
  const navigate = useNavigate()
  const settings = useSettings()
  const sessions = useCompletedSessions()

  const [cursor, setCursor] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })

  const trained = useMemo(() => trainingDays(sessions ?? []), [sessions])
  const grid = useMemo(
    () => monthGrid(cursor.year, cursor.month, settings.weekStartsOn),
    [cursor, settings.weekStartsOn],
  )

  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  })

  const shift = (delta: number) =>
    setCursor((current) => {
      const next = new Date(current.year, current.month + delta, 1)
      return { year: next.getFullYear(), month: next.getMonth() }
    })

  const today = startOfDay(Date.now())
  const weekdays = settings.weekStartsOn === 1 ? WEEKDAYS_MONDAY : WEEKDAYS_SUNDAY

  return (
    <>
      <ScreenHeader title="History" />

      <div className="px-4 pb-6">
        {/* Calendar: density at a glance, before any list. */}
        <div className="rounded-lg border border-line bg-surface p-3">
          <div className="mb-2 flex items-center gap-2">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => shift(-1)}
              className="grid size-8 cursor-pointer place-items-center rounded-full text-ink-muted"
            >
              <ChevronLeft size={17} aria-hidden />
            </button>
            <p className="flex-1 text-center text-[0.9rem] font-semibold">{monthLabel}</p>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => shift(1)}
              className="grid size-8 cursor-pointer place-items-center rounded-full text-ink-muted"
            >
              <ChevronRight size={17} aria-hidden />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {weekdays.map((day, index) => (
              <span
                key={`${day}-${index}`}
                aria-hidden
                className="label-caps py-1 text-center text-ink-faint"
              >
                {day}
              </span>
            ))}

            {grid.map((day) => {
              const inMonth = new Date(day).getMonth() === cursor.month

              // Days from the neighbouring months are only here to square off
              // the week grid. Rendering their numbers at 25% opacity put
              // unreadable text on screen for no informational gain — the
              // month heading already says where you are.
              if (!inMonth) return <span key={day} aria-hidden className="aspect-square" />

              const didTrain = trained.has(day)
              return (
                <span
                  key={day}
                  className={cn(
                    'num grid aspect-square place-items-center rounded-md text-[0.72rem] font-bold',
                    didTrain
                      ? 'bg-accent text-on-accent'
                      : day === today
                        ? 'border border-accent text-accent-ink'
                        : 'text-ink-muted',
                  )}
                >
                  {new Date(day).getDate()}
                </span>
              )
            })}
          </div>
        </div>

        <h2 className="label-caps mt-5 mb-2 px-1 text-ink-faint">All sessions</h2>

        {sessions === undefined ? (
          <p className="py-8 text-center text-[0.85rem] text-ink-faint">Loading…</p>
        ) : sessions.length === 0 ? (
          <div className="py-10 text-center">
            <p className="font-display text-[1.6rem] leading-tight">Nothing logged yet.</p>
            <p className="mx-auto mt-2 max-w-xs text-[0.85rem] leading-relaxed text-ink-muted">
              Finish a workout and it will show up here — fully editable, in case you forgot a set
              or typed a weight wrong.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
            {sessions.map((session) => (
              <li key={session.id}>
                <button
                  type="button"
                  onClick={() => void navigate(`/history/${session.id}`)}
                  className="flex w-full cursor-pointer items-center gap-3 px-3.5 py-3 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.95rem] font-semibold">
                      {session.name}
                    </span>
                    <span className="num block text-[0.72rem] text-ink-muted">
                      {new Date(session.startedAt).toLocaleDateString(undefined, {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                      })}
                      {session.endedAt
                        ? ` · ${formatDuration((session.endedAt - session.startedAt) / 1000)}`
                        : ''}
                    </span>
                  </span>
                  <ChevronRight size={16} className="shrink-0 text-ink-faint" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
