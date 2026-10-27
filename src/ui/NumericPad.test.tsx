import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { NumericPad } from './NumericPad'

/**
 * Regression cover for a bug a browser found and jsdom did not.
 *
 * The pad opens showing the current value so you can see what you are changing.
 * If the first digit APPENDS to that instead of replacing it, typing "80" into
 * a field already reading "80" yields 8080 — a silently corrupted set, logged
 * without any error. The unit tests missed it because they only ever opened the
 * pad on an empty field.
 */
function Harness({ initial = 80, onCommit }: { initial?: number; onCommit: (n: number) => void }) {
  const [open, setOpen] = useState(true)
  return (
    <NumericPad
      open={open}
      onOpenChange={setOpen}
      value={initial}
      onCommit={onCommit}
      unit="kg"
      eyebrow="Bench Press · weight"
      increment={2.5}
    />
  )
}

// RTL matches a string `name` against the full accessible name already, so
// '8' hits the digit key and nothing else.
const press = (name: string) => screen.getByRole('button', { name })

describe('NumericPad', () => {
  it('replaces the seeded value on the first keypress', async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()
    render(<Harness initial={80} onCommit={onCommit} />)

    await user.click(press('8'))
    await user.click(press('0'))
    await user.click(press('Done'))

    // Not 8080.
    expect(onCommit).toHaveBeenCalledWith(80)
  })

  it('keeps appending after the first keypress', async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()
    render(<Harness initial={80} onCommit={onCommit} />)

    await user.click(press('1'))
    await user.click(press('2'))
    await user.click(press('5'))
    await user.click(press('Done'))

    expect(onCommit).toHaveBeenCalledWith(125)
  })

  it('commits the seeded value untouched when nothing is typed', async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()
    render(<Harness initial={82.5} onCommit={onCommit} />)

    await user.click(press('Done'))

    expect(onCommit).toHaveBeenCalledWith(82.5)
  })

  it('backspace edits the seeded value rather than wiping it', async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()
    render(<Harness initial={125} onCommit={onCommit} />)

    // Fixing a typo'd last digit should not force you to retype the whole thing.
    await user.click(press('Backspace'))
    await user.click(press('0'))
    await user.click(press('Done'))

    expect(onCommit).toHaveBeenCalledWith(120)
  })

  it('increments from the seeded value', async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()
    render(<Harness initial={80} onCommit={onCommit} />)

    await user.click(press('+2.5'))
    await user.click(press('Done'))

    expect(onCommit).toHaveBeenCalledWith(82.5)
  })

  it('does not go below zero on decrement', async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()
    render(<Harness initial={1} onCommit={onCommit} />)

    await user.click(press('−2.5'))
    await user.click(press('Done'))

    expect(onCommit).toHaveBeenCalledWith(0)
  })

  it('handles a decimal typed from scratch', async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()
    render(<Harness initial={100} onCommit={onCommit} />)

    await user.click(press('.'))
    await user.click(press('5'))
    await user.click(press('Done'))

    // A leading "." becomes "0.5" rather than NaN.
    expect(onCommit).toHaveBeenCalledWith(0.5)
  })

  it('refuses a second decimal point', async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()
    render(<Harness initial={0} onCommit={onCommit} />)

    await user.click(press('8'))
    await user.click(press('2'))
    await user.click(press('.'))
    await user.click(press('.'))
    await user.click(press('5'))
    await user.click(press('Done'))

    expect(onCommit).toHaveBeenCalledWith(82.5)
  })
})
