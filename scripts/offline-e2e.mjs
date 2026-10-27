// The critical path, with the network off.
//
// Everything else in this repo tests Gymmy with a server reachable. This
// script proves the claim the whole architecture is built around: that you can
// open the app in a gym basement with no signal, log a full workout, and have
// it still be there afterwards.
//
//   npm run build && npm run e2e:offline
//
// Exits non-zero on the first failed assertion.

import { chromium } from 'playwright'

const BASE = process.env.GYMMY_URL ?? 'http://localhost:4317'

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 393, height: 852 },
  hasTouch: true,
  isMobile: true,
  serviceWorkers: 'allow',
})
const page = await context.newPage()

const failures = []
const check = (label, condition) => {
  if (condition) {
    console.log(`  ✓ ${label}`)
  } else {
    failures.push(label)
    console.error(`  ✗ ${label}`)
  }
}

const tap = (name, exact = false) => page.getByRole('button', { name, exact }).click()

async function logSet(weight, reps) {
  await page.getByRole('button', { name: /weight: (not set|[\d.]+)/i }).click()
  for (const digit of String(weight)) await tap(digit, true)
  await tap('Done', true)

  await page.getByRole('button', { name: /reps: (not set|\d+)/i }).click()
  for (const digit of String(reps)) await tap(digit, true)
  await tap('Done', true)

  await tap('Log', true)
  await page.waitForTimeout(200)
}

console.log('\n1. First visit, online — the service worker installs and precaches.')
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForFunction(() => navigator.serviceWorker.controller != null, { timeout: 15_000 })
check('service worker is controlling the page', true)

console.log('\n2. Going offline.')
await context.setOffline(true)

await page.reload({ waitUntil: 'load' })
check('app still loads with no network', await page.getByText(/ready when you are/i).isVisible())

console.log('\n3. Logging a full workout offline.')
await tap(/empty workout/i)
await page.waitForTimeout(200)

await tap(/add exercise/i)
await page.getByRole('button', { name: /^Bench Press/ }).click()
await page.waitForTimeout(250)

await logSet(80, 8)
await logSet(80, 8)
await logSet(80, 7)

const loggedRows = await page.getByRole('button', { name: /^Set \d+ options$/ }).count()
check('three sets logged', loggedRows === 3)

const restVisible = await page.getByText('Rest', { exact: true }).isVisible()
check('rest timer started offline', restVisible)

console.log('\n4. Killing the app mid-workout, still offline.')
// Relaunching an installed PWA opens start_url, not wherever you were, so
// navigating to the root is the honest simulation of a cold start.
await page.goto(BASE, { waitUntil: 'load' })
await page.waitForTimeout(700)

check(
  'a cold start offers to resume the interrupted session',
  await page.getByText(/pick up where you left off/i).isVisible(),
)

await tap(/continue/i)
await page.waitForTimeout(500)
check(
  'the logged sets survived the relaunch',
  (await page.getByRole('button', { name: /^Set \d+ options$/ }).count()) === 3,
)

console.log('\n5. Finishing the workout offline.')
await tap(/finish/i)
await page.waitForTimeout(300)
await tap(/finish workout/i)
await page.waitForTimeout(700)

check('the session summary opens', await page.getByText(/volume/i).first().isVisible())

console.log('\n6. History and records, still offline.')
await page.getByRole('link', { name: 'History' }).click()
await page.waitForTimeout(400)
check('the finished session is in history', await page.getByText('Workout').first().isVisible())

await page.getByRole('link', { name: 'Progress' }).click()
await page.waitForTimeout(500)
check(
  'records were computed offline',
  await page.getByText(/bench press/i).first().isVisible(),
)

console.log('\n7. Back online — nothing is lost.')
await context.setOffline(false)
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.getByRole('link', { name: 'History' }).click()
await page.waitForTimeout(400)
check(
  'the offline workout is still there after reconnecting',
  await page.getByText('Workout').first().isVisible(),
)

await browser.close()

if (failures.length > 0) {
  console.error(`\n${failures.length} assertion(s) failed:\n  - ${failures.join('\n  - ')}\n`)
  process.exit(1)
}
console.log('\nOffline critical path passed.\n')
