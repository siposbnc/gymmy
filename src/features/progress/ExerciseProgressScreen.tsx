import { ChevronLeft } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'

import { useExerciseProgress, useSettings } from '~/db/hooks'
import { describeRecordKind } from '~/domain/records'
import { formatVolume, formatWeight, toDisplayUnit } from '~/domain/units'
import { Button } from '~/ui/Button'
import { Card } from '~/ui/Card'
import { InfoAffordance } from '~/ui/InfoAffordance'
import { cn } from '~/ui/cn'

import { SeriesLine, type SeriesPoint } from './charts/SeriesLine'

type Measure = 'top_set' | 'est_1rm' | 'volume'

const MEASURES: readonly { value: Measure; label: string; explainerId?: string }[] = [
  { value: 'top_set', label: 'Top set' },
  { value: 'est_1rm', label: 'est. 1RM', explainerId: 'est_1rm' },
  { value: 'volume', label: 'Volume', explainerId: 'volume' },
]

/**
 * One exercise over time.
 *
 * The three measures live behind a segmented control rather than on one chart.
 * They are on completely different scales — 140 kg, 154 kg, 8,400 kg — and a
 * second y-axis to fit them together is the single most misleading thing a
 * chart can do. One measure, one axis.
 */
export function ExerciseProgressScreen() {
  const { exerciseId } = useParams<{ exerciseId: string }>()
  const navigate = useNavigate()
  const progress = useExerciseProgress(exerciseId)
  const settings = useSettings()
  const [measure, setMeasure] = useState<Measure>('top_set')

  if (progress === undefined) {
    return <p className="p-8 text-center text-[0.85rem] text-ink-faint">Loading…</p>
  }

  const { exercise, points, records } = progress

  const recordSessions = new Set(
    records.filter((record) => record.kind === 'max_weight').map((record) => record.sessionId),
  )

  const series: SeriesPoint[] = points.map((point) => {
    const raw =
      measure === 'top_set'
        ? point.topSetKg
        : measure === 'est_1rm'
          ? point.estimatedOneRepMax
          : point.volumeKg

    return {
      key: point.sessionId,
      at: point.at,
      value: raw == null ? null : toDisplayUnit(raw, settings.units),
      isRecord: measure === 'top_set' && recordSessions.has(point.sessionId),
      ...(measure === 'top_set'
        ? { sub: `${point.topSetReps} rep${point.topSetReps === 1 ? '' : 's'}` }
        : {}),
    }
  })

  const unit = measure === 'volume' ? settings.units : settings.units
  const activeMeasure = MEASURES.find((option) => option.value === measure)!

  return (
    <>
      <header className="flex items-center gap-3 border-b border-line bg-canvas px-4 pt-3 pb-3">
        <button
          type="button"
          onClick={() => void navigate('/progress')}
          aria-label="Back to Progress"
          className="grid size-[2.375rem] shrink-0 cursor-pointer place-items-center rounded-full border border-line bg-surface"
        >
          <ChevronLeft size={18} aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          <p className="label-caps text-ink-faint">
            {points.length} session{points.length === 1 ? '' : 's'}
          </p>
          <h1 className="truncate font-display text-[1.375rem] leading-tight">
            {exercise?.name ?? 'Exercise'}
          </h1>
        </div>
      </header>

      <div className="grid gap-3 px-4 pt-3.5 pb-6">
        {points.length === 0 ? (
          <div className="py-10 text-center">
            <p className="font-display text-[1.5rem]">Never logged.</p>
            <Button className="mt-4" onClick={() => void navigate('/')}>
              Start a workout
            </Button>
          </div>
        ) : (
          <>
            <div
              role="radiogroup"
              aria-label="Measure"
              className="flex rounded-full border border-line bg-sunken p-[3px]"
            >
              {MEASURES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={measure === option.value}
                  onClick={() => setMeasure(option.value)}
                  className={cn(
                    'h-9 flex-1 cursor-pointer rounded-full text-[0.78rem] font-bold',
                    measure === option.value
                      ? 'bg-raised text-ink shadow-(--shadow-sm)'
                      : 'bg-transparent text-ink-muted',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <Card>
              <div className="mb-1 flex items-center gap-1.5">
                <h2 className="label-caps text-ink-faint">
                  {measure === 'est_1rm'
                    ? 'Estimated one-rep max — analysis, not a record'
                    : activeMeasure.label}
                </h2>
                {activeMeasure.explainerId ? (
                  <InfoAffordance explainerId={activeMeasure.explainerId} />
                ) : null}
              </div>

              <SeriesLine
                title={`${exercise?.name ?? 'Exercise'} — ${activeMeasure.label} over time`}
                points={series}
                unit={unit}
              />

              {measure === 'top_set' ? (
                <p className="mt-2 border-t border-dashed border-line pt-2 text-[0.7rem] leading-relaxed text-ink-faint">
                  A ring marks a session that set a heaviest-weight record.
                </p>
              ) : null}
            </Card>

            <div>
              <h2 className="label-caps mb-2 flex items-center gap-1.5 px-1 text-ink-faint">
                Records
                <InfoAffordance explainerId="records" />
              </h2>
              <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
                {records.map((record) => (
                  <li key={record.id} className="flex items-center gap-3 px-3.5 py-2.5">
                    <span aria-hidden className="h-6 w-[3px] shrink-0 rounded-full bg-pr" />
                    <span className="min-w-0 flex-1">
                      <span className="label-caps block text-ink-faint">
                        {describeRecordKind(record.kind, record.atWeightKg)}
                      </span>
                      <span className="num block text-[0.92rem] font-semibold">
                        {record.kind === 'max_weight'
                          ? formatWeight(record.value, settings.units)
                          : record.kind === 'max_session_volume'
                            ? formatVolume(record.value, settings.units)
                            : `${record.value} reps`}
                      </span>
                    </span>
                    <span className="num shrink-0 text-[0.72rem] text-ink-muted">
                      {new Date(record.achievedAt).toLocaleDateString(undefined, {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </span>
                  </li>
                ))}
              </ul>
              {records.length === 0 ? (
                <Card>
                  <p className="text-[0.8rem] text-ink-muted">No records yet.</p>
                </Card>
              ) : null}
            </div>
          </>
        )}
      </div>
    </>
  )
}
