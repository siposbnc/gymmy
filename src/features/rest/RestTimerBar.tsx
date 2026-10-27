import { useSettings } from '~/db/hooks'
import { formatDuration } from '~/lib/time'
import { cn } from '~/ui/cn'

import {
  describeRest,
  useRestCompletionSignals,
  useRestProgress,
  useRestTimer,
} from './restTimer'

/**
 * The sticky rest bar.
 *
 * A 5px precision rail rather than a chunky progress bar — this sits on screen
 * for most of a workout and must not shout. It raises its voice exactly once,
 * in the final ten seconds, and again on completion.
 */
export function RestTimerBar() {
  const settings = useSettings()
  const { remaining, fraction, isRunning, isComplete } = useRestProgress()
  const extend = useRestTimer((state) => state.extend)
  const skip = useRestTimer((state) => state.skip)

  useRestCompletionSignals({ sound: settings.restSound, vibrate: settings.restVibrate })

  if (!isRunning) return null

  const soon = !isComplete && remaining <= 10

  return (
    <div
      className={cn(
        'mx-3 mb-2 rounded-lg border bg-raised px-3.5 py-2.5 shadow-(--shadow-md)',
        isComplete ? 'border-success bg-success-wash' : soon ? 'border-accent' : 'border-line',
      )}
    >
      <div className="mb-2 flex items-center gap-3">
        <span
          className={cn(
            'label-caps shrink-0',
            isComplete ? 'animate-[pulse_1.6s_ease-in-out_infinite] text-success' : soon ? 'text-accent' : 'text-ink-faint',
          )}
        >
          {isComplete ? 'Rest done' : soon ? 'Rest · get ready' : 'Rest'}
        </span>

        <span
          className={cn(
            'num-hero flex-1 text-[1.7rem] leading-none',
            isComplete ? 'text-success' : soon ? 'text-accent' : '',
          )}
        >
          {formatDuration(Math.max(0, remaining))}
        </span>

        {!isComplete ? (
          <button
            type="button"
            onClick={() => extend(30)}
            className="h-9 shrink-0 cursor-pointer rounded-full border border-line-strong bg-surface px-3.5 text-[0.75rem] font-bold active:scale-95"
          >
            +30s
          </button>
        ) : null}

        <button
          type="button"
          onClick={skip}
          className="h-9 shrink-0 cursor-pointer rounded-full px-3.5 text-[0.75rem] font-bold text-accent active:scale-95"
        >
          {isComplete ? 'Dismiss' : 'Skip'}
        </button>
      </div>

      {/* The rail doubles as the recovery indicator: reopen the app after
          ninety seconds away and it is already in the right place. */}
      <div className="relative h-[5px] overflow-hidden rounded-full bg-sunken">
        <span
          className={cn(
            'block h-full rounded-full transition-[width] duration-500 ease-linear',
            isComplete ? 'bg-success' : 'bg-accent',
          )}
          style={{ width: `${isComplete ? 100 : fraction * 100}%` }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-50"
          style={{
            backgroundImage:
              'repeating-linear-gradient(90deg, transparent 0 22px, var(--border-strong) 22px 23px)',
          }}
        />
      </div>

      {/* Announced, not drawn — the visual countdown is already there. */}
      <p role="status" aria-live="polite" className="sr-only">
        {describeRest(remaining)}
      </p>
    </div>
  )
}
