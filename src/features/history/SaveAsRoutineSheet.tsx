import { useState } from 'react'

import { useExercises, useSessionRoutineDraft, useSettings } from '~/db/hooks'
import { createRoutineFromSession } from '~/db/repositories/routines'
import { describeTarget } from '~/domain/routine-draft'
import { Button } from '~/ui/Button'
import { Sheet } from '~/ui/Sheet'

/**
 * Keep a workout as a plan.
 *
 * The whole screen is a preview, because the targets are *derived* — sets from
 * what you logged, reps from the range you actually hit, weight from what most
 * of the sets used. Those are good rules, not correct ones, so the numbers go
 * on screen before anything is written rather than after.
 *
 * It always creates a new routine. Rewriting the plan this session came from
 * would be a lot of destruction behind one tap on a history screen, and the
 * builder is one navigation away.
 */
export function SaveAsRoutineSheet({
  sessionId,
  open,
  onOpenChange,
  onSaved,
}: {
  sessionId: string | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (routineId: string) => void
}) {
  const settings = useSettings()
  // Only queried while the sheet is open — this is three table reads.
  const draft = useSessionRoutineDraft(open ? sessionId : undefined)
  const exercises = useExercises({ includeArchived: true })
  const [typedName, setTypedName] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Null until they touch the field, so the derived name can arrive late
  // without overwriting what they are typing.
  const name = typedName ?? draft?.name ?? ''
  const nameOf = new Map((exercises ?? []).map((exercise) => [exercise.id, exercise.name]))
  const nothingToSave = draft != null && draft.exercises.length === 0

  function close(open: boolean) {
    if (busy) return
    if (!open) {
      setTypedName(null)
      setError(null)
    }
    onOpenChange(open)
  }

  async function save() {
    if (!sessionId) return
    setBusy(true)
    setError(null)
    try {
      const routineId = await createRoutineFromSession(sessionId, name)
      setTypedName(null)
      onSaved(routineId)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save this as a routine.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={close}
      eyebrow="Save as routine"
      title="Train this again"
      footer={
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => close(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="flex-1"
            disabled={busy || draft == null || nothingToSave || name.trim().length === 0}
            onClick={() => void save()}
          >
            Save routine
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 px-5 py-4">
        {draft === undefined ? (
          <p className="py-2 text-center text-[0.85rem] text-ink-faint">Working it out…</p>
        ) : nothingToSave || draft === null ? (
          <p className="text-[0.88rem] leading-relaxed text-ink-muted">
            There is no logged work in this session, so there is nothing to build a plan from. Add
            the sets you did and try again.
          </p>
        ) : (
          <>
            <div>
              <label htmlFor="routine-name" className="label-caps mb-1.5 block text-ink-muted">
                Name
              </label>
              <input
                id="routine-name"
                value={name}
                onChange={(event) => setTypedName(event.target.value)}
                autoComplete="off"
                className="w-full rounded-md border border-line bg-surface px-3.5 py-3 text-[1rem] outline-none focus-visible:border-accent"
              />
            </div>

            <div>
              <p className="label-caps mb-1.5 text-ink-muted">
                {draft.exercises.length} exercise{draft.exercises.length === 1 ? '' : 's'}
              </p>
              <ul className="grid gap-1.5 rounded-md bg-sunken px-3.5 py-3">
                {draft.exercises.map((entry) => (
                  <li
                    key={`${entry.exerciseId}-${entry.order}`}
                    className="flex items-baseline gap-2 text-[0.85rem]"
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {nameOf.get(entry.exerciseId) ?? 'Exercise'}
                    </span>
                    <span className="num shrink-0 text-ink-muted">
                      {describeTarget(entry, settings.units)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Named rather than silently dropped: a plan quietly missing an
                exercise is a surprise you only get mid-workout. */}
            {draft.skipped.length > 0 ? (
              <p className="text-[0.78rem] leading-relaxed text-ink-muted">
                Left out, with nothing logged against them: {draft.skipped.join(', ')}.
              </p>
            ) : null}

            <p className="text-[0.78rem] leading-relaxed text-ink-muted">
              Sets, reps and weight come from what you actually logged — the weight is whatever most
              of your sets used. Tune any of it in the builder afterwards. This session is not
              changed.
            </p>

            {error ? (
              <p className="text-[0.8rem] leading-relaxed text-danger" role="alert">
                {error}
              </p>
            ) : null}
          </>
        )}
      </div>
    </Sheet>
  )
}
