import { configure, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { ThemeProvider } from '~/app/ThemeProvider'
import { getExercise } from '~/db/repositories/exercises'
import { db } from '~/db/schema'
import { bootstrapDatabase } from '~/db/seed'
import type { Exercise } from '~/domain/types'

import { ExerciseFormSheet } from './ExerciseFormSheet'

/**
 * Machine weight is only ever asked for where it means something, and it has
 * to be *removable*. Leaving kilograms behind on an exercise that is no longer
 * a machine would silently credit every future set with weight that is not
 * there — a wrong number in records and volume with nothing on screen to
 * explain it.
 */
configure({ asyncUtilTimeout: 5000 })

function renderForm(existing?: Exercise) {
  render(
    <ThemeProvider>
      <ExerciseFormSheet
        open
        onOpenChange={() => {}}
        {...(existing ? { existing } : {})}
      />
    </ThemeProvider>,
  )
}

describe('the machine weight field', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await bootstrapDatabase()
  })

  it('appears for a machine and not for a barbell', async () => {
    const user = userEvent.setup()
    renderForm()

    // The form opens on Barbell, which has a bar rather than a carriage.
    expect(screen.queryByLabelText(/machine weight/i)).not.toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'Machine' }))
    expect(await screen.findByLabelText(/machine weight/i)).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'Smith machine' }))
    // A Smith machine's weight is a bar, and two ways to say the same
    // kilograms is how they end up counted twice.
    expect(screen.queryByLabelText(/machine weight/i)).not.toBeInTheDocument()
  })

  it('saves what was typed, in kilograms', async () => {
    const user = userEvent.setup()
    const legPress = await getExercise('ex_leg-press')
    renderForm(legPress)

    await user.type(await screen.findByLabelText(/machine weight/i), '25')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(async () => {
      expect((await getExercise('ex_leg-press'))?.machineWeightKg).toBe(25)
    })
  })

  it('clears the field when it is emptied', async () => {
    const user = userEvent.setup()
    await db.exercises.update('ex_leg-press', { machineWeightKg: 25 })
    renderForm(await getExercise('ex_leg-press'))

    await user.clear(await screen.findByLabelText(/machine weight/i))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    // Removed outright rather than stored as zero: absent is what every
    // exercise without a machine weight says, so it is what this must say.
    await waitFor(async () => {
      expect(await getExercise('ex_leg-press')).not.toHaveProperty('machineWeightKg')
    })
  })

  it('leaves nothing behind when the equipment stops being a machine', async () => {
    const user = userEvent.setup()
    await db.exercises.update('ex_leg-press', { machineWeightKg: 25 })
    renderForm(await getExercise('ex_leg-press'))

    await user.click(await screen.findByRole('radio', { name: 'Barbell' }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(async () => {
      const saved = await getExercise('ex_leg-press')
      expect(saved?.equipment).toBe('barbell')
      expect(saved).not.toHaveProperty('machineWeightKg')
    })
  })
})
