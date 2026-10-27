import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { ThemeProvider } from '~/app/ThemeProvider'
import { addExerciseToSession, listSets, startEmptySession } from '~/db/repositories/sessions'
import { db } from '~/db/schema'
import { bootstrapDatabase } from '~/db/seed'

import { ActiveSessionScreen } from './ActiveSessionScreen'

/**
 * The critical path, end to end through the real components and a real
 * database: open a session, log a set in one tap, and have the next row carry
 * forward what was just done.
 *
 * If this breaks, the product is broken — everything else in Gymmy exists to
 * serve this interaction.
 */
function renderSession() {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={['/session']}>
        <ActiveSessionScreen />
      </MemoryRouter>
    </ThemeProvider>,
  )
}

describe('logging a set', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await bootstrapDatabase()
  })

  it('logs in one tap and carries the numbers forward', async () => {
    const user = userEvent.setup()

    const sessionId = await startEmptySession('Push A')
    const sessionExerciseId = await addExerciseToSession(sessionId, 'ex_bench-press')

    renderSession()

    // The exercise is on screen, with no history yet.
    expect(await screen.findByText('Bench Press')).toBeInTheDocument()
    expect(screen.getByText(/first time — no history yet/i)).toBeInTheDocument()

    // Nothing to prefill from, so set the numbers once via the pad.
    await user.click(screen.getByRole('button', { name: /weight: not set/i }))
    await user.click(await screen.findByRole('button', { name: '8' }))
    await user.click(screen.getByRole('button', { name: '0' }))
    await user.click(screen.getByRole('button', { name: 'Done' }))

    await user.click(await screen.findByRole('button', { name: /reps: not set/i }))
    await user.click(await screen.findByRole('button', { name: '8' }))
    await user.click(screen.getByRole('button', { name: 'Done' }))

    await user.click(screen.getByRole('button', { name: 'Log' }))

    // It persisted immediately — there is no save step that could be lost.
    await waitFor(async () => {
      const sets = await listSets(sessionExerciseId)
      expect(sets).toHaveLength(1)
      expect(sets[0]?.weightKg).toBe(80)
      expect(sets[0]?.reps).toBe(8)
      expect(sets[0]?.type).toBe('normal')
    })

    // And the next row is already filled in with what was just done, so the
    // second set is genuinely one tap.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /weight: 80 kg\. edit/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /reps: 8\. edit/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Log' }))

    await waitFor(async () => {
      const sets = await listSets(sessionExerciseId)
      expect(sets).toHaveLength(2)
      expect(sets[1]?.weightKg).toBe(80)
      expect(sets[1]?.reps).toBe(8)
      expect(sets[1]?.setIndex).toBe(2)
    })
  })

  it('marks the pending set as a warm-up before logging it', async () => {
    const user = userEvent.setup()

    const sessionId = await startEmptySession('Push A')
    const sessionExerciseId = await addExerciseToSession(sessionId, 'ex_squat')

    renderSession()
    await screen.findByText('Squat')

    await user.click(screen.getByRole('button', { name: /weight: not set/i }))
    await user.click(await screen.findByRole('button', { name: '6' }))
    await user.click(screen.getByRole('button', { name: '0' }))
    await user.click(screen.getByRole('button', { name: 'Done' }))

    await user.click(await screen.findByRole('button', { name: /reps: not set/i }))
    await user.click(await screen.findByRole('button', { name: '5' }))
    await user.click(screen.getByRole('button', { name: 'Done' }))

    await user.click(screen.getByRole('button', { name: /log this as a warm-up set/i }))
    await user.click(screen.getByRole('button', { name: 'Log' }))

    await waitFor(async () => {
      const sets = await listSets(sessionExerciseId)
      expect(sets).toHaveLength(1)
      expect(sets[0]?.type).toBe('warmup')
    })

    // A warm-up must not become the working-set prefill — otherwise a ramp-up
    // would quietly become the suggested working weight.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /weight: not set/i })).toBeInTheDocument()
    })
  })

  it('shows the ghost line from the previous session', async () => {
    // A finished session to read history from.
    const past = await startEmptySession('Last week')
    const pastExercise = await addExerciseToSession(past, 'ex_bench-press')
    await db.sets.bulkAdd([
      {
        id: 's1',
        sessionExerciseId: pastExercise,
        setIndex: 1,
        weightKg: 77.5,
        reps: 8,
        type: 'normal',
        completedAt: Date.now() - 1000,
      },
      {
        id: 's2',
        sessionExerciseId: pastExercise,
        setIndex: 2,
        weightKg: 77.5,
        reps: 7,
        type: 'normal',
        completedAt: Date.now() - 500,
      },
    ])
    await db.sessions.update(past, { status: 'completed', endedAt: Date.now() })

    const today = await startEmptySession('Today')
    await addExerciseToSession(today, 'ex_bench-press')

    renderSession()

    expect(await screen.findByText(/77\.5 kg × 8, 7/)).toBeInTheDocument()

    // And the next set is prefilled from it, without the user touching anything.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /weight: 77\.5 kg\. edit/i })).toBeInTheDocument()
    })
  })

  it('recovers the session that was already running', async () => {
    await startEmptySession('Interrupted workout')
    renderSession()
    expect(await screen.findByText('Interrupted workout')).toBeInTheDocument()
  })
})
