// Drive the built app in a real browser and capture screenshots.
//
// Not a test — a pair of eyes. The suite proves the logic; this proves the
// thing actually looks right on a phone-sized screen in both themes, which is
// the one thing a jsdom test can never tell you.
//
//   npm run build && npm run shots
//
// Screenshots land in .shots/ (git-ignored).

import { mkdir, rm } from 'node:fs/promises'
import { chromium } from 'playwright'

const BASE = process.env.GYMMY_URL ?? 'http://localhost:4317'
const OUT = '.shots'
const PHONE = { width: 390, height: 844 }

await rm(OUT, { recursive: true, force: true })
await mkdir(OUT, { recursive: true })

const browser = await chromium.launch()

/** A fresh context per shot: IndexedDB and localStorage start empty. */
async function shoot(name, { theme = 'light', steps = async () => {} } = {}) {
  const context = await browser.newContext({
    viewport: PHONE,
    colorScheme: theme,
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  })
  const page = await context.newPage()

  const errors = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(String(error)))

  await page.goto(BASE, { waitUntil: 'networkidle' })
  await steps(page)
  await page.waitForTimeout(350) // let any spring settle

  await page.screenshot({ path: `${OUT}/${name}-${theme}.png` })
  console.log(`✓ ${name}-${theme}.png`)

  const real = errors.filter((text) => !text.includes('favicon'))
  if (real.length > 0) console.warn(`  ⚠ console errors in ${name}:`, real)

  await context.close()
  return real
}

const tap = (page, name, exact = false) =>
  page.getByRole('button', { name, exact }).click()

/** Fill the pending row via the numeric pad and log it. */
async function logSet(page, weight, reps) {
  await page.getByRole('button', { name: /weight: (not set|[\d.]+)/i }).click()
  for (const digit of String(weight)) await tap(page, digit, true)
  await tap(page, 'Done', true)

  await page.getByRole('button', { name: /reps: (not set|\d+)/i }).click()
  for (const digit of String(reps)) await tap(page, digit, true)
  await tap(page, 'Done', true)

  // Exact: "Log" would otherwise also match the warm-up toggle's label.
  await tap(page, 'Log', true)
  await page.waitForTimeout(250)
}

async function intoSession(page) {
  await tap(page, /empty workout/i)
  await tap(page, /add exercise/i)
  await page.getByRole('button', { name: /^Bench Press/ }).click()
  await page.waitForTimeout(250)
}

/** Build a small routine through the UI, leaving the editor open. */
async function buildRoutine(page) {
  await page.getByRole('link', { name: 'Routines' }).click()
  // The header "New" and the empty-state "Build a routine" both create one.
  await tap(page, 'New', true)
  await page.waitForTimeout(200)

  for (const name of ['Bench Press', 'Incline Dumbbell Press', 'Cable Fly']) {
    await tap(page, /add exercise/i)
    await page.getByRole('button', { name: new RegExp(`^${name}`) }).click()
    await page.waitForTimeout(150)
  }

  // Group the SECOND exercise with the first, so the connector shows. The
  // first exercise's button is correctly disabled — nothing sits above it.
  await page.getByRole('button', { name: /superset with the exercise above/i }).nth(1).click()
  await page.waitForTimeout(250)
}

const allErrors = []

for (const theme of ['light', 'dark']) {
  allErrors.push(...(await shoot('today', { theme })))

  allErrors.push(
    ...(await shoot('session-empty', {
      theme,
      steps: async (page) => {
        await tap(page, /empty workout/i)
        await page.waitForTimeout(200)
      },
    })),
  )

  allErrors.push(
    ...(await shoot('session-logged', {
      theme,
      steps: async (page) => {
        await intoSession(page)
        await logSet(page, 80, 8)
        await logSet(page, 80, 8)
      },
    })),
  )

  allErrors.push(
    ...(await shoot('routines-empty', {
      theme,
      steps: async (page) => {
        await page.getByRole('link', { name: 'Routines' }).click()
        await page.waitForTimeout(200)
      },
    })),
  )

  allErrors.push(
    ...(await shoot('routine-editor', {
      theme,
      steps: buildRoutine,
    })),
  )

  allErrors.push(
    ...(await shoot('routine-session', {
      theme,
      steps: async (page) => {
        await buildRoutine(page)
        await page.getByRole('button', { name: /back to routines/i }).click()
        await page.waitForTimeout(250)
        await tap(page, 'Start', true)
        await page.waitForTimeout(400)
      },
    })),
  )

  allErrors.push(
    ...(await shoot('explainer', {
      theme,
      steps: async (page) => {
        await tap(page, /how gymmy works out your numbers/i)
        // The warm-up card's body text also mentions estimated 1RM, so target
        // the card button by its accessible name rather than loose text.
        await page.getByRole('button', { name: /^Estimated 1RM/ }).click()
        await page.waitForTimeout(300)
      },
    })),
  )

  allErrors.push(
    ...(await shoot('settings', {
      theme,
      steps: async (page) => {
        await page.getByRole('link', { name: 'More' }).click()
        await page.getByRole('link', { name: /settings/i }).click()
        await page.waitForTimeout(200)
      },
    })),
  )
}

await browser.close()

if (allErrors.length > 0) {
  console.error(`\n${allErrors.length} console error(s) across the run.`)
  process.exit(1)
}
console.log('\nNo console errors.')
