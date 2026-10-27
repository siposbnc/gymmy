import { ChevronRight, Dumbbell, Settings2, Sigma } from 'lucide-react'
import { Link } from 'react-router'

import { InstallCard } from '~/features/install/InstallCard'
import { Card } from '~/ui/Card'
import { ScreenHeader } from '~/ui/ScreenHeader'

const LINKS = [
  {
    to: '/more/exercises',
    label: 'Exercises',
    hint: 'The library, plus your own',
    Icon: Dumbbell,
  },
  {
    to: '/more/maths',
    label: 'How Gymmy works out your numbers',
    hint: 'Every formula, with its limits',
    Icon: Sigma,
  },
  {
    to: '/more/settings',
    label: 'Settings',
    hint: 'Units, theme, rest, plates',
    Icon: Settings2,
  },
] as const

export function MoreScreen() {
  return (
    <>
      <ScreenHeader title="More" />
      <div className="grid gap-3 px-4 pb-6">
        <InstallCard />

        <Card className="divide-y divide-line p-0">
          {LINKS.map(({ to, label, hint, Icon }) => (
            <Link key={to} to={to} className="flex items-center gap-3 px-4 py-3.5">
              <Icon size={19} className="shrink-0 text-accent-ink" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-[0.95rem] font-medium">{label}</span>
                <span className="block text-[0.75rem] text-ink-muted">{hint}</span>
              </span>
              <ChevronRight size={17} className="shrink-0 text-ink-faint" aria-hidden />
            </Link>
          ))}
        </Card>
      </div>
    </>
  )
}
