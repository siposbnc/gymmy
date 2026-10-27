import { Check, Copy } from 'lucide-react'
import { useState } from 'react'

import {
  BUILD_COMMIT,
  BUILD_NUMBER,
  buildLabel,
  buildSummary,
  formatBuildTime,
} from '~/lib/build'
import { platform } from '~/lib/platform'
import { cn } from '~/ui/cn'
import { Card } from '~/ui/Card'

/**
 * Which build is running.
 *
 * Not vanity: the service worker can serve a cached build after a deploy, so
 * "did my phone actually get the new version" is a question the interface
 * otherwise gives no way to answer. The number is a commit count, so a bigger
 * one is unambiguously newer.
 */
export function AboutSection() {
  const [copied, setCopied] = useState(false)
  const builtAt = formatBuildTime()

  async function copy() {
    const ok = await platform.clipboard.writeText(buildSummary())
    if (!ok) return
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div>
      <p className="label-caps mb-2 px-1 text-ink-faint">About</p>
      <Card className="flex items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="num block text-[1.05rem] font-bold">{buildLabel()}</span>
          <span className="num block text-[0.72rem] text-ink-muted" data-selectable>
            {BUILD_COMMIT}
            {builtAt ? ` · ${builtAt}` : ''}
          </span>
          {BUILD_NUMBER === 0 ? (
            <span className="mt-1 block text-[0.72rem] leading-relaxed text-ink-muted">
              Built outside version control, so there is no build number to compare.
            </span>
          ) : null}
        </span>

        <button
          type="button"
          onClick={() => void copy()}
          aria-label="Copy build details"
          className={cn(
            'touch-min grid shrink-0 cursor-pointer place-items-center rounded-full border',
            copied ? 'border-success text-success' : 'border-line text-ink-muted',
          )}
        >
          {copied ? <Check size={17} aria-hidden /> : <Copy size={16} aria-hidden />}
        </button>
      </Card>
      <p className="mt-2 px-1 text-[0.72rem] leading-relaxed text-ink-muted">
        A higher build number is newer. If this has not changed after a deploy, fully close the app
        and reopen it — the service worker serves the last version it cached until then.
      </p>
      <p role="status" aria-live="polite" className="sr-only">
        {copied ? 'Build details copied' : ''}
      </p>
    </div>
  )
}
