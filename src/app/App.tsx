import { BrowserRouter, Route, Routes } from 'react-router'

import { ExercisesScreen } from '~/features/exercises/ExercisesScreen'
import { ActiveSessionScreen } from '~/features/session/ActiveSessionScreen'
import { MathsScreen } from '~/features/more/MathsScreen'
import { MoreScreen } from '~/features/more/MoreScreen'
import { HistoryScreen } from '~/features/history/HistoryScreen'
import { SessionDetailScreen } from '~/features/history/SessionDetailScreen'
import { ComingSoon } from '~/features/placeholder/ComingSoon'
import { ExerciseProgressScreen } from '~/features/progress/ExerciseProgressScreen'
import { ProgressScreen } from '~/features/progress/ProgressScreen'
import { RoutineEditorScreen } from '~/features/routines/RoutineEditorScreen'
import { RoutinesScreen } from '~/features/routines/RoutinesScreen'
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

              <Route path="routines">
                <Route index element={<RoutinesScreen />} />
                <Route path=":routineId" element={<RoutineEditorScreen />} />
              </Route>
              <Route path="history">
                <Route index element={<HistoryScreen />} />
                <Route path=":sessionId" element={<SessionDetailScreen />} />
              </Route>

              <Route path="progress">
                <Route index element={<ProgressScreen />} />
                <Route path=":exerciseId" element={<ExerciseProgressScreen />} />
              </Route>

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
