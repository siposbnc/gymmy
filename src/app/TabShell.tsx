import { CalendarDays, Dumbbell, LineChart, ListChecks, MoreHorizontal } from 'lucide-react'
import { NavLink, Outlet } from 'react-router'

import { cn } from '~/ui/cn'

import { RestTimerBar } from '~/features/rest/RestTimerBar'

import { ActiveSessionBar } from './ActiveSessionBar'

const TABS = [
  { to: '/', label: 'Today', Icon: Dumbbell, end: true },
  { to: '/routines', label: 'Routines', Icon: ListChecks, end: false },
  { to: '/history', label: 'History', Icon: CalendarDays, end: false },
  { to: '/progress', label: 'Progress', Icon: LineChart, end: false },
  { to: '/more', label: 'More', Icon: MoreHorizontal, end: false },
] as const

/**
 * The five-destination shell.
 *
 * Bottom tab bar, because every primary action in this app happens one-handed
 * with a thumb. `pb-[env(safe-area-inset-bottom)]` keeps the bar clear of the
 * home indicator on a notched phone.
 */
export function TabShell() {
  return (
    // h-full, not min-h-dvh: a minimum lets the shell outgrow the viewport,
    // which hands scrolling to the document and unpins the tab bar.
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">
        <Outlet />
      </main>

      {/* Rest above the session bar: it is the more urgent of the two, and it
          is temporary, so it gets the position nearer the thumb. */}
      <div className="shrink-0">
        <RestTimerBar />
        <ActiveSessionBar />
      </div>

      <nav
        aria-label="Main"
        className="shrink-0 border-t border-line bg-canvas pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="flex px-1.5 py-2">
          {TABS.map(({ to, label, Icon, end }) => (
            <li key={to} className="flex-1">
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'touch-min grid w-full place-items-center gap-0.5 rounded-md py-1',
                    'transition-colors duration-(--dur-fast)',
                    isActive ? 'text-accent' : 'text-ink-faint',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon size={19} strokeWidth={isActive ? 2.5 : 2} aria-hidden />
                    <span className="text-[0.6rem] font-bold">{label}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
