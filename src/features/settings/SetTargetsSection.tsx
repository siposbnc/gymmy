import { Plus, X } from 'lucide-react'
import { useState } from 'react'

import { setWeeklySetTarget } from '~/db/repositories/settings'
import { SUGGESTED_WEEKLY_SETS } from '~/domain/goals'
import { MUSCLE_LABEL, MUSCLE_ORDER } from '~/domain/muscles'
import type { MuscleGroup, Settings } from '~/domain/types'
import { Card } from '~/ui/Card'
import { InfoAffordance } from '~/ui/InfoAffordance'
import { Sheet } from '~/ui/Sheet'

/**
 * Weekly hard-set targets, per muscle.
 *
 * Opt-in, one muscle at a time. Seeding all fourteen with a default would be
 * Gymmy asserting what your training should look like, which is not its job —
 * and it would fill Progress with thirteen rows you never asked about. The
 * suggested ten is offered on the row you add and nowhere else.
 */
export function SetTargetsSection({ settings }: { settings: Settings }) {
  const [adding, setAdding] = useState(false)
  const targets = settings.weeklySetTargets ?? {}
  const set = MUSCLE_ORDER.filter((muscle) => (targets[muscle] ?? 0) > 0)
  const unset = MUSCLE_ORDER.filter((muscle) => (targets[muscle] ?? 0) <= 0)

  return (
    <div>
      <p className="label-caps mb-2 flex items-center gap-1.5 px-1 text-ink-faint">
        Weekly set targets
        <InfoAffordance explainerId="weekly_sets" />
      </p>

      <Card className="grid gap-2">
        {set.length === 0 ? (
          <p className="text-[0.78rem] leading-relaxed text-ink-muted">
            No targets set. Progress shows the sets you actually did either way — add a target for a
            muscle you want to keep an eye on.
          </p>
        ) : (
          <ul className="grid gap-1.5">
            {set.map((muscle) => (
              <li key={muscle} className="flex items-center gap-2 rounded-md bg-sunken px-3 py-2">
                <span className="min-w-0 flex-1 text-[0.9rem] font-medium">
                  {MUSCLE_LABEL[muscle]}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-label={`One fewer weekly set of ${MUSCLE_LABEL[muscle]}`}
                    onClick={() => void setWeeklySetTarget(muscle, (targets[muscle] ?? 0) - 1)}
                    className="touch-min grid cursor-pointer place-items-center rounded-sm bg-surface text-[1.1rem] font-semibold"
                  >
                    −
                  </button>
                  <span className="num w-7 text-center text-[0.95rem] font-bold">
                    {targets[muscle]}
                  </span>
                  <button
                    type="button"
                    aria-label={`One more weekly set of ${MUSCLE_LABEL[muscle]}`}
                    onClick={() => void setWeeklySetTarget(muscle, (targets[muscle] ?? 0) + 1)}
                    className="touch-min grid cursor-pointer place-items-center rounded-sm bg-surface text-[1.1rem] font-semibold"
                  >
                    +
                  </button>
                  {/* Stepping to zero clears it too, but that is four taps from
                      ten and nobody should have to find that out. */}
                  <button
                    type="button"
                    aria-label={`Remove the ${MUSCLE_LABEL[muscle]} target`}
                    onClick={() => void setWeeklySetTarget(muscle, 0)}
                    className="grid size-8 cursor-pointer place-items-center rounded-full text-ink-faint"
                  >
                    <X size={15} aria-hidden />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {unset.length > 0 ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="w-full cursor-pointer rounded-md border border-dashed border-line-strong py-2.5 text-[0.78rem] font-bold text-ink-muted"
          >
            <Plus size={14} className="mr-1 inline align-[-2px]" aria-hidden />
            Add a muscle
          </button>
        ) : null}
      </Card>

      <Sheet
        open={adding}
        onOpenChange={setAdding}
        eyebrow={`Starts at ${SUGGESTED_WEEKLY_SETS} sets a week — change it after`}
        title="Which muscle?"
      >
        <ul className="divide-y divide-line pb-2">
          {unset.map((muscle: MuscleGroup) => (
            <li key={muscle}>
              <button
                type="button"
                onClick={() => {
                  void setWeeklySetTarget(muscle, SUGGESTED_WEEKLY_SETS)
                  setAdding(false)
                }}
                className="w-full cursor-pointer px-5 py-3.5 text-left text-[0.95rem] font-medium"
              >
                {MUSCLE_LABEL[muscle]}
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    </div>
  )
}
