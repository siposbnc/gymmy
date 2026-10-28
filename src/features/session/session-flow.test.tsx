import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { ThemeProvider } from '~/app/ThemeProvider'
import {
  addExerciseToRoutine,
  createRoutine,
  startSessionFromRoutine,
  updateRoutineExercise,
} from '~/db/repositories/routines'
import { addExerciseToSession, listSets, startEmptySession } from '~/db/repositories/sessions'
import { db } from '~/db/schema'
import { bootstrapDatabase } from '~/db/seed'
import { useRestTimer } from '~/features/rest/restTimer'

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
    useRestTimer.setState({ endsAt: null, totalSeconds: 0, label: null, signalled: false })
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

  it('pre-fills the first set from the routine, then carries forward', async () => {
    const user = userEvent.setup()

    const routineId = await createRoutine('Push A')
    const entryId = await addExerciseToRoutine(routineId, 'ex_bench-press')
    await updateRoutineExercise(entryId, {
      targetSets: 3,
      targetRepsMin: 5,
      targetWeight: { kind: 'absolute', kg: 100 },
    })
    await startSessionFromRoutine(routineId)

    renderSession()
    expect(await screen.findByText('Push A')).toBeInTheDocument()

    // The plan's numbers are already in the row — nothing typed.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /weight: 100 kg\. edit/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /reps: 5\. edit/i })).toBeInTheDocument()
    })
    expect(screen.getByText(/0 of 3/)).toBeInTheDocument()

    // Deviate from the plan: this set actually went heavier.
    await user.click(screen.getByRole('button', { name: /weight: 100 kg\. edit/i }))
    await user.click(await screen.findByRole('button', { name: '1' }))
    await user.click(screen.getByRole('button', { name: '0' }))
    await user.click(screen.getByRole('button', { name: '5' }))
    await user.click(screen.getByRole('button', { name: 'Done' }))
    await user.click(screen.getByRole('button', { name: 'Log' }))

    // Set two follows what you just did, not what the plan still says.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /weight: 105 kg\. edit/i })).toBeInTheDocument()
    })
  })

  it('refuses to log a weight-tracked set with no weight', async () => {
    const user = userEvent.setup()

    const sessionId = await startEmptySession('Push A')
    const sessionExerciseId = await addExerciseToSession(sessionId, 'ex_bench-press')

    renderSession()
    await screen.findByText('Bench Press')

    // Reps alone are not a set here — the weight is the thing being tracked.
    await user.click(screen.getByRole('button', { name: /reps: not set/i }))
    await user.click(await screen.findByRole('button', { name: '8' }))
    await user.click(screen.getByRole('button', { name: 'Done' }))

    const log = await screen.findByRole('button', { name: 'Log. Enter a weight first.' })
    expect(log).toBeDisabled()
    expect(screen.getByText(/enter a weight to log this set/i)).toBeInTheDocument()

    // And zero is not a weight: the pad will not commit it.
    await user.click(screen.getByRole('button', { name: /weight: not set/i }))
    await user.click(await screen.findByRole('button', { name: '0' }))
    expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: '6' }))
    await user.click(screen.getByRole('button', { name: '0' }))
    await user.click(screen.getByRole('button', { name: 'Done' }))

    await user.click(await screen.findByRole('button', { name: /^log$/i }))

    await waitFor(async () => {
      const sets = await listSets(sessionExerciseId)
      expect(sets).toHaveLength(1)
      expect(sets[0]?.weightKg).toBe(60)
    })
  })

  it('logs bodyweight work with reps alone', async () => {
    const user = userEvent.setup()

    const sessionId = await startEmptySession('Pull')
    const sessionExerciseId = await addExerciseToSession(sessionId, 'ex_pull-up')

    renderSession()
    await screen.findByText('Pull-up')

    // No weight field at all on a reps-only exercise, so nothing to require.
    expect(screen.queryByRole('button', { name: /weight:/i })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /reps: not set/i }))
    await user.click(await screen.findByRole('button', { name: '9' }))
    await user.click(screen.getByRole('button', { name: 'Done' }))

    await user.click(await screen.findByRole('button', { name: /^log$/i }))

    await waitFor(async () => {
      const sets = await listSets(sessionExerciseId)
      expect(sets).toHaveLength(1)
      expect(sets[0]?.reps).toBe(9)
    })
  })

  it('auto-starts rest using the exercise own default', async () => {
    const user = userEvent.setup()

    const sessionId = await startEmptySession('Legs')
    await addExerciseToSession(sessionId, 'ex_squat')

    renderSession()
    await screen.findByText('Squat')

    await user.click(screen.getByRole('button', { name: /weight: not set/i }))
    await user.click(await screen.findByRole('button', { name: '6' }))
    await user.click(screen.getByRole('button', { name: '0' }))
    await user.click(screen.getByRole('button', { name: 'Done' }))

    await user.click(await screen.findByRole('button', { name: /reps: not set/i }))
    await user.click(await screen.findByRole('button', { name: '5' }))
    await user.click(screen.getByRole('button', { name: 'Done' }))

    expect(useRestTimer.getState().endsAt).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Log' }))

    await waitFor(() => {
      const { endsAt, totalSeconds, label } = useRestTimer.getState()
      // Squat is seeded at 240s, well above the 120s global default — the
      // per-exercise value is what must win.
      expect(totalSeconds).toBe(240)
      expect(label).toBe('Squat')
      expect(endsAt).toBeGreaterThan(Date.now())
    })
  })

  it('offers more weight once the rep range was cleared, and applies it in one tap', async () => {
    const user = userEvent.setup()

    const routineId = await createRoutine('Push A')
    const entryId = await addExerciseToRoutine(routineId, 'ex_bench-press')
    await updateRoutineExercise(entryId, { targetSets: 3, targetRepsMin: 5, targetRepsMax: 8 })

    // Last week: three sets of eight at 80 — the top of the range, cleared.
    const past = await startSessionFromRoutine(routineId)
    const pastExercise = (await db.sessionExercises.where('sessionId').equals(past).toArray())[0]!
    for (let setIndex = 1; setIndex <= 3; setIndex += 1) {
      await db.sets.add({
        id: `past-${setIndex}`,
        sessionExerciseId: pastExercise.id,
        setIndex,
        weightKg: 80,
        reps: 8,
        type: 'normal',
        completedAt: Date.now() - 100_000 + setIndex,
      })
    }
    await db.sessions.update(past, { status: 'completed', endedAt: Date.now() - 90_000 })

    const sessionId = await startSessionFromRoutine(routineId)
    renderSession()

    // The smallest loadable step on a seeded rack is 2 × 1.25 kg.
    expect(await screen.findByText(/ready for/i)).toBeInTheDocument()
    expect(screen.getByText('82.5 kg')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /use 82\.5 kg for 5 reps/i }))

    // Heavier means back to the bottom of the range — that is the other half
    // of double progression, and it has to happen without a second tap.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /weight: 82\.5 kg\. edit/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /reps: 5\. edit/i })).toBeInTheDocument()
    })

    // Accepted, so it stops asking.
    expect(screen.queryByText(/ready for/i)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^log$/i }))

    const links = await db.sessionExercises.where('sessionId').equals(sessionId).toArray()
    await waitFor(async () => {
      const logged = await listSets(links[0]!.id)
      expect(logged[0]?.weightKg).toBe(82.5)
      expect(logged[0]?.reps).toBe(5)
    })
  })

  it('says nothing when the rep range was not cleared', async () => {
    const routineId = await createRoutine('Push A')
    const entryId = await addExerciseToRoutine(routineId, 'ex_bench-press')
    await updateRoutineExercise(entryId, { targetSets: 3, targetRepsMin: 5, targetRepsMax: 8 })

    const past = await startSessionFromRoutine(routineId)
    const pastExercise = (await db.sessionExercises.where('sessionId').equals(past).toArray())[0]!
    for (let setIndex = 1; setIndex <= 3; setIndex += 1) {
      await db.sets.add({
        id: `past-${setIndex}`,
        sessionExerciseId: pastExercise.id,
        setIndex,
        weightKg: 80,
        reps: 6,
        type: 'normal',
        completedAt: Date.now() - 100_000 + setIndex,
      })
    }
    await db.sessions.update(past, { status: 'completed', endedAt: Date.now() - 90_000 })

    await startSessionFromRoutine(routineId)
    renderSession()

    // Six of a possible eight is progress, and Gymmy has nothing to say about
    // it. There is no "hold here" state, because that would be a scoreboard.
    expect(await screen.findByText('Bench Press')).toBeInTheDocument()
    expect(screen.queryByText(/ready for/i)).not.toBeInTheDocument()
  })

  it('stops the rest timer when the workout is finished', async () => {
    const user = userEvent.setup()

    const sessionId = await startEmptySession('Legs')
    await addExerciseToSession(sessionId, 'ex_squat')

    renderSession()
    await screen.findByText('Squat')

    await user.click(screen.getByRole('button', { name: /weight: not set/i }))
    await user.click(await screen.findByRole('button', { name: '6' }))
    await user.click(screen.getByRole('button', { name: '0' }))
    await user.click(screen.getByRole('button', { name: 'Done' }))
    await user.click(await screen.findByRole('button', { name: /^log$/i }))

    await waitFor(() => expect(useRestTimer.getState().endsAt).not.toBeNull())

    await user.click(screen.getByRole('button', { name: 'Finish' }))
    await user.click(await screen.findByRole('button', { name: 'Finish workout' }))

    // The rest bar lives in the app shell — left running it would count down
    // over the session summary and then chime for a workout that is over.
    await waitFor(() => expect(useRestTimer.getState().endsAt).toBeNull())
  })
})
