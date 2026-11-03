import { configure, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ThemeProvider } from '~/app/ThemeProvider'
import { listRoutineExercises } from '~/db/repositories/routines'
import {
  addExerciseToSession,
  finishSession,
  logSet,
  startEmptySession,
} from '~/db/repositories/sessions'
import { db } from '~/db/schema'
import { bootstrapDatabase } from '~/db/seed'

import { SaveAsRoutineSheet } from './SaveAsRoutineSheet'

/**
 * The targets in a saved routine are *derived*, so the preview is the feature:
 * these cases assert that what the sheet puts on screen is what gets written.
 */

configure({ asyncUtilTimeout: 5000 })

describe('saving a session as a routine', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await bootstrapDatabase()
  })

  async function logAWorkout() {
    const sessionId = await startEmptySession('Thursday push')
    const bench = await addExerciseToSession(sessionId, 'ex_bench-press')
    const fly = await addExerciseToSession(sessionId, 'ex_cable-fly')

    await logSet(bench, { weightKg: 60, reps: 10, type: 'warmup' })
    await logSet(bench, { weightKg: 80, reps: 8 })
    await logSet(bench, { weightKg: 80, reps: 8 })
    await logSet(bench, { weightKg: 75, reps: 8 })
    // Added, never worked. Should be named as left out.
    await addExerciseToSession(sessionId, 'ex_triceps-pushdown')
    await logSet(fly, { weightKg: 15, reps: 15 })
    await finishSession(sessionId)

    return sessionId
  }

  function renderSheet(sessionId: string | undefined, onSaved = vi.fn()) {
    render(
      <ThemeProvider>
        <SaveAsRoutineSheet
          sessionId={sessionId}
          open
          onOpenChange={() => {}}
          onSaved={onSaved}
        />
      </ThemeProvider>,
    )
    return onSaved
  }

  it('shows the derived targets and writes exactly those', async () => {
    const sessionId = await logAWorkout()
    const onSaved = renderSheet(sessionId)

    // Three working sets of eight at the weight most of them used — the 75 kg
    // back-off set does not become the plan.
    expect(await screen.findByText('3 × 8 @ 80 kg')).toBeInTheDocument()
    expect(screen.getByText('1 × 15 @ 15 kg')).toBeInTheDocument()
    expect(screen.getByText(/left out/i)).toHaveTextContent('Triceps Pushdown')
    expect(await screen.findByLabelText(/name/i)).toHaveValue('Thursday push')

    await userEvent.click(screen.getByRole('button', { name: /save routine/i }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())

    const entries = await listRoutineExercises(onSaved.mock.calls[0]?.[0] as string)
    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatchObject({
      exerciseId: 'ex_bench-press',
      targetSets: 3,
      targetRepsMin: 8,
      targetWeight: { kind: 'absolute', kg: 80 },
    })
    expect(entries[0]).not.toHaveProperty('targetRepsMax')
  })

  it('takes a name you type over the session name', async () => {
    const sessionId = await logAWorkout()
    const onSaved = renderSheet(sessionId)

    const name = await screen.findByLabelText(/name/i)
    await userEvent.clear(name)
    await userEvent.type(name, 'Push A')
    await userEvent.click(screen.getByRole('button', { name: /save routine/i }))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    const routine = await db.routines.get(onSaved.mock.calls[0]?.[0] as string)
    expect(routine?.name).toBe('Push A')
  })

  it('offers nothing to save when no work was logged', async () => {
    const sessionId = await startEmptySession('Walked in, walked out')
    await addExerciseToSession(sessionId, 'ex_bench-press')
    await finishSession(sessionId)

    renderSheet(sessionId)

    expect(await screen.findByText(/no logged work in this session/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save routine/i })).toBeDisabled()
  })
})
