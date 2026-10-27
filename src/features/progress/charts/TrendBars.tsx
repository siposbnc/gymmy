import { useId, useState } from 'react'

import { CHART, compactNumber, niceMax } from './chart'

export interface TrendPoint {
  readonly key: string
  readonly label: string
  readonly value: number
  /** Shown in the tooltip under the value. */
  readonly sub?: string
}

interface TrendBarsProps {
  points: readonly TrendPoint[]
  /** Appended to the value in the tooltip, e.g. "kg". */
  unit?: string
  /** Names the single series, so no legend box is needed. */
  title: string
  height?: number
}

/**
 * Magnitude over time: vertical bars.
 *
 * Bars rather than a line because weekly volume is a discrete total per week,
 * not a continuous quantity sampled weekly — a line would imply values between
 * the weeks that do not exist.
 */
export function TrendBars({ points, unit, title, height = 150 }: TrendBarsProps) {
  const [selected, setSelected] = useState<string | null>(null)
  const clipId = useId()

  if (points.length === 0) {
    return (
      <p className="py-8 text-center text-[0.82rem] text-ink-faint">
        Not enough history yet.
      </p>
    )
  }

  const width = 320
  const plotHeight = height - CHART.padTop - CHART.padBottom
  const max = niceMax(Math.max(...points.map((point) => point.value)))
  const slot = width / points.length
  const barWidth = Math.max(3, slot - CHART.barGap * 2)

  const active = points.find((point) => point.key === selected) ?? null

  return (
    <figure className="m-0">
      <figcaption className="sr-only">{title}</figcaption>

      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="block h-auto w-full"
          role="img"
          aria-label={`${title}. ${points.length} points, highest ${compactNumber(max)}${unit ? ` ${unit}` : ''}.`}
        >
          <defs>
            {/* Clip so the rounded data-end never pokes below the baseline. */}
            <clipPath id={clipId}>
              <rect x="0" y="0" width={width} height={CHART.padTop + plotHeight} />
            </clipPath>
          </defs>

          {/* Recessive gridlines — two is enough to read a magnitude. */}
          {[0.5, 1].map((fraction) => (
            <line
              key={fraction}
              x1="0"
              x2={width}
              y1={CHART.padTop + plotHeight * (1 - fraction)}
              y2={CHART.padTop + plotHeight * (1 - fraction)}
              stroke="var(--border)"
              strokeWidth="1"
            />
          ))}

          <g clipPath={`url(#${clipId})`}>
            {points.map((point, index) => {
              const barHeight = max > 0 ? (point.value / max) * plotHeight : 0
              const x = index * slot + (slot - barWidth) / 2
              const y = CHART.padTop + plotHeight - barHeight
              const isActive = point.key === selected

              return (
                <rect
                  key={point.key}
                  x={x}
                  // Extend below the baseline so only the top corners round.
                  y={barHeight > 0 ? y : CHART.padTop + plotHeight - 1}
                  width={barWidth}
                  height={Math.max(barHeight, 1) + CHART.barRadius}
                  rx={CHART.barRadius}
                  fill="var(--accent)"
                  opacity={selected === null || isActive ? 1 : 0.4}
                />
              )
            })}
          </g>

          {/* Baseline sits above the labels, anchoring every bar. */}
          <line
            x1="0"
            x2={width}
            y1={CHART.padTop + plotHeight}
            y2={CHART.padTop + plotHeight}
            stroke="var(--border-strong)"
            strokeWidth="1"
          />

          {/* Selective labels only — first, last, and the tallest. */}
          {points.map((point, index) => {
            const isEdge = index === 0 || index === points.length - 1
            if (!isEdge && points.length > 2) return null
            return (
              <text
                key={point.key}
                x={index * slot + slot / 2}
                y={height - 5}
                textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}
                className="fill-ink-faint text-[9px] font-bold"
              >
                {point.label}
              </text>
            )
          })}

          {/* Hit targets, deliberately wider than the marks. */}
          {points.map((point, index) => (
            <rect
              key={`hit-${point.key}`}
              x={index * slot}
              y="0"
              width={slot}
              height={height}
              fill="transparent"
              className="cursor-pointer"
              onClick={() => setSelected((current) => (current === point.key ? null : point.key))}
              role="button"
              aria-label={`${point.label}: ${compactNumber(point.value)}${unit ? ` ${unit}` : ''}`}
            />
          ))}
        </svg>

        {active ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center">
            <span className="rounded-md border border-line bg-raised px-2.5 py-1.5 text-center shadow-(--shadow-sm)">
              <span className="label-caps block text-ink-faint">{active.label}</span>
              <span className="num block text-[0.95rem] font-bold">
                {compactNumber(active.value)}
                {unit ? <span className="ml-0.5 text-[0.7rem] text-ink-muted">{unit}</span> : null}
              </span>
              {active.sub ? (
                <span className="block text-[0.65rem] text-ink-muted">{active.sub}</span>
              ) : null}
            </span>
          </div>
        ) : null}
      </div>
    </figure>
  )
}
