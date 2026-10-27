import { Archive, ChevronLeft, LineChart, Pencil, Trash2 } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'

import {
  archiveExercise,
  canDeleteExercise,
  deleteExercise,
  getExercise,
  unarchiveExercise,
} from '~/db/repositories/exercises'
import { formatRestLength } from '~/lib/time'
import { Button } from '~/ui/Button'
import { Card } from '~/ui/Card'
import { InfoAffordance } from '~/ui/InfoAffordance'
import { Sheet } from '~/ui/Sheet'

import { ExerciseFormSheet } from './ExerciseFormSheet'

export function ExerciseDetailScreen() {
  const { exerciseId } = useParams<{ exerciseId: string }>()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const data = useLiveQuery(async () => {
    if (!exerciseId) return null
    const exercise = await getExercise(exerciseId)
    if (!exercise) return null
    return { exercise, deletable: await canDeleteExercise(exerciseId) }
  }, [exerciseId])

  if (data === undefined) {
    return <p className="p-8 text-center text-[0.85rem] text-ink-faint">Loading…</p>
  }
  if (data === null) {
    return (
      <div className="grid place-items-center p-8 text-center">
        <p className="font-display text-[1.5rem]">That exercise is gone.</p>
        <Button className="mt-4" onClick={() => void navigate('/more/exercises')}>
          Back to Exercises
        </Button>
      </div>
    )
  }

  const { exercise, deletable } = data
  const archived = exercise.archivedAt != null

  return (
    <>
      <header className="flex items-center gap-3 border-b border-line bg-canvas px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <button
          type="button"
          onClick={() => void navigate('/more/exercises')}
          aria-label="Back to Exercises"
          className="grid size-[2.375rem] shrink-0 cursor-pointer place-items-center rounded-full border border-line bg-surface"
        >
          <ChevronLeft size={18} aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          <p className="label-caps text-ink-faint">
            {exercise.isCustom ? 'Your exercise' : 'Built in'}
            {archived ? ' · archived' : ''}
          </p>
          <h1 className="truncate font-display text-[1.375rem] leading-tight">{exercise.name}</h1>
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={`Edit ${exercise.name}`}
          className="grid size-[2.375rem] shrink-0 cursor-pointer place-items-center rounded-full border border-line bg-surface"
        >
          <Pencil size={16} aria-hidden />
        </button>
      </header>

      <div className="grid gap-3 px-4 pt-3.5 pb-6">
        {exercise.description ? (
          <Card>
            <p className="text-[0.9rem] leading-relaxed" data-selectable>
              {exercise.description}
            </p>
          </Card>
        ) : (
          <Card>
            <p className="text-[0.85rem] leading-relaxed text-ink-muted">
              No description yet. Tap the pencil to add one — a note to your future self about
              setup, grip, or which machine in your gym.
            </p>
          </Card>
        )}

        <Card className="divide-y divide-line p-0">
          <Row label="Main muscle" value={exercise.muscleGroups[0]?.replace(/_/g, ' ') ?? '—'} />
          <Row label="Equipment" value={exercise.equipment.replace(/_/g, ' ')} />
          <Row
            label="Movement type"
            value={exercise.movementType}
            hint={
              exercise.movementType === 'compound'
                ? 'Several joints move at once, so it rests longer'
                : 'One joint, so it recovers faster between sets'
            }
          />
          <Row
            label="Rest between sets"
            value={formatRestLength(exercise.defaultRestSeconds)}
            explainerId="rest_timer"
          />
          <Row
            label="You track"
            value={exercise.trackingType === 'reps_only' ? 'reps only' : 'weight and reps'}
          />
        </Card>

        {exercise.notes ? (
          <Card>
            <p className="label-caps mb-1 text-ink-faint">Your notes</p>
            <p className="text-[0.85rem] leading-relaxed" data-selectable>
              {exercise.notes}
            </p>
          </Card>
        ) : null}

        <Button variant="secondary" onClick={() => void navigate(`/progress/${exercise.id}`)}>
          <LineChart size={17} aria-hidden />
          See your progress
        </Button>

        <div className="mt-2 grid gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              void (archived ? unarchiveExercise(exercise.id) : archiveExercise(exercise.id))
            }
          >
            <Archive size={16} aria-hidden />
            {archived ? 'Restore to the library' : 'Hide from the library'}
          </Button>

          {deletable ? (
            <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={16} aria-hidden />
              Delete permanently
            </Button>
          ) : (
            <p className="px-1 text-[0.75rem] leading-relaxed text-ink-muted">
              This exercise appears in your history or a routine, so it can only be hidden, not
              deleted — otherwise past sessions would lose their names.
            </p>
          )}
        </div>
      </div>

      <ExerciseFormSheet open={editing} onOpenChange={setEditing} existing={exercise} />

      <Sheet
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        eyebrow={exercise.name}
        title="Delete this exercise?"
        footer={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              size="sm"
              className="flex-1"
              onClick={() => {
                void deleteExercise(exercise.id).then(() => navigate('/more/exercises'))
              }}
            >
              Delete
            </Button>
          </div>
        }
      >
        <p className="px-5 py-4 text-[0.9rem] leading-relaxed text-ink-muted">
          Nothing references this exercise, so removing it is safe and cannot affect your history.
        </p>
      </Sheet>
    </>
  )
}

function Row({
  label,
  value,
  hint,
  explainerId,
}: {
  label: string
  value: string
  hint?: string
  explainerId?: string
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="min-w-0 flex-1">
        <span className="label-caps flex items-center gap-1.5 text-ink-faint">
          {label}
          {explainerId ? <InfoAffordance explainerId={explainerId} /> : null}
        </span>
        {hint ? (
          <span className="mt-0.5 block text-[0.72rem] leading-relaxed text-ink-muted">{hint}</span>
        ) : null}
      </span>
      {/* first-letter, not `capitalize`: the latter title-cases every word and
          turns "weight and reps" into "Weight And Reps". */}
      <span className="shrink-0 text-[0.9rem] font-semibold first-letter:uppercase">{value}</span>
    </div>
  )
}
