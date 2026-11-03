import { Check, Copy } from 'lucide-react'
import { useEffect, useState } from 'react'

import { buildRoutineShareCode } from '~/db/repositories/routine-share'
import { platform } from '~/lib/platform'
import { Button } from '~/ui/Button'
import { Sheet } from '~/ui/Sheet'

/**
 * Hand a routine to someone else.
 *
 * A code rather than a file: a file on iOS means the share sheet, which
 * reports nothing back and lands somewhere nobody can find. A string goes into
 * any message and comes back with a paste — and the same string works as a
 * personal backup of one plan, which the full JSON export does not.
 *
 * What is in it is stated plainly. A routine carries your target weights and
 * your notes, and that is worth knowing before you send it to a group chat.
 */
export function ShareRoutineSheet({
  routineId,
  routineName,
  open,
  onOpenChange,
}: {
  routineId: string | undefined
  routineName: string | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [code, setCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open || !routineId) return

    let current = true
    setCode(null)
    setError(null)
    setCopied(false)

    buildRoutineShareCode(routineId)
      .then((built) => {
        if (current) setCode(built)
      })
      .catch((cause: unknown) => {
        if (current) {
          setError(cause instanceof Error ? cause.message : 'Could not build a code for this.')
        }
      })

    return () => {
      current = false
    }
  }, [open, routineId])

  async function copy() {
    if (!code) return
    const ok = await platform.clipboard.writeText(code)
    // "Copied" only when the browser actually said yes. Otherwise say so, and
    // leave them the selectable block below as the way out.
    setCopied(ok)
    if (!ok) setError('Copying was blocked. Select the code below and copy it by hand.')
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      eyebrow={routineName}
      title="Share this routine"
      footer={
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
            Done
          </Button>
          <Button size="sm" className="flex-1" disabled={code == null} onClick={() => void copy()}>
            {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
            {copied ? 'Copied' : 'Copy code'}
          </Button>
        </div>
      }
    >
      <div className="grid gap-3 px-5 py-4">
        <p className="text-[0.82rem] leading-relaxed text-ink-muted">
          Send this code to anyone using Gymmy. They paste it into Routines → Import and end up with
          the same plan: the same exercises, order, targets and rest.
        </p>

        {error ? (
          <p className="text-[0.82rem] leading-relaxed text-danger" role="alert">
            {error}
          </p>
        ) : null}

        {code == null && error == null ? (
          <p className="py-2 text-center text-[0.85rem] text-ink-faint">Building the code…</p>
        ) : null}

        {code ? (
          <>
            {/* Selectable and wrapped rather than truncated: if the clipboard
                is blocked, selecting it by hand is the only way through. */}
            <code className="block max-h-40 overflow-y-auto rounded-md bg-sunken px-3 py-2.5 font-mono text-[0.72rem] leading-relaxed break-all select-all">
              {code}
            </code>
            <p className="text-[0.75rem] leading-relaxed text-ink-faint">
              It contains this routine, its targets and its notes — nothing else. No sets, no
              records, no body weight, no settings. Your target weights travel in kilograms, so it
              reads correctly for someone training in pounds.
            </p>
          </>
        ) : null}
      </div>
    </Sheet>
  )
}
