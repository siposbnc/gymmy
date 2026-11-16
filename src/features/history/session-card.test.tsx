import { cleanup, configure, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ThemeProvider } from '~/app/ThemeProvider'
import { completeSession } from '~/db/repositories/history'
import { addExerciseToSession, logSet, startEmptySession } from '~/db/repositories/sessions'
import { db } from '~/db/schema'
import { bootstrapDatabase } from '~/db/seed'

import { SessionDetailScreen } from './SessionDetailScreen'

/**
 * The card, reached the way a user reaches it.
 *
 * What it draws is pixels and cannot be asserted on — `domain/session-card`
 * covers what goes on it. This covers the part that can break without anyone
 * noticing: that the action exists on a past session, that the sheet opens,
 * and that a device which cannot draw a canvas says so in a sentence rather
 * than showing a broken image. jsdom is exactly that device, which makes it a
 * free test of the fallback.
 */

configure({ asyncUtilTimeout: 5000 })

describe('the shareable session card', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((table) => table.clear()))
    await bootstrapDatabase()
  })
  afterEach(cleanup)

  async function logAWorkout() {
    const sessionId = await startEmptySession('Thursday push')
    const bench = await addExerciseToSession(sessionId, 'ex_bench-press')
    await logSet(bench, { weightKg: 60, reps: 10, type: 'warmup' })
    await logSet(bench, { weightKg: 80, reps: 8 })
    await completeSession(sessionId)
    return sessionId
  }

  function renderDetail(sessionId: string) {
    return render(
      <ThemeProvider>
        <MemoryRouter initialEntries={[`/history/${sessionId}`]}>
          <Routes>
            <Route path="/history/:sessionId" element={<SessionDetailScreen />} />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>,
    )
  }

  it('is offered on any past session, not only one just finished', async () => {
    const user = userEvent.setup()
    const sessionId = await logAWorkout()

    renderDetail(sessionId)
    expect(await screen.findByText('Thursday push')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /session options/i }))
    await user.click(await screen.findByRole('button', { name: /make a card/i }))

    expect(await screen.findByText(/share this workout/i)).toBeInTheDocument()
  })

  it('says so plainly when the device cannot draw one', async () => {
    const user = userEvent.setup()
    const sessionId = await logAWorkout()

    renderDetail(sessionId)
    expect(await screen.findByText('Thursday push')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /session options/i }))
    await user.click(await screen.findByRole('button', { name: /make a card/i }))

    // jsdom has no 2D context, so this is the real fallback path.
    expect(await screen.findByText(/could not draw the card/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /copy image/i })).not.toBeInTheDocument()
  })

  it('hands the clipboard a PNG when the device can draw one', async () => {
    const user = userEvent.setup()
    const sessionId = await logAWorkout()

    const blob = new Blob(['not really a png'], { type: 'image/png' })
    // Stand in for a real canvas: what matters here is the wiring from the
    // rendered blob to the clipboard, not the pixels.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      stubContext() as unknown as CanvasRenderingContext2D,
    )
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
      callback(blob)
    })
    const write = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('ClipboardItem', class {})
    Object.defineProperty(navigator, 'clipboard', { value: { write }, configurable: true })
    URL.createObjectURL = vi.fn(() => 'blob:card')
    URL.revokeObjectURL = vi.fn()

    renderDetail(sessionId)
    expect(await screen.findByText('Thursday push')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /session options/i }))
    await user.click(await screen.findByRole('button', { name: /make a card/i }))

    const image = await screen.findByRole('img', { name: /thursday push/i })
    expect(image).toHaveAttribute('src', 'blob:card')

    await user.click(screen.getByRole('button', { name: /copy image/i }))

    await waitFor(() => expect(write).toHaveBeenCalledTimes(1))
    expect(await screen.findByText(/copied to clipboard/i)).toBeInTheDocument()

    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })
})

/** The handful of canvas calls the drawing makes, doing nothing. */
function stubContext() {
  return {
    fillRect: () => {},
    fill: () => {},
    stroke: () => {},
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    arcTo: () => {},
    fillText: () => {},
    measureText: () => ({ width: 100 }),
    set fillStyle(_value: string) {},
    set strokeStyle(_value: string) {},
    set lineWidth(_value: number) {},
    set font(_value: string) {},
    set letterSpacing(_value: string) {},
    set textAlign(_value: string) {},
    set textBaseline(_value: string) {},
  }
}
