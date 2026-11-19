import { ArrowRight, CalendarClock, Play } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'

import { useCurrentSession, useRoutines, useSettings, useTrainingRecency } from '~/db/hooks'
import { planSessionFromRoutine, startSessionFromRoutine } from '~/db/repositories/routines'
import {
  discardSession,
  isStale,
  planEmptySession,
  startEmptySession,
  startPlannedSession,
} from '~/db/repositories/sessions'
import { totalVolume } from '~/domain/metrics'
import { MUSCLE_LABEL, MUSCLE_ORDER } from '~/domain/muscles'
import {
  describeLastRun,
  describeRecency,
  restBand,
  type MuscleRecency,
  type RestBand,
} from '~/domain/recency'
import { countsAsSet } from '~/domain/sets'
import type { MuscleGroup } from '~/domain/types'
import { formatVolume } from '~/domain/units'
import { BodyMap, RestKey } from './BodyMap'
import { useRestTimer } from '~/features/rest/restTimer'
import { Button } from '~/ui/Button'
import { Card } from '~/ui/Card'
import { ScreenHeader } from '~/ui/ScreenHeader'
import { Sheet } from '~/ui/Sheet'
import { cn } from '~/ui/cn'
import { InstallNudge } from '~/features/install/InstallCard'
import { formatDuration, useElapsed } from '~/features/session/useElapsed'

