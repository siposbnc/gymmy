import type { SessionCardData } from '~/domain/session-card'
import { formatWeight, toDisplayUnit, type WeightUnit } from '~/domain/units'
import { formatDuration } from '~/lib/time'

/**
 * The session card, drawn.
 *
 * Canvas rather than a screenshot of a DOM node. The alternatives all cost
 * more than they give: an SVG `foreignObject` renders inconsistently in
 * Safari, and a DOM-to-image library is a dependency for something that is
 * twenty lines of layout. Canvas also gives an exact 1080×1080 whatever the
 * phone's pixel ratio, which is the whole point of an image meant to leave the
 * device.
 *
 * **Colours are read from the live theme, never hard-coded.** The tokens in
 * `styles/tokens.css` are the source of truth for the app, so a card that
 * copied their hexes would be a second source that silently drifts. Reading
 * the computed custom properties means the card is the app's colours by
 * construction, in whichever theme is on.
 */

/** Square, because a square is the one shape nothing crops. */
export const CARD_SIZE = 1080

const PAD = 76
const UI = '"Archivo Variable", "Archivo", Arial, sans-serif'
const DISPLAY = '"Instrument Serif", Georgia, serif'

interface Palette {
  readonly bg: string
  readonly surface: string
  readonly line: string
  readonly ink: string
  readonly inkMuted: string
  readonly inkFaint: string
  readonly accent: string
  readonly pr: string
}

function readPalette(): Palette {
  const styles = getComputedStyle(document.documentElement)
  const read = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback

  return {
    bg: read('--bg', '#f6f3ee'),
    surface: read('--surface', '#fffdfa'),
    line: read('--border', '#e3dcd2'),
    ink: read('--text', '#1a1614'),
    inkMuted: read('--text-muted', '#6b625a'),
    inkFaint: read('--text-faint', '#746b62'),
    accent: read('--accent', '#c7430f'),
    pr: read('--pr', '#8a6410'),
  }
}

/**
 * Load every face the card draws with before drawing.
 *
 * Canvas does not wait for webfonts the way the DOM does: a `fillText` issued
 * before the face has loaded silently renders in the fallback, and the first
 * card anyone made would come out in Arial.
 */
async function loadFonts(): Promise<void> {
  if (!document.fonts) return
  await Promise.all([
    document.fonts.load(`400 72px ${DISPLAY}`),
    document.fonts.load(`400 40px ${UI}`),
    document.fonts.load(`600 40px ${UI}`),
    document.fonts.load(`700 26px ${UI}`),
    document.fonts.load(`600 76px ${UI}`),
  ])
  await document.fonts.ready
}

interface CardOptions {
  readonly unit: WeightUnit
  /** Formatted by the caller, which knows the locale. */
  readonly dateLabel: string
}

/**
 * Draw the card and hand back a PNG.
 *
 * Null when there is no 2D context to draw on — a headless test environment,
 * or a browser that has run out of canvas memory. The caller shows a sentence
 * rather than a broken image.
 */
export async function renderSessionCard(
  data: SessionCardData,
  options: CardOptions,
): Promise<Blob | null> {
  const canvas = document.createElement('canvas')
  canvas.width = CARD_SIZE
  canvas.height = CARD_SIZE

  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  await loadFonts()
  drawCard(ctx, data, options, readPalette())

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png')
  })
}

