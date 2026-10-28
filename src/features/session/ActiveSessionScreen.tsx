import { ChevronLeft, Plus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'

import { useActiveSession, useSettings } from '~/db/hooks'
import { completeSession } from '~/db/repositories/history'
import { addExerciseToSession, discardSession } from '~/db/repositories/sessions'
import { totalVolume } from '~/domain/metrics'
import { formatVolume } from '~/domain/units'
import { useRestTimer } from '~/features/rest/restTimer'
import { Button } from '~/ui/Button'
import { Sheet } from '~/ui/Sheet'

import { ExercisePickerSheet } from '~/features/exercises/ExercisePickerSheet'

import { ExerciseCard } from './ExerciseCard'
import { ProgressRibbon } from './ProgressRibbon'
import { formatDuration, useElapsed } from './useElapsed'

export function ActiveSessionScreen() {
  const navigate = useNavigate()
  const active = useActiveSession()
  const settings = useSettings()

  const [picking, setPicking] = useState(false)
  const [finishing, setFinishing] = useState(false)

  // The rest bar lives in the app shell, so an unstopped timer follows you out
  // of the workout and chimes at you on the history screen.
  const stopRest = useRestTimer((state) => state.skip)

  // `undefined` is "still loading"; `null` is "there genuinely isn't one".
  if (active === undefined) {
    return <p className="p-8 text-center text-[0.85rem] text-ink-faint">Loading…</p>
  }
  if (active === null) {
    return (
      <div className="grid place-items-center p-8 text-center">
        <p className="font-display text-[1.6rem]">No workout in progress.</p>
        <Button className="mt-4" onClick={() => void navigate('/')}>
          Back to Today
        </Button>
      </div>
    )
  }

  const { session, views } = active
  const allSets = views.flatMap((view) => view.sets)
  const workingSets = allSets.filter((set) => set.type !== 'warmup')
  const volume = totalVolume({ sets: allSets })

  return (
    <>
      <SessionHeader
        name={session.name}
        startedAt={session.startedAt}
        setCount={workingSets.length}
        onBack={() => void navigate('/')}
        onFinish={() => setFinishing(true)}
      />

      <ProgressRibbon views={views} />

      <div className="grid gap-3 px-4 pt-3.5 pb-6">
        {views.map((view, index) => {
          const previous = views[index - 1]
          const group = view.sessionExercise.supersetGroup
          return (
            <ExerciseCard
              key={view.sessionExercise.id}
              view={view}
              settings={settings}
              // The first exercise with an unfinished set is the one in hand.
              active={index === views.findIndex((candidate) => candidate.sets.length === 0)}
              groupedWithPrevious={
                group != null && group === previous?.sessionExercise.supersetGroup
              }
            />
          )
        })}

        <button
          type="button"
          onClick={() => setPicking(true)}
          className="w-full cursor-pointer rounded-lg border-[1.5px] border-dashed border-line-strong p-3.5 text-[0.85rem] font-bold text-ink-muted"
        >
          <Plus size={15} className="mr-1 inline align-[-2px]" aria-hidden />
          Add exercise
        </button>

        {views.length === 0 ? (
          <p className="px-6 pt-4 text-center text-[0.85rem] leading-relaxed text-ink-muted">
            An empty workout. Add whatever you feel like doing — nothing here has to come from a
            plan.
          </p>
        ) : null}
      </div>

      <ExercisePickerSheet
        open={picking}
        onOpenChange={setPicking}
        alreadyAdded={views.map((view) => view.sessionExercise.exerciseId)}
        onPick={(exerciseId) => {
          void addExerciseToSession(session.id, exerciseId)
          setPicking(false)
        }}
      />

      <Sheet
        open={finishing}
        onOpenChange={setFinishing}
        eyebrow={session.name}
        title={workingSets.length === 0 ? 'Nothing logged yet' : 'Finish this workout?'}
        footer={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setFinishing(false)}>
              Keep going
            </Button>
            <Button
              variant={workingSets.length === 0 ? 'danger' : 'success'}
              size="sm"
              className="flex-1"
              onClick={() => {
                setFinishing(false)
                // Rest belongs to the set you just did. The workout is over,
                // so the countdown and its scheduled notification go with it.
                stopRest()
                if (workingSets.length === 0) {
                  void discardSession(session.id).then(() => navigate('/'))
                  return
                }
                // completeSession settles records, then the detail screen shows
                // the summary and anything newly earned.
                void completeSession(session.id).then(() => navigate(`/history/${session.id}`))
              }}
            >
              {workingSets.length === 0 ? 'Discard workout' : 'Finish workout'}
            </Button>
          </div>
        }
      >
        <div className="px-5 py-4">
          {workingSets.length === 0 ? (
            <p className="text-[0.9rem] leading-relaxed text-ink-muted">
              You have not logged any working sets, so there is nothing worth keeping. Discarding
              removes this session entirely.
            </p>
          ) : (
            <dl className="grid grid-cols-3 gap-3">
              <Summary label="Duration" value={<Elapsed startedAt={session.startedAt} />} />
              <Summary label="Sets" value={String(workingSets.length)} />
              <Summary label="Volume" value={formatVolume(volume, settings.units)} />
            </dl>
          )}
        </div>
      </Sheet>
    </>
  )
}

function Summary({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="label-caps text-ink-faint">{label}</dt>
      <dd className="num mt-0.5 text-title font-semibold">{value}</dd>
    </div>
  )
}

function Elapsed({ startedAt }: { startedAt: number }) {
  return <>{formatDuration(useElapsed(startedAt))}</>
}

function SessionHeader({
  name,
  startedAt,
  setCount,
  onBack,
  onFinish,
}: {
  name: string
  startedAt: number
  setCount: number
  onBack: () => void
  onFinish: () => void
}) {
  const elapsed = useElapsed(startedAt)

  return (
    <header className="flex items-center gap-3 border-b border-line bg-canvas px-4 pt-3 pb-3">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back to Today"
        className="grid size-[2.375rem] shrink-0 cursor-pointer place-items-center rounded-full border border-line bg-surface"
      >
        <ChevronLeft size={18} aria-hidden />
      </button>

      <div className="min-w-0 flex-1">
        <h1 className="truncate font-display text-[1.375rem] leading-tight font-normal">{name}</h1>
        <p className="num flex items-center gap-1.5 text-[0.7rem] text-ink-muted">
          <span
            aria-hidden
            className="size-1.5 shrink-0 animate-[blink_2s_var(--ease-out-soft)_infinite] rounded-full bg-accent"
          />
          {formatDuration(elapsed)} · {setCount} set{setCount === 1 ? '' : 's'}
        </p>
      </div>

      <Button variant="success" size="xs" onClick={onFinish}>
        Finish
      </Button>
    </header>
  )
}
