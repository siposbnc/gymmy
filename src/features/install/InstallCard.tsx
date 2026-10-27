import { Check, Download, Share, X } from 'lucide-react'
import { useState } from 'react'

import { platform } from '~/lib/platform'
import { Button } from '~/ui/Button'
import { Card } from '~/ui/Card'

import { useInstallState } from './useInstallState'

const DISMISSED_KEY = 'gymmy.install-dismissed'

/**
 * The case for installing, stated honestly.
 *
 * This is not a growth nudge. On iOS an uninstalled site can have its
 * IndexedDB evicted under storage pressure, and the training history in there
 * exists nowhere else. Installing also unlocks notifications, without which
 * the rest timer cannot reach you once you switch apps. So the copy explains
 * the actual stakes rather than saying "get the app!".
 */
export function InstallCard({
  dismissible = false,
  onDismiss,
}: {
  dismissible?: boolean
  onDismiss?: () => void
}) {
  const state = useInstallState()
  const [busy, setBusy] = useState(false)

  if (state === 'installed') {
    return (
      <Card className="flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-success-wash text-success">
          <Check size={18} aria-hidden />
        </span>
        <p className="text-[0.85rem] leading-relaxed text-ink-muted">
          Installed. Your history is stored on this device and the app works with no signal.
        </p>
      </Card>
    )
  }

  if (state === 'unsupported') return null

  return (
    <Card className="relative">
      {dismissible ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss install suggestion"
          className="absolute top-2.5 right-2.5 grid size-8 cursor-pointer place-items-center rounded-full text-ink-faint"
        >
          <X size={15} aria-hidden />
        </button>
      ) : null}

      <p className="label-caps mb-1 text-accent-ink">Add to your home screen</p>
      <p className="pr-6 text-[0.85rem] leading-relaxed text-ink-muted">
        Gymmy keeps everything on this device. Installing it makes the browser far less likely to
        clear that storage, lets the rest timer reach you after you switch apps, and makes the app
        open with no signal at all.
      </p>

      {state === 'promptable' ? (
        <Button
          className="mt-3"
          disabled={busy}
          onClick={() => {
            setBusy(true)
            void platform.install.prompt().finally(() => setBusy(false))
          }}
        >
          <Download size={17} aria-hidden />
          Install Gymmy
        </Button>
      ) : (
        <ol className="mt-3 grid gap-2 rounded-md bg-sunken px-3.5 py-3">
          <Step n={1}>
            Tap the <Share size={13} className="inline align-[-2px]" aria-label="Share" /> Share
            button in Safari&rsquo;s toolbar.
          </Step>
          <Step n={2}>
            Scroll down and choose <strong className="font-semibold text-ink">Add to Home
            Screen</strong>.
          </Step>
          <Step n={3}>Open Gymmy from the home screen icon rather than from Safari.</Step>
        </ol>
      )}
    </Card>
  )
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5 text-[0.82rem] leading-relaxed text-ink-muted">
      <span className="num grid size-[1.125rem] shrink-0 place-items-center rounded-full bg-accent text-[0.65rem] font-extrabold text-on-accent">
        {n}
      </span>
      <span>{children}</span>
    </li>
  )
}

/** Today's dismissible version, which remembers being dismissed. */
export function InstallNudge() {
  const state = useInstallState()
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISSED_KEY) === '1'
    } catch {
      return false
    }
  })

  if (dismissed || state === 'installed' || state === 'unsupported') return null

  return (
    <InstallCard
      dismissible
      onDismiss={() => {
        setDismissed(true)
        try {
          localStorage.setItem(DISMISSED_KEY, '1')
        } catch {
          // Non-fatal: it will simply reappear next launch.
        }
      }}
    />
  )
}
