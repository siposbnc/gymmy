import { plannedSetAt } from '../set-plan'
import type { PlannedSet, SetEntry, TargetWeight } from '../types'
import { formatWeight } from '../units'
import type { Metric } from './types'

/** The minimum a set needs to expose for prefill to reason about it. */
export type PrefillSet = Pick<SetEntry, 'type' | 'weightKg' | 'reps' | 'setIndex'>

/** Which tier of the chain produced the values. Drives nothing but honesty. */
export type PrefillSource =
  | 'ramp_last_time'
  | 'carried_forward'
  | 'routine_target'
  | 'same_set_last_time'
  | 'last_set_ever'
  | 'empty'

export interface PrefillInput {
  /** Which set is being filled, 1-based among working sets. */
  readonly setIndex: number
  /** Working sets already logged for this exercise in THIS session. */
  readonly currentSessionSets?: readonly PrefillSet[] | undefined
  /** Working sets from the most recent previous session of this exercise. */
  readonly previousSessionSets?: readonly PrefillSet[] | undefined
  /** The routine's target, when the session came from a plan. */
  readonly target?:
    | {
        readonly weight?: TargetWeight | undefined
        readonly reps?: number | undefined
        /**
         * A weight and a rep count per set, when the plan is a ladder.
         *
         * Indexed by `setIndex`. A ladder and a flat `weight` never coexist —
         * the repository drops one when it writes the other — so there is
         * exactly one answer to what the plan asks of a given set.
         */
        readonly plan?: readonly PlannedSet[] | undefined
      }
    | undefined
}

export interface PrefillResult {
  readonly weightKg?: number
  readonly reps?: number
  readonly source: PrefillSource
}

const isWorking = (set: PrefillSet) => set.type !== 'warmup'

/** Float dust: 62.5 − 60 must be 2.5, not 2.5000000000000036. */
const round = (value: number) => Math.round(value * 1000) / 1000

/**
 * A routine's ladder, in the shape {@link resolveClimb} reads.
 *
 * Percent rungs contribute no weight for the same reason a percent target
 * does: they need a training max this module has no business knowing about.
 * Their reps still count, so a ladder of percentages still shapes the reps.
 */
function plannedShape(plan: readonly PlannedSet[] | undefined): Rung[] {
  return (plan ?? []).map((rung, index) => ({
    setIndex: index + 1,
    ...(rung.weight?.kind === 'absolute' ? { weightKg: rung.weight.kg } : {}),
    reps: rung.reps,
  }))
}

/** A climb, as this function cares about it: an indexed list of loads. */
interface Rung {
  readonly setIndex: number
  readonly weightKg?: number | undefined
  readonly reps?: number | undefined
}

/**
 * Repeat the shape of a climb, shifted to match today's first set.
 *
 * Almost nobody takes every working set at one weight. A climb — 60×10, 70×8,
 * 80×6 — is the normal shape of a working exercise, and without this the
 * carry-forward tier offers 60 for set two because 60 is what you just did,
 * which means re-typing the whole climb every set of every session forever.
 *
 * So: set two prefills from the climb's set two, plus whatever you have
 * already added to set one today. Push the opening set to 62.5 and the rest
 * follows — 72.5, 82.5 — with no further taps.
 *
 * **The shape comes from either of two places, and the rule is the same for
 * both**: last session's working sets, or a ladder written into the routine.
 * That is deliberate. A written ladder would otherwise lose to carry-forward
 * from set two onward and only ever work for the opening set, and a routine
 * that is right once and stale afterwards is the thing this app is trying not
 * to be. Taking the shape but not the absolute numbers is what lets the plan
 * describe how an exercise is *built* without overruling what you can lift.
 *
 * Four refusals keep it from guessing:
 *
 * **Set one is never touched.** The shift is measured from the opening set, so
 * that one has to be the user's own number.
 *
 * **Straight sets are left alone.** If the shape is 80/80/80 there is nothing
 * to repeat and carry-forward is already right.
 *
 * **The shift must be smaller than the climb's own smallest step.** This is the
 * one rule doing real work, and it is parameter-free — measured from the climb
 * rather than from a constant. Open 60/70/80 at 62.5 and a 2.5 kg shift is
 * unmistakably "the same climb, heavier". Open it at 80 and the 20 kg shift is
 * the width of a rung: far likelier that you have abandoned the climb and are
 * taking straight sets at the top, so this stays out of the way.
 *
 * **Today has to still match the shape.** Every set logged so far must sit at
 * its counterpart plus the same offset. Deviate anywhere and the climb is no
 * longer what you are doing, so it goes quiet for the rest of the exercise.
 *
 * It answers for the reps too, which no other tier of its kind does. A climb's
 * rep counts move with its weights, so answering for the weight alone would
 * offer the next rung at the rep count of the lighter one.
 *
 * Note what this is not: progression advice. It repeats a shape and follows
 * where you move; it never adds weight of its own. That decision belongs to
 * `suggestProgression`, deliberately kept separate and switchable off.
 */
