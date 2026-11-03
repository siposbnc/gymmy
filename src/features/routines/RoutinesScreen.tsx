import { Archive, ClipboardPaste, Copy, Pencil, Play, Plus, Share2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'

import { useActiveSession, useRoutines, type RoutineSummary } from '~/db/hooks'
import {
  archiveRoutine,
  createRoutine,
  duplicateRoutine,
  startSessionFromRoutine,
} from '~/db/repositories/routines'
import { Button } from '~/ui/Button'
import { Card } from '~/ui/Card'
import { ScreenHeader } from '~/ui/ScreenHeader'
import { Sheet } from '~/ui/Sheet'

import { ImportRoutineSheet } from './ImportRoutineSheet'
import { ShareRoutineSheet } from './ShareRoutineSheet'

export function RoutinesScreen() {
  const navigate = useNavigate()
  const routines = useRoutines()
  const active = useActiveSession()
  const [menuFor, setMenuFor] = useState<RoutineSummary | null>(null)
  const [sharing, setSharing] = useState<RoutineSummary | null>(null)
  const [importing, setImporting] = useState(false)

  const hasActiveSession = active != null

  async function create() {
    const id = await createRoutine()
    await navigate(`/routines/${id}`)
  }

  async function start(routineId: string) {
    await startSessionFromRoutine(routineId)
    await navigate('/session')
  }

  return (
    <>
      <ScreenHeader
        title="Routines"
        action={
          <Button size="sm" onClick={() => void create()}>
            <Plus size={16} aria-hidden />
            New
          </Button>
        }
      />

      <div className="grid gap-3 px-4 pb-6">
        {routines === undefined ? (
          <p className="py-8 text-center text-[0.85rem] text-ink-faint">Loading…</p>
        ) : routines.length === 0 ? (
          <EmptyState onCreate={() => void create()} onImport={() => setImporting(true)} />
        ) : (
          routines.map((summary) => (
            <RoutineCard
              key={summary.routine.id}
              summary={summary}
              disabled={hasActiveSession}
              onStart={() => void start(summary.routine.id)}
              onEdit={() => void navigate(`/routines/${summary.routine.id}`)}
              onMenu={() => setMenuFor(summary)}
            />
          ))
        )}

        {hasActiveSession && routines && routines.length > 0 ? (
          <p className="px-2 text-center text-[0.78rem] leading-relaxed text-ink-muted">
            A workout is already in progress. Finish or discard it before starting another.
          </p>
        ) : null}

        {/* Below the list rather than in the header: importing is a once-in-a-
            while thing, and the header already holds the action you came for. */}
        {routines && routines.length > 0 ? (
          <button
            type="button"
            onClick={() => setImporting(true)}
            className="w-full cursor-pointer rounded-lg border-[1.5px] border-dashed border-line-strong p-3.5 text-[0.85rem] font-bold text-ink-muted"
          >
            <ClipboardPaste size={15} className="mr-1.5 inline align-[-2px]" aria-hidden />
            Import a shared routine
          </button>
        ) : null}
      </div>

      <Sheet
        open={menuFor !== null}
        onOpenChange={(open) => !open && setMenuFor(null)}
        eyebrow={menuFor?.routine.name}
        title="Routine options"
      >
        <div className="divide-y divide-line pb-2">
          <MenuAction
            icon={<Pencil size={18} />}
            label="Edit"
            hint="Exercises, targets and rest"
            onClick={() => {
              if (menuFor) void navigate(`/routines/${menuFor.routine.id}`)
              setMenuFor(null)
            }}
          />
          <MenuAction
            icon={<Copy size={18} />}
            label="Duplicate"
            hint="Start from a copy — the usual way to build the next cycle"
            onClick={() => {
              if (menuFor) {
                void duplicateRoutine(menuFor.routine.id).then((id) => navigate(`/routines/${id}`))
              }
              setMenuFor(null)
            }}
          />
          <MenuAction
            icon={<Share2 size={18} />}
            label="Share"
            hint="A code you can send to anyone else using Gymmy"
            onClick={() => {
              setSharing(menuFor)
              setMenuFor(null)
            }}
          />
          <MenuAction
            icon={<Archive size={18} />}
            label="Archive"
            hint="Hidden from this list. Past workouts keep their names."
            destructive
            onClick={() => {
              if (menuFor) void archiveRoutine(menuFor.routine.id)
              setMenuFor(null)
            }}
          />
        </div>
      </Sheet>

      <ShareRoutineSheet
        routineId={sharing?.routine.id}
        routineName={sharing?.routine.name}
        open={sharing !== null}
        onOpenChange={(open) => !open && setSharing(null)}
      />

      <ImportRoutineSheet
        open={importing}
        onOpenChange={setImporting}
        onImported={(routineId) => {
          setImporting(false)
          // Into the builder, not back to the list: the first thing anyone
          // does with someone else's plan is change the weights.
          void navigate(`/routines/${routineId}`)
        }}
      />
    </>
  )
}

function RoutineCard({
  summary,
  disabled,
  onStart,
  onEdit,
  onMenu,
}: {
  summary: RoutineSummary
  disabled: boolean
  onStart: () => void
  onEdit: () => void
  onMenu: () => void
}) {
  const { routine, exerciseCount, preview } = summary

  return (
    <Card className="p-0">
      <button type="button" onClick={onEdit} className="w-full cursor-pointer px-4 pt-4 text-left">
        <p className="font-display text-[1.45rem] leading-tight">{routine.name}</p>
        <p className="mt-1 text-[0.78rem] text-ink-muted">
          {exerciseCount === 0
            ? 'No exercises yet'
            : preview.join(' · ') + (exerciseCount > preview.length ? ' · …' : '')}
        </p>
      </button>

      <div className="mt-3 flex items-center gap-2 border-t border-line px-4 py-3">
        <Button
          size="sm"
          className="flex-1"
          disabled={disabled || exerciseCount === 0}
          onClick={onStart}
        >
          <Play size={15} fill="currentColor" aria-hidden />
          Start
        </Button>
        <Button
          variant="secondary"
          size="sm"
          iconOnly
          aria-label={`${routine.name} options`}
          onClick={onMenu}
        >
          ⋮
        </Button>
      </div>
    </Card>
  )
}

function MenuAction({
  icon,
  label,
  hint,
  destructive = false,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  hint: string
  destructive?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full cursor-pointer items-center gap-3 px-5 py-3.5 text-left"
    >
      <span className={destructive ? 'text-danger' : 'text-accent-ink'}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className={`block text-[0.95rem] font-medium ${destructive ? 'text-danger' : ''}`}>
          {label}
        </span>
        <span className="block text-[0.75rem] leading-relaxed text-ink-muted">{hint}</span>
      </span>
    </button>
  )
}

function EmptyState({ onCreate, onImport }: { onCreate: () => void; onImport: () => void }) {
  return (
    <div className="px-4 py-10 text-center">
      {/* The editorial serif earns its keep on empty states. */}
      <p className="font-display text-[1.75rem] leading-tight">No plans yet.</p>
      <p className="mx-auto mt-3 max-w-xs text-[0.88rem] leading-relaxed text-ink-muted">
        A routine is a list of exercises with targets, so a session starts with everything already
        filled in. You never need one — an empty workout works fine — but it saves a lot of tapping
        if you train the same thing every week.
      </p>
      <Button className="mt-5" onClick={onCreate}>
        <Plus size={17} aria-hidden />
        Build a routine
      </Button>
      {/* Offered here because arriving with a friend's code is a perfectly
          normal way to end up on this screen with nothing on it. */}
      <p className="mt-4 text-[0.8rem] text-ink-muted">
        Been sent a code?{' '}
        <button
          type="button"
          onClick={onImport}
          className="cursor-pointer font-semibold text-accent-ink underline underline-offset-2"
        >
          Import a shared routine
        </button>
      </p>
    </div>
  )
}
