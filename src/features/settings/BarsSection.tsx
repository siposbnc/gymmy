import { Check, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { updateSettings } from '~/db/repositories/settings'
import type { Bar, Settings } from '~/domain/types'
import { formatWeight, fromDisplayUnit, INCREMENT, toDisplayUnit } from '~/domain/units'
import { newId } from '~/lib/uuid'
import { Button } from '~/ui/Button'
import { Card } from '~/ui/Card'
import { NumericPad } from '~/ui/NumericPad'
import { Sheet } from '~/ui/Sheet'
import { cn } from '~/ui/cn'

/**
 * The bars you own.
 *
 * Most gyms have several, and the same plates on a 10 kg technique bar are a
 * very different total than on a 20 kg Olympic bar. Exercises can point at a
 * specific one; everything else uses whichever is marked default.
 */
export function BarsSection({ settings }: { settings: Settings }) {
  const [editing, setEditing] = useState<Bar | null>(null)
  const [adding, setAdding] = useState(false)
  const [padFor, setPadFor] = useState<string | null>(null)

  const unit = settings.units

  async function save(bars: Bar[], defaultBarId = settings.defaultBarId) {
    // The default must always point at a bar that exists.
    const safeDefault = bars.some((bar) => bar.id === defaultBarId)
      ? defaultBarId
      : (bars[0]?.id ?? '')
    await updateSettings({ bars, defaultBarId: safeDefault })
  }

  const padBar = settings.bars.find((bar) => bar.id === padFor)

  return (
    <div>
      <p className="label-caps mb-2 px-1 text-ink-faint">Bars</p>
      <Card className="grid gap-3">
        <p className="text-[0.78rem] leading-relaxed text-ink-muted">
          The plate calculator subtracts the bar before splitting what is left between the two
          sides. Mark one as the default, then set a different bar on any exercise that uses one.
        </p>

        <ul className="grid gap-1.5">
          {settings.bars.map((bar) => {
            const isDefault = bar.id === settings.defaultBarId
            return (
              <li
                key={bar.id}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-2',
                  isDefault ? 'bg-accent-wash' : 'bg-sunken',
                )}
              >
                <button
                  type="button"
                  aria-label={
                    isDefault ? `${bar.name} is the default bar` : `Make ${bar.name} the default`
                  }
                  aria-pressed={isDefault}
                  onClick={() => void save(settings.bars, bar.id)}
                  className={cn(
                    'grid size-6 shrink-0 cursor-pointer place-items-center rounded-full border',
                    isDefault
                      ? 'border-accent bg-accent text-on-accent'
                      : 'border-line-strong text-transparent',
                  )}
                >
                  <Check size={13} strokeWidth={3} aria-hidden />
                </button>

                <button
                  type="button"
                  onClick={() => setEditing(bar)}
                  className="min-w-0 flex-1 cursor-pointer text-left"
                >
                  <span className="block truncate text-[0.9rem] font-semibold">{bar.name}</span>
                  {isDefault ? (
                    <span className="label-caps block text-ink-muted">default</span>
                  ) : null}
                </button>

                <button
                  type="button"
                  onClick={() => setPadFor(bar.id)}
                  aria-label={`Change the weight of ${bar.name}`}
                  className="num shrink-0 cursor-pointer rounded-sm border-b-2 border-accent px-2 text-[0.95rem] font-bold"
                >
                  {formatWeight(bar.weightKg, unit)}
                </button>

                <button
                  type="button"
                  aria-label={`Remove ${bar.name}`}
                  disabled={settings.bars.length <= 1}
                  onClick={() =>
                    void save(
                      settings.bars.filter((candidate) => candidate.id !== bar.id),
                    )
                  }
                  className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-danger disabled:pointer-events-none disabled:opacity-30"
                >
                  <Trash2 size={15} aria-hidden />
                </button>
              </li>
            )
          })}
        </ul>

        <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
          <Plus size={16} aria-hidden />
          Add a bar
        </Button>
      </Card>

      {padBar ? (
        <NumericPad
          open
          onOpenChange={(open) => !open && setPadFor(null)}
          value={toDisplayUnit(padBar.weightKg, unit)}
          onCommit={(value) =>
            void save(
              settings.bars.map((bar) =>
                bar.id === padBar.id
                  ? { ...bar, weightKg: Math.max(0, fromDisplayUnit(value, unit)) }
                  : bar,
              ),
            )
          }
          unit={unit}
          eyebrow={`${padBar.name} · weight`}
          increment={INCREMENT[unit]}
        />
      ) : null}

      <BarNameSheet
        bar={editing}
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        onSave={(name) => {
          if (editing) {
            void save(
              settings.bars.map((bar) => (bar.id === editing.id ? { ...bar, name } : bar)),
            )
          }
          setEditing(null)
        }}
      />

      <BarNameSheet
        bar={null}
        open={adding}
        onOpenChange={setAdding}
        onSave={(name) => {
          const bar: Bar = { id: newId('bar'), name, weightKg: 20 }
          void save([...settings.bars, bar])
          setAdding(false)
          // Straight into setting its weight, which is the point of adding it.
          setPadFor(bar.id)
        }}
      />
    </div>
  )
}

function BarNameSheet({
  bar,
  open,
  onOpenChange,
  onSave,
}: {
  bar: Bar | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (name: string) => void
}) {
  const [draft, setDraft] = useState('')

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next) setDraft(bar?.name ?? '')
        onOpenChange(next)
      }}
      eyebrow={bar ? 'Rename' : 'New bar'}
      title={bar ? bar.name : 'What is it called?'}
      footer={
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="flex-1"
            disabled={!draft.trim()}
            onClick={() => onSave(draft.trim())}
          >
            {bar ? 'Save' : 'Add bar'}
          </Button>
        </div>
      }
    >
      <div className="px-5 py-4">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          aria-label="Bar name"
          autoComplete="off"
          placeholder="Technique bar"
          className="w-full rounded-md border border-line bg-surface px-3.5 py-3 text-[1rem] outline-none focus-visible:border-accent"
        />
        <p className="mt-2 text-[0.75rem] leading-relaxed text-ink-muted">
          You will set the weight next. Name it however you recognise it in your gym.
        </p>
      </div>
    </Sheet>
  )
}
