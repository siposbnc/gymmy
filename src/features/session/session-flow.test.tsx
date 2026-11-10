import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ThemeProvider } from '~/app/ThemeProvider'
import {
  addExerciseToRoutine,
  createRoutine,
  setRoutineSetPlan,
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
/**
 * Unmount before the next case deletes the database.
 *
 * `useLiveQuery` keeps a read in flight across the end of a test; if Dexie
 * closes underneath it the promise rejects with `DatabaseClosedError`, which
 * Vitest reports as an unhandled rejection and can attribute to whichever
 * test happens to be running. Draining a tick with the database still open
 * lets it settle.
 */
afterEach(cleanup)

/**
 * Start each case from a clean, seeded database — without closing the old one.
 *
 * Every other suite resets with `db.delete()`, which is fine when nothing is
 * mounted. Here the session screen is, and its `useLiveQuery` spans five
 * tables: a read can still be in the air when the connection goes, and Dexie
 * rejects it with `DatabaseClosedError`. Vitest then reports an unhandled
 * rejection against whichever test is running by then — a flake that fails a
 * case which did nothing wrong.
 *
 * Emptying the tables leaves the connection open, so a late read returns
 * nothing instead of throwing.
 */
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

describe('logging a set', () => {
  beforeEach(async () => {
    await resetDatabase()
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

describe('a routine that plans a weight per set', () => {
  beforeEach(async () => {
    await resetDatabase()
    useRestTimer.setState({ endsAt: null, totalSeconds: 0, label: null, signalled: false })
  })

  it('gives each set its own rung on the first run, then gets out of the way', async () => {
    const user = userEvent.setup()

    const routineId = await createRoutine('Legs')
    const entryId = await addExerciseToRoutine(routineId, 'ex_squat')
    await setRoutineSetPlan(entryId, [
      { reps: 10, weight: { kind: 'absolute', kg: 60 } },
      { reps: 8, weight: { kind: 'absolute', kg: 70 } },
      { reps: 6, weight: { kind: 'absolute', kg: 80 } },
    ])

    const sessionId = await startSessionFromRoutine(routineId)
    renderSession()
    await screen.findByText('Squat')

    // Written down, so it works before there is any history to copy — which
    // is the whole reason a ladder is worth storing.
    expect(screen.getByText(/60 × 10/)).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /weight: 60 kg\. edit/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /reps: 10\. edit/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /^log$/i }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /weight: 70 kg\. edit/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /reps: 8\. edit/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /^log$/i }))
    await user.click(await screen.findByRole('button', { name: /^log$/i }))

    // Wait on the screen, not just the database: the test ends by deleting
    // the database, and a live query still in flight would then reject.
    await screen.findByRole('button', { name: /set 3 options/i })

    const links = await db.sessionExercises.where('sessionId').equals(sessionId).toArray()
    await waitFor(async () => {
      const logged = await listSets(links[0]!.id)
      expect(logged.map((set) => set.weightKg)).toEqual([60, 70, 80])
    })
  })

  it('is outranked by what you actually lifted', async () => {
    const routineId = await createRoutine('Legs')
    const entryId = await addExerciseToRoutine(routineId, 'ex_squat')
    await setRoutineSetPlan(entryId, [
      { reps: 10, weight: { kind: 'absolute', kg: 60 } },
      { reps: 8, weight: { kind: 'absolute', kg: 70 } },
    ])

    // Last week you opened at 65, not the 60 the routine still says.
    const past = await startSessionFromRoutine(routineId)
    const pastLink = (await db.sessionExercises.where('sessionId').equals(past).toArray())[0]!
    await db.sets.add({
      id: 'past-1',
      sessionExerciseId: pastLink.id,
      setIndex: 1,
      weightKg: 65,
      reps: 10,
      type: 'normal',
      completedAt: Date.now() - 100_000,
    })
    await db.sessions.update(past, { status: 'completed', endedAt: Date.now() - 90_000 })

    await startSessionFromRoutine(routineId)
    renderSession()
    await screen.findByText('Squat')

    // The plan seeds an exercise with no history and then stops arguing with
    // it. Otherwise it would hand back the stale 60 every week until someone
    // went and edited the routine.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /weight: 65 kg\. edit/i })).toBeInTheDocument()
    })
  })
})

