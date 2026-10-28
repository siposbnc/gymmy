import { Download, FileSpreadsheet, Upload } from 'lucide-react'
import { useState } from 'react'

import { importFromJson, type ImportMode } from '~/db/backup'
import { useBackupStatus } from '~/db/hooks'
import { allSetsForExport } from '~/db/repositories/history'
import { describeBackup } from '~/domain/backup-reminder'
import { csvFilename, toCsv } from '~/domain/csv'
import type { Settings } from '~/domain/types'
import { saveBackup } from '~/features/backup/saveBackup'
import { platform } from '~/lib/platform'
import { Button } from '~/ui/Button'
import { Card } from '~/ui/Card'
import { Sheet } from '~/ui/Sheet'

/**
 * Export and import.
 *
 * Prominent rather than tucked away, because with no account this is the whole
 * backup story — and the only way to move to a new phone. The state of it is
 * measured in unsaved workouts rather than elapsed days, and the same figure
 * drives the prompt offered after a session ends: Settings is where a backup
 * lives, but nobody comes to Settings after training.
 */
export function BackupSection({ settings }: { settings: Settings }) {
  const [importing, setImporting] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const backup = useBackupStatus()

  async function handleExport() {
    setBusy(true)
    try {
      await saveBackup()
      setStatus('Backup created.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Export failed.')
    } finally {
      setBusy(false)
    }
  }

  async function handleCsvExport() {
    setBusy(true)
    try {
      const rows = await allSetsForExport()
      if (rows.length === 0) {
        setStatus('Nothing to export yet — finish a workout first.')
        return
      }
      await platform.files.save({
        filename: csvFilename(),
        mimeType: 'text/csv',
        data: toCsv(rows, settings.units),
      })
      setStatus(`Exported ${rows.length} set${rows.length === 1 ? '' : 's'}.`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'CSV export failed.')
    } finally {
      setBusy(false)
    }
  }

  async function handleImport(mode: ImportMode) {
    setImporting(false)
    setBusy(true)
    try {
      const json = await platform.files.open({ accept: 'application/json,.json' })
      if (json == null) return
      const result = await importFromJson(json, mode)
      const total = Object.values(result.counts).reduce((sum, n) => sum + n, 0)
      setStatus(
        mode === 'replace'
          ? `Replaced everything with the backup — ${total} records restored.`
          : `Merged in ${total} new record${total === 1 ? '' : 's'}.`,
      )
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Import failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <p className="label-caps mb-2 px-1 text-ink-faint">Your data</p>
      <Card className="grid gap-3">
        <p className="text-[0.8rem] leading-relaxed text-ink-muted">
          Gymmy keeps everything on this device and never uploads it. That also means a backup file
          is the only way to move to a new phone — or to get your history back if this one is lost.
        </p>

        <div className="flex gap-2">
          <Button size="sm" className="flex-1" disabled={busy} onClick={() => void handleExport()}>
            <Download size={16} aria-hidden />
            Export
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="flex-1"
            disabled={busy}
            onClick={() => setImporting(true)}
          >
            <Upload size={16} aria-hidden />
            Import
          </Button>
        </div>

        <div className="border-t border-dashed border-line pt-3">
          <p className="mb-2 text-[0.78rem] leading-relaxed text-ink-muted">
            A spreadsheet copy, one row per set. Useful for a coach or your own digging — but it
            is <strong className="font-semibold text-ink">not</strong> a backup, because Gymmy
            cannot read it back in.
          </p>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => void handleCsvExport()}
          >
            <FileSpreadsheet size={16} aria-hidden />
            Export sets as CSV
          </Button>
        </div>

        {status ? (
          <p className="rounded-md bg-sunken px-3 py-2 text-[0.78rem] text-ink-muted" role="status">
            {status}
          </p>
        ) : null}

        {backup ? (
          <div
            className={
              backup.shouldPrompt
                ? 'rounded-md border border-accent bg-accent-wash px-3 py-2'
                : 'px-1'
            }
          >
            <p
              className={
                backup.shouldPrompt
                  ? 'text-[0.78rem] leading-relaxed'
                  : 'text-[0.75rem] text-ink-faint'
              }
            >
              {describeBackup(backup)}
            </p>
            {/* Said once, here, rather than every time a backup is made: the
                share sheet reports nothing back, so "saved" is a claim Gymmy
                is not in a position to make. */}
            <p className="mt-1 text-[0.72rem] leading-relaxed text-ink-muted">
              Gymmy can tell that it handed a file to your phone, not where the phone put it. Check
              it landed somewhere that outlives this device.
            </p>
          </div>
        ) : null}
      </Card>

      <Sheet
        open={importing}
        onOpenChange={setImporting}
        eyebrow="Restore a backup"
        title="How should this merge?"
      >
        <div className="divide-y divide-line pb-2">
          <button
            type="button"
            onClick={() => void handleImport('merge')}
            className="w-full cursor-pointer px-5 py-4 text-left"
          >
            <span className="block text-[0.95rem] font-semibold">Merge</span>
            <span className="mt-1 block text-[0.8rem] leading-relaxed text-ink-muted">
              Keeps everything already on this device and adds only what it has not seen. Safe if
              you are unsure — importing the same file twice changes nothing.
            </span>
          </button>
          <button
            type="button"
            onClick={() => void handleImport('replace')}
            className="w-full cursor-pointer px-5 py-4 text-left"
          >
            <span className="block text-[0.95rem] font-semibold text-danger">Replace everything</span>
            <span className="mt-1 block text-[0.8rem] leading-relaxed text-ink-muted">
              Wipes what is here first, so the device ends up exactly as the backup. This is the
              new-phone case. Anything logged on this device and not in the file is lost.
            </span>
          </button>
        </div>
      </Sheet>
    </div>
  )
}
