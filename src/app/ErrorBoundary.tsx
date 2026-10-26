import { Component, type ErrorInfo, type ReactNode } from 'react'

import { Button } from '~/ui/Button'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Last line of defence.
 *
 * Gymmy holds training history that exists nowhere else, so a crash must never
 * look like data loss. The copy says so explicitly, and the recovery action is
 * a reload rather than anything that touches the database.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Gymmy crashed:', error, info.componentStack)
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="grid min-h-dvh place-items-center p-6">
        <div className="max-w-sm text-center">
          <h1 className="font-display text-[2rem] leading-tight">Something broke.</h1>
          <p className="mt-3 text-[0.9rem] leading-relaxed text-ink-muted">
            Your training history is stored on this device and is still there — nothing was lost.
            Reloading should get you back.
          </p>
          <p
            className="num mt-4 rounded-md bg-sunken px-3 py-2 text-left text-[0.75rem] text-ink-faint"
            data-selectable
          >
            {error.message}
          </p>
          <Button className="mt-5" onClick={() => window.location.reload()}>
            Reload Gymmy
          </Button>
        </div>
      </div>
    )
  }
}