function resolveClimb(
  setIndex: number,
  shape: readonly Rung[],
  currentWorking: readonly PrefillSet[],
): { weightKg: number; reps: number | undefined } | undefined {
  if (setIndex <= 1) return undefined

  const at = (index: number) => shape.find((set) => set.setIndex === index)
  const rung = (index: number) => at(index)?.weightKg

  const target = rung(setIndex)
  if (target == null) return undefined

  const weights = shape
    .map((set) => set.weightKg)
    .filter((weight): weight is number => weight != null)
  if (weights.length < 2) return undefined
  if (weights.every((weight) => weight === weights[0])) return undefined

  const openingRung = rung(1)
  const openingToday = currentWorking.find((set) => set.setIndex === 1)?.weightKg
  const offset =
    openingRung == null || openingToday == null ? 0 : round(openingToday - openingRung)

  const smallestStep = weights
    .slice(1)
    .map((weight, index) => Math.abs(weight - weights[index]!))
    .filter((gap) => gap > 0)
    .reduce((smallest, gap) => Math.min(smallest, gap), Infinity)
  if (Math.abs(offset) >= smallestStep) return undefined

  const followsShape = currentWorking.every((set) => {
    if (set.weightKg == null) return true
    const counterpart = rung(set.setIndex)
    if (counterpart == null) return true
    return round(set.weightKg) === round(counterpart + offset)
  })
  if (!followsShape) return undefined

  const next = round(target + offset)
  if (!(next > 0)) return undefined

  // Reps come from the same rung, unshifted. A climb's rep counts move with
  // its weights — 60 × 10 then 70 × 8 — so answering for the weight alone
  // would offer the next rung at the rep count of the lighter one, which is
  // neither what was done nor what is likely possible.
  return { weightKg: next, reps: at(setIndex)?.reps }
}

/**
 * Resolve what a new set row should already contain.
 *
 * This is the feature the app lives or dies on: if logging a set takes more
 * than one tap when nothing changed, people stop logging and every other
 * feature becomes worthless because the data dries up.
 *
 * **Weight and reps are resolved independently**, each taking the first tier
 * that has an answer for it, and **they do not use the same order**. That is
 * the one thing to understand about this function:
 *
 * - **Weight: history wins, every time.** The plan is the last tier asked, so
 *   it answers only when there is nothing to go on — the first run of a
 *   routine, or an exercise you have never done. A routine is a group of
 *   exercises with some useful defaults attached; what you can lift today is a
 *   fact about your training, not about a number somebody typed into a plan
 *   once. A plan that outranked history would hand you a stale weight every
 *   session until you edited the routine, which is precisely the chore that
 *   makes people stop using plans.
 * - **Reps: the plan still leads.** Reps are the prescription — "heavy triples
 *   today" is the plan's business in a way that "100 kg" is not. The one
 *   exception is a ladder you are visibly repeating; see {@link resolveRamp}.
 *
 * The tiers, strongest first, with the differences marked:
 *
 * 1. **The same climb as last time** — both fields. Only when last session was
 *    not straight sets: set 2 prefills from last session's set 2, with the
 *    weight shifted by whatever you have already added to set 1 today. See
 *    {@link resolveClimb} for the four conditions that keep it honest.
 * 2. **The routine's ladder** — both fields, under exactly the same rules, for
 *    a climb that was written down rather than inferred. It sits above
 *    carry-forward because carry-forward is a stand-in for per-set
 *    information, and a ladder *is* per-set information; it sits below
 *    history because the shape is the plan's contribution and the numbers are
 *    not. Shifted the same way, so following a ladder at a heavier opening set
 *    carries the whole thing up rather than dragging you back to it.
 * 3. **Carried forward** — both fields. The last working set you logged for
 *    this exercise in this session. If you bumped to 80 kg on set 1, set 2
 *    should say 80. What you just did is the best evidence of what you are
 *    about to do.
 * 4. **Routine target** — *reps only at this height*. The single rep figure a
 *    straight-sets plan asks for.
 * 5. **Same set index last time** — set 3 prefills from last session's set 3,
 *    which matters when a lifter ramps or drops across a session.
 * 6. **Last set ever** — the final working set of the previous session.
 * 7. **Routine target** — *weight only, as a last resort*. The plan seeds an
 *    exercise with no history and then gets out of the way.
 * 8. **Empty** — a genuinely new exercise. Say so rather than inventing a zero.
 *
 * Resolving the fields separately also prevents a subtler failure: a routine
 * exercise is created with a rep target and no weight target, so a tier that
 * answered as a unit would let the plan's "8 reps" swallow the whole turn and
 * leave the weight blank — on an exercise you benched 82.5 kg for three sets
 * last week, with the ghost line directly above saying so.
 *
 * `source` reports where the **weight** came from, since that is the number
 * being justified; for a bodyweight exercise it reports the reps instead.
 *
 * Percent-based targets are deliberately not resolved here: they need a
 * training max this function has no business knowing about, so the caller
 * converts to kilograms first. See docs/PLAN.md §4.
 */
