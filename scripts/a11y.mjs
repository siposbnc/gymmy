// Accessibility audit with axe-core, across every screen in both themes.
//
//   npm run build && npm run a11y
//
// Exits non-zero on any violation. Run with --verbose for the full node list.
//
// This catches the mechanical failures — unlabelled controls, contrast below
// threshold, broken heading order, missing landmarks. It cannot judge whether
// the app is usable with a screen reader, so it is a floor, not a ceiling.

import { readFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const BASE = process.env.GYMMY_URL ?? 'http://localhost:4317'
const VERBOSE = process.argv.includes('--verbose')

const axeSource = await readFile('node_modules/axe-core/axe.min.js', 'utf8')

const browser = await chromium.launch()

/** Seed enough data that charts, records and history actually render. */
async function seed(page) {
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
    for (let week = 0; week < 4; week += 1) {
      const startedAt = Date.now() - week * 7 * DAY - 2 * DAY
      const sessionId = `a11y_ses_${week}`
      await put('sessions', {
        id: sessionId,
        name: 'Lower A',
        startedAt,
        endedAt: startedAt + 3_600_000,
        status: 'completed',
      })
      const linkId = `a11y_sex_${week}`
      await put('sessionExercises', {
        id: linkId,
        sessionId,
        exerciseId: 'ex_squat',
        order: 0,
        restSeconds: 180,
      })
      for (let setIndex = 1; setIndex <= 3; setIndex += 1) {
        await put('sets', {
          id: `a11y_set_${week}_${setIndex}`,
          sessionExerciseId: linkId,
          setIndex,
          weightKg: 120 + week * 5,
          reps: 3,
          type: setIndex === 1 ? 'warmup' : 'normal',
          completedAt: startedAt + setIndex * 300_000,
        })
      }
    }
    db.close()
  })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
}

const SCREENS = [
  ['Today', '/'],
  ['Routines', '/routines'],
  ['History', '/history'],
  ['Progress', '/progress'],
  ['Exercise progress', '/progress/ex_squat'],
  ['More', '/more'],
  ['Exercises', '/more/exercises'],
  ['Maths reference', '/more/maths'],
  ['Settings', '/more/settings'],
]

let total = 0
const summary = []

for (const theme of ['light', 'dark']) {
  const context = await browser.newContext({
    viewport: { width: 393, height: 852 },
    colorScheme: theme,
    hasTouch: true,
    isMobile: true,
  })
  const page = await context.newPage()
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await seed(page)

  for (const [name, path] of SCREENS) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(350)

    await page.evaluate(axeSource)
    const result = await page.evaluate(async () =>
      // eslint-disable-next-line no-undef
      window.axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      }),
    )

    const violations = result.violations
    total += violations.length

    if (violations.length === 0) {
      console.log(`  ✓ ${theme.padEnd(5)} ${name}`)
    } else {
      console.error(`  ✗ ${theme.padEnd(5)} ${name} — ${violations.length} violation(s)`)
      for (const violation of violations) {
        console.error(`      [${violation.impact}] ${violation.id}: ${violation.help}`)
        summary.push(`${theme}/${name}: ${violation.id} (${violation.impact})`)
        if (VERBOSE) {
          for (const node of violation.nodes.slice(0, 4)) {
            console.error(`        ${node.target.join(' ')}`)
            if (node.failureSummary) {
              console.error(`        ${node.failureSummary.replace(/\n/g, '\n        ')}`)
            }
          }
        }
      }
    }
  }

  await context.close()
}

await browser.close()

if (total > 0) {
  console.error(`\n${total} accessibility violation(s):\n  - ${summary.join('\n  - ')}\n`)
  process.exit(1)
}
console.log('\nNo accessibility violations.\n')
