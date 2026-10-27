import { toDisplayUnit, type WeightUnit } from './units'

/**
 * CSV export.
 *
 * The JSON backup is for restoring Gymmy; this is for everything else — a
 * spreadsheet, a coach, your own curiosity. One row per set, flattened, so it
 * is useful the moment it opens rather than needing to be unpicked first.
 *
 * Weight appears twice on purpose: `weight_kg` is the canonical stored value,
 * and `weight` is whatever unit you read the app in. Exporting only the
 * display unit would lose precision for pound users; exporting only kilograms
 * would be unreadable for them.
 */

export interface CsvSetRow {
  readonly sessionId: string
  readonly sessionName: string
  readonly startedAt: number
  readonly exerciseName: string
  readonly setIndex: number
  readonly setType: string
  readonly weightKg?: number | undefined
  readonly reps?: number | undefined
  readonly rpe?: number | undefined
}

const COLUMNS = [
  'date',
  'session',
  'exercise',
  'set',
  'type',
  'weight_kg',
  'weight',
  'unit',
  'reps',
  'rpe',
  'volume_kg',
] as const

/**
 * Escape one field.
 *
 * Quote anything containing a comma, quote, or newline, and double any inner
 * quotes — the RFC 4180 rules. Exercise names are user-editable, so "Bench
 * Press, close grip" is a realistic input rather than a hypothetical.
 */
export function escapeCsvField(value: string): string {
  if (!/[",\n\r]/.test(value)) return value
  return `"${value.replace(/"/g, '""')}"`
}

function isoDate(timestamp: number): string {
  const date = new Date(timestamp)
  const pad = (n: number) => String(n).padStart(2, '0')
  // Local date, not UTC: a 9pm workout should not export as the next day.
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function toCsv(rows: readonly CsvSetRow[], unit: WeightUnit): string {
  const lines = [COLUMNS.join(',')]

  for (const row of rows) {
    const volume =
      row.weightKg != null && row.reps != null ? row.weightKg * row.reps : undefined

    const fields = [
      isoDate(row.startedAt),
      row.sessionName,
      row.exerciseName,
      String(row.setIndex),
      row.setType,
      row.weightKg == null ? '' : String(round(row.weightKg)),
      row.weightKg == null ? '' : String(round(toDisplayUnit(row.weightKg, unit))),
      unit,
      row.reps == null ? '' : String(row.reps),
      row.rpe == null ? '' : String(row.rpe),
      volume == null ? '' : String(round(volume)),
    ]

    lines.push(fields.map(escapeCsvField).join(','))
  }

  // Trailing newline: some tools drop the final row without it.
  return `${lines.join('\n')}\n`
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

export function csvFilename(now = new Date()): string {
  return `gymmy-sets-${isoDate(now.getTime())}.csv`
}