export function resolvePrefill(input: PrefillInput): PrefillResult {
  const { setIndex, currentSessionSets = [], previousSessionSets = [], target } = input

  const previousWorking = previousSessionSets.filter(isWorking)
  const currentWorking = currentSessionSets.filter(isWorking)
  const carried = currentWorking.at(-1)
  const sameIndex = previousWorking.find((set) => set.setIndex === setIndex)
  const lastEver = previousWorking.at(-1)

  const nothing = { weightKg: undefined, reps: undefined }
  const ramp = resolveClimb(setIndex, previousWorking, currentWorking) ?? nothing
  // The same rule applied to a climb somebody wrote down instead of one they
  // happened to do. Below history, above carry-forward: see the chain note.
  const ladder =
    resolveClimb(setIndex, plannedShape(target?.plan), currentWorking) ?? nothing

  // What the plan asks of THIS set: the matching rung of a ladder, or the one
  // flat target that applies to every set. The two never coexist on a stored
  // row, so there is no precedence to decide between them here.
  const rung = plannedSetAt(target?.plan, setIndex)
  const plannedWeight = rung?.weight ?? target?.weight
  const plannedReps = rung?.reps ?? target?.reps

  type Tier = { source: PrefillSource; value: number | undefined }

  // The one tier that answers for both fields at once, and the one place the
  // plan loses control of the rep count. A climb is the counter-example to
  // "the plan leads on reps": a routine rung holds one figure per set, but a
  // lifter visibly repeating last session's climb is better evidence than a
  // plan that may never have described the climb at all.
  const fromRamp = { source: 'ramp_last_time' as const }
  const fromCarried = { source: 'carried_forward' as const }
  const fromPlan = { source: 'routine_target' as const }
  const fromSameIndex = { source: 'same_set_last_time' as const }
  const fromLastEver = { source: 'last_set_ever' as const }

  const weightTiers: Tier[] = [
    { ...fromRamp, value: ramp.weightKg },
    { ...fromPlan, value: ladder.weightKg },
    { ...fromCarried, value: carried?.weightKg },
    { ...fromSameIndex, value: sameIndex?.weightKg },
    { ...fromLastEver, value: lastEver?.weightKg },
    // Last, deliberately — see the chain note above. A percent target resolves
    // to nothing here on purpose; the caller converts it first.
    { ...fromPlan, value: plannedWeight?.kind === 'absolute' ? plannedWeight.kg : undefined },
  ]

  const repsTiers: Tier[] = [
    { ...fromRamp, value: ramp.reps },
    { ...fromPlan, value: ladder.reps },
    { ...fromCarried, value: carried?.reps },
    { ...fromPlan, value: plannedReps },
    { ...fromSameIndex, value: sameIndex?.reps },
    { ...fromLastEver, value: lastEver?.reps },
  ]

  const first = (tiers: readonly Tier[]) => tiers.find((tier) => tier.value != null)

  const weight = first(weightTiers)
  const repetitions = first(repsTiers)

  const weightKg = weight?.value
  const reps = repetitions?.value
  const weightSource = weight?.source
  const repsSource = repetitions?.source

  return {
    ...(weightKg == null ? {} : { weightKg }),
    ...(reps == null ? {} : { reps }),
    source: weightSource ?? repsSource ?? 'empty',
  }
}

