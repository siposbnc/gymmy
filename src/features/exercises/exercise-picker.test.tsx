import { configure, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ThemeProvider } from '~/app/ThemeProvider'
import { getExercise } from '~/db/repositories/exercises'
import { addExerciseToSession, logSet, startEmptySession } from '~/db/repositories/sessions'
import { db } from '~/db/schema'
import { bootstrapDatabase } from '~/db/seed'

import { ExercisePickerSheet } from './ExercisePickerSheet'

/**
 * The picker holds over a hundred exercises and you train perhaps fifteen.
 * What is on top is the whole value of this sheet.
 */

// Each case writes a handful of sessions through the real repositories and
// then waits on a live query to catch up. The default one-second budget is
// enough alone and not enough when the suite runs them alongside everything
// else, which is a slow machine, not a broken feature.
configure({ asyncUtilTimeout: 5000 })

async function trained(exerciseId: string, sessions: number, daysAgo = 1) {
  for (let index = 0; index < sessions; index += 1) {
    const sessionId = await startEmptySession('Past')
    const link = await addExerciseToSession(sessionId, exerciseId)
    await logSet(link, { weightKg: 60, reps: 8, type: 'normal' })
    const at = Date.now() - (daysAgo + index * 7) * 86_400_000
    await db.sessions.update(sessionId, { status: 'completed', endedAt: at, startedAt: at })
  }
}

function renderPicker(onPick = vi.fn()) {
  render(
    <ThemeProvider>
      <ExercisePickerSheet open onOpenChange={() => {}} onPick={onPick} />
    </ThemeProvider>,
  )
  return onPick
}

/** The exercise names on screen, in the order they are rendered. */
function namesInOrder(): string[] {
  return screen
    .getAllByRole('listitem')
    .map((row) => within(row).getAllByRole('button')[0]?.textContent ?? '')
}

function indexOf(name: string): number {
  return namesInOrder().findIndex((text) => text.startsWith(name))
}

describe('the exercise picker', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await bootstrapDatabase()
  })

  it('puts what you actually train above the rest of the alphabet', async () => {
    await trained('ex_lat-pulldown', 4)
    await trained('ex_seated-cable-row', 2)

    renderPicker()

    await screen.findByText('Your usual')

    // Without this, both sit far down an alphabetical list of 110 exercises.
    expect(indexOf('Lat Pulldown')).toBeLessThan(indexOf('Seated Cable Row'))
    expect(indexOf('Seated Cable Row')).toBeLessThan(indexOf('Ab Wheel Rollout'))

    // And the count beside them is what explains that order.
    expect(screen.getByText(/4 sessions ·/)).toBeInTheDocument()
  })

  it('ranks the programme you run now above the one you abandoned', async () => {
    await trained('ex_deadlift', 8, 200)
    await trained('ex_hack-squat', 3, 3)

    renderPicker()
    await screen.findByText('Your usual')

    expect(indexOf('Hack Squat')).toBeLessThan(indexOf('Deadlift'))
  })

  it('ignores an exercise that was added to a session but never logged', async () => {
    const sessionId = await startEmptySession('Past')
    await addExerciseToSession(sessionId, 'ex_crunch')
    await db.sessions.update(sessionId, { status: 'completed', endedAt: Date.now() })

    await trained('ex_squat', 2)
    renderPicker()
    await screen.findByText('Your usual')

    // "3 sessions" has to mean three times you did it.
    expect(indexOf('Squat')).toBeLessThan(indexOf('Crunch'))
    expect(screen.queryByText(/1 session ·/)).not.toBeInTheDocument()
  })

  it('does not count the workout you are in the middle of', async () => {
    // It would re-rank the list underneath you while you are using it.
    const sessionId = await startEmptySession('Right now')
    const link = await addExerciseToSession(sessionId, 'ex_crunch')
    await logSet(link, { weightKg: 0, reps: 20, type: 'normal' })

    renderPicker()
    await screen.findByRole('button', { name: /Pin Crunch to the top/i })

    expect(screen.queryByText('Your usual')).not.toBeInTheDocument()
  })

  it('pins an exercise to the top without adding it to the workout', async () => {
    const user = userEvent.setup()
    const onPick = renderPicker()

    await user.click(await screen.findByRole('button', { name: /Pin Wrist Curl to the top/i }))

    // The star sits beside the row, not inside it: pinning something must not
    // be one mis-tap away from adding it to the session you are in.
    expect(onPick).not.toHaveBeenCalled()
    await waitFor(async () => {
      expect((await getExercise('ex_wrist-curl'))?.pinnedAt).toBeTypeOf('number')
    })

    await screen.findByText('Pinned')
    expect(indexOf('Wrist Curl')).toBe(0)
  })

  it('keeps pins in the order they were made, so none of them move', async () => {
    const user = userEvent.setup()
    renderPicker()

    await user.click(await screen.findByRole('button', { name: /Pin Squat to the top/i }))
    await screen.findByText('Pinned')
    await user.click(await screen.findByRole('button', { name: /Pin Bench Press to the top/i }))

    // Alphabetically Bench Press comes first; it is second here because the
    // position your thumb already learned must not shift under it.
    await waitFor(() => {
      expect(indexOf('Squat')).toBe(0)
      expect(indexOf('Bench Press')).toBe(1)
    })
  })

  it('unpins from the pinned block', async () => {
    const user = userEvent.setup()
    renderPicker()

    await user.click(await screen.findByRole('button', { name: /Pin Squat to the top/i }))
    await screen.findByText('Pinned')

    await user.click(screen.getByRole('button', { name: /Unpin Squat/i }))

    await waitFor(() => {
      expect(screen.queryByText('Pinned')).not.toBeInTheDocument()
    })
    expect((await getExercise('ex_squat'))?.pinnedAt).toBeUndefined()
  })

  it('drops the section headings while you are searching', async () => {
    const user = userEvent.setup()
    await trained('ex_lat-pulldown', 4)

    renderPicker()
    await screen.findByText('Your usual')

    await user.type(screen.getByRole('searchbox', { name: /search exercises/i }), 'pulldown')

    // Three hits do not need three headings explaining themselves.
    await waitFor(() => {
      expect(screen.queryByText('Your usual')).not.toBeInTheDocument()
    })
    expect(indexOf('Lat Pulldown')).toBe(0)
  })

  it('shows a plain list on a fresh install, with nothing to rank yet', async () => {
    renderPicker()

    await screen.findByText('Ab Wheel Rollout')
    expect(screen.queryByText('Everything else')).not.toBeInTheDocument()
  })
})
