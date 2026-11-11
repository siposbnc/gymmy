import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ThemeProvider } from '~/app/ThemeProvider'
import {
  addExerciseToSession,
  listSessionExercises,
  listSets,
  logSet,
  startEmptySession,
} from '~/db/repositories/sessions'
import { db } from '~/db/schema'
import { bootstrapDatabase } from '~/db/seed'

import { ActiveSessionScreen } from './ActiveSessionScreen'

/**
 * Swapping an exercise, through the real screen and a real database.
 *
 * The repository tests cover what the swap does to the rows; this covers the
 * part a user can get wrong — that the action is reachable mid-workout, that it
 * says what it is about to do before it does it, and that logged sets stay
 * where they were performed.
 */

/** See the note in `session-flow.test.tsx`: clearing beats deleting here. */
async function resetDatabase() {
  await Promise.all(db.tables.map((table) => table.clear()))
  await bootstrapDatabase()
}

function renderSession() {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={['/session']}>
        <ActiveSessionScreen />
      </MemoryRouter>
    </ThemeProvider>,
  )
}

describe('swapping an exercise mid-workout', () => {
  beforeEach(resetDatabase)
  afterEach(cleanup)

  it('replaces the exercise from the card menu', async () => {
    const user = userEvent.setup()

    const sessionId = await startEmptySession('Push A')
    await addExerciseToSession(sessionId, 'ex_bench-press')

    renderSession()
    expect(await screen.findByText('Bench Press')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /bench press options/i }))

    // The consequence is stated before the picker opens.
    expect(await screen.findByText(/keeps its place and its rep targets/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /swap for another exercise/i }))

    // The sheet borrowed for this says what it is for.
    expect(await screen.findByText(/swap bench press for/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^dumbbell bench press/i }))

    await waitFor(async () => {
      const rows = await listSessionExercises(sessionId)
      expect(rows.map((row) => row.exerciseId)).toEqual(['ex_dumbbell-bench-press'])
    })
    expect(await screen.findByText('Dumbbell Bench Press')).toBeInTheDocument()
  })

  it('takes the logged sets with it instead of adding a second card', async () => {
    const user = userEvent.setup()

    const sessionId = await startEmptySession('Push A')
    const benchRow = await addExerciseToSession(sessionId, 'ex_bench-press')
    await logSet(benchRow, { weightKg: 80, reps: 8 })

    renderSession()
    expect(await screen.findByText('Bench Press')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /bench press options/i }))
    expect(await screen.findByText(/1 logged set moves with it/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /swap for another exercise/i }))
    await user.click(await screen.findByRole('button', { name: /^dumbbell bench press/i }))

    // One card, now the new exercise — the set came along with it.
    expect(await screen.findByText('Dumbbell Bench Press')).toBeInTheDocument()
    expect(screen.queryByText('Bench Press')).not.toBeInTheDocument()

    await waitFor(async () => {
      const rows = await listSessionExercises(sessionId)
      expect(rows.map((row) => row.exerciseId)).toEqual(['ex_dumbbell-bench-press'])
      expect(await listSets(rows[0]!.id)).toHaveLength(1)
    })
  })
})
