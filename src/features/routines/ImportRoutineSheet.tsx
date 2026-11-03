import { useState } from 'react'

import { useSettings } from '~/db/hooks'
import { importRoutinePlan, planRoutineImport } from '~/db/repositories/routine-share'
import { describeTarget } from '~/domain/routine-draft'
import type { ImportPlan } from '~/domain/routine-share'
import { Button } from '~/ui/Button'
import { Sheet } from '~/ui/Sheet'

/**
 * Take someone else's routine.
 *
 * Two steps on purpose. Checking the code is a read — it writes nothing — and
 * what it found goes on screen first: the plan, its targets, and which
 * exercises would be added to your library. Importing blind is how you end up
 * with four near-duplicates of a cable fly in your picker.
 *
 * Pasting into a field rather than reading the clipboard directly: clipboard
 * reads need a permission prompt that iOS shows every single time, and a
 * long-press paste is something everyone already knows how to do.
 */
export function ImportRoutineSheet({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported: (routineId: string) => void
}) {
  const settings = useSettings()
  const [code, setCode] = useState('')
  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function close(next: boolean) {
    if (busy) return
    if (!next) {
      setCode('')
      setPlan(null)
      setError(null)
    }
    onOpenChange(next)
  }

  async function check() {
    setBusy(true)
    setError(null)
    try {
      setPlan(await planRoutineImport(code))
    } catch (cause) {
      setPlan(null)
      // Every rejection in the decoder carries a sentence worth showing; this
      // is where they are shown.
      setError(cause instanceof Error ? cause.message : 'That code could not be read.')
    } finally {
      setBusy(false)
    }
  }

  async function confirm() {
    if (!plan) return
    setBusy(true)
    try {
      const { routineId } = await importRoutinePlan(plan)
      setCode('')
      setPlan(null)
      onImported(routineId)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Importing failed.')
    } finally {
      setBusy(false)
    }
  }

  const toCreate = plan?.entries.filter((entry) => entry.create) ?? []

  return (
    <Sheet
      open={open}
      onOpenChange={close}
      eyebrow="Import a routine"
      title={plan ? plan.routine.name : 'Paste the code'}
      footer={
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => close(false)}>
            Cancel
          </Button>
          {plan ? (
            <Button size="sm" className="flex-1" disabled={busy} onClick={() => void confirm()}>
              Add this routine
            </Button>
          ) : (
            <Button
              size="sm"
              className="flex-1"
              disabled={busy || code.trim().length === 0}
              onClick={() => void check()}
            >
              Check the code
            </Button>
          )}
        </div>
      }
    >
      <div className="grid gap-3 px-5 py-4">
        {plan ? (
          <>
            <div>
              <p className="label-caps mb-1.5 text-ink-muted">
                {plan.entries.length} exercise{plan.entries.length === 1 ? '' : 's'}
              </p>
              <ul className="grid gap-1.5 rounded-md bg-sunken px-3.5 py-3">
                {plan.entries.map((entry) => (
                  <li
                    key={`${entry.exerciseId}-${entry.draft.order}`}
                    className="flex items-baseline gap-2 text-[0.85rem]"
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">{entry.name}</span>
                    <span className="num shrink-0 text-ink-muted">
                      {describeTarget(entry.draft, settings.units)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {plan.routine.notes ? (
              <p className="text-[0.8rem] leading-relaxed text-ink-muted">
                Notes: {plan.routine.notes}
              </p>
            ) : null}

            {/* The part worth consenting to. Everything else lands inside the
                routine; these land in the exercise library for good. */}
            {toCreate.length > 0 ? (
              <p className="rounded-md border border-accent bg-accent-wash px-3 py-2 text-[0.78rem] leading-relaxed">
                {toCreate.length === 1 ? 'One exercise is' : `${toCreate.length} exercises are`} not
                in your library yet and will be added as your own:{' '}
                {toCreate.map((entry) => entry.name).join(', ')}.
              </p>
            ) : (
              <p className="text-[0.78rem] leading-relaxed text-ink-muted">
                Every exercise in it is already in your library, so nothing new is added there.
              </p>
            )}

            <p className="text-[0.75rem] leading-relaxed text-ink-faint">
              This adds a routine. Nothing you already have is changed, and importing the same code
              twice gives you two routines rather than a mess.
            </p>
          </>
        ) : (
          <>
            <label htmlFor="routine-code" className="label-caps block text-ink-muted">
              Routine code
            </label>
            <textarea
              id="routine-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="GYMMY-R1.…"
              rows={4}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              className="w-full resize-none rounded-md border border-line bg-surface px-3.5 py-3 font-mono text-[0.78rem] leading-relaxed outline-none focus-visible:border-accent"
            />
            <p className="text-[0.78rem] leading-relaxed text-ink-muted">
              Long-press the field to paste. Line breaks and stray spaces are fine — Gymmy strips
              them.
            </p>
          </>
        )}

        {error ? (
          <p className="text-[0.82rem] leading-relaxed text-danger" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Sheet>
  )
}
