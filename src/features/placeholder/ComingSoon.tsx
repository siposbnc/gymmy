import { ScreenHeader } from '~/ui/ScreenHeader'

interface ComingSoonProps {
  title: string
  /** Which milestone delivers this, e.g. "M3". */
  milestone: string
  /** What it will do, in the user's terms. */
  description: string
}

/**
 * An honest placeholder.
 *
 * M0 builds the foundations; these screens arrive in later milestones. Saying
 * which one and what it will do beats a spinner or a blank panel that reads
 * like a bug.
 */
export function ComingSoon({ title, milestone, description }: ComingSoonProps) {
  return (
    <>
      <ScreenHeader title={title} />
      <div className="px-4">
        <div className="rounded-lg border border-dashed border-line-strong p-6 text-center">
          <p className="label-caps text-accent-ink">{milestone}</p>
          <p className="mt-2 text-[0.9rem] leading-relaxed text-ink-muted">{description}</p>
        </div>
      </div>
    </>
  )
}
