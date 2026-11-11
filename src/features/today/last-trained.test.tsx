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

  it('names the longest rest, which is the answer it exists to give', async () => {
    await trained('ex_squat', 9)
    await trained('ex_bench-press', 2)

    renderToday()

    expect(await screen.findByText('Last trained')).toBeInTheDocument()
    // Quads first: the order is the entire recommendation, and the readout
    // writes out the one number a shaded figure can only approximate.
    expect(screen.getByText('Quads')).toBeInTheDocument()
    expect(screen.getByText('9d')).toBeInTheDocument()
  })

  it('says which muscles have never been trained — the thing a date cannot', async () => {
    await trained('ex_squat', 9)

    renderToday()

    // Only quads have history, so everything else is drawn as never trained
    // and the readout names one of them plus how many more there are.
    expect(await screen.findByText(/\+\d+ more, not trained yet/i)).toBeInTheDocument()
  })

  it('reads as text as well as colour, since the figure is colour-only', async () => {
    await trained('ex_squat', 9)
    await trained('ex_bench-press', 2)

    renderToday()

    const spoken = await screen.findByText(/^Quads: last trained 9d$/)
    const list = spoken.closest('ul')
    const lines = Array.from(list?.querySelectorAll('li') ?? []).map((item) => item.textContent)

    expect(lines.slice(0, 2)).toEqual(['Quads: last trained 9d', 'Chest: last trained 2d'])
    expect(lines).toContain('Hamstrings: not trained yet')
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
