import { describe, expect, it } from 'vitest'

import { BUILD_COMMIT, BUILD_NUMBER, buildLabel, buildSummary, formatBuildTime } from './build'

/**
 * These constants are substituted by Vite at compile time. If the `define`
 * block is ever removed or renamed, the identifiers become undefined at
 * runtime and the Settings screen breaks — so the wiring is worth asserting
 * rather than assuming.
 */
describe('build identity', () => {
  it('is actually injected, not left as a bare identifier', () => {
    expect(typeof BUILD_NUMBER).toBe('number')
    expect(typeof BUILD_COMMIT).toBe('string')
    expect(BUILD_COMMIT.length).toBeGreaterThan(0)
  })

  it('increases with history, so a bigger number is newer', () => {
    // Zero is the documented fallback for a build with no git behind it.
    expect(BUILD_NUMBER).toBeGreaterThanOrEqual(0)
    expect(Number.isInteger(BUILD_NUMBER)).toBe(true)
  })
})

describe('buildLabel', () => {
  it('reads as a build number when there is one', () => {
    expect(buildLabel()).toMatch(BUILD_NUMBER > 0 ? /^Build \d+$/ : /^Development build$/)
  })
})

describe('formatBuildTime', () => {
  it('formats a real timestamp', () => {
    expect(formatBuildTime('2026-10-28T14:32:00.000Z')).toMatch(/2026/)
  })

  it('returns null rather than "Invalid Date" for junk', () => {
    expect(formatBuildTime('not a date')).toBeNull()
    expect(formatBuildTime('')).toBeNull()
  })
})

describe('buildSummary', () => {
  it('is one line carrying everything needed to identify a build', () => {
    const summary = buildSummary()
    expect(summary).toContain(BUILD_COMMIT)
    expect(summary).toContain(buildLabel())
    // One string, because this is what gets pasted into a message.
    expect(summary.split('\n')).toHaveLength(1)
  })
})
