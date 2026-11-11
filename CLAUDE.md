# Working on Gymmy

Conventions that are not obvious from the code. The product reasoning lives in
[docs/PLAN.md](docs/PLAN.md); this file is about how to work in the repo.

## Branching — `dev` by default, `main` ships

**Do all development on `dev`. Merge to `main` only at milestone boundaries.**

`main` is Cloudflare's production branch, so every push to it deploys. Pushing
at normal working frequency spams deployments for changes nobody is looking at
yet.

- Work on `dev` and commit there as granularly as usual.
- Merge `dev` → `main` when a milestone is genuinely done: `npm run check`
  green, production build passing, screens visually verified.
- Nothing goes straight to `main`, including doc-only changes.

```bash
git checkout dev          # before starting anything
npm run check             # typecheck + lint + tests
git merge dev             # from main, only at a milestone
```

## The rule that keeps the codebase honest

**`src/domain` is pure.** No React, no Dexie, no DOM — enforced by an ESLint
rule, not by convention. Every calculation worth being correct about lives
there and is unit-tested with nothing mounted and no database opened.

If something in `domain/` needs data, the caller fetches it and passes it in.

## Metrics ship with their own explanation

Each module in `src/domain/metrics/` exports its calculation **together with**
its explainer copy, formula, and worked-example function. A registry test fails
the build if any entry ships without copy.

This is structural, not stylistic: changing the 12-rep cap on estimated 1RM
means editing the file that also holds the sentence describing that cap, so the
user-facing explanation cannot drift from the maths.

## Invariants worth knowing before you change things

- **Records are observations.** Only three kinds, all from logged work.
  An estimated 1RM can never produce a record — there are tests asserting this
  specifically, and they are not incidental.
- **Sessions snapshot their routine.** Name, order, rest, targets and the volume
  goal are copied at start. Editing a routine must never rewrite training
  history — including turning a session you beat into one you missed.
- **History outranks the plan, on weight.** A routine is a group of exercises
  with some useful defaults attached: it seeds an exercise with no history and
  then gets out of the way, because what you can lift is a fact about your
  training rather than a number somebody typed once. Reps are the other way
  round — the plan leads there. A ladder (`setPlan`) contributes the *shape* of
  an exercise, never the absolute numbers: it is shifted by whatever you
  changed on set one, exactly as a ramp from last session is.
- **A ladder always travels with the summary it implies.** `targetSets`,
  `targetRepsMin/Max` and `isAmrap` are rewritten from `setPlan` on every
  write, never by a caller, which is why the ribbon, the session header and
  the weekly set counts never had to learn ladders exist. A ladder whose rungs
  are identical is not stored — that is straight sets.
- **A swap carries the shape, never the load.** Replacing an exercise
  mid-session keeps its place, its superset group and its rep prescription;
  absolute weights are stripped, because 80 kg of bench press is not 80 kg of
  dumbbell press and prefill's plan tier would offer it as your opening set.
  **Sets travel with the row**, which is a decision about history and not only
  about convenience: two sets logged on the bench become two sets of whatever
  you swapped to, in the volume split, the charts and the records path. It was
  made deliberately — the alternative, stranding them under an exercise you are
  no longer doing, reads as an add rather than a swap.
- **Goals report, they do not score.** A missed volume goal is a number beside
  another number: no red state, no failure copy, no broken streak. And a goal is
  never invented — the first run of a routine has nothing to beat, so it shows
  no target rather than a guess.
- **Weight is stored in kilograms, always.** Pounds are a display concern,
  converted at the boundary and nowhere else.
- **A share code carries a plan, never history.** Routine, targets, rest,
  supersets, notes — and nothing else, ever. No sets, no records, no body
  weight, no settings, and nothing device-local such as a `barId` or a
  `machineWeightKg`. Adding a field to the payload is a decision about what
  leaves someone's phone.
- **A set's `weightKg` is the total load.** Plates plus the bar, and what you
  added plus what the machine weighs. The session screen converts at the input,
  nothing downstream knows the difference, and the split is snapshotted onto
  the session so re-measuring a machine cannot rewrite how history reads.
- **Derived targets are previewed before they are written.** Saving a session
  as a routine and importing a code both show the exact rows they will write,
  which is why the repositories expose a draft/plan step separately from the
  write. Keep them that way rather than deriving twice.
- **Every write lands immediately.** There is no save step that can be lost.
- **Records are recomputed, never incrementally patched**, and their ids are
  derived from (exercise, kind, weight) so rebuilds are stable.

## Verification

`npm run check` is typecheck + lint + tests. **It is not enough on its own** —
several milestones' worth of real bugs were invisible to a green suite and
obvious the moment the app was rendered or measured.

Everything below needs a build and a server first:

```bash
npm run build
npx vite preview --port 4317 --strictPort &
```

| Command               | What it catches                                                                                                                                                                           |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run shots`       | Every screen in both themes into `.shots/`, plus console errors. Also asserts at iPhone dimensions that the document does not scroll and the tab bar is pinned — a bug that shipped once. |
| `npm run a11y`        | axe-core across 9 screens × 2 themes. Found four genuine contrast failures the first time it ran. `--verbose` for the failing nodes.                                                      |
| `npm run e2e:offline` | The whole critical path with the network off: log a workout, kill the app, recover, finish, see records. This is the claim the architecture exists to support.                            |

Look at the screenshots. The scripts catch mechanical faults; they cannot tell
you a layout reads badly.

## Deployment

Cloudflare **Workers static assets**, not classic Pages. SPA fallback is
configured in `wrangler.jsonc` through
`assets.not_found_handling: "single-page-application"`.

Do not add a `public/_redirects` with `/* /index.html 200` — Cloudflare rejects
it as an infinite loop, correctly, because the rewrite normalises
`/index.html` back to `/` and re-matches `/*`. (Netlify does accept it, if the
host ever changes.)

Validate deploy config with `wrangler deploy --dry-run` locally rather than
finding out on the build server.
