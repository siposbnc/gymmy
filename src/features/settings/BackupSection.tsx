import { Download, Upload } from 'lucide-react'
import { useState } from 'react'

import { backupFilename, exportToJson, importFromJson, type ImportMode } from '~/db/backup'
import { updateSettings } from '~/db/repositories/settings'
import type { Settings } from '~/domain/types'
import { platform } from '~/lib/platform'
import { Button } from '~/ui/Button'
import { Card } from '~/ui/Card'
import { Sheet } from '~/ui/Sheet'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Export and import.
 *
 * Prominent rather than tucked away, because with no account this is the whole
 * backup story — and the only way to move to a new phone. The age nudge exists
 * because iOS will evict IndexedDB for an uninstalled site under storage
 * pressure, and a user who has never exported would lose everything.
 */
export function BackupSection({ settings }: { settings: Settings }) {
  const [importing, setImporting] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const daysSinceExport =
    settings.lastExportAt == null
      ? null
      : Math.floor((Date.now() - settings.lastExportAt) / DAY_MS)

  async function handleExport() {
    setBusy(true)
    try {
      const json = await exportToJson()
      await platform.files.save({
        filename: backupFilename(),
        mimeType: 'application/json',
        data: json,
      })
      await updateSettings({ lastExportAt: Date.now() })
      setStatus('Backup saved.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Export failed.')
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

        {status ? (
          <p className="rounded-md bg-sunken px-3 py-2 text-[0.78rem] text-ink-muted" role="status">
            {status}
          </p>
        ) : null}

        {daysSinceExport === null ? (
          <p className="rounded-md border border-accent bg-accent-wash px-3 py-2 text-[0.78rem] leading-relaxed">
            You have never exported. If this device is lost or the browser clears its storage, your
            training history goes with it.
          </p>
        ) : daysSinceExport > 30 ? (
          <p className="rounded-md border border-accent bg-accent-wash px-3 py-2 text-[0.78rem] leading-relaxed">
            Last backup was {daysSinceExport} days ago.
          </p>
        ) : (
          <p className="text-[0.75rem] text-ink-faint">
            Last backup{' '}
            {daysSinceExport === 0 ? 'today' : `${daysSinceExport} day${daysSinceExport === 1 ? '' : 's'} ago`}.
          </p>
        )}
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
