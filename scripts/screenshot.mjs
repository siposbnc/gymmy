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

/**
 * Log several finished sessions so the progress charts have something real to
 * draw. Done through IndexedDB directly rather than the UI — driving 40 sets
 * through the numeric pad would take minutes and prove nothing extra.
 */
async function seedHistory(page) {
  await page.evaluate(async () => {
    const open = indexedDB.open('gymmy')
    const db = await new Promise((resolve, reject) => {
      open.onsuccess = () => resolve(open.result)
      open.onerror = () => reject(open.error)
    })

    const put = (store, value) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite')
        tx.objectStore(store).put(value)
        tx.oncomplete = resolve
        tx.onerror = () => reject(tx.error)
      })

    const DAY = 86_400_000
    const plan = [
      { weeksAgo: 5, squat: 120, bench: 75 },
      { weeksAgo: 4, squat: 125, bench: 77.5 },
      { weeksAgo: 3, squat: 130, bench: 77.5 },
      { weeksAgo: 2, squat: 132.5, bench: 80 },
      { weeksAgo: 1, squat: 137.5, bench: 80 },
      { weeksAgo: 0, squat: 140, bench: 82.5 },
    ]

    let n = 0
    for (const { weeksAgo, squat, bench } of plan) {
      const startedAt = Date.now() - weeksAgo * 7 * DAY - 2 * DAY
      const sessionId = `seed_ses_${n}`
      await put('sessions', {
        id: sessionId,
        name: weeksAgo % 2 === 0 ? 'Lower A' : 'Upper A',
        startedAt,
        endedAt: startedAt + 3_900_000,
        status: 'completed',
      })

      for (const [index, [exerciseId, weight, reps]] of [
        ['ex_squat', squat, 3],
        ['ex_bench-press', bench, 8],
        ['ex_romanian-deadlift', squat * 0.6, 8],
      ].entries()) {
        const linkId = `seed_sex_${n}_${index}`
        await put('sessionExercises', {
          id: linkId,
          sessionId,
          exerciseId,
          order: index,
          restSeconds: 150,
        })
        for (let setIndex = 1; setIndex <= 3; setIndex += 1) {
          await put('sets', {
            id: `seed_set_${n}_${index}_${setIndex}`,
            sessionExerciseId: linkId,
            setIndex,
            weightKg: weight,
            reps,
            type: 'normal',
            completedAt: startedAt + setIndex * 300_000,
          })
        }
      }
      n += 1
    }
    db.close()
  })

  // Records are derived. Reloading lets bootstrapDatabase notice the sessions
  // have no records yet and rebuild them — the same path an import takes.
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
}

const allErrors = []