/**
 * The ghost line: `77.5 kg × 8, 8, 7`.
 *
 * The most-read text in the app, which is why it is never behind a tap. Weights
 * collapse to one figure when every set used the same load, because that is the
 * common case and repeating it three times is noise.
 */
export function lastTimeSummary(
  sets: readonly PrefillSet[],
  unit: 'kg' | 'lb' = 'kg',
): string | null {
  const working = sets.filter(isWorking)
  if (working.length === 0) return null

  const reps = working.map((set) => set.reps).filter((value): value is number => value != null)
  if (reps.length === 0) return null

  const weights = working
    .map((set) => set.weightKg)
    .filter((value): value is number => value != null)

  const repsText = reps.join(', ')

  if (weights.length === 0) return `bodyweight × ${repsText}`

  const uniform = weights.every((weight) => weight === weights[0])
  if (uniform && weights.length === working.length) {
    return `${formatWeight(weights[0]!, unit)} × ${repsText}`
  }

  // Loads varied — show each pairing rather than a misleading single figure.
  return working
    .map((set) =>
      set.weightKg == null
        ? `bw × ${set.reps ?? '?'}`
        : `${formatWeight(set.weightKg, unit, { withUnit: false })} × ${set.reps ?? '?'}`,
    )
    .join(', ')
    .concat(` ${unit}`)
}

export const prefillMetric: Metric<PrefillInput, PrefillResult> = {
  id: 'prefill',
  label: 'Pre-filled weights and reps',
  shortLabel: 'pre-fill',
  formula:
    'weight: the same ramp as last time → this session → last session → your plan · reps: your plan, under the two history tiers above it',
  compute: resolvePrefill,

  explainer: {
    whatItIs: 'The numbers already in a new set row before you touch it.',
    whyUseful:
      'Most sets repeat what you just did, so logging becomes one tap. The "last time" line under the exercise always shows what you actually did, so you can see what you are matching.',
    caveats: [
      'It is a starting point, not a recommendation — Gymmy is not telling you to lift that. Change it freely.',
      'Editing a pre-filled value only affects the set you are logging. It never changes past sessions.',
      'Weight and reps are filled separately, and your training outranks your routine on weight. A routine’s weight is a starting point for an exercise with no history — once you have lifted it, what you lifted is what you are offered.',
      'Reps work the other way round: your routine leads, because how many reps to aim for is the plan’s business in a way that the weight is not.',
      'If last session climbed across your sets, the same climb is offered again — each set at its own weight and reps — moved by however much you changed the first set. It only follows you; it never adds weight on its own.',
      'A climb is the one case where the reps come from what you did rather than from your routine, because a routine holds a single rep figure and a climb has a different one per set.',
      'Change a set to something that is not part of last session’s climb and the climb stops being offered for the rest of that exercise. What you just did takes over again.',
    ],
  },

  example: (input) => {
    const result = resolvePrefill(input)
    if (result.source === 'empty') return null

    const reason: Record<Exclude<PrefillSource, 'empty'>, string> = {
      ramp_last_time: `set ${input.setIndex} of last session’s climb, moved by what you changed on set 1`,
      carried_forward: 'carried forward from your last set in this session',
      routine_target: "your plan's target for this exercise",
      same_set_last_time: `set ${input.setIndex} from your last session`,
      last_set_ever: 'the last set you logged for this exercise',
    }

    const parts: string[] = []
    if (result.weightKg != null) parts.push(formatWeight(result.weightKg))
    if (result.reps != null) parts.push(`${result.reps} reps`)

    return {
      given: `set ${input.setIndex}`,
      substitution: reason[result.source],
      result: parts.join(' × ') || '—',
    }
  },
}
