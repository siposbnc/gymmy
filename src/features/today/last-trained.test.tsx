import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ThemeProvider } from '~/app/ThemeProvider'
import {
  addExerciseToSession,
  finishSession,
  logSet,
  startEmptySession,
} from '~/db/repositories/sessions'
import { db } from '~/db/schema'
import { bootstrapDatabase } from '~/db/seed'

import { TodayScreen } from './TodayScreen'

/**
 * The card that answers "what should I train today?".
 *
 * The arithmetic is covered in `domain/recency.test.ts`. This covers the part
 * that decides whether it is any use: that it is on the launch screen, in the
 * order that makes the decision, and that it keeps quiet when it has nothing
 * to say.
 */

const DAY = 86_400_000

/** A finished workout of one exercise, logged `daysAgo` days ago. */
async function trained(exerciseId: string, daysAgo: number) {
  const sessionId = await startEmptySession('Workout')
  const sexId = await addExerciseToSession(sessionId, exerciseId)
  const setId = await logSet(sexId, { weightKg: 80, reps: 8 })
  await db.sets.update(setId, { completedAt: Date.now() - daysAgo * DAY })
  await finishSession(sessionId)
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

describe('the last-trained card', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((table) => table.clear()))
    await bootstrapDatabase()
  })
  afterEach(cleanup)

  it('lists the muscles you train, longest rested first', async () => {
    await trained('ex_squat', 9)
    await trained('ex_bench-press', 2)

    renderToday()

    const list = await screen.findByRole('list')
    const muscles = Array.from(list.querySelectorAll('li')).map((item) => item.textContent)

    // Quads first: the order is the entire recommendation.
    expect(muscles).toEqual(['Quads9d', 'Chest2d'])
  })

  it('says nothing at all on a fresh install', async () => {
    renderToday()

    expect(await screen.findByText(/empty workout/i)).toBeInTheDocument()
    expect(screen.queryByText(/last trained/i)).not.toBeInTheDocument()
  })

  it('stays out of the way once a workout is in progress', async () => {
    await trained('ex_squat', 9)
    await startEmptySession('Push A')

    renderToday()

    // Mid-workout the question has already been answered.
    expect(await screen.findByText(/in progress/i)).toBeInTheDocument()
    expect(screen.queryByText(/last trained/i)).not.toBeInTheDocument()
  })
})
