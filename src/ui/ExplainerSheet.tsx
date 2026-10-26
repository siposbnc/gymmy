import { explainableById, isMetric } from '~/domain/metrics'

import { Button } from './Button'
import { Sheet } from './Sheet'

interface ExplainerSheetProps {
  explainerId: string
  /** See InfoAffordance: a conduit for the metric's own input type. */
  exampleInput?: unknown
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Context line above the title, e.g. "Bench Press · set 2". */
  eyebrow?: string | undefined
}

/**
 * One generic component renders every explainer in the app.
 *
 * Four parts, always in this order: what it is → how it is worked out → why it
 * is useful → where it breaks down. The caveats are last but not buried; an
 * honest limit is what makes the other three trustworthy.
 *
 * Because the copy lives in the same module as the function (see
 * `domain/metrics/`), changing a calculation means editing the file that holds
 * the sentence describing it. Drift is structurally impossible.
 */
export function ExplainerSheet({
  explainerId,
  exampleInput,
  open,
  onOpenChange,
  eyebrow,
}: ExplainerSheetProps) {
  const entry = explainableById(explainerId)

  if (!entry) {
    // A missing id is a programming error, not a user-facing state. The
    // registry test exists to make sure this never ships.
    return null
  }

  const worked =
    isMetric(entry) && exampleInput !== undefined ? entry.example(exampleInput) : null

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={entry.label}
      eyebrow={eyebrow}
      footer={
        <div className="flex items-center gap-2">
          <span className="flex-1 text-[0.8rem] font-bold text-accent">
            All of Gymmy&rsquo;s maths →
          </span>
          <Button size="sm" onClick={() => onOpenChange(false)}>
            Got it
          </Button>
        </div>
      }
    >
      <section className="border-b border-line px-5 py-4">
        <p className="label-caps mb-2 text-accent">What it is</p>
        <p className="text-[0.85rem] leading-relaxed" data-selectable>
          {entry.explainer.whatItIs}
        </p>
      </section>

      {entry.formula ? (
        <section className="border-b border-line px-5 py-4">
          <p className="label-caps mb-2 text-accent">How it&rsquo;s worked out</p>
          <p className="num inline-block rounded-sm bg-sunken px-3 py-2 text-[0.875rem] font-semibold">
            {entry.formula}
          </p>

          {worked ? (
            <div className="mt-3 rounded-md border-l-[3px] border-accent bg-sunken px-4 py-3">
              <p className="label-caps mb-1.5 text-ink-faint">Your set</p>
              <p className="num text-[0.9rem] leading-relaxed font-bold text-accent">
                {worked.given}
              </p>
              <p className="num text-[0.9rem] leading-relaxed">
                → {worked.substitution} ={' '}
                <strong className="text-[1.1rem] font-bold">{worked.result}</strong>
              </p>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="border-b border-line px-5 py-4">
        <p className="label-caps mb-2 text-accent">Why it&rsquo;s useful</p>
        <p className="text-[0.85rem] leading-relaxed" data-selectable>
          {entry.explainer.whyUseful}
        </p>
      </section>

      <section className="px-5 py-4">
        <p className="label-caps mb-2 text-accent">Where it breaks down</p>
        <ul className="grid gap-2.5">
          {entry.explainer.caveats.map((caveat) => (
            <li
              key={caveat}
              className="relative pl-5 text-[0.85rem] leading-relaxed text-ink-muted"
              data-selectable
            >
              <span className="absolute top-[0.4rem] left-0 size-2 rotate-45 rounded-[2px] bg-danger opacity-70" />
              {caveat}
            </li>
          ))}
        </ul>
      </section>
    </Sheet>
  )
}