export function TodayScreen() {
  const navigate = useNavigate()
  const current = useCurrentSession()
  const settings = useSettings()
  const routines = useRoutines()
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const stopRest = useRestTimer((state) => state.skip)

  const session = current?.session ?? null
  const planned = session?.status === 'planned'
  const stale = session && !planned ? isStale(session) : false
  // Once a workout is under way, or a plan is sitting there, the question this
  // answers has already been answered.
  const recency = useTrainingRecency(session == null)

  async function start() {
    await startEmptySession('Workout')
    await navigate('/session')
  }

  async function startRoutine(routineId: string) {
    await startSessionFromRoutine(routineId)
    await navigate('/session')
  }

  /** Into the session screen, which is also the plan editor. */
  async function planRoutine(routineId: string) {
    await planSessionFromRoutine(routineId)
    await navigate('/session')
  }

  async function planEmpty() {
    await planEmptySession('Workout')
    await navigate('/session')
  }

  return (
    <>
      <ScreenHeader
        eyebrow={new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
        title={
          planned
            ? 'Planned and waiting.'
            : session
              ? 'Pick up where you left off.'
              : 'Ready when you are.'
        }
      />

      <div className="grid gap-3 px-4 pb-6">
        {planned && session ? (
          <PlannedCard
            name={session.name}
            exerciseCount={current?.views.length ?? 0}
            plannedSets={
              current?.views.reduce(
                (total, view) => total + (view.sessionExercise.targetSets ?? 0),
                0,
              ) ?? 0
            }
            preview={(current?.views ?? [])
              .slice(0, 3)
              .map((view) => view.exercise?.name ?? 'Unknown')}
            plannedAt={session.plannedAt}
            onStart={() => void startPlannedSession(session.id).then(() => navigate('/session'))}
            onEdit={() => void navigate('/session')}
            onDiscard={() => setConfirmDiscard(true)}
          />
        ) : session ? (
          <ResumeCard
            name={session.name}
            startedAt={session.startedAt}
            setCount={
              current?.views.flatMap((v) => v.sets).filter(countsAsSet).length ?? 0
            }
            volume={formatVolume(
              totalVolume({ sets: current?.views.flatMap((v) => v.sets) ?? [] }),
              settings.units,
            )}
            stale={stale}
            onResume={() => void navigate('/session')}
            onDiscard={() => setConfirmDiscard(true)}
          />
        ) : (
          <>
            {/* Routines first when they exist — most sessions come from a plan.
                The empty workout stays one tap away for everyone else. */}
            {(routines ?? [])
              .filter((summary) => summary.exerciseCount > 0)
              .slice(0, 3)
              .map((summary) => {
                // "Have I already done this one this week?" is half of choosing
                // a routine, and it is the half the card could not answer. A
                // routine never run says nothing rather than "never".
                const lastRun = describeLastRun(recency?.routineLastRunAt.get(summary.routine.id))

                return (
                  // Two targets, one row: the big one starts the workout now,
                  // and the narrow one sets it up to start later. Planning is a
                  // decision made on this screen — at home, hours before the
                  // gym — so burying it in a menu would be hiding it from the
                  // moment it is taken.
                  <div key={summary.routine.id} className="flex items-stretch gap-2">
                    <button
                      type="button"
                      onClick={() => void startRoutine(summary.routine.id)}
                      className="flex h-16 min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-xl bg-accent px-5 text-on-accent shadow-(--shadow-md) transition-transform duration-(--dur-fast) active:scale-[0.98]"
                    >
                      <Play size={20} fill="currentColor" aria-hidden className="shrink-0" />
                      <span className="min-w-0 flex-1 text-left">
                        <span className="label-caps block">
                          {summary.exerciseCount} exercise{summary.exerciseCount === 1 ? '' : 's'}
                          {lastRun ? ` · ${lastRun}` : null}
                        </span>
                        <span className="block truncate text-[1.1rem] font-bold tracking-tight">
                          {summary.routine.name}
                        </span>
                      </span>
                      <ArrowRight size={20} aria-hidden className="shrink-0 opacity-85" />
                    </button>

                    <button
                      type="button"
                      onClick={() => void planRoutine(summary.routine.id)}
                      aria-label={`Plan ${summary.routine.name} to start later`}
                      className="flex h-16 w-[3.75rem] shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-line-strong bg-surface text-ink-muted shadow-(--shadow-sm) transition-transform duration-(--dur-fast) active:scale-[0.98]"
                    >
                      <CalendarClock size={18} aria-hidden />
                      <span className="label-caps text-[0.6rem]" aria-hidden>
                        Plan
                      </span>
                    </button>
                  </div>
                )
              })}

            <div className="flex items-stretch gap-2">
              <button
                type="button"
                onClick={() => void start()}
                className={cn(
                  'flex h-16 min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-xl px-5 transition-transform duration-(--dur-fast) active:scale-[0.98]',
                  (routines ?? []).some((summary) => summary.exerciseCount > 0)
                    ? 'border border-line-strong bg-surface text-ink shadow-(--shadow-sm)'
                    : 'bg-accent text-on-accent shadow-(--shadow-md)',
                )}
              >
                <Play size={20} fill="currentColor" aria-hidden className="shrink-0" />
                <span className="flex-1 text-left">
                  <span className="label-caps block">No plan needed</span>
                  <span className="block text-[1.1rem] font-bold tracking-tight">
                    Empty workout
                  </span>
                </span>
                <ArrowRight size={20} aria-hidden className="shrink-0 opacity-85" />
              </button>

              {/* A session you want to set up that is not one of your routines
                  — and the only way to build a plan on a fresh install. */}
              <button
                type="button"
                onClick={() => void planEmpty()}
                // Deliberately not "plan an empty workout": that phrase is the
                // button beside it, and two controls whose names contain the
                // same words are two controls a screen reader cannot tell
                // apart.
                aria-label="Plan a workout from scratch to start later"
                className="flex h-16 w-[3.75rem] shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-line-strong bg-surface text-ink-muted shadow-(--shadow-sm) transition-transform duration-(--dur-fast) active:scale-[0.98]"
              >
                <CalendarClock size={18} aria-hidden />
                <span className="label-caps text-[0.6rem]" aria-hidden>
                  Plan
                </span>
              </button>
            </div>
          </>
        )}

        {/* The one exception to "nothing else belongs here": choosing what to
            train is the decision made on this screen, and it is made out of
            dates. Everything else stays away — the maths reference lives under
            More, and every number that needs explaining carries its own ⓘ
            where it appears. */}
        {session ? null : <LastTrainedCard muscles={recency?.muscles ?? []} />}

        <InstallNudge />
      </div>

      <Sheet
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title={planned ? 'Discard this plan?' : 'Discard this workout?'}
        footer={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setConfirmDiscard(false)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              size="sm"
              className="flex-1"
              onClick={() => {
                if (session) void discardSession(session.id)
                // Same reasoning as finishing: no session, no rest.
                stopRest()
                setConfirmDiscard(false)
              }}
            >
              Discard
            </Button>
          </div>
        }
      >
        <p className="px-5 py-4 text-[0.9rem] leading-relaxed text-ink-muted">
          {planned
            ? 'Nothing has been logged, so this only removes the plan. The routine it came from is untouched.'
            : 'This removes the session and every set logged in it. There is no undo — but you can finish it instead and edit or delete it later from History.'}
        </p>
      </Sheet>
    </>
  )
}

/**
 * Muscles that get a region on the figure.
 *
 * `full_body` is an attribution bucket rather than a place on the body — a
 * clean is credited to it — so it has nowhere to be shaded and is never
 * counted as untrained.
 */
const MAPPED_MUSCLES = MUSCLE_ORDER.filter((muscle) => muscle !== 'full_body')

/**
 * How long since each muscle was trained, as a map of the body.
 *
 * It reports dates and lets you draw the conclusion, rather than announcing
 * that your chest is recovered — which depends on the load, the week and the
 * lifter, and is not something a date can know. Nothing is red, nothing is
 * overdue, and nothing has to be tapped.
 *
 * The two lines underneath name the extremes. A map is read in seconds and a
 * shaded figure is only ever approximate, so the one number worth having — how
 * long the longest rest actually is — is written out in words beside it.
 */
function LastTrainedCard({ muscles }: { muscles: readonly MuscleRecency[] }) {
  // A fresh install has nothing to say about where to start.
  if (muscles.length === 0) return null

  const bands: Partial<Record<MuscleGroup, RestBand>> = {}
  for (const entry of muscles) bands[entry.muscle] = restBand(entry)

  // Already sorted longest-rested first by the domain.
  const longest = muscles[0]
  const untrained = MAPPED_MUSCLES.filter((muscle) => bands[muscle] == null)

  return (
    <Card>
      <p className="label-caps text-ink-muted">Last trained</p>

      <div className="mt-2">
        <BodyMap bands={bands} />
      </div>

      <RestKey />

      <div className="mt-2.5 flex gap-2 border-t border-dashed border-line pt-2.5">
        {longest ? (
          <Readout
            swatch={FILL_FOR_BAND[restBand(longest)]}
            name={MUSCLE_LABEL[longest.muscle]}
            value={describeRecency(longest)}
          />
        ) : null}

        {untrained.length > 0 ? (
          <Readout
            swatch="bg-rest-0"
            name={MUSCLE_LABEL[untrained[0]!]}
            value={
              untrained.length === 1
                ? 'not trained yet'
                : `+${untrained.length - 1} more, not trained yet`
            }
          />
        ) : (
          // Nothing untrained — name the other end of the ramp instead, so the
          // line always says what the palest shading on the figure means.
          <Readout
            swatch={FILL_FOR_BAND[restBand(muscles.at(-1))]}
            name={MUSCLE_LABEL[muscles.at(-1)!.muscle]}
            value={describeRecency(muscles.at(-1)!)}
          />
        )}
      </div>

      {/* The figure is colour-only by construction, so the whole reading is
          also available as text. */}
      <ul className="sr-only">
        {muscles.map((entry) => (
          <li key={entry.muscle}>
            {MUSCLE_LABEL[entry.muscle]}: last trained {describeRecency(entry)}
          </li>
        ))}
        {untrained.map((muscle) => (
          <li key={muscle}>{MUSCLE_LABEL[muscle]}: not trained yet</li>
        ))}
      </ul>
    </Card>
  )
}

/** Swatch classes, spelled out so Tailwind can see them. */
const FILL_FOR_BAND: Readonly<Record<RestBand, string>> = {
  none: 'bg-rest-0',
  fresh: 'bg-rest-1',
  recent: 'bg-rest-2',
  few: 'bg-rest-3',
  week: 'bg-rest-4',
  long: 'bg-rest-5',
}

function Readout({ swatch, name, value }: { swatch: string; name: string; value: string }) {
  return (
    <p className="min-w-0 flex-1">
      <span className="flex items-center gap-1.5 text-[0.8rem] font-semibold text-ink">
        <i className={cn('size-2.5 shrink-0 rounded-xs', swatch)} aria-hidden />
        <span className="truncate">{name}</span>
      </span>
      <span className="num mt-0.5 block text-[0.75rem] text-ink-muted">{value}</span>
    </p>
  )
}

/**
 * A workout that is set up and waiting.
 *
 * Shaped like the resume card on purpose — this is the same "there is a session
 * here" slot — but it reports the plan rather than progress, and it has no
 * clock, because nothing has started. Starting it goes straight to the session
 * screen: you are standing in the gym by then, and the next thing you want is
 * the first set.
 */
function PlannedCard({
  name,
  exerciseCount,
  plannedSets,
  preview,
  plannedAt,
  onStart,
  onEdit,
  onDiscard,
}: {
  name: string
  exerciseCount: number
  plannedSets: number
  preview: string[]
  plannedAt: number | undefined
  onStart: () => void
  onEdit: () => void
  onDiscard: () => void
}) {
  const age = describeLastRun(plannedAt)

  return (
    <Card active className="p-0">
      <button
        type="button"
        onClick={onEdit}
        className="w-full cursor-pointer px-4 pt-4 pb-3 text-left"
      >
        <p className="label-caps flex items-center gap-1.5 text-accent-ink">
          <CalendarClock size={12} aria-hidden />
          Planned{age ? ` ${age}` : null}
        </p>
        <p className="mt-1 font-display text-[1.6rem] leading-tight">{name}</p>
        <p className="num mt-1.5 text-[0.8rem] text-ink-muted">
          {exerciseCount === 0
            ? 'No exercises yet — tap to add them'
            : `${exerciseCount} exercise${exerciseCount === 1 ? '' : 's'}${plannedSets > 0 ? ` · ${plannedSets} sets` : ''}`}
        </p>
        {/* What is actually in it. The counts say how much work; this is the
            line that lets you recognise the plan without opening it. */}
        {preview.length > 0 ? (
          <p className="mt-1 truncate text-[0.78rem] text-ink-faint">
            {preview.join(' · ')}
            {exerciseCount > preview.length ? ' · …' : null}
          </p>
        ) : null}
      </button>

      <div className="flex items-center gap-2 border-t border-line px-4 py-3">
        <Button size="sm" className="flex-1" onClick={onStart}>
          <Play size={15} fill="currentColor" aria-hidden />
          Start
        </Button>
        <Button variant="secondary" size="sm" onClick={onEdit}>
          Edit
        </Button>
        <Button variant="secondary" size="sm" onClick={onDiscard}>
          Discard
        </Button>
      </div>

      {/* The one thing a plan has to say for itself: the clock is not running
          and nothing is being missed by leaving it here. */}
      <p className="border-t border-line px-4 py-2.5 text-[0.75rem] leading-relaxed text-ink-muted">
        Nothing is being timed yet. The workout starts — and the clock with it — when you tap Start.
      </p>
    </Card>
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
        <p className="label-caps text-accent-ink">In progress</p>
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
