import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ThemeProvider } from '~/app/ThemeProvider'
import { completeSession } from '~/db/repositories/history'
import { addExerciseToSession, logSet, startEmptySession } from '~/db/repositories/sessions'
import { updateSettings } from '~/db/repositories/settings'
import { db } from '~/db/schema'
import { bootstrapDatabase } from '~/db/seed'
import { platform } from '~/lib/platform'

import { BackupPrompt } from './BackupPrompt'

/**
 * The prompt is the whole feature: the export has existed since M1, and what
 * was missing was anything that noticed you were not using it.
 */
async function finishWorkout(name = 'Push A') {
  const sessionId = await startEmptySession(name)
  const link = await addExerciseToSession(sessionId, 'ex_bench-press')
  await logSet(link, { weightKg: 80, reps: 8 })
  await completeSession(sessionId)
  return sessionId
}

function renderPrompt() {
  render(
    <ThemeProvider>
      <BackupPrompt />
    </ThemeProvider>,
  )
}

describe('the backup prompt', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await bootstrapDatabase()
    vi.restoreAllMocks()
  })

  it('asks after the first workout, when nothing has ever been backed up', async () => {
    await finishWorkout()
    renderPrompt()

    expect(await screen.findByText(/never backed up/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /back up now/i })).toBeInTheDocument()
  })

  it('stays silent when the backup already covers everything', async () => {
    await finishWorkout()
    await updateSettings({ lastExportAt: Date.now() })

    renderPrompt()

    // Asking for a backup identical to the last one spends the willingness to
    // be interrupted that the real prompt depends on.
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /back up now/i })).not.toBeInTheDocument()
    })
  })

  it('stays silent for a workout or two after a recent backup', async () => {
    await updateSettings({ lastExportAt: Date.now() - 86_400_000 })
    await finishWorkout('One')
    await finishWorkout('Two')

    renderPrompt()

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /back up now/i })).not.toBeInTheDocument()
    })
  })

  it('asks again once three workouts are unsaved', async () => {
    await updateSettings({ lastExportAt: Date.now() - 86_400_000 })
    await finishWorkout('One')
    await finishWorkout('Two')
    await finishWorkout('Three')

    renderPrompt()

    expect(await screen.findByText(/3 workouts since your last backup/i)).toBeInTheDocument()
  })

  it('writes the file out and records that it did', async () => {
    const save = vi.spyOn(platform.files, 'save').mockResolvedValue()

    await finishWorkout()
    renderPrompt()

    await userEvent.click(await screen.findByRole('button', { name: /back up now/i }))

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))

    const written = save.mock.calls[0]?.[0]
    expect(written?.filename).toMatch(/^gymmy-backup-\d{4}-\d{2}-\d{2}\.json$/)
    expect(written?.mimeType).toBe('application/json')
    // The file is the real export, not a stub — this is the only migration path.
    const parsed = JSON.parse(written?.data ?? '{}') as { data: { sets: unknown[] } }
    expect(parsed.data.sets).toHaveLength(1)

    const settings = await db.settings.get('singleton')
    expect(settings?.lastExportAt).toBeGreaterThan(0)

    // "Created", not "saved": the share sheet reports nothing back.
    expect(await screen.findByText('Backup created.')).toBeInTheDocument()
  })

  it('says so when the backup fails rather than claiming success', async () => {
    vi.spyOn(platform.files, 'save').mockRejectedValue(new Error('No room on device'))

    await finishWorkout()
    renderPrompt()

    await userEvent.click(await screen.findByRole('button', { name: /back up now/i }))

    expect(await screen.findByText('No room on device')).toBeInTheDocument()

    // And it must not claim the history is safe when it is not.
    const settings = await db.settings.get('singleton')
    expect(settings?.lastExportAt).toBeUndefined()
  })
})
