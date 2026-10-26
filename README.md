# Gymmy

A gym buddy app. Log your sets and reps fast, build your own training plans, and watch the
numbers go up.

> **Status: planning.** No implementation yet. The full design lives in
> **[docs/PLAN.md](docs/PLAN.md)**.

## What it is

Gymmy is judged on one interaction: you finish a set, and you tell Gymmy about it. If that takes
more than a single tap when nothing changed from last week, the app has failed — people stop
logging, and every other feature becomes worthless because the data dries up.

Priority order, in order:

1. **Logging a set is instant** — pre-filled from last time, one tap, no keyboard, no network.
2. **Never lose data** — survives the app being killed mid-workout, offline, on a dying battery.
3. **Show progress** — the reason to keep logging is seeing the numbers go up.
4. **Planning serves logging** — a routine exists to pre-fill a session, not to be admired.

## Planned for v1

- **Set/rep logging** with previous-performance prefill and one-tap confirm
- **Training plan builder** — reusable routines with target sets/reps/weight/rest, supersets
- **Rest timer** that survives the phone sleeping
- **History & progress** — editable session history, per-exercise charts, weekly volume
- **Exercise library** — seeded catalog plus your own custom exercises
- **Plate calculator** driven by the plates you actually own
- **Personal records** from logged work only — never from an estimate
- **In-app explanations** for every number Gymmy works out for you
- **JSON/CSV export and import** — your data stays yours

## Principles

**Records are things you did.** Estimated 1RM is shown as analysis, never as an achievement.
Gymmy only congratulates you for work you actually logged.

**Every derived number is explainable in one tap.** Formula, a worked example using your own
set, and an honest note on where it breaks down.

**Local-first.** Your training history lives on your device. No account, no server, works with
no signal in the basement of a gym.

## Stack

Installable PWA — React + TypeScript + Vite, Dexie (IndexedDB), Tailwind CSS, Framer Motion,
Recharts. Native app-store builds later via Capacitor.

## Repository layout

```
docs/PLAN.md     the full application plan — product, data model, architecture, milestones
```

## License

TBD.
