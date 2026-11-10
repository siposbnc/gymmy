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

const tap = (page, name, exact = false) => page.getByRole('button', { name, exact }).click()

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
  await page
    .getByRole('button', { name: /superset with the exercise above/i })
    .nth(1)
    .click()
  await page.waitForTimeout(250)
}

/** Build the routine, then give its first exercise a weight per set. */
async function buildLadder(page) {
  await buildRoutine(page)
  await page.getByRole('radio', { name: 'Per set' }).first().click()
  await page.waitForTimeout(250)

  for (const [row, weight, reps] of [
    [1, '60', '10'],
    [2, '70', '8'],
    [3, '80', '6'],
  ]) {
    await page.getByRole('button', { name: new RegExp(`set ${row} weight`, 'i') }).click()
    for (const digit of weight) await tap(page, digit, true)
    await tap(page, 'Done', true)

    await page.getByRole('button', { name: new RegExp(`set ${row} reps`, 'i') }).click()
    for (const digit of reps) await tap(page, digit, true)
    await tap(page, 'Done', true)
  }
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
      const lower = weeksAgo % 2 === 0
      const name = lower ? 'Lower A' : 'Upper A'
      await put('sessions', {
        id: sessionId,
        // Routine-backed with a goal snapshot, so the session summary has a
        // volume goal to render and a previous run to measure it against.
        routineId: lower ? 'seed_rtn_lower' : 'seed_rtn_upper',
        routineNameSnapshot: name,
        volumeGoalSnapshot: { kind: 'beat_last' },
        name,
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

    // A couple of weekly set targets, so Progress has bars rather than bare
    // counts. Read-modify-write: the settings row already exists.
    const existing = await new Promise((resolve, reject) => {
      const request = db
        .transaction('settings', 'readonly')
        .objectStore('settings')
        .get('singleton')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    if (existing) {
      await put('settings', {
        ...existing,
        weeklySetTargets: { chest: 12, quads: 10, hamstrings: 10, back: 14 },
      })
    }

    db.close()
  })

  // Records are derived. Reloading lets bootstrapDatabase notice the sessions
  // have no records yet and rebuild them — the same path an import takes.
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
}

/**
 * Pull the seeded exercises apart in time.
 *
 * `seedHistory` trains squat, bench and RDL together in every session, so
 * every muscle shares one date and the last-trained card comes out as one
 * block of identical chips. The interesting thing about that card is the
 * range — what a fortnight looks like next to yesterday, and whether the
 * dimming of what you trained today reads as quiet rather than as broken — so
 * the shot needs dates that actually differ.
 *
 * Done by id rather than by joining through `sessionExercises`: the seed
 * numbers its rows `seed_set_<session>_<exercise>_<set>`, and index 1 is the
 * bench press, 2 the Romanian deadlift.
 */
async function spreadTrainingDates(page) {
  await page.evaluate(async () => {
    const open = indexedDB.open('gymmy')
    const db = await new Promise((resolve, reject) => {
      open.onsuccess = () => resolve(open.result)
      open.onerror = () => reject(open.error)
    })

    const DAY = 86_400_000
    const shift = (id) =>
      /^seed_set_\d+_1_/.test(id) ? 5 * DAY : /^seed_set_\d+_2_/.test(id) ? 16 * DAY : 0

    await new Promise((resolve, reject) => {
      const tx = db.transaction('sets', 'readwrite')
      const store = tx.objectStore('sets')
      store.openCursor().onsuccess = (event) => {
        const cursor = event.target.result
        if (!cursor) return
        const back = shift(cursor.value.id)
        if (back > 0) cursor.update({ ...cursor.value, completedAt: cursor.value.completedAt - back })
        cursor.continue()
      }
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
    })

    db.close()
  })

  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
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

  // Today with training behind it: the last-trained card is the only thing on
  // this screen that is not a start button, and whether a row of muscle chips
  // reads as a glanceable answer or as a wall is not something a test can say.
  allErrors.push(
    ...(await shoot('today-trained', {
      theme,
      steps: async (page) => {
        await seedHistory(page)
        await spreadTrainingDates(page)
      },
    })),
  )

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

  // A machine that weighs something before you load it. The row shows what
  // you added and states the total underneath, and the only way to know that
  // reads clearly rather than crowding the row is to look at it.
  allErrors.push(
    ...(await shoot('session-machine', {
      theme,
      steps: async (page) => {
        await tap(page, /empty workout/i)
        await tap(page, /add exercise/i)
        await page.getByRole('button', { name: /^Leg Press/ }).click()
        await page.waitForTimeout(250)

        // Through the session's own exercise menu, which is where a machine
        // weight gets set or corrected while you are standing at the machine.
        await tap(page, /leg press options/i)
        await page.waitForTimeout(300)
        for (let step = 0; step < 10; step += 1) {
          await tap(page, /increase machine weight/i)
        }
        await page.keyboard.press('Escape')
        await page.waitForTimeout(300)

        await logSet(page, 40, 10)
      },
    })),
  )

  // The exercise menu mid-workout, with two sets already logged. The swap
  // sub-label has to state what happens to them, and it is the longest line in
  // the sheet — so this is the shot that proves it does not wrap into mush.
  allErrors.push(
    ...(await shoot('session-exercise-menu', {
      theme,
      steps: async (page) => {
        await intoSession(page)
        await logSet(page, 80, 8)
        await tap(page, /bench press options/i)
        await page.waitForTimeout(350)
      },
    })),
  )

  // The picker with history behind it: the sections only exist once there is
  // something to rank, and an empty install cannot show that.
  allErrors.push(
    ...(await shoot('exercise-picker', {
      theme,
      steps: async (page) => {
        await seedHistory(page)
        await tap(page, /empty workout/i)
        await tap(page, /add exercise/i)
        await page.waitForTimeout(350)
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

  // A weight per set. The rows have to stay readable at phone width with a
  // pad-sized tap target on every number, which is the thing a test cannot
  // tell you.
  allErrors.push(...(await shoot('routine-ladder', { theme, steps: buildLadder })))

  // And the same ladder in the gym: the plan line under "last time", with the
  // rung you are on picked out.
  allErrors.push(
    ...(await shoot('session-ladder', {
      theme,
      steps: async (page) => {
        await buildLadder(page)
        await page.getByRole('button', { name: /back to routines/i }).click()
        await page.waitForTimeout(250)
        await tap(page, 'Start', true)
        await page.waitForTimeout(400)
      },
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

  // The progression nudge needs a previous session that actually cleared the
  // routine's rep range, so it only exists with history behind it.
  allErrors.push(
    ...(await shoot('progression', {
      theme,
      steps: async (page) => {
        await seedHistory(page)
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

  // The post-workout summary as it actually arrives: finished just now, so
  // the backup prompt is on it. Reached by finishing, never from History.
  allErrors.push(
    ...(await shoot('session-finished', {
      theme,
      steps: async (page) => {
        await intoSession(page)
        await logSet(page, 80, 8)
        await tap(page, 'Finish', true)
        await tap(page, 'Finish workout', true)
        await page.waitForTimeout(500)
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
        await page
          .getByRole('button', { name: /Lower A/ })
          .first()
          .click()
        await page.waitForTimeout(400)
      },
    })),
  )

  // Turning a logged workout into a plan. The numbers in the preview are
  // derived, so this is the shot that proves the derived line reads sensibly.
  allErrors.push(
    ...(await shoot('save-as-routine', {
      theme,
      steps: async (page) => {
        await seedHistory(page)
        await page.getByRole('link', { name: 'History' }).click()
        await page.waitForTimeout(300)
        await page
          .getByRole('button', { name: /Lower A/ })
          .first()
          .click()
        await page.waitForTimeout(350)
        await tap(page, /session options/i)
        await tap(page, /save as routine/i)
        await page.waitForTimeout(400)
      },
    })),
  )

  // A share code on screen: long, monospace, and wrapped inside its own box.
  allErrors.push(
    ...(await shoot('routine-share', {
      theme,
      steps: async (page) => {
        await buildRoutine(page)
        await page.getByRole('button', { name: /back to routines/i }).click()
        await page.waitForTimeout(250)
        await tap(page, /options$/i)
        await tap(page, /^Share/)
        await page.waitForTimeout(500)
      },
    })),
  )

  // The import preview, reached the way a recipient reaches it: a code in the
  // field, checked, with an exercise that has to be added to the library.
  allErrors.push(
    ...(await shoot('routine-import', {
      theme,
      steps: async (page) => {
        await buildRoutine(page)
        await page.getByRole('button', { name: /back to routines/i }).click()
        await page.waitForTimeout(250)
        await tap(page, /options$/i)
        await tap(page, /^Share/)
        const code = await page.locator('code').first().innerText()
        await page.keyboard.press('Escape')
        await page.waitForTimeout(250)

        await tap(page, /import a shared routine/i)
        await page.getByLabel(/routine code/i).fill(code)
        await tap(page, /check the code/i)
        await page.waitForTimeout(450)
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
    ...(await shoot('settings-set-targets', {
      theme,
      steps: async (page) => {
        await page.goto(`${BASE}/more/settings`, { waitUntil: 'networkidle' })
        await tap(page, /add a muscle/i)
        await page.waitForTimeout(300)
        await page.getByRole('button', { name: 'Chest', exact: true }).click()
        await page.waitForTimeout(300)
        // Not exact: the heading carries an ⓘ button, so its text node is not
        // the whole accessible name.
        await page
          .getByText(/weekly set targets/i)
          .first()
          .scrollIntoViewIfNeeded()
        await page.waitForTimeout(300)
      },
    })),
  )

  allErrors.push(
    ...(await shoot('routine-goal', {
      theme,
      steps: async (page) => {
        await buildRoutine(page)
        await page.getByRole('radio', { name: 'Beat last time' }).click()
        await page
          .getByText(/session goal/i)
          .first()
          .scrollIntoViewIfNeeded()
        await page.waitForTimeout(300)
      },
    })),
  )

  allErrors.push(
    ...(await shoot('settings-about', {
      theme,
      steps: async (page) => {
        await page.goto(`${BASE}/more/settings`, { waitUntil: 'networkidle' })
        await page.getByText('About', { exact: true }).scrollIntoViewIfNeeded()
        await page.waitForTimeout(350)
      },
    })),
  )

  allErrors.push(
    ...(await shoot('explainer', {
      theme,
      steps: async (page) => {
        // Reached from More now — Today is for starting a session, not reading.
        await page.goto(`${BASE}/more/maths`, { waitUntil: 'networkidle' })
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

  // The status bar cap only suppresses the iOS top blur if it keeps WebKit's
  // exact shape: fixed, backed, >=6px tall, >=80% wide, within 4px of the top.
  const cap = await page.evaluate(() => {
    const element = document.querySelector('#status-bar-cap')
    if (!element) return null
    const box = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    return {
      fixed: style.position === 'fixed',
      top: Math.round(box.top),
      height: Math.round(box.height),
      widthRatio: box.width / window.innerWidth,
      opaque:
        style.backgroundColor !== 'transparent' &&
        !style.backgroundColor.includes('rgba(0, 0, 0, 0)'),
    }
  })

  check('status bar cap exists', cap !== null)
  if (cap) {
    check('cap is position:fixed', cap.fixed)
    check(`cap is within 4px of the top (${cap.top})`, cap.top <= 4)
    check(`cap is at least 6px tall (${cap.height})`, cap.height >= 6)
    check(
      `cap spans at least 80% width (${Math.round(cap.widthRatio * 100)}%)`,
      cap.widthRatio >= 0.8,
    )
    check('cap has an opaque background', cap.opaque)
  }

  // iOS zooms the page whenever a focused text control renders under 16px.
  // The first fix for this lived in @layer base and lost to utility classes,
  // so measure the computed value rather than trusting the stylesheet.
  const smallInputs = await page.evaluate(() => {
    const controls = [...document.querySelectorAll('input, textarea, select')]
    return controls
      .filter((element) => {
        const type = element.getAttribute('type')
        if (type === 'checkbox' || type === 'radio') return false
        return Number.parseFloat(getComputedStyle(element).fontSize) < 16
      })
      .map((element) => {
        const label = element.getAttribute('aria-label') ?? element.tagName.toLowerCase()
        return `${label} @ ${getComputedStyle(element).fontSize}`
      })
  })
  check(
    `every text control is at least 16px${smallInputs.length ? ` — ${smallInputs.join(', ')}` : ''}`,
    smallInputs.length === 0,
  )

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
  check(
    'sheet still fits on screen rather than running off the top',
    after.height <= 852 - KEYBOARD,
  )
  check('tab bar gets out of the way while typing', !after.navVisible)

  await context.close()
}

await browser.close()

if (allErrors.length > 0) {
  console.error(`\n${allErrors.length} console error(s) across the run.`)
  process.exit(1)
}
console.log('\nNo console errors.')
