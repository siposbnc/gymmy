import type { RestBand } from '~/domain/recency'
import type { MuscleGroup } from '~/domain/types'

/**
 * The body, shaded by how long since each muscle was trained.
 *
 * Deliberately abstract: flat geometric regions on a thin frame, not an
 * anatomy drawing. Realistic musculature would be the only illustrative thing
 * in an app made of type and numerals, and it would date badly — this reads as
 * a diagram, which is what it is.
 *
 * **Why colour is allowed to carry the value here.** Everywhere else in Gymmy
 * a one-hue bar does the work and position carries identity. On a map it is
 * the other way round: position already says *which* muscle, so the colour
 * channel is free to say *how long*. That is also why the legend is not
 * optional — the ramp is the only thing encoding the number.
 *
 * Every region is drawn whether or not it has history. A muscle you have never
 * trained is the single most useful thing this can tell you, and the chip list
 * it replaced could not say it at all: it only knew about muscles with sets.
 */

const FILL: Readonly<Record<RestBand, string>> = {
  // Written out rather than built from a template, so Tailwind can see them.
  none: 'fill-rest-0',
  fresh: 'fill-rest-1',
  recent: 'fill-rest-2',
  few: 'fill-rest-3',
  week: 'fill-rest-4',
  long: 'fill-rest-5',
}

interface BodyMapProps {
  /** Absent muscles are drawn as never trained, which is what absent means. */
  bands: Readonly<Partial<Record<MuscleGroup, RestBand>>>
}

export function BodyMap({ bands }: BodyMapProps) {
  const fill = (muscle: MuscleGroup) => FILL[bands[muscle] ?? 'none']

  return (
    <div className="grid grid-cols-2 gap-1.5">
      <Figure label="front">
        <Front fill={fill} />
      </Figure>
      <Figure label="back">
        <Back fill={fill} />
      </Figure>
    </div>
  )
}

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid justify-items-center gap-1">
      {/* Height-capped rather than width-filled: this card sits under the start
          buttons, and a figure that scales with the column runs past the fold
          on a 844px screen. */}
      <svg viewBox="0 0 100 172" className="h-[15rem] w-auto" aria-hidden>
        {children}
      </svg>
      <span className="label-caps text-ink-faint">{label}</span>
    </div>
  )
}

type Fill = (muscle: MuscleGroup) => string

/** Head, neck and feet. Never a muscle, so never shaded. */
function Frame() {
  return (
    <g className="fill-none stroke-line-strong" strokeWidth={0.9}>
      <circle cx="50" cy="12" r="8.5" />
      <path d="M45.5 20.5h9" />
      <path d="M37.5 166h9.5M53 166h9.5" />
    </g>
  )
}

function Front({ fill }: { fill: Fill }) {
  return (
    <>
      <Frame />
      <g className="stroke-line-strong" strokeWidth={0.8}>
        <path className={fill('traps')} d="M35.5 25q14.5-4.5 29 0l-3 7h-23z" />

        <ellipse className={fill('shoulders')} cx="26.5" cy="39" rx="8" ry="8.5" />
        <ellipse className={fill('shoulders')} cx="73.5" cy="39" rx="8" ry="8.5" />

        <path className={fill('chest')} d="M36.5 34h12v15h-10q-2 0-2-2z" />
        <path className={fill('chest')} d="M63.5 34h-12v15h10q2 0 2-2z" />

        <rect className={fill('biceps')} x="19.5" y="49" width="13" height="21" rx="6.5" />
        <rect className={fill('biceps')} x="67.5" y="49" width="13" height="21" rx="6.5" />

        <rect className={fill('forearms')} x="18.5" y="72" width="11.5" height="25" rx="5.7" />
        <rect className={fill('forearms')} x="70" y="72" width="11.5" height="25" rx="5.7" />

        {/* Inset from the chest, so the torso reads as two regions rather than
            one block that happens to change colour halfway down. */}
        <rect className={fill('core')} x="39" y="53" width="22" height="30" rx="5" />

        <rect className={fill('quads')} x="35.5" y="89" width="13" height="36" rx="6.5" />
        <rect className={fill('quads')} x="51.5" y="89" width="13" height="36" rx="6.5" />

        {/* Narrower than the thigh, so the leg tapers and reads as a leg. */}
        <rect className={fill('calves')} x="37" y="131" width="10.5" height="31" rx="5.2" />
        <rect className={fill('calves')} x="52.5" y="131" width="10.5" height="31" rx="5.2" />
      </g>
    </>
  )
}

function Back({ fill }: { fill: Fill }) {
  return (
    <>
      <Frame />
      <g className="stroke-line-strong" strokeWidth={0.8}>
        {/* The traps own more of the back than they do of the front, which is
            most of what tells the two figures apart at a glance. */}
        <path className={fill('traps')} d="M35 25q15-4.5 30 0l-4 14h-22z" />

        <ellipse className={fill('shoulders')} cx="26.5" cy="41" rx="8" ry="8.5" />
        <ellipse className={fill('shoulders')} cx="73.5" cy="41" rx="8" ry="8.5" />

        <path className={fill('lats')} d="M37 41h10v29l-7.5-3.5q-2.5-1.2-2.5-4.5z" />
        <path className={fill('lats')} d="M63 41H53v29l7.5-3.5q2.5-1.2 2.5-4.5z" />
        <rect className={fill('back')} x="48.5" y="41" width="3" height="29" rx="1.5" />

        <rect className={fill('triceps')} x="19.5" y="51" width="13" height="21" rx="6.5" />
        <rect className={fill('triceps')} x="67.5" y="51" width="13" height="21" rx="6.5" />

        <rect className={fill('forearms')} x="18.5" y="74" width="11.5" height="25" rx="5.7" />
        <rect className={fill('forearms')} x="70" y="74" width="11.5" height="25" rx="5.7" />

        <path className={fill('glutes')} d="M36 74h12v14q0 5-6 5t-6-5z" />
        <path className={fill('glutes')} d="M64 74H52v14q0 5 6 5t6-5z" />

        <rect className={fill('hamstrings')} x="35.5" y="97" width="13" height="28" rx="6.5" />
        <rect className={fill('hamstrings')} x="51.5" y="97" width="13" height="28" rx="6.5" />

        <rect className={fill('calves')} x="37" y="131" width="10.5" height="31" rx="5.2" />
        <rect className={fill('calves')} x="52.5" y="131" width="10.5" height="31" rx="5.2" />
      </g>
    </>
  )
}

/** The ramp, spelled out. Not optional: on a map, colour IS the value. */
export function RestKey() {
  return (
    // Not `label-caps`: the card header above is already a small-caps label,
    // and a second one at the same weight turns the legend into a heading
    // rather than a scale.
    <p className="mt-2.5 flex items-center gap-2 text-[0.7rem] text-ink-muted" aria-hidden>
      <span className="shrink-0">just trained</span>
      <span className="flex flex-1 gap-0.5">
        <i className="h-1.5 flex-1 rounded-xs bg-rest-1" />
        <i className="h-1.5 flex-1 rounded-xs bg-rest-2" />
        <i className="h-1.5 flex-1 rounded-xs bg-rest-3" />
        <i className="h-1.5 flex-1 rounded-xs bg-rest-4" />
        <i className="h-1.5 flex-1 rounded-xs bg-rest-5" />
      </span>
      <span className="num shrink-0">2w+</span>
    </p>
  )
}
