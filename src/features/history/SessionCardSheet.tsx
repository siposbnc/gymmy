import { Check, Copy } from 'lucide-react'
import { useEffect, useState } from 'react'

import type { SessionCardData } from '~/domain/session-card'
import type { WeightUnit } from '~/domain/units'
import { Button } from '~/ui/Button'
import { Sheet } from '~/ui/Sheet'

import { renderSessionCard } from './sessionCardImage'

/**
 * The session as a square image, for showing someone.
 *
 * **Copy, not share.** A share sheet on iOS reports nothing back and lands the
 * file somewhere nobody can find; an image on the clipboard goes straight into
 * whatever the person already has open. The picture itself is rendered at full
 * size in the sheet as well, because press-and-hold is the gesture an iPhone
 * user already knows — and it works when the Clipboard API is missing or
 * refuses.
 *
 * Nothing is written or uploaded. The card is made on the device, handed to
 * the clipboard, and forgotten when the sheet closes.
 */

type Status = 'rendering' | 'ready' | 'unavailable'

interface SessionCardSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Null while the session is still loading. */
  data: SessionCardData | null
  unit: WeightUnit
  /** Formatted here rather than in the drawing, which knows no locale. */
  dateLabel: string
}

const canCopyImages = () =>
  typeof ClipboardItem !== 'undefined' && typeof navigator.clipboard?.write === 'function'

export function SessionCardSheet({
  open,
  onOpenChange,
  data,
  unit,
  dateLabel,
}: SessionCardSheetProps) {
  const [url, setUrl] = useState<string | null>(null)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [status, setStatus] = useState<Status>('rendering')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open || data == null) return

    let objectUrl: string | null = null
    let cancelled = false
    setStatus('rendering')
    setCopied(false)

    void renderSessionCard(data, { unit, dateLabel }).then((rendered) => {
      if (cancelled) return
      if (rendered == null) {
        setStatus('unavailable')
        return
      }
      objectUrl = URL.createObjectURL(rendered)
      setBlob(rendered)
      setUrl(objectUrl)
      setStatus('ready')
    })

    return () => {
      cancelled = true
      // The image is a few hundred kilobytes; leaking one per open would add up
      // over a history someone scrolls through.
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      setUrl(null)
      setBlob(null)
    }
  }, [open, data, unit, dateLabel])

  async function copy() {
    if (!blob) return
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Safari refuses the write outside a user gesture it recognises, and
      // some browsers refuse images entirely. The picture is right there, so
      // say so rather than failing silently.
      setStatus('unavailable')
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      eyebrow={data?.title}
      title="Share this workout"
      footer={
        status === 'ready' && canCopyImages() ? (
          <Button className="w-full" onClick={() => void copy()}>
            {copied ? (
              <>
                <Check size={17} aria-hidden /> Copied to clipboard
              </>
            ) : (
              <>
                <Copy size={17} aria-hidden /> Copy image
              </>
            )}
          </Button>
        ) : null
      }
    >
      <div className="px-5 pt-4 pb-5">
        {status === 'rendering' ? (
          <div className="grid aspect-square place-items-center rounded-lg border border-dashed border-line-strong">
            <p className="text-[0.85rem] text-ink-faint">Drawing the card…</p>
          </div>
        ) : null}

        {url ? (
          <img
            src={url}
            alt={`${data?.title ?? 'Workout'} — a square card showing the session's duration, sets, volume and top lifts`}
            width={1080}
            height={1080}
            className="w-full rounded-lg border border-line shadow-(--shadow-sm)"
          />
        ) : null}

        {status === 'unavailable' && url == null ? (
          <p className="py-8 text-center text-[0.85rem] leading-relaxed text-ink-muted">
            This device could not draw the card. Nothing is wrong with the workout — the summary
            above it is all still there.
          </p>
        ) : null}

        {url ? (
          <p className="mt-3 text-center text-[0.78rem] leading-relaxed text-ink-muted">
            {canCopyImages()
              ? 'Or press and hold the image to copy or save it.'
              : 'Press and hold the image to copy or save it.'}
          </p>
        ) : null}
      </div>
    </Sheet>
  )
}
