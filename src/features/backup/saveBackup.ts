import { backupFilename, exportToJson } from '~/db/backup'
import { updateSettings } from '~/db/repositories/settings'
import { platform } from '~/lib/platform'

/**
 * Write a backup out to wherever the user keeps files.
 *
 * Shared by Settings and by the prompt after a workout, so both record the
 * same thing and neither can drift into a different idea of "backed up".
 *
 * An honest limitation lives here: on iOS this hands the file to the share
 * sheet, and the share sheet reports nothing back — not success, not cancel.
 * So `lastExportAt` records that Gymmy produced a backup and the OS took it,
 * which is the most it can truthfully claim. The UI says as much rather than
 * asserting the file reached iCloud.
 */
export async function saveBackup(): Promise<void> {
  const json = await exportToJson()

  await platform.files.save({
    filename: backupFilename(),
    mimeType: 'application/json',
    data: json,
  })

  await updateSettings({ lastExportAt: Date.now() })
}
