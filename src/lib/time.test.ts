import { describe, expect, it } from 'vitest'

import { describeDuration, formatDuration, formatRestLength } from './time'

describe('formatDuration', () => {
  it('formats under an hour as m:ss', () => {
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(8)).toBe('0:08')
    expect(formatDuration(90)).toBe('1:30')
    expect(formatDuration(2530)).toBe('42:10')
  })

  it('adds hours once past sixty minutes', () => {
    expect(formatDuration(3600)).toBe('1:00:00')
    expect(formatDuration(3862)).toBe('1:04:22')
  })

  it('never shows a negative time', () => {
    // An overrun rest clamps rather than rendering "-0:30".
    expect(formatDuration(-30)).toBe('0:00')
  })
})

describe('formatRestLength', () => {
  it('uses seconds below a minute', () => {
    expect(formatRestLength(45)).toBe('45s')
    expect(formatRestLength(0)).toBe('0s')
  })

  it('switches to m:ss at a minute', () => {
    expect(formatRestLength(60)).toBe('1:00')
    expect(formatRestLength(150)).toBe('2:30')
  })
})

describe('describeDuration', () => {
  it('spells it out for screen readers', () => {
    expect(describeDuration(90)).toBe('1 minute 30 seconds')
    expect(describeDuration(120)).toBe('2 minutes')
    expect(describeDuration(45)).toBe('45 seconds')
    expect(describeDuration(0)).toBe('0 seconds')
  })
})
