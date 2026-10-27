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
  label: 'RPE — Rate of Perceived Exertion',
  shortLabel: 'RPE',
  explainer: {
    whatItIs:
      'RPE stands for Rate of Perceived Exertion. It is a 1–10 rating of how hard a set felt, where 10 means you could not have done another rep. Count the reps you had left: 10 is nothing left, 9 is one more rep, 8 is two more, 7 is three more, 6 or less is easy.',
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
      'A reps record only appears for a weight you have trained more than once. The first time you try a weight is the first time you tried it, not an achievement — otherwise adding 2.5 kg every week would mint a new record every week and bury the ones that mean something.',
      'If you forgot to log something, add it from History and records recalculate.',
    ],
  },
}

export const restTimerGuide: Explainable = {
  id: 'rest_timer',
  label: 'The rest timer',
  shortLabel: 'rest',
  explainer: {
    whatItIs:
      'A countdown between sets. It starts on its own when you log a set, using the rest length saved for that exercise, and you can add 30 seconds or skip it at any point.',
    whyUseful:
      'Rest length changes what a session trains. Keeping it consistent is what makes this week comparable to last week — and it saves watching a clock while you are catching your breath.',
    caveats: [
      'Gymmy records when your rest ends rather than counting down second by second, so locking your phone or switching apps cannot make it drift. Come back after two minutes away and it already shows the right time.',
      'A notification needs permission, and on iPhone it needs Gymmy installed to the home screen. Vibration does not exist in Safari at all. The in-app sound and the on-screen countdown always work, which is why the timer never relies on the other two.',
    ],
  },
}

export const amrapGuide: Explainable = {
  id: 'amrap',
  label: 'AMRAP — As Many Reps As Possible',
  shortLabel: 'AMRAP',
  explainer: {
    whatItIs:
      'AMRAP stands for As Many Reps As Possible. Marking the last set of an exercise as AMRAP means you stop at the point you genuinely cannot do another rep, rather than at the number the plan asked for.',
    whyUseful:
      'A fixed rep target tells you nothing about the days you had more in the tank. Taking the final set to failure shows what the weight is actually worth to you right now, and it is the clearest signal that a weight has become easy enough to go up.',
    caveats: [
      'One set, at the end. Taking every set to failure wrecks the quality of the sets that follow and the sessions after it.',
      'Gymmy records what you did, not what the plan asked for, so an AMRAP set logs as its real rep count like any other set.',
    ],
  },
}

export const warmupVsWorkingGuide: Explainable = {
  id: 'set_types',
  label: 'Set types — working, warm-up, dropset',
  shortLabel: 'set types',
  explainer: {
    whatItIs:
      'A working set is a real set at your training weight, and it is what Gymmy counts. A warm-up is a lighter set ramping up to it. A dropset is an extra set done immediately after a working set with the weight reduced, taken without resting.',
    whyUseful:
      'Separating them keeps your totals honest. Warm-ups would otherwise inflate your set count and drag your average weight down, while dropsets are genuine extra work and should count.',
    caveats: [
      'Only warm-ups are excluded from volume, records and estimated one-rep max. Dropsets and sets taken to failure all count as real work.',
      'Nothing is deleted either way — a warm-up stays visible in the session so you can see how you worked up to your top set.',
    ],
  },
}

export const streakGuide: Explainable = {
  id: 'streak',
  label: 'Streak',
  shortLabel: 'streak',
  formula: 'consecutive weeks that met your session goal',
  explainer: {
    whatItIs:
      'How many weeks in a row you have hit the number of sessions you set as your goal.',
    whyUseful:
      'Consistency over months beats any single session, and weeks are the honest unit — rest days are part of training, not a failure.',
    caveats: [
      'The current week never breaks it. A Tuesday cannot fail a three-session week, so the count only moves once a week is over.',
      'It is motivation, not data. Losing a streak to illness, travel or a deload means nothing about your training, and you can switch it off in Settings.',
    ],
  },
}

export const muscleVolumeGuide: Explainable = {
  id: 'muscle_volume',
  label: 'Volume by muscle',
  shortLabel: 'by muscle',
  formula: "each set's volume counts toward its exercise's main muscle",
  explainer: {
    whatItIs:
      'Your weekly training volume split by the muscle each exercise mainly works.',
    whyUseful:
      'It shows where your effort is actually going, which is often not where you think — most people train what they enjoy and under-train the rest.',
    caveats: [
      'A set counts in full toward one muscle, not divided across every muscle involved. Splitting a bench press between chest, triceps and shoulders would look precise while being guesswork, so Gymmy credits the main mover and says so.',
      'Volume compares a muscle against itself over time. Comparing chest to quads is not meaningful — legs move more weight by nature.',
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
