/**
 * What each built-in exercise is, and how it differs from its neighbours.
 *
 * Keyed by the seed slug rather than the full id, so the table stays readable
 * next to `exercises.ts`. One or two sentences each: enough to choose between
 * two similar movements, not a coaching manual. Gymmy is a log, not a tutor —
 * these answer "which of these am I looking at" rather than teaching the lift.
 */
export const EXERCISE_DESCRIPTIONS: Record<string, string> = {
  // --- Chest ---------------------------------------------------------------
  'bench-press':
    'The standard horizontal press. Flat bench, barbell, full range to the chest. The benchmark upper-body pressing lift.',
  'incline-bench-press':
    'Bench set to roughly 30°, which shifts work toward the upper chest and front delts. Expect less weight than flat.',
  'decline-bench-press':
    'Bench angled down, emphasising the lower chest. Shorter range than flat, so the weight is usually higher.',
  'dumbbell-bench-press':
    'Flat press with dumbbells. A longer range and more stabilising work than the barbell, at lower total load.',
  'incline-dumbbell-press':
    'Incline press with dumbbells. Upper-chest bias with each arm working independently.',
  'machine-chest-press':
    'Fixed-path pressing. Removes the balance demand, which makes it useful late in a session or when fatigued.',
  'cable-fly':
    'An arcing movement with the arms nearly straight, keeping tension on the chest throughout rather than at one point.',
  'dumbbell-fly':
    'The free-weight fly. Hardest at the bottom stretch and easiest at the top, unlike the cable version.',
  'pec-deck': 'A seated machine fly. Fixed path, easy to load, forgiving on the shoulders.',
  'push-up':
    'Bodyweight horizontal press. Scales by changing hand or foot height rather than by adding load.',
  dip: 'Pressing from parallel bars with a forward lean to bias the chest. Staying upright shifts it to the triceps.',

  // --- Back ----------------------------------------------------------------
  deadlift:
    'Lifting a loaded bar from the floor to a standing position. A full posterior-chain lift and usually the heaviest thing you do.',
  'pendlay-row':
    'A row where the bar returns to the floor between reps, so each one starts dead. Stricter and more explosive than a touch-and-go row.',
  'barbell-row':
    'Bent-over row with continuous tension — the bar does not rest between reps. More total time under load than a Pendlay.',
  'dumbbell-row':
    'One-armed row, usually braced on a bench. Lets each side work through its own range.',
  't-bar-row':
    'Rowing with one end of the bar fixed, giving a neutral grip and a stable path. Easy to load heavy.',
  'seated-cable-row': 'Horizontal pulling with constant cable tension and a supported torso.',
  'lat-pulldown': 'Vertical pulling with adjustable load. The scalable stand-in for pull-ups.',
  'pull-up':
    'Bodyweight vertical pull, palms facing away. Harder than the chin-up and more lat-dominant.',
  'chin-up':
    'Vertical pull with palms facing you. The biceps contribute more, so most people manage more reps than on pull-ups.',
  'straight-arm-pulldown':
    'A single-joint lat movement with the elbows locked. Isolates the lats without the arms giving out first.',
  'face-pull':
    'Pulling to face height with the elbows high, working the rear delts and upper back. Common as shoulder-health work.',
  shrug: 'Straight-up elevation of the shoulders, working the upper traps. Short range, heavy load.',
  'dumbbell-shrug': 'Shrug with dumbbells at your sides, allowing a slightly freer path than a bar.',
  'rack-pull':
    'A partial deadlift starting from pins around the knee. Heavier than a full pull, with the hardest portion removed.',

  // --- Legs ----------------------------------------------------------------
  squat:
    'Back squat: bar on the upper back, hips descending below parallel. The reference lower-body lift.',
  'front-squat':
    'Bar held across the front of the shoulders, keeping the torso upright and shifting work to the quads.',
  'hack-squat':
    'A machine squat on a fixed angled path. Quad-dominant with the back supported.',
  'leg-press': 'Pressing a sled with the back supported. Heavy loading without spinal demand.',
  'bulgarian-split-squat':
    'A single-leg squat with the rear foot elevated. Brutal for the amount of weight involved.',
  lunge: 'Stepping forward or walking under load, one leg at a time.',
  'goblet-squat':
    'Squat holding a single weight at the chest. Self-correcting form, which is why it is a common starting point.',
  'romanian-deadlift':
    'A hip hinge from standing with only slight knee bend, lowering under control. Hamstring-focused — the bar does not return to the floor.',
  'stiff-leg-deadlift':
    'Similar to a Romanian deadlift but starting from the floor with straighter legs, so the range is longer.',
  'hip-thrust':
    'Driving the hips up with the shoulders on a bench and a bar across the hips. The most directly glute-loaded movement here.',
  'leg-extension': 'Seated single-joint quad work. Isolates the quads with no hip involvement.',
  'leg-curl': 'Lying hamstring curl. Knee-flexion work, as opposed to the hinge pattern.',
  'seated-leg-curl':
    'Hamstring curl seated, with the hip flexed. Slightly different hamstring emphasis to the lying version.',
  'hip-abduction': 'Pushing the knees apart against resistance, working the outer glutes.',
  'standing-calf-raise': 'Calf raise with legs straight, which favours the gastrocnemius.',
  'seated-calf-raise': 'Calf raise with the knees bent, which shifts work to the soleus.',
  'good-morning':
    'A hinge with the bar on the back. Loads the hamstrings and lower back through a long lever, so the weight stays modest.',

  // --- Shoulders -----------------------------------------------------------
  'overhead-press':
    'Standing strict press from the shoulders to overhead, with no leg drive. The benchmark vertical press.',
  'push-press':
    'Overhead press using a dip and leg drive to start the bar moving. Allows more weight than a strict press.',
  'dumbbell-shoulder-press':
    'Overhead press with dumbbells, usually seated. Each arm works independently through a longer range.',
  'arnold-press': 'A dumbbell press that rotates from palms-in to palms-out, adding front-delt work.',
  'machine-shoulder-press': 'Fixed-path overhead pressing with the back supported.',
  'lateral-raise':
    'Raising the arms out to the sides, isolating the side delts. Light weight, strict form — this one does not need to be heavy.',
  'cable-lateral-raise':
    'The lateral raise with cable tension, which stays constant through the range instead of peaking at the top.',
  'front-raise': 'Raising the arms forward, isolating the front delts.',
  'rear-delt-fly':
    'Bent-over or seated reverse fly for the rear delts, the head most people under-train.',
  'upright-row': 'Pulling a bar up the front of the body to chest height, working side delts and traps.',

  // --- Arms ----------------------------------------------------------------
  'barbell-curl': 'The standard biceps curl with a bar. Both arms together, heaviest curl variant.',
  'dumbbell-curl': 'Curl with dumbbells, which lets the wrists rotate freely.',
  'hammer-curl':
    'Curl with a neutral, palms-facing grip. Shifts work toward the brachialis and forearms.',
  'preacher-curl':
    'Curl with the upper arms braced on a pad, removing the swing and keeping tension on the biceps.',
  'incline-dumbbell-curl':
    'Curling with the upper arms behind the torso on an incline bench, stretching the biceps at the bottom.',
  'cable-curl': 'Curl against constant cable tension rather than against gravity alone.',
  'concentration-curl': 'Single-arm curl braced against the inner thigh. Strict and low-load.',
  'triceps-pushdown': 'Pushing a cable attachment down with the elbows fixed. The staple triceps movement.',
  'rope-pushdown':
    'Pushdown with a rope, allowing the hands to separate at the bottom for a stronger contraction.',
  'overhead-triceps-ext':
    'Extending overhead, which stretches the long head of the triceps that pushdowns mostly miss.',
  'skull-crusher':
    'Lying triceps extension to the forehead. Long-head emphasis with a heavier load than overhead work.',
  'close-grip-bench-press':
    'Bench press with the hands inside shoulder width, shifting the work from chest to triceps.',
  'triceps-dip': 'Dips kept upright to bias the triceps rather than the chest.',
  'wrist-curl': 'Small-range forearm flexion work.',
  'reverse-curl': 'Curl with palms facing down, loading the forearm extensors and brachioradialis.',

  // --- Core ----------------------------------------------------------------
  'hanging-leg-raise':
    'Raising the legs while hanging. Hard on the grip as well as the abs, and scalable by bending the knees.',
  'cable-crunch': 'Kneeling crunch against a cable, which lets you load the abs progressively.',
  crunch: 'Short-range spinal flexion. Bodyweight, high rep.',
  'sit-up': 'Full-range flexion from lying to sitting, involving the hip flexors as well as the abs.',
  'russian-twist': 'Rotating side to side under load, working the obliques.',
  'ab-wheel-rollout':
    'Rolling out and back with a wheel. An anti-extension movement — the abs resist the spine arching.',
  'back-extension':
    'Extending the torso from a bent position, working the lower back and glutes.',

  // --- Full body -----------------------------------------------------------
  'power-clean':
    'Explosively pulling a bar from the floor to the shoulders. A speed and power lift; the weight stays well below a deadlift.',
  'clean-and-press': 'A power clean followed by pressing the bar overhead.',
  'kettlebell-swing':
    'A ballistic hip hinge swinging the bell to chest height. Driven by the hips, not the arms.',
  thruster: 'A front squat flowing straight into an overhead press. Taxing enough to be conditioning.',
}