/** Assertion helper for the structural checks that follow the screenshots. */
const check = (label, condition) => {
  if (condition) {
    console.log(`  ✓ ${label}`)
  } else {
    allErrors.push(label)
    console.error(`  ✗ ${label}`)
  }
}

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
    ...(await shoot('progress', {
      theme,
      steps: async (page) => {
        await seedHistory(page)
        await page.getByRole('link', { name: 'Progress' }).click()
        await page.waitForTimeout(400)
      },
    })),
  )

  allErrors.push(
    ...(await shoot('exercise-progress', {
      theme,
      steps: async (page) => {
        await seedHistory(page)
        await page.getByRole('link', { name: 'Progress' }).click()
        await page.getByRole('button', { name: /^Squat/ }).click()
        await page.waitForTimeout(400)
      },
    })),
  )

  allErrors.push(
    ...(await shoot('history', {
      theme,
      steps: async (page) => {
        await seedHistory(page)
        await page.getByRole('link', { name: 'History' }).click()
        await page.waitForTimeout(400)
      },
    })),
  )

  allErrors.push(
    ...(await shoot('session-detail', {
      theme,
      steps: async (page) => {
        await seedHistory(page)
        await page.getByRole('link', { name: 'History' }).click()
        await page.waitForTimeout(300)
        await page.getByRole('button', { name: /Lower A/ }).first().click()
        await page.waitForTimeout(400)
      },
    })),
  )

  allErrors.push(
    ...(await shoot('exercise-detail', {
      theme,
      steps: async (page) => {
        await page.goto(`${BASE}/more/exercises`, { waitUntil: 'networkidle' })
        await page.getByRole('button', { name: /^Romanian Deadlift/ }).click()
        await page.waitForTimeout(350)
      },
    })),
  )

  allErrors.push(
    ...(await shoot('exercise-new', {
      theme,
      steps: async (page) => {
        await page.goto(`${BASE}/more/exercises`, { waitUntil: 'networkidle' })
        await tap(page, 'New', true)
        await page.waitForTimeout(350)
      },
    })),
  )

  allErrors.push(
    ...(await shoot('settings-bars', {
      theme,
      steps: async (page) => {
        await page.goto(`${BASE}/more/settings`, { waitUntil: 'networkidle' })
        await page.getByText('Bars', { exact: true }).scrollIntoViewIfNeeded()
        await page.waitForTimeout(350)
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

/**
 * Shell integrity check.
 *
 * The document itself must never scroll: if it does, an installed iOS PWA
 * drags the whole shell — safe-area padding and all — up under the Dynamic
 * Island, and takes the bottom tab bar off-screen with it. That exact bug
 * shipped, so it gets an assertion rather than a screenshot.
 */
{
  const context = await browser.newContext({
    viewport: { width: 393, height: 852 }, // iPhone 15 Pro
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
  })
  const page = await context.newPage()
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await seedHistory(page)

  for (const [name, path] of [
    ['today', '/'],
    ['progress', '/progress'],
    ['history', '/history'],
  ]) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(300)

    const shell = await page.evaluate(() => {
      const nav = document.querySelector('nav[aria-label="Main"]')
      return {
        documentScrolls:
          document.documentElement.scrollHeight > document.documentElement.clientHeight,
        bodyScrolls: document.body.scrollHeight > document.body.clientHeight,
        navBottom: nav ? Math.round(nav.getBoundingClientRect().bottom) : -1,
        viewportHeight: window.innerHeight,
      }
    })

    if (shell.documentScrolls || shell.bodyScrolls) {
      allErrors.push(`${path}: the document scrolls — the tab bar will not stay fixed`)
    }
    // The nav must sit at the bottom edge, not somewhere up the page.
    if (Math.abs(shell.navBottom - shell.viewportHeight) > 2) {
      allErrors.push(
        `${path}: tab bar bottom at ${shell.navBottom}, viewport ${shell.viewportHeight}`,
      )
    }
    console.log(
      `✓ shell ${name}: document fixed, tab bar pinned at ${shell.navBottom}/${shell.viewportHeight}`,
    )
  }

  await context.close()
}

/**
 * Keyboard-inset wiring.
 *
 * Playwright cannot raise a real on-screen keyboard, but the part that breaks
 * is the CSS: does the sheet actually lift, and does the tab bar get out of
 * the way. Driving --keyboard-inset directly tests exactly that.
 */
{
  const context = await browser.newContext({
    viewport: { width: 393, height: 852 },
    hasTouch: true,
    isMobile: true,
  })
  const page = await context.newPage()
  await page.goto(`${BASE}/more/exercises`, { waitUntil: 'networkidle' })

  // Open a sheet with a search field in it.
  await tap(page, 'New', true)
  await page.waitForTimeout(400)

  const before = await page.evaluate(() => {
    const sheet = document.querySelector('[role="dialog"]')
    return sheet ? Math.round(sheet.getBoundingClientRect().bottom) : -1
  })
  check('sheet sits at the bottom of the screen with no keyboard', before === 852)

  const KEYBOARD = 336
  await page.evaluate((inset) => {
    document.documentElement.style.setProperty('--keyboard-inset', `${inset}px`)
    document.documentElement.dataset.keyboard = 'open'
  }, KEYBOARD)
  await page.waitForTimeout(350)

  const after = await page.evaluate(() => {
    const sheet = document.querySelector('[role="dialog"]')
    const nav = document.querySelector('nav[aria-label="Main"]')
    return {
      bottom: sheet ? Math.round(sheet.getBoundingClientRect().bottom) : -1,
      height: sheet ? Math.round(sheet.getBoundingClientRect().height) : -1,
      navVisible: nav ? getComputedStyle(nav).display !== 'none' : false,
    }
  })

  check(
    `sheet lifts clear of the keyboard (${after.bottom} vs ${852 - KEYBOARD})`,
    Math.abs(after.bottom - (852 - KEYBOARD)) <= 2,
  )
  check('sheet still fits on screen rather than running off the top', after.height <= 852 - KEYBOARD)
  check('tab bar gets out of the way while typing', !after.navVisible)

  await context.close()
}

await browser.close()

if (allErrors.length > 0) {
  console.error(`\n${allErrors.length} console error(s) across the run.`)
  process.exit(1)
}
console.log('\nNo console errors.')
