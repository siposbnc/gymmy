# Gymmy — Application Plan

> Status: **planning**. No implementation yet.
> Decisions locked: installable PWA (app-store path kept open) · local-first, single user per device ·
> soft & modern UI (light + dark) · kilograms · weight-based training only in v1
> v1 scope: set/rep logging · training plan builder (absolute weights) · rest timer · history & progress
> charts · exercise library · prefill · plate calculator · warm-up flags · RPE · PR detection from logged
> work only · in-app explanations for every derived number · export/import
>
> See [§10 Locked decisions](#10-locked-decisions) for the resolved questions.

---

## 1. Product definition

**Gymmy is a gym buddy you hold in one sweaty hand.**

The whole app is judged on one interaction: _you finish a set, and you tell Gymmy about it._ If that takes
more than one tap when nothing changed from last time, the app has failed — people stop logging, and every
other feature (charts, PRs, plans) becomes worthless because the data dries up.

So the design priority order is:

1. **Logging a set is instant.** Pre-filled, one tap, no keyboard, no network.
2. **Never lose data.** The app can be killed mid-workout, offline, on a dying battery. It recovers.
3. **Show progress.** The reason to keep logging is seeing the numbers go up.
4. **Planning serves logging.** A routine exists to pre-fill a session, not to be admired.

### Who it's for

A lifter who trains with a repeating plan (PPL, upper/lower, 5/3/1, their own thing) and wants a fast
log plus honest progress data. Not a beginner's guided-program app, not a social network, not a nutrition
tracker.

### Explicitly _not_ building

Social feed · friend following · nutrition/macros · gamified badge economy · AI coach chat · in-app
purchases. Each one dilutes the core loop and adds a lot of surface area. PRs are the only dopamine
mechanic, and that one is earned.

---

## 2. Core user journeys

**A. Train from a plan** (the 90% case)
Home → "Push A" → session opens with every exercise and target pre-filled from the routine _and_ last
week's actual numbers → log sets, rest timer auto-runs → finish → PRs and session summary.

**B. Train off the cuff**
Home → "Empty workout" → add exercises as you go → finish. (Not every session comes from a plan; forcing
a routine is a common app mistake.)

**C. Build / tune a plan**
Routines → new or duplicate → add exercises, set target sets/reps/weight/rest, group supersets, reorder.
Tuning usually happens _right after_ a session, so the session summary links straight into the routine.

**D. Check progress**
Progress → pick an exercise → chart of top set / estimated 1RM / weekly volume → "when did I last squat
140?" answered in two taps.

**E. Fix a mistake**
History → tap a past session → edit any set, add a forgotten exercise, delete a bogus set. People forget
to log; if history is read-only the data becomes a lie they stop trusting.

---

## 3. Information architecture

Bottom tab bar (mobile-first, thumb-reachable), 5 destinations:

| Tab          | Purpose                                                                                  |
| ------------ | ---------------------------------------------------------------------------------------- |
| **Today**    | Active session card _or_ start-workout entry points · recent sessions · week-at-a-glance |
| **Routines** | Training plan list → routine builder/editor                                              |
| **History**  | Calendar + chronological list → session detail (editable)                                |
| **Progress** | Per-exercise charts, PR board, weekly volume by muscle group, streak                     |
| **More**     | Exercise library · settings · units/theme · export/import                                |

Plus one full-screen, out-of-tab surface:

- **Active Session** — takes over the screen while training. A persistent bar shows it from any tab so you
  can never "lose" a running workout.

### The Active Session screen (the one that matters)

```
┌──────────────────────────────────────┐
│  Push A              42:10   [Finish]│
├──────────────────────────────────────┤
│  Bench Press            ⋮  3 of 4    │
│  ┌────────────────────────────────┐  │
│  │ W  20kg × 12          ✓        │  │   warm-up, greyed, excluded from math
│  │ 1  80kg ×  8          ✓        │  │
│  │ 2  80kg ×  8          ✓   PR   │  │
│  │ 3  [80] × [ 8]      [ Log ]    │  │ ← pre-filled, one tap
│  └────────────────────────────────┘  │
│  last time · 77.5kg × 8,8,7          │   ghost text, always visible
│  plates/side · 20 + 10 + 2.5         │   plate calculator
├──────────────────────────────────────┤
│  ▸ Incline DB Press    0 of 3        │
│  ▸ Cable Fly           0 of 3        │
│  + Add exercise                      │
├──────────────────────────────────────┤
│  ⏱  Rest  1:28  ────────────  [+30s] │   sticky, timestamp-driven
└──────────────────────────────────────┘
```

Rules baked into this screen:

- The next set row is **always pre-filled** from (a) the routine target, else (b) the same set index last
  time, else (c) the last set logged for that exercise.
- Numbers are edited with **steppers + a numeric pad sheet**, never the OS keyboard.
- "Last time" is visible without tapping anything. It's the single most-looked-at number in a gym app.
- Every tap persists immediately. There is no "save workout" step that can be lost.

---

## 4. Data model

Local-first in IndexedDB. Everything is a plain object with a string `id` (UUID v7 so ids sort by time).

```
Exercise
  id, name, muscleGroups[], equipment, movementType: compound|isolation
  trackingType: weight_reps | reps_only | time | distance_time
  defaultRestSeconds, notes, isCustom, archivedAt?

Routine                        // a training plan / template
  id, name, notes, accentColor, createdAt, updatedAt, archivedAt?

RoutineExercise
  id, routineId, exerciseId, order
  targetSets, targetRepsMin, targetRepsMax?, isAmrap
  targetWeight?: TargetWeight          // tagged union, see below
  restSeconds?, supersetGroup?, notes

Session                        // one actual workout
  id, routineId?, routineNameSnapshot?, name
  startedAt, endedAt?, status: active|completed
  notes, bodyweightKg?, perceivedEffort?

SessionExercise
  id, sessionId, exerciseId, order, restSeconds?, supersetGroup?, notes

SetEntry
  id, sessionExerciseId, setIndex
  weightKg?, reps?, durationSeconds?, distanceM?
  rpe?, type: normal|warmup|dropset|failure
  completedAt

PersonalRecord                 // ONLY from logged work — never from an estimate
  id, exerciseId, kind: max_weight|max_reps_at_weight|max_session_volume
  value, setEntryId, sessionId, achievedAt

BodyMeasurement                // v1.5
  id, date, weightKg?, bodyFatPct?, measurements{}

ExerciseMax                    // v1.5, powers percent-based targets
  id, exerciseId, trainingMaxKg, effectiveFrom

Settings                       // single row — one user per device, no profiles
  units: kg|lb              (default kg)
  theme: system|light|dark  (default system)
  weekStartsOn, defaultRestSeconds
  weeklySessionGoal         (drives the streak; streak can be disabled)
  showRpe                   (default off)
  barWeightKg               (default 20)
  plateInventory[]          (seeded, user-editable)
  schemaVersion
```

### Modelling decisions worth defending

**Sessions snapshot, they don't reference.** A `Session` copies what it needs from the routine
(`routineNameSnapshot`, the exercise list, the targets). Editing "Push A" next month must not retroactively
rewrite what you did in March. This is the single most common data-model bug in workout apps.

**Weight is always stored in kilograms.** `lb` is a display concern only. Storing as-entered plus a unit
flag means every aggregate (volume, 1RM, charts) has to convert at read time, and round-tripping
lb→kg→lb drifts. Display rounds to the nearest 0.5 kg / 1 lb increment.

**Warm-up sets are flagged, not deleted.** They're excluded from volume, PRs and 1RM estimates, but
they're real data about how you ramp.

**`trackingType` on the exercise** keeps planks and runs from forcing a nullable weight field into every
UI. v1 ships `weight_reps` and `reps_only` fully; `time` is supported in the model so adding it later
isn't a migration.

**A record is something you did, never something a formula inferred.** All three `PersonalRecord` kinds are
_observations_ of logged work: you put 140 kg on the bar, you got 9 reps at 100 kg, you moved 8,400 kg in a
session. An estimated 1RM is a model output, so it can never trigger a PR, never appear on the PR board,
and never fire a celebration. It exists purely as an analysis number on charts and set rows, always
labelled as an estimate. See [§4.1](#41-prs-are-observed-estimates-are-not) and
[Appendix A](#appendix-a--estimated-1rm).

Note that a genuine heaviest-single still works perfectly: log a 1-rep set and that's a `max_weight` record
like any other — because you actually lifted it.

**Target weights use a tagged union from day one.**

```ts
type TargetWeight =
  { kind: 'absolute'; kg: number } | { kind: 'percent'; pct: number; basis: 'training_max' } // declared now, future update
```

**v1 implements `absolute` only.** The `percent` variant is deferred to a future update, but the union is
declared immediately because the _shape_ is the expensive part, not the feature. Retrofitting it later
would mean a migration across every saved routine, a new branch in prefill resolution, a mode toggle in
the builder, and a snapshot-time computation in the session. Declaring it today costs one line and makes
the future update pure code.

(Related: `RoutineExercise.isAmrap` for `5+`-style sets is one boolean and ships in v1 alongside it.)

### 4.1 PRs are observed; estimates are not

|                          | Source         | PR?          | Where it shows                                                |
| ------------------------ | -------------- | ------------ | ------------------------------------------------------------- |
| **Max weight**           | logged set     | ✅           | set row badge, PR board, session summary                      |
| **Max reps at a weight** | logged set     | ✅           | set row badge, PR board, session summary                      |
| **Max session volume**   | logged session | ✅           | session summary, PR board                                     |
| **Estimated 1RM**        | Epley formula  | ❌ **never** | progress chart line, exercise detail — always prefixed `est.` |

This resolves a question the previous draft got wrong. It also makes the 12-rep cap on e1RM a _chart_
concern rather than a data-integrity one: a junk estimate can no longer fabricate a permanent record, it
can only put a spike in a trend line. The cap stays — the spike is still misleading — but the blast radius
is now small, which is the right place for a formula's uncertainty to live.

The user-facing consequence is a clean rule that's easy to state and easy to trust: **Gymmy only
congratulates you for work you actually did.**

---

## 5. Technical architecture

### Stack

| Concern     | Choice                                      | Why                                                                                                |
| ----------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Framework   | **React + TypeScript (strict)**             | Known quantity, best ecosystem for the chart/animation needs                                       |
| Build       | **Vite**                                    | Fast, first-class PWA plugin                                                                       |
| Routing     | **React Router**                            | File-light, nested layouts for the tab shell                                                       |
| Persistence | **Dexie (IndexedDB)** + `useLiveQuery`      | Reactive queries straight off the DB — the DB _is_ the state store, so no cache-invalidation layer |
| UI state    | **Zustand**                                 | Only for genuinely ephemeral state: rest timer, open sheets, numeric-pad target                    |
| Styling     | **Tailwind CSS** + CSS custom properties    | Tokens in CSS vars so light/dark is a variable swap, not a class fork                              |
| Primitives  | **Radix UI** (sheet, dialog, tabs, popover) | Accessibility for free; styling stays ours so the app doesn't look like a template                 |
| Animation   | **Framer Motion**                           | Spring layout animations on set rows, shared-element session transitions                           |
| Charts      | **Recharts**                                | Fast to build, enough control for the handful of charts needed                                     |
| Dates       | **date-fns**                                | Tree-shakeable, no timezone surprises                                                              |
| Schemas     | **Zod**                                     | Guards the import path and versions the export format                                              |
| Icons       | **lucide-react**                            |                                                                                                    |
| PWA         | **vite-plugin-pwa** (Workbox)               | Precache the shell, update prompt                                                                  |
| Tests       | **Vitest** + RTL, **Playwright**            |                                                                                                    |

### Layering

```
src/
  app/            router, tab shell, theme provider, error boundary
  features/
    session/       active session, set rows, numeric pad, plate calculator
    routines/      list, builder, superset grouping
    exercises/     library, filters, exercise detail
    history/       calendar, list, session detail/edit
    progress/      charts, PR board, volume
    settings/      units, theme, export/import
  db/              dexie schema + versioned migrations, seed data, repositories
  domain/          PURE functions: 1rm, volume, pr detection, unit conversion,
                   plate math, prefill resolution, streaks
  ui/              design-system components (Button, Card, Sheet, Stepper, Stat)
  lib/
    platform/      ADAPTERS: notifications, vibration, audio, file save/open,
                   storage persistence — one small module per capability
    timer, uuid, formatters
```

The rule that keeps this maintainable: **`domain/` is pure and has no imports from `db/` or React.** All
the logic worth being correct about — 1RM, PR detection, volume aggregation, unit rounding, plate
decomposition, what number to pre-fill — lives there and is unit-tested directly. UI components read via
`useLiveQuery` and call repository functions; they contain no math.

### Keeping the app-store door open

An eventual store presence doesn't change v1, but it does set two rules now.

**The intended path is Capacitor**, not a React Native rewrite. Capacitor wraps this exact codebase into
iOS/Android binaries and keeps 100% of the UI, the DB layer, and the design system. A React Native port
would mean rewriting every view (Tailwind classes don't cross over) for no user-visible gain. Capacitor
also _fixes_ the plan's weakest point: it gives real OS-level local notifications on iOS, so the rest
timer stops depending on PWA notification support.

**The cost today is one rule:** no component calls a web-only API directly. Notifications, vibration,
audio, file export and storage persistence all go through `lib/platform/*` adapters with plain interfaces.
Swapping a web implementation for a Capacitor plugin is then a one-file change per capability instead of a
hunt through the feature folders. This is also just better design for testing — the adapters stub trivially.

### Three things that need care

**1. The rest timer must survive backgrounding.**
A `setInterval` is dead the moment the phone sleeps or the browser tab is frozen. So: store the timer's
**absolute end timestamp** in persisted state, derive remaining time on every render and on
`visibilitychange`. A `setInterval` only drives the visual tick. Completion is signalled by a service-worker
notification scheduled against the timestamp, with an in-app sound + animated fallback.

**2. Active-session recovery.**
Every set log is an immediate IndexedDB write, and `Session.status === 'active'` is the recovery flag. On
launch, if an active session exists, Gymmy restores it (and offers to discard if it's stale by >8h).

**3. Export is a first-class feature, not a nice-to-have.**
With no cloud, the user's data lives in a browser storage bucket that iOS Safari will evict if the app
isn't installed and storage runs low. Mitigations: push the install prompt, ship JSON export/import in
M1 rather than at the end, version the export schema, and surface a gentle "last backup was 6 weeks ago"
nudge.

---

## 6. Design system — "soft & modern", light + dark

Both themes are first-class from day one; the token layer makes that nearly free.

**Color.** Semantic CSS variables only — components never name a raw color.
`--surface`, `--surface-raised`, `--surface-sunken`, `--border`, `--text`, `--text-muted`,
`--accent` / `--accent-fg`, `--success` (a logged set), `--pr` (a record), `--danger`.
One vivid accent carries the brand (indigo/violet direction), with a distinct green reserved _exclusively_
for "set completed" so the screen reads at a glance as "how much is done". Light theme is warm off-white
rather than pure `#fff`; dark theme is a soft near-black with raised surfaces, never pure `#000`.

**Type.** One geometric sans (Inter/Geist) for UI. Every number uses `font-variant-numeric: tabular-nums`
so values don't jitter as they change. Weights get a large display treatment — they are the hero data, not
labels.

**Shape & depth.** 16–20px card radii, pill buttons, layered low-opacity shadows in light mode and
border+surface-lift in dark mode (shadows read as mud on dark backgrounds).

**Motion.** 200–300ms springs. Layout animation when a set completes and the next row slides up. A
scale-and-check on log. A brief flare — not a 3-second confetti cannon — on a PR. All of it gated behind
`prefers-reduced-motion`.

**Touch ergonomics (gym-specific).**

- 44×44px minimum targets; the primary action sits in the bottom third of the screen.
- Bottom sheets instead of centre modals — reachable one-handed.
- Destructive actions need a swipe or a confirm; a fat-finger tap must never delete a set.
- A custom numeric pad, so weights can be entered without the OS keyboard eating half the screen.

**Accessibility.** AA contrast in both themes, full keyboard path (the app is also used on a laptop),
visible focus rings, labelled icon buttons, live-region announcements for timer completion.

---

## 7. Features

### v1 — locked scope

**The four pillars**

| Feature                   | Notes                                                                                                                            |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Set/rep logging**       | The spine. Weight × reps in kg, steppers + custom numeric pad, immediate persistence                                             |
| **Training plan builder** | Routines with target sets/reps/weight/rest per exercise, superset grouping, duplicate, reorder                                   |
| **Rest timer**            | Per-exercise defaults, auto-start on log, +30s / skip, background-safe, notification + vibration                                 |
| **History & progress**    | Calendar + list, editable session detail, per-exercise charts (top set, est. 1RM, volume), weekly volume by muscle group, streak |
| **Exercise library**      | ~80 seeded exercises with muscle group / equipment / movement type, filters, custom exercises, per-exercise history and PR board |

**The five that decide whether the app actually gets used** — all confirmed in v1:

1. **Previous-performance prefill + one-tap logging.** The next set row resolves its values through a
   fallback chain: routine target → same set index last session → last set logged for that exercise →
   empty. `last time · 77.5kg × 8,8,7` sits permanently under the exercise header, no tap required.
   This is _the_ feature; everything else is secondary. Lives in `domain/prefill.ts` as a pure function
   over the exercise's set history, so the chain is directly testable.

2. **Plate calculator.** Given a target weight, the bar weight and the plate inventory, show the plates
   per side (`140kg → 25 + 20 + 2.5`). Greedy decomposition in `domain/plates.ts`, and it must handle an
   _incomplete_ inventory honestly — if 140 isn't loadable it says so and offers the nearest loadable
   weight rather than lying. Doubles as the rounding function for percent-based targets in v1.5.

3. **Warm-up set marking.** One tap on a set row to flag it as warm-up. Rendered greyed and un-numbered,
   and excluded from volume totals, PR detection and e1RM. Without this your ramp-up sets drag every
   volume chart down and clutter the PR table.

4. **Optional RPE / reps-in-reserve.** A single collapsed field per set, off by default so it costs
   nothing visually, toggled on in settings. It's what makes autoregulated training loggable at all, and
   it feeds the v1.5 deload/overload logic.

5. **PR detection — from logged work only.** Three record kinds, all of them observations: max weight,
   max reps at a given weight, max session volume. Detected synchronously on log, flagged inline on the
   set row and collected in the session summary. **Estimated 1RM never triggers a PR** (§4.1) — a record
   is something you did, not something a formula says you could do. The celebration is a brief flare, not
   a three-second confetti cannon you have to sit through mid-workout.

**Also in v1** (smaller, but each closes a real gap)

6. **Empty / freestyle workout.** Start with nothing and add exercises as you go.
7. **Fully editable history.** Backfill a forgotten session, fix a typo'd weight.
8. **JSON export + import, CSV export.** The backup story for a no-account app, and a trust signal.
   Also the only way to move to a new device — see §10.
9. **Session summary screen.** Duration, total volume, PRs, vs. last time — and a shortcut to adjust the
   routine while it's fresh.
10. **Persistent active-session bar.** Visible from every tab so a running workout is never lost.

### 11. The explain-the-math layer

Gymmy derives a lot of numbers the user didn't type: estimated 1RM, volume, weekly volume by muscle
group, streaks, plate splits, prefilled weights, PR thresholds. Every one of those is a small act of
trust. A number with no explanation is either taken on faith or quietly ignored — and the moment a user
suspects a metric is wrong, they stop believing all of them.

So **every derived number in the app is explainable in one tap**, and the explanations are honest about
limits rather than marketing the formula.

**Pattern.** Each derived value carries a small ⓘ affordance opening a bottom sheet with four parts, in
this order:

1. **What it is** — one plain sentence, no jargon. _"An estimate of the heaviest weight you could lift
   once, worked out from a set you actually did."_
2. **How it's worked out** — the formula, written readably, plus a worked example **using the user's own
   set**: `100 kg × 5 → 100 × (1 + 5 ÷ 30) = 117 kg`. Their numbers, not invented ones.
3. **Why it's useful** — what decision it helps with. _"It's the only way to compare sets with different
   weights and reps: it says 100 kg × 5 beat 90 kg × 8."_
4. **Where it breaks down** — the caveats, stated plainly. _"Above 12 reps it stops being meaningful, so
   Gymmy shows nothing. And it never counts as a personal record — records are only for weight you
   actually lifted."_

**Plus a reference page** under More → _"How Gymmy works out your numbers"_, listing every metric with
the same four-part treatment. Reachable directly, not only through contextual sheets, so it can be read
once out of curiosity rather than discovered one tooltip at a time.

**Architecture — the explanation ships with the function.** Each module in `domain/metrics/` exports its
calculation _and_ its explainer metadata together:

```ts
export const estimatedOneRepMax: Metric<{ weightKg: number; reps: number }> = {
  id: 'est_1rm',
  label: 'Estimated 1RM',
  shortLabel: 'est. 1RM',
  compute: ({ weightKg, reps }) => /* … */,
  formula: 'weight × (1 + reps ÷ 30)',
  explainer: { whatItIs: '…', whyUseful: '…', caveats: ['…'] },
  example: (input) => /* worked example from the user's real numbers */,
}
```

The explainer sheet is one generic component rendering any `Metric`. This matters because it makes drift
structurally impossible: changing the 12-rep cap in the function means editing the file that holds the
sentence describing the cap. Documentation that lives in a separate content folder always ends up lying
eventually.

**Metrics needing an explainer in v1:** estimated 1RM · volume (per set, exercise, session) · weekly
volume by muscle group · each PR kind and what disqualifies a set · why warm-up sets are excluded ·
the RPE scale · streak definition · plate decomposition · the prefill fallback chain · kg↔lb rounding.

**Two of these are education, not just transparency.** The **RPE scale** needs explaining because most
people genuinely don't know it (RPE 8 = two reps left in the tank), and an unexplained 1–10 field gets
filled in randomly, poisoning every feature built on it. And **warm-up exclusion** needs explaining
because a user who doesn't know their warm-ups are excluded will think the volume chart is broken.

**Restraint:** no first-run tutorial, no modal wall. The affordance is a quiet ⓘ, with a single subtle
one-time hint the first time a derived number appears. Explanations are pulled, not pushed.

### 12. Goals — shipped post-v1

Two goals, deliberately only two, and neither of them scores you.

**Session volume goal — per routine.** A tagged union on `Routine`, same shape as `TargetWeight`:
`beat_last` (the default offered) or `absolute`. `beat_last` leads because it self-calibrates — it needs
no number from the user and cannot go stale as they get stronger; `absolute` exists for a deload or a
programme that names a figure.

Three constraints make it honest:

- **Snapshotted onto the session at start**, exactly like the name and the targets. Raising the goal in
  November must not retroactively turn a session beaten in March into a miss.
- **"Previous" means the session before this one**, not the latest — scoped by `startedAt`, so an old
  summary reads the same next year as it does today.
- **The first run of a routine has no target.** Not a zero, not an invented figure: the summary says so
  in words. Same stance as a 1RM estimate above 12 reps showing a dash.

Shown on the **session summary only** — not during the workout, where a volume counter would invite
padding the session to make a number move. Neutral on hit or miss: a deload week _should_ come in lower.

**Weekly hard sets per muscle.** Counted rather than weighed, because volume in kilograms is gameable —
ten light sets beat five hard ones on the total while doing less. A set is a set whatever is on the bar,
and it is also the unit most training research uses. Working sets only, credited to the exercise's
primary mover, matching how weekly volume attributes.

Targets live in `Settings.weeklySetTargets` and **start empty**. Seeding fourteen muscles with a default
would be Gymmy asserting what someone's training ought to look like. Ten sets is _offered_ when a muscle
is added and nowhere else; the explainer says plainly that it is a heuristic.

Neither field needed a migration: absent is the correct value for every row written before they existed.

### v1.5 — next, once the loop is proven

- **Weekly program scheduler** — assign routines to weekdays, "what's today?" on the Today tab.
- **Percent-of-max targets** _(deferred by decision — v1 is absolute weights only)_ — implement the
  `percent` variant of `TargetWeight` plus `ExerciseMax`, unlocking 5/3/1-style programming: edit one
  training max, the whole cycle re-weights itself and rounds to loadable plates. The union is declared in
  v1, so this is code-only with no migration. Note the basis is a user-entered **training max**, not an
  estimated 1RM — consistent with §4.1, program weights shouldn't be driven by a formula's guess.
- **Time- and distance-based tracking** — planks, carries, cardio. `trackingType` already allows for it in
  the model; this is the UI plus the set-row variants.
- **Progressive overload suggestions** — "you hit 3×8 @ 80kg; try 82.5kg" from a configurable rule
  (double progression / linear / RPE-based). Suggestion only, never forced.
- ~~**Volume targets per muscle group** with a weekly under/over indicator.~~ **Shipped post-v1**, as
  _hard sets_ per muscle rather than volume in kilograms — see §7.12. Set counts cannot be run up with
  light junk sets the way a kilogram total can.
- **Body weight & measurements** with a weight trend line, local-only progress photos.
- **Rest-day and session reminders** via scheduled notifications.
- **Workout templates gallery** — a few starter plans (PPL, upper/lower, 5/3/1) as seed routines.

### v2 — bigger bets, deliberately deferred

- **App-store release via Capacitor.** Wrap the same codebase; gains real iOS local notifications for the
  rest timer and removes the IndexedDB-eviction risk entirely. The `lib/platform/*` adapters shipped in v1
  are what make this cheap.
- **Cloud sync + accounts.** The local-first model means this is additive: same UI, a sync adapter behind
  the repositories. Worth doing only once you want multi-device — note this is also the point at which
  "one user per device" stops being an assumption.
- **Apple Health / Google Health Connect** workout export.
- **Shareable session card** rendered to an image.
- **Deload detection** from volume/RPE trends.
- **Watch companion** — big ask, big payoff for rest timers.
- **Exercise demo media.** Note: decent exercise animations are a licensing cost, not a coding task.
  Budget for it or skip it.

---

## 8. Milestones

Each milestone ends with something you can actually train with.

**M0 — Foundations.** Vite + TS strict, lint/format, Tailwind + token layer, light/dark with system
following, tab shell + routing, Dexie schema v1 with versioned migrations, seeded exercise library,
seeded plate inventory + bar weight, settings (units/theme/rest/plates), `lib/platform/*` adapter
interfaces, the `Metric` type + generic explainer sheet, base UI kit (Button, Card, Sheet, Stepper, Stat,
NumericPad, InfoAffordance).

**M1 — Core logging.** _Shippable: you can log a real workout._ Empty workout, add/reorder exercises, set
rows, **prefill resolution (#1)**, complete/edit/delete sets, **warm-up flag (#3)**, **RPE field (#4)**,
finish session, active-session recovery, persistent session bar, **JSON export/import (#8)**. Explainers
for every metric introduced here (prefill, volume, warm-up exclusion, RPE) ship _with_ their functions —
a metric without its explainer is not done.

**M2 — Rest timer.** Timestamp-driven state, per-exercise defaults, auto-start, +30s/skip, sticky bar,
notification via the platform adapter, vibration, in-app audio fallback.

**M3 — Routines + plates.** Builder with targets (`absolute` variant), AMRAP flag and superset groups,
duplicate/reorder/archive, start-from-routine with snapshotting, targets feeding the prefill chain,
**plate calculator (#2)** on the set row and in the builder.

**M4 — History & progress.** Calendar + list, editable session detail, **session summary (#9)**,
**PR detection across the three observed record kinds (#5)**, PR board, per-exercise charts (top set /
est. 1RM / volume), weekly volume by muscle group, streak. Estimated 1RM appears here for the first time —
as a chart line and a labelled `est.` value only, wired to nothing in the PR path.

**M5 — Polish & PWA.** Install prompt, offline verification, empty/loading/error states, animation pass,
accessibility audit, CSV export, backup-age nudge, the **"How Gymmy works out your numbers" reference
page (#11)**, Playwright coverage of "log a full workout offline", performance pass on long histories.

### Test focus

Unit tests concentrate on `domain/`:

- **e1RM** — Epley across 1–12, the `reps === 1` special case, and `null` above 12.
- **PR detection** — warm-up sets excluded; dropsets; ties (a tie is not a PR); first-ever set for an
  exercise; and a guard test asserting that **no estimated value can ever produce a `PersonalRecord`**,
  including the 20-rep burnout set that would historically have faked one.
- **Explainers** — every `Metric` in `domain/metrics/` has non-empty explainer copy and a working example
  function. A single test iterating the registry prevents a metric shipping undocumented.
- **Plate decomposition** — exact loads, unloadable targets, an incomplete inventory, non-standard bar.
- **Prefill chain** — each fallback tier, and an exercise with no history at all.
- **Volume aggregation** and **kg↔lb display rounding**.

One Playwright flow proves the critical path end-to-end with the network off: start a routine, log every
set, trigger a rest timer, hit a PR, finish, confirm it lands in history after a reload.

---

## 9. Risks

| Risk                                                                                                                                         | Mitigation                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **iOS PWA notification limits** — background notifications need iOS 16.4+ _and_ the app installed; the Vibration API doesn't exist in Safari | Install prompt, in-app countdown that's correct on resume, audio + visual fallback; never make the timer depend on notifications. Permanently solved by the Capacitor build |
| **IndexedDB eviction** on iOS when uninstalled / low storage                                                                                 | Push install, ship export in M1, backup-age nudge, `navigator.storage.persist()`. Also solved by the Capacitor build                                                        |
| **Single user per device has no device-migration path**                                                                                      | Export/import _is_ the migration path — so it must be complete (every table, round-trip tested), not a partial dump                                                         |
| **Explainer copy drifting from the math** it describes                                                                                       | Explainer text lives in the same module as the function (§7); a registry test fails the build if any metric lacks copy or an example                                        |
| **Explanations becoming clutter** on a screen used between sets                                                                              | Pull, not push: a quiet ⓘ and one first-time hint. No tutorials, no modals, nothing that must be dismissed mid-workout                                                      |
| **Schema churn** as features land                                                                                                            | Dexie versioned migrations from day one; `schemaVersion` in every export; migration tests                                                                                   |
| **Unit-conversion drift**                                                                                                                    | Canonical kg, conversion only at the display boundary                                                                                                                       |
| **Over-modelling programs in v1**                                                                                                            | Routines only in v1; the weekly scheduler is v1.5 and sits _on top_ of routines                                                                                             |
| **Session screen complexity creep**                                                                                                          | Hard rule: nothing enters that screen unless it's needed between two sets                                                                                                   |
| **Chart performance** on a multi-year history                                                                                                | Pre-aggregate per session on write; charts read summaries, not raw sets                                                                                                     |

---

## 10. Locked decisions

| #   | Decision                                                          | Consequences                                                                                                                                                                                                                                                                                                                    |
| --- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Kilograms by default**                                          | `kg` is both the canonical storage unit and the default display unit. Steppers increment 2.5 kg (weight) / 1 rep. `lb` stays available in settings as a display conversion, rounded to 1 lb. Plate calculator uses metric plates.                                                                                               |
| 2   | **Plate inventory seeded, fully editable**                        | Seed a standard metric gym: 20 kg bar; pairs of 25, 20, 15, 10, 5, 2.5, 1.25 kg. Settings exposes bar weight and per-plate counts, so a home gym with three plate pairs gets correct math. Decomposition must handle an incomplete set — it reports the nearest loadable weight rather than inventing plates.                   |
| 3   | **Weight-based training only in v1**                              | Ship `weight_reps` and `reps_only` tracking fully. `trackingType` keeps `time` and `distance_time` in the model and the DB schema so adding them in v1.5 is UI work, not a migration. No cardio, no distance, no interval timers in v1.                                                                                         |
| 4   | **Absolute target weights only; percentages are a future update** | `TargetWeight` is declared as a tagged union from day one (§4), but v1 implements and exposes `absolute` only — no percent UI, no training-max concept, no `ExerciseMax` table. `isAmrap` ships in v1 since it's one boolean. The union declaration is the entire hedge: the future update becomes code with no data migration. |
| 5   | **One user per device, no profiles**                              | No `userId` on any record; `Settings` is a single row. Simplifies every query and the whole UI. The cost: **export/import is the only device-migration path**, so it must cover every table and be round-trip tested (see §9).                                                                                                  |
| 6   | **App store eventually, via Capacitor**                           | Doesn't change v1 features, but it sets the architectural rule in §5: every platform capability goes behind a `lib/platform/*` adapter. No React Native port — Capacitor reuses the entire UI, and it eliminates both the iOS notification and IndexedDB-eviction risks when it lands.                                          |
| 7   | **Estimates never produce records**                               | `PersonalRecord` has three kinds, all observations of logged work (§4.1). Estimated 1RM is analysis-only: chart line and labelled `est.` value, excluded from the PR path by construction and by a guard test. A logged 1-rep set still sets a normal `max_weight` record.                                                      |
| 8   | **Every derived number is explainable in-app**                    | A `Metric` carries its calculation _and_ its explainer copy, formula and worked-example function in one module (§7). Contextual ⓘ sheets plus a reference page under More. A registry test fails the build if a metric ships without copy.                                                                                      |
| 9   | **Goals report, they never score**                                | A missed volume goal is a number beside another number — no red state, no failure copy, no broken streak (§7.12). Hitting an `absolute` target exactly counts; `beat_last` requires strictly beating it, because that is what the words say. And a goal is never invented: no previous session means no target, said in words.  |
| 10  | **Weekly targets are counted in sets, not kilograms**             | Volume totals are gameable by adding light sets; a set counts once whatever the load. Credited to the primary mover, warm-ups excluded. Targets start unset — ten is offered as a heuristic when a muscle is added, never seeded across the board.                                                                              |

---

## Appendix A — Estimated 1RM

**What it is.** The 1RM is the heaviest weight you could lift for exactly one rep. Nobody tests it often —
it's risky and it wrecks the rest of the session — so it's _estimated_ from an ordinary working set. That
estimate is the best single progress metric available, because it's the only way to compare sets with
different weights and reps: it answers "was 100 kg × 5 better than 90 kg × 8?" (yes — 117 vs 114).

**Formula.** Epley: `e1RM = weight × (1 + reps / 30)`, with two rules.

**Rule 1 — `reps === 1` returns the weight unchanged.** Plain Epley gives `w × 1.033` at one rep, so a
100 kg single would "prove" a 103 kg max. An actual single _is_ the measurement; don't inflate it.

**Rule 2 — no estimate above 12 reps.** Return `null`, display `—`.

| Set         | Epley says | Reality    |
| ----------- | ---------- | ---------- |
| 100 kg × 3  | 110 kg     | sound      |
| 100 kg × 5  | 117 kg     | sound      |
| 100 kg × 10 | 133 kg     | borderline |
| 100 kg × 20 | **167 kg** | fantasy    |
| 100 kg × 30 | **200 kg** | fantasy    |

The formula is a straight line fitted to data in roughly the 1–10 rep range. Past ~12 reps the limiting
factor stops being maximal strength and becomes muscular endurance, breathing and pain tolerance — and
that relationship varies enormously between people and between exercises. Nobody who benches 100 kg × 20
can bench 167 kg.

**What the cap protects, now that estimates can't set records.** The original worry was a fake PR: squat
140 kg × 3 → e1RM 154 kg (true), then a light burnout set of 100 kg × 20 → e1RM 167 kg, and the app
congratulates you for a lift you cannot perform — permanently, since every real PR afterward then reads as
a regression.

The §4.1 decision kills that outright: **estimates never produce records**, so there is nothing to
fabricate. What remains is narrower — a 167 kg spike in the e1RM trend line, which still misleads when
you're eyeballing the chart for whether training is working. That's worth preventing, so the cap stays,
but it's now a presentation safeguard rather than a guard on stored data. Uncertainty confined to a chart
line is uncertainty in the right place.

**High-rep sets are not discarded.** A 20-rep set still counts toward max-weight PRs, reps-at-weight PRs,
session and weekly volume, and the volume series on the chart. It just doesn't get an e1RM number
attached, and it was never going to claim a record.

**On alternative formulas.** Brzycki (`w × 36 / (37 − reps)`) has the nicer property of returning exactly
`w` at one rep, but degrades _worse_ at high reps — 2.1× the weight at 20 reps, 5.1× at 30, and a division
by zero at 37. Capping is required whichever formula is chosen, so Gymmy uses Epley with the special case.
It lives in `domain/metrics/one-rep-max.ts` as a pure function bundled with its explainer, so swapping or
blending formulas later is a single-file change with the test suite already in place — and the user-facing
explanation updates in the same edit.

---

## Appendix B — Draft explainer copy

First-pass user-facing text for the ⓘ sheets and the reference page (§7). Written to be read between sets:
short sentences, no jargon, caveats included rather than buried. `{…}` interpolates the user's real data.

### Estimated 1RM

> **What it is** — An estimate of the heaviest weight you could lift for a single rep, worked out from a
> set you actually did. You never have to test a true max to track it.
>
> **How it's worked out** — `weight × (1 + reps ÷ 30)`, a formula called Epley.
> Your set: `{100} kg × {5} → {100} × (1 + {5} ÷ 30) = {117} kg`.
>
> **Why it's useful** — It's the only fair way to compare sets that look nothing alike. Was 100 kg × 5
> better than 90 kg × 8? Estimated 1RM says yes: 117 vs 114. That's what the trend line tracks.
>
> **Where it breaks down** — It's reliable up to about 10–12 reps. Past that you're limited by endurance
> rather than strength, and the formula starts returning fantasy numbers, so Gymmy shows nothing above 12
> reps. It also **never counts as a personal record** — records are only for weight you genuinely lifted.

### Personal records

> **What it is** — Your best-ever logged performance on an exercise, in three flavours: heaviest weight,
> most reps at a given weight, and biggest total volume in one session.
>
> **How it's worked out** — Compared against every set you've logged for that exercise. Warm-up sets don't
> count. A tie isn't a record — you have to beat it.
>
> **Why it's useful** — It's the clearest signal that training is working, and it's a fact rather than an
> interpretation.
>
> **Where it breaks down** — Records come only from work you logged. Gymmy won't award you a record based
> on an estimate of what you _could_ lift, so your estimated 1RM going up is not a PR. If you forgot to
> log something, add it from History and records recalculate.

### Volume

> **What it is** — The total weight you moved: `sets × reps × weight`, added up.
>
> **How it's worked out** — Each set contributes `reps × weight`.
> This session: `{8,420} kg across {24} sets`.
>
> **Why it's useful** — Volume is the main driver of muscle growth, and it catches progress that your top
> set misses: same weights, more sets, more total work.
>
> **Where it breaks down** — It treats all weight as equal, so it says a heavy squat session and a long
> dumbbell session are comparable when they aren't really. Use it to compare a lift against _itself_ over
> time, not across different exercises. Warm-up sets are excluded.

### Why warm-up sets don't count

> Sets you mark as warm-ups are kept in your history but left out of volume totals, personal records and
> estimated 1RM. Otherwise ramping up with the empty bar would drag your volume chart down and clutter
> your records with weights you weren't trying hard on. They're still visible in the session so you can
> see how you worked up to your top set.

### RPE (how hard the set was)

> **What it is** — A 1–10 rating of effort, where 10 means you could not have done another rep.
>
> **How to use it** — Count the reps you had left:
> **10** — nothing left · **9** — 1 more rep · **8** — 2 more · **7** — 3 more · **6 or less** — easy, more
> than 3 left.
>
> **Why it's useful** — The same weight is a different workout on a bad night's sleep. RPE records how
> hard it actually felt, which is what tells you whether to push or hold next session.
>
> **Where it breaks down** — It's a judgement call and most people underrate how close to failure they
> were. It gets more accurate with practice. It's optional — leave it blank and nothing breaks.

### Plates per side

> **What it is** — Which plates to load on each side of the bar to reach your target weight.
>
> **How it's worked out** — Subtract the bar ({20} kg), halve what's left, then take the largest plates
> first from the plates you own.
> `{140} kg → {25 + 20 + 2.5} per side`.
>
> **Why it's useful** — Saves doing arithmetic with a loaded bar waiting and your heart rate up.
>
> **Where it breaks down** — Only uses plates you've told Gymmy you have, in Settings. If a weight can't
> be made exactly, Gymmy says so and offers the nearest weight you _can_ load instead of guessing.

### Pre-filled weights and reps

> **What it is** — The numbers already in a new set row before you touch it.
>
> **How it's worked out** — In order: your routine's target for that set; then whatever you did for that
> same set last session; then your most recent set of that exercise; then blank.
>
> **Why it's useful** — Most sets repeat last week's numbers, so logging becomes one tap. The
> `last time` line under the exercise always shows what you actually did, so you can see what you're
> matching.
>
> **Where it breaks down** — It's a starting point, not a recommendation — Gymmy isn't telling you to lift
> that. Change it freely; editing never affects past sessions.

### Streak

> **What it is** — How many weeks in a row you've hit your training target.
>
> **How it's worked out** — Counted in **weeks**, not days, against the weekly session goal in Settings.
> The current week doesn't break the streak until it's over.
>
> **Why it's useful** — Consistency over months beats any single session, and weeks are the honest unit —
> rest days are part of training, not a failure.
>
> **Where it breaks down** — It's motivation, not data. Losing a streak to illness or a deload means
> nothing about your training. It can be switched off in Settings.