describe('an exercise you ramp', () => {
  beforeEach(async () => {
    await resetDatabase()
    useRestTimer.setState({ endsAt: null, totalSeconds: 0, label: null, signalled: false })
  })

  /** Last session: 60 × 10, 70 × 8, 80 × 6. */
  async function rampedLastWeek() {
    const past = await startEmptySession('Legs')
    const link = await addExerciseToSession(past, 'ex_squat')
    const rungs = [
      [60, 10],
      [70, 8],
      [80, 6],
    ]
    for (const [index, [weight, reps]] of rungs.entries()) {
      await db.sets.add({
        id: `past-${index}`,
        sessionExerciseId: link,
        setIndex: index + 1,
        weightKg: weight!,
        reps: reps!,
        type: 'normal',
        completedAt: Date.now() - 100_000 + index,
      })
    }
    await db.sessions.update(past, { status: 'completed', endedAt: Date.now() - 90_000 })
  }

  it('offers the next rung instead of making you retype the climb', async () => {
    const user = userEvent.setup()
    await rampedLastWeek()

    const sessionId = await startEmptySession('Legs')
    const sessionExerciseId = await addExerciseToSession(sessionId, 'ex_squat')

    renderSession()
    await screen.findByText('Squat')

    // Set one opens on last session's opener, as it always has.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /weight: 60 kg\. edit/i })).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /^log$/i }))

    // Set two is the rung above — with its own rep count, not the ten you did
    // at the bottom. Before this, it offered 60 again.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /weight: 70 kg\. edit/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /reps: 8\. edit/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /^log$/i }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /weight: 80 kg\. edit/i })).toBeInTheDocument()
    })

    // Three taps, three rungs, nothing typed.
    await user.click(screen.getByRole('button', { name: /^log$/i }))
    await screen.findByRole('button', { name: /set 3 options/i })

    await waitFor(async () => {
      const logged = await listSets(sessionExerciseId)
      expect(logged.map((set) => set.weightKg)).toEqual([60, 70, 80])
      expect(logged.map((set) => set.reps)).toEqual([10, 8, 6])
    })
  })

  it('carries the whole climb up when you push the opening set', async () => {
    const user = userEvent.setup()
    await rampedLastWeek()

    const sessionId = await startEmptySession('Legs')
    const sessionExerciseId = await addExerciseToSession(sessionId, 'ex_squat')

    renderSession()
    await screen.findByText('Squat')
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /weight: 60 kg\. edit/i })).toBeInTheDocument()
    })

    // 60 → 62.5 on the opener.
    await user.click(screen.getByRole('button', { name: /weight: 60 kg\. edit/i }))
    await user.click(await screen.findByRole('button', { name: '6' }))
    await user.click(screen.getByRole('button', { name: '2' }))
    await user.click(screen.getByRole('button', { name: '.' }))
    await user.click(screen.getByRole('button', { name: '5' }))
    await user.click(screen.getByRole('button', { name: 'Done' }))
    await user.click(await screen.findByRole('button', { name: /^log$/i }))

    // The rest of the climb follows by the same 2.5, unasked.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /weight: 72\.5 kg\. edit/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /^log$/i }))
    await screen.findByRole('button', { name: /set 2 options/i })

    await waitFor(async () => {
      const logged = await listSets(sessionExerciseId)
      expect(logged.map((set) => set.weightKg)).toEqual([62.5, 72.5])
    })
  })
})

/**
 * A machine that weighs something before you load it.
 *
 * The claim being tested is the one the feature exists for: you enter what you
 * added, because that is what you physically do, and what gets stored is what
 * you actually moved — so every record, total and chart downstream keeps
 * reading one field that means one thing.
 */
describe('a machine with a weight of its own', () => {
  beforeEach(async () => {
    await resetDatabase()
    useRestTimer.setState({ endsAt: null, totalSeconds: 0, label: null, signalled: false })
    await db.exercises.update('ex_leg-press', { machineWeightKg: 25 })
  })

  it('takes the weight you added and logs the total', async () => {
    const user = userEvent.setup()

    const sessionId = await startEmptySession('Legs')
    const sessionExerciseId = await addExerciseToSession(sessionId, 'ex_leg-press')

    renderSession()
    expect(await screen.findByText('Leg Press')).toBeInTheDocument()

    // The field asks for what you add, and says so.
    await user.click(screen.getByRole('button', { name: /added weight: not set/i }))
    await user.click(await screen.findByRole('button', { name: '4' }))
    await user.click(screen.getByRole('button', { name: '0' }))
    await user.click(screen.getByRole('button', { name: 'Done' }))

    // Both numbers are on screen: the one you typed and the one that counts.
    expect(await screen.findByText('+ 25 kg machine = 65 kg total')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /added weight: 40 kg, 65 kg total/i }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^log$/i }))

    // Stored as the total — anything else would understate every record and
    // volume figure derived from it.
    await waitFor(async () => {
      const sets = await listSets(sessionExerciseId)
      expect(sets[0]?.weightKg).toBe(65)
    })

    // And the logged row reads as the total, with the convention stated once
    // for the card rather than repeated on every row.
    expect(screen.getByText(/logged weights include it/i)).toBeInTheDocument()
  })

  it('lets you log the carriage on its own, because that is real work', async () => {
    const user = userEvent.setup()

    const sessionId = await startEmptySession('Legs')
    const sessionExerciseId = await addExerciseToSession(sessionId, 'ex_leg-press')

    renderSession()
    await screen.findByText('Leg Press')

    // Nothing on it: zero added is a legitimate entry here, where elsewhere a
    // zero weight is a set that would vanish from volume and records.
    await user.click(screen.getByRole('button', { name: /added weight: not set/i }))
    await user.click(await screen.findByRole('button', { name: '0' }))
    await user.click(screen.getByRole('button', { name: 'Done' }))

    await user.click(await screen.findByRole('button', { name: /^log$/i }))

    await waitFor(async () => {
      const sets = await listSets(sessionExerciseId)
      expect(sets[0]?.weightKg).toBe(25)
    })
  })

  it('asks for a plain weight when the exercise has no machine weight', async () => {
    const sessionId = await startEmptySession('Push')
    await addExerciseToSession(sessionId, 'ex_bench-press')

    renderSession()
    await screen.findByText('Bench Press')

    // The added/total split appears only where it means something.
    expect(screen.getByRole('button', { name: /weight: not set/i })).toBeInTheDocument()
    expect(screen.queryByText(/machine/i)).not.toBeInTheDocument()
  })
})
