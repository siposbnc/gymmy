import { useState } from 'react'

import { updateSettings } from '~/db/repositories/settings'
import type { Settings } from '~/domain/types'
import { platform } from '~/lib/platform'
import { Button } from '~/ui/Button'
import { Card } from '~/ui/Card'
import { InfoAffordance } from '~/ui/InfoAffordance'
import { Stepper } from '~/ui/Stepper'
import { cn } from '~/ui/cn'

function Toggle({
  label,
  hint,
  checked,
  disabled = false,
  onChange,
}: {
  label: string
  hint: string
  checked: boolean
  disabled?: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <label
      className={cn(
        'flex items-center gap-3 py-2.5',
        disabled && 'pointer-events-none opacity-50',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[0.9rem] font-medium">{label}</span>
        <span className="block text-[0.75rem] leading-relaxed text-ink-muted">{hint}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-[1.875rem] w-[3.125rem] shrink-0 cursor-pointer rounded-full',
          'transition-colors duration-200',
          checked ? 'bg-success' : 'bg-line-strong',
        )}
      >
        <span
          className={cn(
            'absolute top-[3px] size-6 rounded-full bg-white shadow-sm',
            'transition-[left] duration-200 ease-(--ease-spring)',
            checked ? 'left-[23px]' : 'left-[3px]',
          )}
        />
      </button>
    </label>
  )
}

/**
 * Rest timer preferences.
 *
 * The notification row is honest about platform limits rather than silently
 * doing nothing: vibration does not exist in Safari, and web notifications on
 * iOS need an installed PWA. Both are listed as extras on top of the in-app
 * sound, because the sound is the one that always works.
 */
export function RestSection({ settings }: { settings: Settings }) {
  const [permission, setPermission] = useState(() => platform.notifications.getPermission())
  const notificationsSupported = platform.notifications.isSupported()
  const vibrationSupported = platform.vibration.isSupported()

  return (
    <div>
      <p className="label-caps mb-2 flex items-center gap-1.5 px-1 text-ink-faint">
        Rest timer
        <InfoAffordance explainerId="rest_timer" />
      </p>
      <Card className="grid gap-3">
        <Stepper
          value={settings.defaultRestSeconds}
          onChange={(defaultRestSeconds) => void updateSettings({ defaultRestSeconds })}
          step={15}
          min={0}
          max={600}
          unit="seconds"
          hint="Default — each exercise remembers its own"
          decreaseLabel="Decrease default rest by 15 seconds"
          increaseLabel="Increase default rest by 15 seconds"
        />

        <div className="divide-y divide-line">
          <Toggle
            label="Start automatically"
            hint="Begins the moment you log a set"
            checked={settings.autoStartRest}
            onChange={(autoStartRest) => void updateSettings({ autoStartRest })}
          />
          <Toggle
            label="Sound"
            hint="Two short tones. Works everywhere, which is why it is the fallback."
            checked={settings.restSound}
            onChange={(restSound) => void updateSettings({ restSound })}
          />
          <Toggle
            label="Vibrate"
            hint={
              vibrationSupported
                ? 'A short double buzz when rest ends'
                : 'Not available in this browser — Safari has no vibration API'
            }
            checked={settings.restVibrate && vibrationSupported}
            disabled={!vibrationSupported}
            onChange={(restVibrate) => void updateSettings({ restVibrate })}
          />
        </div>

        {notificationsSupported && permission !== 'granted' ? (
          <div className="rounded-md border border-line bg-sunken px-3 py-2.5">
            <p className="text-[0.78rem] leading-relaxed text-ink-muted">
              {permission === 'denied'
                ? 'Notifications are blocked, so Gymmy can only alert you while the app is open. The timer itself still keeps perfect time — it counts from a timestamp, not a ticking counter.'
                : 'Allow notifications and Gymmy can tell you rest is over even if you have switched apps.'}
            </p>
            {permission === 'default' ? (
              <Button
                size="sm"
                variant="secondary"
                className="mt-2"
                onClick={() => {
                  void platform.notifications.requestPermission().then(setPermission)
                }}
              >
                Allow notifications
              </Button>
            ) : null}
          </div>
        ) : null}
      </Card>
    </div>
  )
}
