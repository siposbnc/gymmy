import { configure, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ThemeProvider } from '~/app/ThemeProvider'
import { createCustomExercise } from '~/db/repositories/exercises'
import {
  addExerciseToRoutine,
  createRoutine,
  listRoutineExercises,
  updateRoutineExercise,
} from '~/db/repositories/routines'
import { db } from '~/db/schema'
import { bootstrapDatabase } from '~/db/seed'
import { platform } from '~/lib/platform'

import { ImportRoutineSheet } from './ImportRoutineSheet'
import { ShareRoutineSheet } from './ShareRoutineSheet'

/**
 * The claim: a routine leaves one phone as a string and arrives on another as
 * the same plan, including an exercise the second phone has never heard of.
 *
 * Driven through the two sheets rather than the repositories, because the
 * repository test already covers the data and what is interesting here is that
 * the code you can copy is the code that imports.
 */

configure({ asyncUtilTimeout: 5000 })

describe('sharing a routine between two devices', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await bootstrapDatabase()
  })

  async function buildShoulderDay() {
    const landmine = await createCustomExercise({
      name: 'Landmine Press',
      muscleGroups: ['shoulders', 'triceps'],
      equipment: 'barbell',
      movementType: 'compound',
      trackingType: 'weight_reps',
      defaultRestSeconds: 120,
    })

    const routineId = await createRoutine('Shoulder day')
    const press = await addExerciseToRoutine(routineId, landmine)
    await addExerciseToRoutine(routineId, 'ex_lateral-raise')
    await updateRoutineExercise(press, {
      targetSets: 4,
      targetRepsMin: 6,
      targetRepsMax: 10,
      targetWeight: { kind: 'absolute', kg: 45 },
    })

    return { routineId, landmine }
  }

  /** What the sender sees: a code, and a copy button that says it worked. */
  async function copyTheCode(routineId: string): Promise<string> {
    const copied = vi.spyOn(platform.clipboard, 'writeText').mockResolvedValue(true)

    const { unmount } = render(
      <ThemeProvider>
        <ShareRoutineSheet
          routineId={routineId}
          routineName="Shoulder day"
          open
          onOpenChange={() => {}}
        />
      </ThemeProvider>,
    )

    const button = await screen.findByRole('button', { name: /copy code/i })
    await waitFor(() => expect(button).toBeEnabled())
    await userEvent.click(button)

    await screen.findByRole('button', { name: /copied/i })
    const code = copied.mock.calls[0]?.[0] ?? ''
    copied.mockRestore()
    // Off the screen before the recipient's half renders: both sheets show
    // the routine name, and a query matching two devices at once proves
    // nothing.
    unmount()
    return code
  }

  it('copies a code that another device can import', { timeout: 20_000 }, async () => {
    const { routineId, landmine } = await buildShoulderDay()
    const code = await copyTheCode(routineId)
    expect(code).toMatch(/^GYMMY-R1\./)

    // The recipient's device: the seed library, and nothing of the sender's.
    await db.routines.clear()
    await db.routineExercises.clear()
    await db.exercises.delete(landmine)

    const onImported = vi.fn()
    const { unmount } = render(
      <ThemeProvider>
        <ImportRoutineSheet open onOpenChange={() => {}} onImported={onImported} />
      </ThemeProvider>,
    )

    // A paste, not 600 keystrokes.
    fireEvent.change(screen.getByLabelText(/routine code/i), { target: { value: code } })
    await userEvent.click(screen.getByRole('button', { name: /check the code/i }))

    // The preview names the plan, its targets, and what it would add to the
    // exercise library — before anything is written.
    await screen.findByText('Shoulder day')
    expect(screen.getByText('4 × 6–10 @ 45 kg')).toBeInTheDocument()
    expect(screen.getByText(/will be added as your own/i)).toHaveTextContent('Landmine Press')
    expect(await db.routines.count()).toBe(0)

    await userEvent.click(screen.getByRole('button', { name: /add this routine/i }))

    await waitFor(() => expect(onImported).toHaveBeenCalled())
    const routine = await db.routines.get(onImported.mock.calls[0]?.[0] as string)
    expect(routine?.name).toBe('Shoulder day')

    const entries = await listRoutineExercises(routine!.id)
    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatchObject({
      targetSets: 4,
      targetRepsMin: 6,
      targetRepsMax: 10,
      targetWeight: { kind: 'absolute', kg: 45 },
    })

    // The exercise the recipient did not have was rebuilt from the code.
    const rebuilt = await db.exercises.get(entries[0]!.exerciseId)
    expect(rebuilt).toMatchObject({ name: 'Landmine Press', isCustom: true })

    unmount()
  })

  it('says what is wrong rather than failing silently', async () => {
    render(
      <ThemeProvider>
        <ImportRoutineSheet open onOpenChange={() => {}} onImported={vi.fn()} />
      </ThemeProvider>,
    )

    fireEvent.change(screen.getByLabelText(/routine code/i), {
      target: { value: 'send me your push day pls' },
    })
    await userEvent.click(screen.getByRole('button', { name: /check the code/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/does not look like a routine code/i)
    expect(await db.routines.count()).toBe(0)
  })

  it('tells you when the clipboard was blocked instead of claiming it copied', async () => {
    const { routineId } = await buildShoulderDay()
    // What a browser does without a secure context or with permission denied.
    vi.spyOn(platform.clipboard, 'writeText').mockResolvedValue(false)

    render(
      <ThemeProvider>
        <ShareRoutineSheet
          routineId={routineId}
          routineName="Shoulder day"
          open
          onOpenChange={() => {}}
        />
      </ThemeProvider>,
    )

    const button = await screen.findByRole('button', { name: /copy code/i })
    await waitFor(() => expect(button).toBeEnabled())
    await userEvent.click(button)

    expect(await screen.findByRole('alert')).toHaveTextContent(/copy it by hand/i)
    expect(screen.queryByRole('button', { name: /copied/i })).not.toBeInTheDocument()
    vi.restoreAllMocks()
  })
})
