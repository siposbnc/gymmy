/**
 * Which build is running.
 *
 * Injected by Vite at compile time — see the `define` block in vite.config.ts.
 * Worth having because a service worker can serve a cached build after a
 * deploy, so "did my phone actually pick up the new version" is a question you
 * cannot answer by looking at the UI.
 *
 * The number is the commit count, so it increases monotonically and a bigger
 * number is unambiguously newer. The commit is there so a reported build can
 * be traced back to exact source.
 */

declare const __BUILD_NUMBER__: number
declare const __BUILD_COMMIT__: string
declare const __BUILD_TIME__: string

export const BUILD_NUMBER = __BUILD_NUMBER__
export const BUILD_COMMIT = __BUILD_COMMIT__
export const BUILD_TIME = __BUILD_TIME__

/** "Build 47", or "Build 47 (dev)" when it was not built from a clean commit. */
export function buildLabel(): string {
  return BUILD_NUMBER > 0 ? `Build ${BUILD_NUMBER}` : 'Development build'
}

/** "28 Oct 2026, 14:32" in the reader's locale, or null if unparseable. */
export function formatBuildTime(iso: string = BUILD_TIME): string | null {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * One line, copyable, with everything needed to identify a build.
 *
 * Deliberately a single string: if something is wrong, this is what gets
 * pasted into a message, and three separate values would arrive as one.
 */
export function buildSummary(): string {
  const time = formatBuildTime()
  return [buildLabel(), BUILD_COMMIT, time].filter(Boolean).join(' · ')
}