function drawCard(
  ctx: CanvasRenderingContext2D,
  data: SessionCardData,
  { unit, dateLabel }: CardOptions,
  palette: Palette,
): void {
  const right = CARD_SIZE - PAD

  ctx.fillStyle = palette.bg
  ctx.fillRect(0, 0, CARD_SIZE, CARD_SIZE)

  // An inset panel rather than a full bleed: the card reads as an object
  // someone made rather than as a screenshot with the edges cut off.
  roundedRect(ctx, PAD / 2, PAD / 2, CARD_SIZE - PAD, CARD_SIZE - PAD, 40)
  ctx.fillStyle = palette.surface
  ctx.fill()
  ctx.strokeStyle = palette.line
  ctx.lineWidth = 2
  ctx.stroke()

  // --- the session ---------------------------------------------------------
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = palette.inkFaint
  ctx.font = `700 24px ${UI}`
  ctx.letterSpacing = '2.4px'
  ctx.fillText(dateLabel.toUpperCase(), PAD, 168)
  ctx.letterSpacing = '0px'

  ctx.fillStyle = palette.ink
  ctx.font = `400 76px ${DISPLAY}`
  ctx.fillText(truncate(ctx, data.title, CARD_SIZE - PAD * 2), PAD, 246)

  // --- the three numbers ---------------------------------------------------
  const stats: [string, string][] = [
    ['Time', data.durationSeconds == null ? '—' : formatDuration(data.durationSeconds)],
    ['Sets', String(data.workingSets)],
    [
      unit.toUpperCase(),
      Math.round(toDisplayUnit(data.volumeKg, unit)).toLocaleString('en-US'),
    ],
  ]

  const columnWidth = (CARD_SIZE - PAD * 2) / 3
  stats.forEach(([label, value], index) => {
    const x = PAD + columnWidth * index

    ctx.fillStyle = palette.ink
    ctx.font = `600 72px ${UI}`
    ctx.fillText(value, x, 384)

    ctx.fillStyle = palette.inkFaint
    ctx.font = `700 22px ${UI}`
    ctx.letterSpacing = '2.2px'
    ctx.fillText(label.toUpperCase(), x, 424)
    ctx.letterSpacing = '0px'
  })

  line(ctx, PAD, 476, right, palette.line)

  // --- the lifts -----------------------------------------------------------
  // The reason the card is worth posting. A duration could be any workout.
  //
  // Centred in the room between the rule and the footer rather than hung from
  // the top of it: a three-exercise session would otherwise sit in the upper
  // third of a square with a third of the card empty beneath it.
  const ROW_HEIGHT = 64
  const regionTop = 476
  const regionBottom = data.recordCount > 0 ? 918 : 952
  const blockHeight =
    data.lines.length * ROW_HEIGHT + (data.hiddenExercises > 0 ? 46 : 0)

  let y = regionTop + Math.max(0, (regionBottom - regionTop - blockHeight) / 2) + 44

  for (const row of data.lines) {
    const figures =
      row.weightKg == null
        ? `bodyweight × ${row.reps}`
        : `${formatWeight(row.weightKg, unit, { withUnit: false })} ${unit} × ${row.reps}`

    ctx.font = `600 36px ${UI}`
    const figuresWidth = ctx.measureText(figures).width
    const star = row.isRecord ? 42 : 0

    ctx.fillStyle = palette.ink
    ctx.textAlign = 'right'
    ctx.fillText(figures, right - star, y)

    if (row.isRecord) {
      // Earned, and marked the same way it is marked everywhere else.
      ctx.fillStyle = palette.pr
      ctx.font = `600 34px ${UI}`
      ctx.fillText('★', right, y)
    }

    ctx.textAlign = 'left'
    ctx.fillStyle = palette.inkMuted
    ctx.font = `400 36px ${UI}`
    const room = right - PAD - figuresWidth - star - 32
    ctx.fillText(truncate(ctx, row.name, room), PAD, y)

    y += ROW_HEIGHT
  }

  if (data.hiddenExercises > 0) {
    ctx.fillStyle = palette.inkFaint
    ctx.font = `400 30px ${UI}`
    ctx.fillText(`+${data.hiddenExercises} more`, PAD, y)
  }

  // --- the footer ----------------------------------------------------------
  if (data.recordCount > 0) {
    ctx.fillStyle = palette.pr
    ctx.font = `600 34px ${UI}`
    ctx.fillText(
      `★ ${data.recordCount} personal record${data.recordCount === 1 ? '' : 's'}`,
      PAD,
      CARD_SIZE - 136,
    )
  }

  line(ctx, PAD, CARD_SIZE - 108, right, palette.line)

  ctx.fillStyle = palette.inkFaint
  ctx.font = `400 28px ${UI}`
  ctx.fillText('Logged with', PAD, CARD_SIZE - 62)

  const prefix = ctx.measureText('Logged with ').width
  ctx.fillStyle = palette.accent
  ctx.font = `700 28px ${UI}`
  ctx.letterSpacing = '2px'
  ctx.fillText('GYMMY', PAD + prefix, CARD_SIZE - 62)
  ctx.letterSpacing = '0px'
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + width, y, x + width, y + height, radius)
  ctx.arcTo(x + width, y + height, x, y + height, radius)
  ctx.arcTo(x, y + height, x, y, radius)
  ctx.arcTo(x, y, x + width, y, radius)
  ctx.closePath()
}

function line(ctx: CanvasRenderingContext2D, x1: number, y: number, x2: number, color: string) {
  ctx.beginPath()
  ctx.moveTo(x1, y)
  ctx.lineTo(x2, y)
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.stroke()
}

/** Clip a name to the room it has, with an ellipsis rather than an overlap. */
function truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text

  let clipped = text
  while (clipped.length > 1 && ctx.measureText(`${clipped}…`).width > maxWidth) {
    clipped = clipped.slice(0, -1)
  }
  return `${clipped.trimEnd()}…`
}
