import { fullNumber } from './chart'

export interface CategoryDatum {
  readonly key: string
  readonly label: string
  readonly value: number
}

interface CategoryBarsProps {
  data: readonly CategoryDatum[]
  unit?: string
  title: string
  /** Fold everything past this into "Other". */
  maxRows?: number
}

/**
 * Magnitude across categories: horizontal bars.
 *
 * Horizontal rather than vertical because the categories are words — "hamstrings"
 * does not fit under a 40px column on a 390px screen, and rotated axis labels
 * are an anti-pattern.
 *
 * One hue, not fourteen. Identity is carried by the row labels, so colour has
 * no job here beyond marking the data; using a categorical palette would imply
 * the hues mean something they do not.
 */
export function CategoryBars({ data, unit, title, maxRows = 8 }: CategoryBarsProps) {
  if (data.length === 0) {
    return (
      <p className="py-6 text-center text-[0.82rem] text-ink-faint">
        Nothing logged this week yet.
      </p>
    )
  }

  const sorted = [...data].sort((a, b) => b.value - a.value)

  // A ninth category is never a new hue; it folds into "Other".
  const head = sorted.slice(0, maxRows)
  const tail = sorted.slice(maxRows)
  const rows =
    tail.length > 0
      ? [
          ...head,
          {
            key: '__other',
            label: `Other (${tail.length})`,
            value: tail.reduce((sum, row) => sum + row.value, 0),
          },
        ]
      : head

  const max = Math.max(...rows.map((row) => row.value), 1)

  return (
    <figure className="m-0">
      <figcaption className="sr-only">{title}</figcaption>

      {/* The unit is stated once here rather than repeated on every row —
          appending it to a compacted value produced "2.0kkg". */}
      {unit ? (
        <p className="label-caps mb-1.5 text-right text-ink-faint">{unit}</p>
      ) : null}

      <ul className="grid gap-1.5">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center gap-2.5">
            <span className="w-[5.5rem] shrink-0 truncate text-[0.72rem] font-semibold capitalize">
              {row.label.replace(/_/g, ' ')}
            </span>

            <span className="relative h-4 min-w-0 flex-1 overflow-hidden rounded-sm bg-sunken">
              <span
                className="absolute inset-y-0 left-0 rounded-sm bg-accent"
                style={{ width: `${Math.max(2, (row.value / max) * 100)}%` }}
              />
            </span>

            {/* Direct label on every row: with this few rows an axis would be
                more furniture than the data. Full values, not compacted —
                "2.0k" for both 2,016 and 1,980 hides the difference the bars
                are there to show. */}
            <span className="num w-[3.25rem] shrink-0 text-right text-[0.72rem] font-bold text-ink-muted">
              {fullNumber(row.value)}
            </span>
          </li>
        ))}
      </ul>
    </figure>
  )
}
