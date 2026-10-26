import { MAX_REPS_FOR_ESTIMATE } from './one-rep-max'
import type { Explainable } from './types'

/**
 * Explainers with no calculation behind them.
 *
 * These two are education rather than transparency, and they matter more than
 * most of the computed ones:
 *
 * - Most people genuinely do not know the RPE scale. An unexplained 1–10 field
 *   gets filled in randomly, which poisons every feature built on it.
 * - A user who does not know their warm-ups are excluded will conclude the
 *   volume chart is broken.
 */

export const rpeGuide: Explainable = {
  id: 'rpe',
  label: 'RPE — how hard the set was',
  shortLabel: 'RPE',
  explainer: {
    whatItIs:
      'A 1–10 rating of effort, where 10 means you could not have done another rep. Count the reps you had left: 10 is nothing left, 9 is one more rep, 8 is two more, 7 is three more, 6 or less is easy.',
    whyUseful:
      'The same weight is a different workout on a bad night of sleep. RPE records how hard it actually felt, which is what tells you whether to push or hold next session.',
    caveats: [
      'It is a judgement call, and most people underrate how close to failure they were. It gets more accurate with practice.',
      'Entirely optional — leave it blank and nothing breaks.',
    ],
  },
}

export const warmupGuide: Explainable = {
  id: 'warmup_exclusion',
  label: 'Warm-up sets',
  shortLabel: 'warm-ups',
  explainer: {
    whatItIs:
      'Sets you mark as warm-ups are kept in your history but left out of volume totals, personal records and estimated 1RM.',
    whyUseful:
      'Otherwise ramping up with the empty bar would drag your volume chart down and clutter your records with weights you were not trying hard on. They stay visible in the session so you can see how you worked up to your top set.',
    caveats: [
      'If your totals look lower than you expected, check how many sets are marked as warm-ups.',
    ],
  },
}

export const recordsGuide: Explainable = {
  id: 'records',
  label: 'Personal records',
  shortLabel: 'records',
  explainer: {
    whatItIs:
      'Your best-ever logged performance on an exercise, in three kinds: heaviest weight, most reps at a given weight, and biggest total volume in one session.',
    whyUseful:
      'It is the clearest signal that training is working, and it is a fact rather than an interpretation.',
    caveats: [
      'Records come only from work you logged. Gymmy will not award you a record based on an estimate of what you could lift, so your estimated 1RM going up is not a record.',
      `Warm-up sets do not count, and a tie is not a record — you have to beat it.`,
      'If you forgot to log something, add it from History and records recalculate.',
    ],
  },
}

export const unitsGuide: Explainable = {
  id: 'units',
  label: 'Kilograms and pounds',
  shortLabel: 'units',
  formula: '1 kg = 2.20462 lb',
  explainer: {
    whatItIs:
      'Gymmy stores every weight in kilograms and converts for display. Switching units never changes what you lifted.',
    whyUseful:
      'One canonical unit means your charts, volume totals and records stay consistent and comparable no matter which unit you are reading in.',
    caveats: [
      `Displayed weights round to the nearest 0.5 kg or 1 lb, so a converted value can look slightly different from the number you originally typed. The stored value is unchanged.`,
      `Stepper increments follow the unit: 2.5 kg or 5 lb.`,
    ],
  },
}

/** Mentioned in the 1RM caveats; kept here so the cap has one definition. */
export const ONE_REP_MAX_CAP = MAX_REPS_FOR_ESTIMATE
