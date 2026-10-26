import { useSettings } from '~/db/hooks'
import { updateSettings } from '~/db/repositories/settings'
import { INCREMENT, type WeightUnit } from '~/domain/units'
import type { ThemePreference } from '~/domain/types'
import { useTheme } from '~/app/theme-context'
import { Card } from '~/ui/Card'
import { InfoAffordance } from '~/ui/InfoAffordance'
import { ScreenHeader } from '~/ui/ScreenHeader'
import { Stepper } from '~/ui/Stepper'
import { cn } from '~/ui/cn'

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
  label: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-full border border-line bg-sunken p-[3px]"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'h-10 cursor-pointer rounded-full px-4 text-[0.8rem] font-bold',
            value === option.value
              ? 'bg-raised text-ink shadow-(--shadow-sm)'
              : 'bg-transparent text-ink-muted',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function Row({
  label,
  hint,
  explainerId,
  children,
}: {
  label: string
  hint?: string
  explainerId?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[0.9rem] font-medium">
          {label}
          {explainerId ? <InfoAffordance explainerId={explainerId} /> : null}
        </p>
        {hint ? <p className="mt-0.5 text-[0.75rem] text-ink-muted">{hint}</p> : null}
      </div>
      {children}
    </div>
  )
}

export function SettingsScreen() {
  const settings = useSettings()
  const { preference, setPreference } = useTheme()

  return (
    <>
      <ScreenHeader eyebrow="More" title="Settings" />

      <div className="grid gap-4 px-4 pb-6">
        <Card className="divide-y divide-line p-0">
          <Row
            label="Units"
            hint={`Steppers move in ${INCREMENT[settings.units]} ${settings.units}`}
            explainerId="units"
          >
            <Segmented<WeightUnit>
              label="Units"
              value={settings.units}
              options={[
                { value: 'kg', label: 'kg' },
                { value: 'lb', label: 'lb' },
              ]}
              onChange={(units) => void updateSettings({ units })}
            />
          </Row>

          <Row label="Theme" hint="System follows your phone">
            <Segmented<ThemePreference>
              label="Theme"
              value={preference}
              options={[
                { value: 'system', label: 'Auto' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
              onChange={(next) => {
                setPreference(next)
                void updateSettings({ theme: next })
              }}
            />
          </Row>

          <Row
            label="Show RPE field"
            hint="How hard each set was, 1–10"
            explainerId="rpe"
          >
            <Segmented
              label="Show RPE field"
              value={settings.showRpe ? 'on' : 'off'}
              options={[
                { value: 'off', label: 'Off' },
                { value: 'on', label: 'On' },
              ]}
              onChange={(next) => void updateSettings({ showRpe: next === 'on' })}
            />
          </Row>
        </Card>

        <div>
          <p className="label-caps mb-2 px-1 text-ink-faint">Rest</p>
          <Card>
            <Stepper
              value={settings.defaultRestSeconds}
              onChange={(defaultRestSeconds) => void updateSettings({ defaultRestSeconds })}
              step={15}
              min={15}
              max={600}
              unit="seconds"
              hint="Default — individual exercises override this"
              decreaseLabel="Decrease default rest by 15 seconds"
              increaseLabel="Increase default rest by 15 seconds"
            />
          </Card>
        </div>

        <div>
          <p className="label-caps mb-2 px-1 text-ink-faint">Bar &amp; plates</p>
          <Card className="grid gap-3">
            <Stepper
              value={settings.barWeightKg}
              onChange={(barWeightKg) => void updateSettings({ barWeightKg })}
              step={2.5}
              min={0}
              max={40}
              unit="kg bar"
              decreaseLabel="Decrease bar weight"
              increaseLabel="Increase bar weight"
            />

            <div>
              <p className="label-caps mb-2 text-ink-faint">Pairs owned</p>
              <ul className="grid gap-1.5">
                {settings.plateInventory.map((plate, index) => (
                  <li
                    key={plate.weightKg}
                    className="flex items-center gap-3 rounded-md bg-sunken px-3 py-2"
                  >
                    <span className="num flex-1 text-[0.95rem] font-semibold">
                      {plate.weightKg} kg
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        aria-label={`One fewer pair of ${plate.weightKg} kg plates`}
                        onClick={() => {
                          const next = settings.plateInventory.map((p, i) =>
                            i === index ? { ...p, pairs: Math.max(0, p.pairs - 1) } : p,
                          )
                          void updateSettings({ plateInventory: next })
                        }}
                        className="touch-min grid cursor-pointer place-items-center rounded-sm bg-surface text-[1.1rem] font-semibold"
                      >
                        −
                      </button>
                      <span className="num w-7 text-center text-[0.95rem] font-bold">
                        {plate.pairs}
                      </span>
                      <button
                        type="button"
                        aria-label={`One more pair of ${plate.weightKg} kg plates`}
                        onClick={() => {
                          const next = settings.plateInventory.map((p, i) =>
                            i === index ? { ...p, pairs: p.pairs + 1 } : p,
                          )
                          void updateSettings({ plateInventory: next })
                        }}
                        className="touch-min grid cursor-pointer place-items-center rounded-sm bg-surface text-[1.1rem] font-semibold"
                      >
                        +
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[0.75rem] leading-relaxed text-ink-muted">
                The plate calculator only uses what you own. Set a count to zero and it will route
                around that plate rather than pretend you have it.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}
