import { BrowserRouter, Route, Routes } from 'react-router'

import { ExercisesScreen } from '~/features/exercises/ExercisesScreen'
import { ActiveSessionScreen } from '~/features/session/ActiveSessionScreen'
import { MathsScreen } from '~/features/more/MathsScreen'
import { MoreScreen } from '~/features/more/MoreScreen'
import { ComingSoon } from '~/features/placeholder/ComingSoon'
import { SettingsScreen } from '~/features/settings/SettingsScreen'
import { TodayScreen } from '~/features/today/TodayScreen'

import { ErrorBoundary } from './ErrorBoundary'
import { TabShell } from './TabShell'
import { ThemeProvider } from './ThemeProvider'

export function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<TabShell />}>
              <Route index element={<TodayScreen />} />

              {/* Inside the shell so the tab bar stays reachable mid-workout,
                  but the session bar hides itself here. */}
              <Route path="session" element={<ActiveSessionScreen />} />

              <Route
                path="routines"
                element={
                  <ComingSoon
                    title="Routines"
                    milestone="M3"
                    description="Build reusable training plans with target sets, reps, weight and rest — then start a session with everything pre-filled."
                  />
                }
              />
              <Route
                path="history"
                element={
                  <ComingSoon
                    title="History"
                    milestone="M4"
                    description="A calendar and list of every session, each one fully editable so a forgotten set can be added later."
                  />
                }
              />
              <Route
                path="progress"
                element={
                  <ComingSoon
                    title="Progress"
                    milestone="M4"
                    description="Per-exercise charts, your personal record board, and weekly volume by muscle group."
                  />
                }
              />

              <Route path="more">
                <Route index element={<MoreScreen />} />
                <Route path="exercises" element={<ExercisesScreen />} />
                <Route path="maths" element={<MathsScreen />} />
                <Route path="settings" element={<SettingsScreen />} />
              </Route>

              <Route
                path="*"
                element={
                  <ComingSoon
                    title="Not found"
                    milestone="404"
                    description="That screen does not exist. Use the tabs below."
                  />
                }
              />
            </Route>
          </Routes>
        </BrowserRouter>
      </ThemeProvider>
    </ErrorBoundary>
  )
}
