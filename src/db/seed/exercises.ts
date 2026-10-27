import type { Equipment, Exercise, MovementType, MuscleGroup, TrackingType } from '~/domain/types'

import { EXERCISE_DESCRIPTIONS } from './descriptions'

/**
 * The built-in exercise library.
 *
 * IDs are stable slugs rather than generated UUIDs, deliberately: seeding must
 * be idempotent, and a routine built in v1 has to keep pointing at the same
 * exercise after an app update adds more. Never renumber or reuse an id.
 *
 * Rest defaults derive from movement type — compounds need longer — with
 * explicit overrides where that heuristic is wrong (the big three deserve 3
 * minutes; a lateral raise does not need a minute).
 */

type Seed = readonly [
  slug: string,
  name: string,
  muscles: readonly MuscleGroup[],
  equipment: Equipment,
  movement: MovementType,
  restOverride?: number,
  tracking?: TrackingType,
]

const REST_BY_MOVEMENT: Record<MovementType, number> = {
  compound: 150,
  isolation: 60,
}

// prettier-ignore
const SEEDS: readonly Seed[] = [
  // --- Chest ---------------------------------------------------------------
  ['bench-press',            'Bench Press',                  ['chest', 'triceps', 'shoulders'], 'barbell',   'compound',  180],
  ['incline-bench-press',    'Incline Bench Press',          ['chest', 'shoulders', 'triceps'], 'barbell',   'compound',  150],
  ['decline-bench-press',    'Decline Bench Press',          ['chest', 'triceps'],              'barbell',   'compound',  150],
  ['dumbbell-bench-press',   'Dumbbell Bench Press',         ['chest', 'triceps'],              'dumbbell',  'compound',  150],
  ['incline-dumbbell-press', 'Incline Dumbbell Press',       ['chest', 'shoulders'],            'dumbbell',  'compound',  120],
  ['machine-chest-press',    'Machine Chest Press',          ['chest', 'triceps'],              'machine',   'compound',  120],
  ['cable-fly',              'Cable Fly',                    ['chest'],                         'cable',     'isolation'],
  ['dumbbell-fly',           'Dumbbell Fly',                 ['chest'],                         'dumbbell',  'isolation'],
  ['pec-deck',               'Pec Deck',                     ['chest'],                         'machine',   'isolation'],
  ['push-up',                'Push-up',                      ['chest', 'triceps', 'core'],      'bodyweight','compound',  90,  'reps_only'],
  ['dip',                    'Chest Dip',                    ['chest', 'triceps'],              'bodyweight','compound',  120, 'reps_only'],

  // --- Back ----------------------------------------------------------------
  ['deadlift',               'Deadlift',                     ['back', 'glutes', 'hamstrings'],  'barbell',   'compound',  240],
  ['pendlay-row',            'Pendlay Row',                  ['back', 'lats', 'biceps'],        'barbell',   'compound',  150],
  ['barbell-row',            'Barbell Row',                  ['back', 'lats', 'biceps'],        'barbell',   'compound',  150],
  ['dumbbell-row',           'Dumbbell Row',                 ['lats', 'back', 'biceps'],        'dumbbell',  'compound',  120],
  ['t-bar-row',              'T-Bar Row',                    ['back', 'lats'],                  'barbell',   'compound',  150],
  ['seated-cable-row',       'Seated Cable Row',             ['back', 'lats', 'biceps'],        'cable',     'compound',  120],
  ['lat-pulldown',           'Lat Pulldown',                 ['lats', 'biceps'],                'cable',     'compound',  120],
  ['pull-up',                'Pull-up',                      ['lats', 'biceps', 'back'],        'bodyweight','compound',  150, 'reps_only'],
  ['chin-up',                'Chin-up',                      ['lats', 'biceps'],                'bodyweight','compound',  150, 'reps_only'],
  ['straight-arm-pulldown',  'Straight-Arm Pulldown',        ['lats'],                          'cable',     'isolation'],
  ['face-pull',              'Face Pull',                    ['shoulders', 'traps', 'back'],    'cable',     'isolation'],
  ['shrug',                  'Barbell Shrug',                ['traps'],                         'barbell',   'isolation', 90],
  ['dumbbell-shrug',         'Dumbbell Shrug',               ['traps'],                         'dumbbell',  'isolation', 90],
  ['rack-pull',              'Rack Pull',                    ['back', 'traps', 'glutes'],       'barbell',   'compound',  180],

  // --- Legs ----------------------------------------------------------------
  ['squat',                  'Squat',                        ['quads', 'glutes', 'core'],       'barbell',   'compound',  240],
  ['front-squat',            'Front Squat',                  ['quads', 'core'],                 'barbell',   'compound',  180],
  ['hack-squat',             'Hack Squat',                   ['quads', 'glutes'],               'machine',   'compound',  150],
  ['leg-press',              'Leg Press',                    ['quads', 'glutes'],               'machine',   'compound',  150],
  ['bulgarian-split-squat',  'Bulgarian Split Squat',        ['quads', 'glutes'],               'dumbbell',  'compound',  120],
  ['lunge',                  'Walking Lunge',                ['quads', 'glutes'],               'dumbbell',  'compound',  120],
  ['goblet-squat',           'Goblet Squat',                 ['quads', 'glutes'],               'dumbbell',  'compound',  120],
  ['romanian-deadlift',      'Romanian Deadlift',            ['hamstrings', 'glutes', 'back'],  'barbell',   'compound',  180],
  ['stiff-leg-deadlift',     'Stiff-Leg Deadlift',           ['hamstrings', 'glutes'],          'barbell',   'compound',  180],
  ['hip-thrust',             'Hip Thrust',                   ['glutes', 'hamstrings'],          'barbell',   'compound',  150],
  ['leg-extension',          'Leg Extension',                ['quads'],                         'machine',   'isolation'],
  ['leg-curl',               'Lying Leg Curl',               ['hamstrings'],                    'machine',   'isolation'],
  ['seated-leg-curl',        'Seated Leg Curl',              ['hamstrings'],                    'machine',   'isolation'],
  ['hip-abduction',          'Hip Abduction',                ['glutes'],                        'machine',   'isolation'],
  ['standing-calf-raise',    'Standing Calf Raise',          ['calves'],                        'machine',   'isolation', 45],
  ['seated-calf-raise',      'Seated Calf Raise',            ['calves'],                        'machine',   'isolation', 45],
  ['good-morning',           'Good Morning',                 ['hamstrings', 'back', 'glutes'],  'barbell',   'compound',  150],

  // --- Shoulders -----------------------------------------------------------
  ['overhead-press',         'Overhead Press',               ['shoulders', 'triceps'],          'barbell',   'compound',  180],
  ['push-press',             'Push Press',                   ['shoulders', 'triceps', 'quads'], 'barbell',   'compound',  180],
  ['dumbbell-shoulder-press','Dumbbell Shoulder Press',      ['shoulders', 'triceps'],          'dumbbell',  'compound',  120],
  ['arnold-press',           'Arnold Press',                 ['shoulders'],                     'dumbbell',  'compound',  120],
  ['machine-shoulder-press', 'Machine Shoulder Press',       ['shoulders', 'triceps'],          'machine',   'compound',  120],
  ['lateral-raise',          'Lateral Raise',                ['shoulders'],                     'dumbbell',  'isolation', 45],
  ['cable-lateral-raise',    'Cable Lateral Raise',          ['shoulders'],                     'cable',     'isolation', 45],
  ['front-raise',            'Front Raise',                  ['shoulders'],                     'dumbbell',  'isolation', 45],
  ['rear-delt-fly',          'Rear Delt Fly',                ['shoulders', 'back'],             'dumbbell',  'isolation', 45],
  ['upright-row',            'Upright Row',                  ['shoulders', 'traps'],            'barbell',   'compound',  90],

  // --- Arms ----------------------------------------------------------------
  ['barbell-curl',           'Barbell Curl',                 ['biceps'],                        'barbell',   'isolation'],
  ['dumbbell-curl',          'Dumbbell Curl',                ['biceps'],                        'dumbbell',  'isolation'],
  ['hammer-curl',            'Hammer Curl',                  ['biceps', 'forearms'],            'dumbbell',  'isolation'],
  ['preacher-curl',          'Preacher Curl',                ['biceps'],                        'barbell',   'isolation'],
  ['incline-dumbbell-curl',  'Incline Dumbbell Curl',        ['biceps'],                        'dumbbell',  'isolation'],
  ['cable-curl',             'Cable Curl',                   ['biceps'],                        'cable',     'isolation'],
  ['concentration-curl',     'Concentration Curl',           ['biceps'],                        'dumbbell',  'isolation', 45],
  ['triceps-pushdown',       'Triceps Pushdown',             ['triceps'],                       'cable',     'isolation'],
  ['rope-pushdown',          'Rope Pushdown',                ['triceps'],                       'cable',     'isolation'],
  ['overhead-triceps-ext',   'Overhead Triceps Extension',   ['triceps'],                       'dumbbell',  'isolation'],
  ['skull-crusher',          'Skull Crusher',                ['triceps'],                       'barbell',   'isolation'],
  ['close-grip-bench-press', 'Close-Grip Bench Press',       ['triceps', 'chest'],              'barbell',   'compound',  150],
  ['triceps-dip',            'Triceps Dip',                  ['triceps', 'chest'],              'bodyweight','compound',  120, 'reps_only'],
  ['wrist-curl',             'Wrist Curl',                   ['forearms'],                      'dumbbell',  'isolation', 45],
  ['reverse-curl',           'Reverse Curl',                 ['forearms', 'biceps'],            'barbell',   'isolation', 45],

  // --- Core ----------------------------------------------------------------
  ['hanging-leg-raise',      'Hanging Leg Raise',            ['core'],                          'bodyweight','isolation', 60, 'reps_only'],
  ['cable-crunch',           'Cable Crunch',                 ['core'],                          'cable',     'isolation'],
  ['crunch',                 'Crunch',                       ['core'],                          'bodyweight','isolation', 45, 'reps_only'],
  ['sit-up',                 'Sit-up',                       ['core'],                          'bodyweight','isolation', 45, 'reps_only'],
  ['russian-twist',          'Russian Twist',                ['core'],                          'dumbbell',  'isolation', 45],
  ['ab-wheel-rollout',       'Ab Wheel Rollout',             ['core'],                          'other',     'compound',  60,  'reps_only'],
  ['back-extension',         'Back Extension',               ['back', 'glutes', 'hamstrings'],  'bodyweight','isolation', 60,  'reps_only'],

  // --- Full body / carries -------------------------------------------------
  ['power-clean',            'Power Clean',                  ['full_body'],                     'barbell',   'compound',  180],
  ['clean-and-press',        'Clean and Press',              ['full_body'],                     'barbell',   'compound',  180],
  ['kettlebell-swing',       'Kettlebell Swing',             ['glutes', 'hamstrings', 'core'],  'kettlebell','compound',  90],
  ['thruster',               'Thruster',                     ['full_body'],                     'barbell',   'compound',  150],
]

function toExercise([
  slug,
  name,
  muscleGroups,
  equipment,
  movementType,
  restOverride,
  tracking,
]: Seed): Exercise {
  const description = EXERCISE_DESCRIPTIONS[slug]
  return {
    id: `ex_${slug}`,
    name,
    muscleGroups: [...muscleGroups],
    equipment,
    movementType,
    trackingType: tracking ?? 'weight_reps',
    defaultRestSeconds: restOverride ?? REST_BY_MOVEMENT[movementType],
    ...(description == null ? {} : { description }),
    isCustom: false,
  }
}

export const SEED_EXERCISES: readonly Exercise[] = SEEDS.map(toExercise)
