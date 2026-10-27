import { useState } from 'react'

import { EXPLAINABLES } from '~/domain/metrics'
import { Card } from '~/ui/Card'
import { ExplainerSheet } from '~/ui/ExplainerSheet'
import { ScreenHeader } from '~/ui/ScreenHeader'

/**
 * "How Gymmy works out your numbers".
 *
 * Renders the whole registry, so it is reachable directly rather than only
 * discovered one ⓘ at a time. A user curious about the maths can read it all
 * in one sitting instead of hunting for tooltips.
 */
export function MathsScreen() {
  const [openId, setOpenId] = useState<string | null>(null)

  return (
    <>
      <ScreenHeader eyebrow="Reference" title="How Gymmy works out your numbers" />

      <div className="grid gap-2.5 px-4 pb-6">
        <p className="mb-1 text-[0.85rem] leading-relaxed text-ink-muted">
          Every number Gymmy derives rather than asks you for, with the formula, a worked example
          and an honest note on where it breaks down.
        </p>

        {EXPLAINABLES.map((entry) => (
          <Card key={entry.id} className="p-0">
            <button
              type="button"
              onClick={() => setOpenId(entry.id)}
              className="w-full cursor-pointer px-4 py-3.5 text-left"
            >
              <p className="text-[1.05rem] font-semibold tracking-tight">{entry.label}</p>
              {entry.formula ? (
                <p className="num mt-1 text-[0.8rem] text-accent-ink">{entry.formula}</p>
              ) : null}
              <p className="mt-1.5 line-clamp-2 text-[0.8rem] leading-relaxed text-ink-muted">
                {entry.explainer.whatItIs}
              </p>
            </button>
          </Card>
        ))}
      </div>

      {openId ? (
        <ExplainerSheet
          explainerId={openId}
          open
          onOpenChange={(open) => !open && setOpenId(null)}
        />
      ) : null}
    </>
  )
}
