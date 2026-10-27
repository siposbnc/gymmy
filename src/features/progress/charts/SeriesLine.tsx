import { useState } from 'react'

import { CHART, compactNumber, niceMax, shortDate } from './chart'

export interface SeriesPoint {
  readonly key: string
  readonly at: number
  /** Null leaves a genuine gap — see the estimated-1RM case. */
  readonly value: number | null
  readonly isRecord?: boolean
  readonly sub?: string
}

interface SeriesLineProps {
  points: readonly SeriesPoint[]
  unit?: string
  /** Names the single series, so no legend box is needed. */
  title: string
  height?: number
}

/**
 * Change over time: a line.
 *
 * Nulls are rendered as BREAKS, never interpolated or carried forward. A
 * session where no set qualified for an estimated 1RM has no value — drawing
 * through it would invent data, and flat-lining it would claim you stalled
 * when you simply did a different rep range.
 *
 * Records are marked by FORM, not by a second colour: a larger ring with a
 * surface-coloured gap plus a direct label. The validator put the accent and
 * the brass record colour at ΔE 2.8 under protanopia, so hue alone would be
 * invisible to a red-green colourblind reader.
 */
export function SeriesLine({ points, unit, title, height = 170 }: SeriesLineProps) {
  const [selected, setSelected] = useState<string | null>(null)

  const plotted = points.filter((point) => point.value != null)

  if (plotted.length === 0) {
    return (
      <p className="py-8 text-center text-[0.82rem] leading-relaxed text-ink-faint">
        No data for this measure yet.
      </p>
    )
  }

  const width = 320
  const plotHeight = height - CHART.padTop - CHART.padBottom

  const values = plotted.map((point) => point.value!)
  const max = niceMax(Math.max(...values))
  // Floor at zero only when the data is near it; otherwise a tight band makes
  // a 2.5kg gain legible instead of a flat line across the top.
  const rawMin = Math.min(...values)
  const min = rawMin > max * 0.4 ? Math.floor((rawMin * 0.92) / 5) * 5 : 0
  const span = Math.max(max - min, 1)

  const x = (index: number) =>
    points.length === 1 ? width / 2 : (index / (points.length - 1)) * width
  const y = (value: number) =>
    CHART.padTop + plotHeight - ((value - min) / span) * plotHeight

  // Build one path per unbroken run, so gaps stay gaps.
  const segments: string[] = []
  let current: string[] = []
  points.forEach((point, index) => {
    if (point.value == null) {
      if (current.length > 1) segments.push(current.join(' '))
      current = []
      return
    }
    current.push(`${current.length === 0 ? 'M' : 'L'} ${x(index)} ${y(point.value)}`)
  })
  if (current.length > 1) segments.push(current.join(' '))

  const active = points.find((point) => point.key === selected) ?? null
  const latest = plotted.at(-1)!
  const first = plotted[0]!
  const change = latest.value! - first.value!

  return (
    <figure className="m-0">
      <figcaption className="sr-only">{title}</figcaption>

      <div className="mb-1 flex items-baseline gap-2">
        <span className="num text-display font-semibold">
          {compactNumber(latest.value!)}
          {unit ? <span className="ml-0.5 text-[0.8rem] text-ink-muted">{unit}</span> : null}
        </span>
        {plotted.length > 1 ? (
          <span className="num text-[0.75rem] font-bold text-ink-muted">
            {change >= 0 ? '↑' : '↓'} {compactNumber(Math.abs(change))}
            {unit ?? ''} since {shortDate(first.at)}
          </span>
        ) : null}
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="block h-auto w-full overflow-visible"
          role="img"
          aria-label={`${title}. Latest ${compactNumber(latest.value!)}${unit ? ` ${unit}` : ''} on ${shortDate(latest.at)}.`}
        >
          {[0, 0.5, 1].map((fraction) => (
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

          {segments.map((path) => (
            <path
              key={path.slice(0, 24)}
              d={path}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={CHART.lineWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

          {points.map((point, index) =>
            point.value == null ? null : (
              <g key={point.key}>
                {point.isRecord ? (
                  // Form, not hue: a ring with a surface gap reads as "notable"
                  // at any colour vision, and in greyscale.
                  <circle
                    cx={x(index)}
                    cy={y(point.value)}
                    r={CHART.recordRadius}
                    fill="var(--surface)"
                    stroke="var(--accent)"
                    strokeWidth={CHART.ringWidth}
                  />
                ) : (
                  <circle
                    cx={x(index)}
                    cy={y(point.value)}
                    r={point.key === selected ? CHART.markerRadius + 1.5 : CHART.markerRadius}
                    fill="var(--accent)"
                    stroke="var(--surface)"
                    strokeWidth={CHART.ringWidth}
                  />
                )}
              </g>
            ),
          )}

          {/* Crosshair for the selected point. */}
          {active?.value != null ? (
            <line
              x1={x(points.indexOf(active))}
              x2={x(points.indexOf(active))}
              y1={CHART.padTop}
              y2={CHART.padTop + plotHeight}
              stroke="var(--border-strong)"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
          ) : null}

          <text x="0" y={height - 5} className="fill-ink-faint text-[9px] font-bold">
            {shortDate(first.at)}
          </text>
          <text
            x={width}
            y={height - 5}
            textAnchor="end"
            className="fill-ink-faint text-[9px] font-bold"
          >
            {shortDate(latest.at)}
          </text>

          {points.map((point, index) => (
            <rect
              key={`hit-${point.key}`}
              x={x(index) - width / Math.max(points.length, 1) / 2}
              y="0"
              width={width / Math.max(points.length, 1)}
              height={height}
              fill="transparent"
              className="cursor-pointer"
              onClick={() => setSelected((c) => (c === point.key ? null : point.key))}
              role="button"
              aria-label={`${shortDate(point.at)}: ${
                point.value == null ? 'no data' : compactNumber(point.value)
              }`}
            />
          ))}
        </svg>

        {active ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center">
            <span className="rounded-md border border-line bg-raised px-2.5 py-1.5 text-center shadow-(--shadow-sm)">
              <span className="label-caps block text-ink-faint">{shortDate(active.at)}</span>
              <span className="num block text-[0.95rem] font-bold">
                {active.value == null ? '—' : compactNumber(active.value)}
                {active.value != null && unit ? (
                  <span className="ml-0.5 text-[0.7rem] text-ink-muted">{unit}</span>
                ) : null}
              </span>
              {active.sub ? (
                <span className="block text-[0.65rem] text-ink-muted">{active.sub}</span>
              ) : null}
              {active.isRecord ? (
                <span className="label-caps mt-0.5 block text-ink">★ Record</span>
              ) : null}
            </span>
          </div>
        ) : null}
      </div>
    </figure>
  )
}
