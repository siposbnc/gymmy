import { ArrowRight } from 'lucide-react'

import { useSettings } from '~/db/hooks'
import { calculatePlates, formatPlates } from '~/domain/metrics'
import { formatWeight } from '~/domain/units'
import { Card } from '~/ui/Card'
import { InfoAffordance } from '~/ui/InfoAffordance'
import { ScreenHeader } from '~/ui/ScreenHeader'
import { Stat } from '~/ui/Stat'

/**
 * The Today tab.
 *
 * In M1 this becomes the real entry point — active session card, or the
 * start-workout buttons. For M0 it proves the foundations are wired: live
 * settings off IndexedDB, a pure domain calculation, and the explainer sheet.
 */
export function TodayScreen() {
  const settings = useSettings()

  // A real calculation against the user's real plate inventory, so M0 is
  // demonstrably working rather than merely compiling.
  const demoTarget = 100
  const plates = calculatePlates({
    targetKg: demoTarget,
    barWeightKg: settings.barWeightKg,
    inventory: settings.plateInventory,
  })

  return (
    <>
      <ScreenHeader eyebrow="Gymmy" title="Foundations are in." />

      <div className="grid gap-3 px-4">
        <Card>
          <p className="text-[0.9rem] leading-relaxed text-ink-muted">
            M0 is complete: the token layer, database, platform adapters and UI kit are wired up.
            Set logging arrives in <strong className="font-semibold text-ink">M1</strong>.
          </p>
        </Card>

        <div className="grid grid-cols-3 gap-2.5">
          <Stat label="Unit" value={settings.units} />
          <Stat label="Bar" value={formatWeight(settings.barWeightKg, settings.units, { withUnit: false })} unit={settings.units} />
          <Stat label="Rest" value={`${Math.round(settings.defaultRestSeconds / 60)}:00`} />
        </div>

        <Card>
          <p className="label-caps flex items-center gap-1.5 text-ink-faint">
            Plates per side for {formatWeight(demoTarget, settings.units)}
            <InfoAffordance
              explainerId="plates"
              exampleInput={{
                targetKg: demoTarget,
                barWeightKg: settings.barWeightKg,
                inventory: settings.plateInventory,
              }}
            />
          </p>
          <p className="num mt-1.5 text-title font-semibold">{formatPlates(plates)}</p>
          {!plates.exact ? (
            <p className="mt-1 text-[0.75rem] text-ink-muted">
              Not loadable exactly — closest is {formatWeight(plates.achievedKg, settings.units)}.
            </p>
          ) : null}
        </Card>

        <a
          href="/more/maths"
          className="flex touch-comfortable items-center gap-3 rounded-lg bg-accent px-5 text-on-accent"
        >
          <span className="flex-1">
            <span className="label-caps block opacity-70">Every number, explained</span>
            <span className="text-[1.05rem] font-bold tracking-tight">
              How Gymmy works out your numbers
            </span>
          </span>
          <ArrowRight size={20} aria-hidden />
        </a>
      </div>
    </>
  )
}
