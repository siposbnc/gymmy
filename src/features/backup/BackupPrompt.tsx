import { Upload } from 'lucide-react'
import { useState } from 'react'

import { useBackupStatus } from '~/db/hooks'
import { describeBackup } from '~/domain/backup-reminder'
import { Button } from '~/ui/Button'

import { saveBackup } from './saveBackup'

/**
 * The backup nudge, offered the moment a workout ends.
 *
 * This is the only place in the app it appears unprompted, and the timing is
 * the whole design: you have just finished, you are not mid-set, and the thing
 * at risk has grown by exactly one session. Settings is where a backup lives;
 * nobody goes to Settings after training.
 *
 * It appears only when {@link backupStatus} says it is due — never on a visit
 * from History, and never when nothing has been logged since the last one.
 */
export function BackupPrompt() {
  const status = useBackupStatus()
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<string | null>(null)

  async function handleSave() {
    setBusy(true)
    try {
      await saveBackup()
      // "Created" is the honest verb: on iOS the file goes to the share sheet,
      // which tells us nothing about where it landed, or whether it did.
      setOutcome('Backup created.')
    } catch (error) {
      setOutcome(error instanceof Error ? error.message : 'Backup failed.')
    } finally {
      setBusy(false)
    }
  }

  if (outcome) {
    return (
      <p className="rounded-lg bg-sunken px-3.5 py-2.5 text-[0.8rem] text-ink-muted" role="status">
        {outcome}
      </p>
    )
  }

  if (!status?.shouldPrompt) return null

  return (
    <div className="rounded-lg border border-accent bg-accent-wash p-3.5">
      <p className="flex items-center gap-2 text-[0.85rem] font-semibold">
        <Upload size={15} className="shrink-0 text-accent-ink" aria-hidden />
        {describeBackup(status)}
      </p>
      {/* The reasoning is worth a paragraph the first time and nothing at all
          the fifth: by then it has been read, and repeating it is what turns a
          useful prompt into wallpaper. */}
      {status.state === 'never_saved' ? (
        <p className="mt-1 text-[0.75rem] leading-relaxed text-ink-muted">
          Gymmy keeps everything on this device. A backup file is the only way to get this history
          back if the phone is lost — or to move it to a new one.
        </p>
      ) : null}
      <Button size="sm" className="mt-2.5" disabled={busy} onClick={() => void handleSave()}>
        Back up now
      </Button>
    </div>
  )
}
