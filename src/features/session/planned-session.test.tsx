import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ThemeProvider } from '~/app/ThemeProvider'
import {
  addExerciseToRoutine,
  createRoutine,
  planSessionFromRoutine,
  updateRoutineExercise,
} from '~/db/repositories/routines'
import { planEmptySession } from '~/db/repositories/sessions'
import { db } from '~/db/schema'
import { bootstrapDatabase } from '~/db/seed'
import { TodayScreen } from '~/features/today/TodayScreen'

import { ActiveSessionScreen } from './ActiveSessionScreen'

/**
 * Setting a workout up at home and starting it at the gym.
 *
 * The claim under test is the one the feature exists for: a planned session is
 * the real thing, waiting, with the clock stopped. It can be shaped like any
 * session, it offers no way to log work before it starts, and tapping Start is
 * what makes it a workout.
 */

/** Leave the connection open — see the note in `session-flow.test.tsx`. */
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

function renderToday() {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={['/']}>
        <TodayScreen />
      </MemoryRouter>
    </ThemeProvider>,
  )
}

/** "Push A": bench press, four sets of eight at 80 kg. */
async function planPushA() {
  const routineId = await createRoutine('Push A')
  const bench = await addExerciseToRoutine(routineId, 'ex_bench-press')
  await updateRoutineExercise(bench, { targetSets: 4, targetRepsMin: 8 })
  await updateRoutineExercise(bench, { targetWeight: { kind: 'absolute', kg: 80 } })
  return planSessionFromRoutine(routineId)
}

describe('a workout planned ahead', () => {
  beforeEach(resetDatabase)
  afterEach(cleanup)

  it('shows the plan with no clock and no way to log work yet', async () => {
    await planPushA()

    renderSession()

    expect(await screen.findByText('Push A')).toBeInTheDocument()
    expect(screen.getByText(/Planned · 1 exercise · 4 sets/)).toBeInTheDocument()
    // What you came to do, stated once — there is no pending row to say it.
    expect(screen.getByText('4 × 8 @ 80 kg')).toBeInTheDocument()

    // Nothing to log, nothing to finish, no duration running.
    expect(screen.queryByRole('button', { name: 'Log' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Finish' })).not.toBeInTheDocument()
    expect(screen.queryByText(/weight: 80 kg/i)).not.toBeInTheDocument()

    // But it is still a session you can shape before you leave the house.
    expect(screen.getByRole('button', { name: /add exercise/i })).toBeInTheDocument()
  })

  it('becomes a workout — and starts its clock — when you tap Start', async () => {
    const user = userEvent.setup()
    const sessionId = await planPushA()

    // Planned last night: the twelve hours since must not end up in the
    // duration of today's session.
    const lastNight = Date.now() - 12 * 60 * 60 * 1000
    await db.sessions.update(sessionId, { startedAt: lastNight, plannedAt: lastNight })

    renderSession()

    await user.click(await screen.findByRole('button', { name: 'Start' }))

    // The session screen it was already on is now the live one.
    expect(await screen.findByRole('button', { name: 'Log' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Finish' })).toBeInTheDocument()
    // And the plan it carried is what the first set is prefilled with.
    expect(screen.getByRole('button', { name: /weight: 80 kg\. edit/i })).toBeInTheDocument()

    await waitFor(async () => {
      const session = await db.sessions.get(sessionId)
      expect(session?.status).toBe('active')
      expect(session?.startedAt).toBeGreaterThan(lastNight)
    })
  })

  it('is offered from Today, beside starting the same routine now', async () => {
    const user = userEvent.setup()
    const routineId = await createRoutine('Push A')
    await addExerciseToRoutine(routineId, 'ex_bench-press')

    renderToday()

    await user.click(await screen.findByRole('button', { name: /plan Push A to start later/i }))

    await waitFor(async () => {
      expect((await db.sessions.toArray())[0]?.status).toBe('planned')
    })
  })

  it('waits on Today without a timer, and says so', async () => {
    await planPushA()

    renderToday()

    expect(await screen.findByText('Planned and waiting.')).toBeInTheDocument()
    expect(screen.getByText(/Planned today/)).toBeInTheDocument()
    expect(screen.getByText('1 exercise · 4 sets')).toBeInTheDocument()
    expect(screen.getByText(/Nothing is being timed yet/)).toBeInTheDocument()
    expect(screen.getByText('Bench Press')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument()

    // The resume card's copy belongs to a workout in progress, which this is not.
    expect(screen.queryByText('In progress')).not.toBeInTheDocument()
  })

  it('throws the plan away without touching the routine it came from', async () => {
    const user = userEvent.setup()
    await planPushA()

    renderToday()

    await user.click(await screen.findByRole('button', { name: 'Discard' }))
    // The confirm sheet is modal, so the card behind it is out of the
    // accessibility tree and this resolves to the sheet's own button.
    await user.click(await screen.findByRole('button', { name: /^discard$/i }))

    await waitFor(async () => {
      expect(await db.sessions.count()).toBe(0)
    })
    expect(await db.routines.count()).toBe(1)
  })

  it('leaves an empty plan sayable — there is nothing in it yet', async () => {
    await planEmptySession('Workout')

    renderSession()

    expect(await screen.findByText(/An empty plan/)).toBeInTheDocument()
    expect(screen.getByText(/Planned · 0 exercises/)).toBeInTheDocument()
  })
})
