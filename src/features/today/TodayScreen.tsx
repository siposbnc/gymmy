import { ArrowRight, Play } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'

import { useActiveSession, useSettings } from '~/db/hooks'
import { discardSession, isStale, startEmptySession } from '~/db/repositories/sessions'
import { totalVolume } from '~/domain/metrics'
import { formatVolume } from '~/domain/units'
import { Button } from '~/ui/Button'
import { Card } from '~/ui/Card'
import { ScreenHeader } from '~/ui/ScreenHeader'
import { Sheet } from '~/ui/Sheet'
import { formatDuration, useElapsed } from '~/features/session/useElapsed'

export function TodayScreen() {
  const navigate = useNavigate()
  const active = useActiveSession()
  const settings = useSettings()
  const [confirmStale, setConfirmStale] = useState(false)

  const session = active?.session ?? null
  const stale = session ? isStale(session) : false

  async function start() {
    await startEmptySession('Workout')
    await navigate('/session')
  }

  return (
    <>
      <ScreenHeader
        eyebrow={new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
        title={session ? 'Pick up where you left off.' : 'Ready when you are.'}
      />

      <div className="grid gap-3 px-4 pb-6">
        {session ? (
          <ResumeCard
            name={session.name}
            startedAt={session.startedAt}
            setCount={
              active?.views.flatMap((v) => v.sets).filter((s) => s.type !== 'warmup').length ?? 0
            }
            volume={formatVolume(
              totalVolume({ sets: active?.views.flatMap((v) => v.sets) ?? [] }),
              settings.units,
            )}
            stale={stale}
            onResume={() => void navigate('/session')}
            onDiscard={() => setConfirmStale(true)}
          />
        ) : (
          <button
            type="button"
            onClick={() => void start()}
            className="flex h-16 cursor-pointer items-center gap-3 rounded-xl bg-accent px-5 text-on-accent shadow-(--shadow-md) transition-transform duration-(--dur-fast) active:scale-[0.98]"
          >
            <Play size={20} fill="currentColor" aria-hidden className="shrink-0" />
            <span className="flex-1 text-left">
              <span className="label-caps block opacity-70">No plan needed</span>
              <span className="block text-[1.1rem] font-bold tracking-tight">Start a workout</span>
            </span>
            <ArrowRight size={20} aria-hidden className="shrink-0 opacity-85" />
          </button>
        )}

        <Card>
          <p className="text-[0.85rem] leading-relaxed text-ink-muted">
            <strong className="font-semibold text-ink">Logging and rest are in:</strong> pre-filled
            set rows, warm-ups, RPE, editable sets, backups, and a rest timer that survives your
            phone sleeping. Training plans arrive in M3 — until then every workout starts empty and
            you add exercises as you go.
          </p>
        </Card>

        <button
          type="button"
          onClick={() => void navigate('/more/maths')}
          className="flex cursor-pointer items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="label-caps block text-ink-faint">Every number, explained</span>
            <span className="block text-[0.95rem] font-semibold">
              How Gymmy works out your numbers
            </span>
          </span>
          <ArrowRight size={17} aria-hidden className="shrink-0 text-ink-faint" />
        </button>
      </div>

      <Sheet
        open={confirmStale}
        onOpenChange={setConfirmStale}
        title="Discard this workout?"
        footer={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setConfirmStale(false)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              size="sm"
              className="flex-1"
              onClick={() => {
                if (session) void discardSession(session.id)
                setConfirmStale(false)
              }}
            >
              Discard
            </Button>
          </div>
        }
      >
        <p className="px-5 py-4 text-[0.9rem] leading-relaxed text-ink-muted">
          This removes the session and every set logged in it. There is no undo — but you can finish
          it instead and edit or delete it later from History.
        </p>
      </Sheet>
    </>
  )
}

function ResumeCard({
  name,
  startedAt,
  setCount,
  volume,
  stale,
  onResume,
  onDiscard,
}: {
  name: string
  startedAt: number
  setCount: number
  volume: string
  stale: boolean
  onResume: () => void
  onDiscard: () => void
}) {
  const elapsed = useElapsed(startedAt)

  return (
    <Card active className="p-0">
      <button
        type="button"
        onClick={onResume}
        className="w-full cursor-pointer px-4 pt-4 pb-3 text-left"
      >
        <p className="label-caps text-accent">In progress</p>
        <p className="mt-1 font-display text-[1.6rem] leading-tight">{name}</p>
        <p className="num mt-1.5 text-[0.8rem] text-ink-muted">
          {formatDuration(elapsed)} · {setCount} set{setCount === 1 ? '' : 's'} · {volume}
        </p>
      </button>

      <div className="flex items-center gap-2 border-t border-line px-4 py-3">
        <Button size="sm" className="flex-1" onClick={onResume}>
          Continue
        </Button>
        {stale ? (
          <Button variant="danger" size="sm" onClick={onDiscard}>
            Discard
          </Button>
        ) : null}
      </div>

      {stale ? (
        // Someone who started a session yesterday and forgot it should not have
        // today's workout silently appended to it.
        <p className="border-t border-line px-4 py-2.5 text-[0.75rem] leading-relaxed text-ink-muted">
          This workout has been open for a while. Continue it if you are still training, or discard
          it and start fresh.
        </p>
      ) : null}
    </Card>
  )
}
