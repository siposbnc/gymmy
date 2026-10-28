import { ChevronRight, Flame } from 'lucide-react'
import { useNavigate } from 'react-router'

import { useProgressOverview, useSettings } from '~/db/hooks'
import type { MuscleSetProgress } from '~/domain/goals'
import { MUSCLE_LABEL } from '~/domain/muscles'
import { formatVolume, formatWeight } from '~/domain/units'
import { Card } from '~/ui/Card'
import { InfoAffordance } from '~/ui/InfoAffordance'
import { ScreenHeader } from '~/ui/ScreenHeader'

import { CategoryBars } from './charts/CategoryBars'
import { TrendBars } from './charts/TrendBars'

/**
 * This week's set counts, against targets where there are any.
 *
 * Under-target is marked by a visibly unfilled bar and the "of N" label, not by
 * a colour: the same palette has to work for a colourblind reader, and "behind
 * on back" is information rather than an alarm. A muscle with no target gets a
 * count and no bar — there is nothing to be short of.
 */
function WeeklySetList({ progress }: { progress: readonly MuscleSetProgress[] }) {
  if (progress.length === 0) {
    return (
      <p className="text-[0.82rem] leading-relaxed text-ink-muted">
        No working sets logged this week yet.
      </p>
    )
  }

  return (
    <ul className="grid gap-2">
      {progress.map((row) => (
        <li key={row.muscle} className="grid gap-1">
          <div className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate text-[0.85rem] font-medium">
              {MUSCLE_LABEL[row.muscle]}
            </span>
            <span className="num shrink-0 text-[0.85rem] font-bold">
              {row.sets}
              {row.target == null ? null : (
                <span className="font-medium text-ink-muted"> of {row.target}</span>
              )}
            </span>
          </div>
          {row.target == null ? null : (
            <div
              className="h-1.5 overflow-hidden rounded-full bg-sunken"
              role="img"
              aria-label={`${row.sets} of ${row.target} sets`}
            >
              <span
                className="block h-full rounded-full bg-accent"
                style={{ width: `${Math.min(1, row.sets / row.target) * 100}%` }}
              />
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

export function ProgressScreen() {
  const navigate = useNavigate()
  const overview = useProgressOverview()
  const settings = useSettings()

  if (overview === undefined) {
    return <p className="p-8 text-center text-[0.85rem] text-ink-faint">Loading…</p>
  }

  const {
    streak,
    weeks,
    thisWeekByMuscle,
    thisWeekSets,
    hasSetTargets,
    records,
    exerciseNames,
    sessionCount,
  } = overview

  if (sessionCount === 0) {
    return (
      <>
        <ScreenHeader title="Progress" />
        <div className="px-6 py-10 text-center">
          <p className="font-display text-[1.75rem] leading-tight">Nothing to chart yet.</p>
          <p className="mx-auto mt-3 max-w-xs text-[0.88rem] leading-relaxed text-ink-muted">
            Finish a couple of workouts and this fills in: what you lifted, how your best sets are
            trending, and where your volume is going.
          </p>
        </div>
      </>
    )
  }

  // Last 12 weeks, oldest first — enough to see a trend on a 390px screen
  // without the bars becoming hairlines.
  const recentWeeks = weeks.slice(-12)
  const thisWeek = weeks.at(-1)

  return (
    <>
      <ScreenHeader title="Progress" />

      <div className="grid gap-3 px-4 pb-6">
        {settings.showStreak ? (
          <Card className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent-wash text-accent-ink">
              <Flame size={20} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              {/* A hero number, not a chart — one value needs no plot. */}
              <span className="num block text-display leading-none font-semibold">
                {streak.weeks}
                <span className="ml-1 text-[0.85rem] font-semibold text-ink-muted">
                  week{streak.weeks === 1 ? '' : 's'}
                </span>
              </span>
              <span className="block text-[0.75rem] text-ink-muted">
                {streak.currentWeekMet
                  ? `This week is done too — ${streak.thisWeek} of ${streak.goal}.`
                  : `${streak.thisWeek} of ${streak.goal} sessions this week.`}
              </span>
            </span>
            <InfoAffordance explainerId="streak" />
          </Card>
        ) : null}

        <Card>
          <h2 className="label-caps mb-2 flex items-center gap-1.5 text-ink-faint">
            Weekly volume
            <InfoAffordance explainerId="volume" />
          </h2>
          <TrendBars
            title="Total training volume per week"
            unit={settings.units}
            points={recentWeeks.map((week) => ({
              key: String(week.weekStart),
              label: new Date(week.weekStart).toLocaleDateString(undefined, {
                day: 'numeric',
                month: 'short',
              }),
              value: week.totalKg,
              sub: `${week.sessionIds.length} session${week.sessionIds.length === 1 ? '' : 's'}`,
            }))}
          />
        </Card>

        <Card>
          <h2 className="label-caps mb-0.5 text-ink-faint">This week by muscle</h2>
          <p className="mb-2.5 text-[0.72rem] leading-relaxed text-ink-muted">
            {thisWeek
              ? `${formatVolume(thisWeek.totalKg, settings.units)} across ${thisWeek.sessionIds.length} session${thisWeek.sessionIds.length === 1 ? '' : 's'}.`
              : 'Nothing logged this week yet.'}{' '}
            Each set counts toward its exercise&rsquo;s main muscle.
          </p>
          <CategoryBars
            title="Volume by muscle group this week"
            unit={settings.units}
            data={thisWeekByMuscle}
          />
        </Card>

        <Card>
          <h2 className="label-caps mb-0.5 flex items-center gap-1.5 text-ink-faint">
            Hard sets this week
            <InfoAffordance explainerId="weekly_sets" />
          </h2>
          <p className="mb-2.5 text-[0.72rem] leading-relaxed text-ink-muted">
            {hasSetTargets
              ? 'Working sets per muscle, against your targets. Anything short of target is listed first.'
              : 'Working sets per muscle. Set targets in Settings and they show up here as a bar.'}
          </p>
          <WeeklySetList progress={thisWeekSets} />
        </Card>

        <div>
          <h2 className="label-caps mb-2 flex items-center gap-1.5 px-1 text-ink-faint">
            Personal records
            <InfoAffordance explainerId="records" />
          </h2>

          {records.length === 0 ? (
            <Card>
              <p className="text-[0.82rem] leading-relaxed text-ink-muted">
                No records yet. Every exercise sets one the first time you log it.
              </p>
            </Card>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
              {records.map((record) => (
                <li key={record.id}>
                  <button
                    type="button"
                    onClick={() => void navigate(`/progress/${record.exerciseId}`)}
                    className="flex w-full cursor-pointer items-center gap-3 px-3.5 py-3 text-left"
                  >
                    <span aria-hidden className="h-7 w-[3px] shrink-0 rounded-full bg-pr" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.92rem] font-semibold">
                        {exerciseNames.get(record.exerciseId) ?? 'Exercise'}
                      </span>
                      <span className="label-caps block text-ink-faint">Heaviest logged</span>
                    </span>
                    <span className="num shrink-0 text-[0.95rem] font-bold">
                      {formatWeight(record.value, settings.units)}
                    </span>
                    <ChevronRight size={15} className="shrink-0 text-ink-faint" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  )
}
