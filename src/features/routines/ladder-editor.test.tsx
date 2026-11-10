import { configure, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { ThemeProvider } from '~/app/ThemeProvider'
import {
  addExerciseToRoutine,
  createRoutine,
  listRoutineExercises,
  setRoutineSetPlan,
} from '~/db/repositories/routines'
import { db } from '~/db/schema'
import { bootstrapDatabase } from '~/db/seed'

import { RoutineEditorScreen } from './RoutineEditorScreen'

/**
 * Writing a weight per set.
 *
 * The editor is the only place a ladder can be built from nothing, and it is
 * also where the two ways of saying the same thing have to be kept apart: a
 * ladder of identical rungs is straight sets, and storing one would leave the
 * editor guessing which mode to open in.
 */
configure({ asyncUtilTimeout: 5000 })

function renderEditor(routineId: string) {
  render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[`/routines/${routineId}`]}>
        <Routes>
          <Route path="/routines/:routineId" element={<RoutineEditorScreen />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  )
}

async function aRoutineWithASquat() {
  const routineId = await createRoutine('Legs')
  const entryId = await addExerciseToRoutine(routineId, 'ex_squat')
  return { routineId, entryId }
}

describe('planning a weight per set', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await bootstrapDatabase()
  })

  it('opens the rows holding what the three boxes held', async () => {
    const user = userEvent.setup()
    const { routineId } = await aRoutineWithASquat()
    renderEditor(routineId)

    await user.click(await screen.findByRole('radio', { name: 'Per set' }))

    // Three sets of eight, as added — switching mode costs you nothing, or
    // the toggle is a trap you have to undo by retyping.
    expect(await screen.findByRole('button', { name: /set 1 reps: 8/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /set 3 reps: 8/i })).toBeInTheDocument()

    // And nothing is written while the rungs all say the same thing.
    expect((await listRoutineExercises(routineId))[0]).not.toHaveProperty('setPlan')
  })

  it('stores the ladder as soon as a rung differs', async () => {
    const user = userEvent.setup()
    const { routineId } = await aRoutineWithASquat()
    renderEditor(routineId)

    await user.click(await screen.findByRole('radio', { name: 'Per set' }))
    await user.click(await screen.findByRole('button', { name: /set 2 weight: not set/i }))
    await user.click(await screen.findByRole('button', { name: '7' }))
    await user.click(screen.getByRole('button', { name: '0' }))
    await user.click(screen.getByRole('button', { name: 'Done' }))

    await waitFor(async () => {
      const entry = (await listRoutineExercises(routineId))[0]
      expect(entry?.setPlan).toHaveLength(3)
      expect(entry?.setPlan?.[1]?.weight).toEqual({ kind: 'absolute', kg: 70 })
      expect(entry?.setPlan?.[0]).not.toHaveProperty('weight')
    })
  })

  it('adds and removes rungs, keeping the set count in step', async () => {
    const user = userEvent.setup()
    const { routineId, entryId } = await aRoutineWithASquat()
    await setRoutineSetPlan(entryId, [
      { reps: 10, weight: { kind: 'absolute', kg: 60 } },
      { reps: 8, weight: { kind: 'absolute', kg: 70 } },
    ])
    renderEditor(routineId)

    await user.click(await screen.findByRole('button', { name: /add set/i }))
    await waitFor(async () => {
      const entry = (await listRoutineExercises(routineId))[0]
      // A copy of the top rung, and the summary everything else reads moves
      // with it.
      expect(entry?.setPlan).toHaveLength(3)
      expect(entry?.targetSets).toBe(3)
    })

    await user.click(await screen.findByRole('button', { name: /remove set 3/i }))
    await waitFor(async () => {
      const entry = (await listRoutineExercises(routineId))[0]
      expect(entry?.setPlan).toHaveLength(2)
      expect(entry?.targetSets).toBe(2)
    })
  })

  it('collapses on its own when the last difference is removed', async () => {
    const user = userEvent.setup()
    const { routineId, entryId } = await aRoutineWithASquat()
    await setRoutineSetPlan(entryId, [
      { reps: 10, weight: { kind: 'absolute', kg: 60 } },
      { reps: 8, weight: { kind: 'absolute', kg: 70 } },
      { reps: 8, weight: { kind: 'absolute', kg: 70 } },
    ])
    renderEditor(routineId)

    // Dropping the odd rung out leaves two identical ones, which is straight
    // sets — so it stops being stored as a ladder without being asked about.
    await user.click(await screen.findByRole('button', { name: /remove set 1/i }))

    await waitFor(async () => {
      const entry = (await listRoutineExercises(routineId))[0]
      expect(entry).not.toHaveProperty('setPlan')
      expect(entry).toMatchObject({
        targetSets: 2,
        targetRepsMin: 8,
        targetWeight: { kind: 'absolute', kg: 70 },
      })
    })
  })

  it('asks before dropping a ladder, and keeps set one when you agree', async () => {
    const user = userEvent.setup()
    const { routineId, entryId } = await aRoutineWithASquat()
    await setRoutineSetPlan(entryId, [
      { reps: 10, weight: { kind: 'absolute', kg: 60 } },
      { reps: 8, weight: { kind: 'absolute', kg: 70 } },
      { reps: 6, weight: { kind: 'absolute', kg: 80 } },
    ])
    renderEditor(routineId)

    await user.click(await screen.findByRole('radio', { name: 'Same every set' }))

    // Lossy, so it is asked about — and the question says what will be left.
    expect(await screen.findByText(/back to the same weight every set/i)).toBeInTheDocument()
    expect(screen.getByText('60 × 10')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /collapse it/i }))

    await waitFor(async () => {
      const entry = (await listRoutineExercises(routineId))[0]
      expect(entry).not.toHaveProperty('setPlan')
      expect(entry?.targetWeight).toEqual({ kind: 'absolute', kg: 60 })
      expect(entry?.targetRepsMin).toBe(10)
      expect(entry?.targetSets).toBe(3)
    })
  })

  it('keeps the ladder when you change your mind', async () => {
    const user = userEvent.setup()
    const { routineId, entryId } = await aRoutineWithASquat()
    await setRoutineSetPlan(entryId, [
      { reps: 10, weight: { kind: 'absolute', kg: 60 } },
      { reps: 6, weight: { kind: 'absolute', kg: 80 } },
    ])
    renderEditor(routineId)

    await user.click(await screen.findByRole('radio', { name: 'Same every set' }))
    await user.click(await screen.findByRole('button', { name: /keep the ladder/i }))

    expect((await listRoutineExercises(routineId))[0]?.setPlan).toHaveLength(2)
  })
})
