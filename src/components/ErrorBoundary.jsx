import { Component } from 'react'

/**
 * Catches render and lifecycle errors so a crash shows something a reader can
 * act on instead of a blank page.
 *
 * A class because React exposes no hook equivalent — `getDerivedStateFromError`
 * and `componentDidCatch` have no function-component counterparts.
 *
 * Deliberately self-contained: it reads no context and calls no store, because
 * the thing that just threw may well be the state those would hand back.
 */

const SALVAGE_KEY = 'gunit.state.recovered'

/*
 * Every library this browser holds, not one key.
 *
 * There is a guest library and one per account signed in on this machine, and
 * this component deliberately reads no context — the state a store would hand
 * back is quite possibly what just threw — so it cannot know which of them is
 * in use. It takes all of them.
 *
 * The salvage keys are skipped, or a second reset would overwrite the copy the
 * first one made and the whole point of keeping it would be lost.
 */
const LIBRARY_PREFIX = 'gunit.state.'
const NOT_A_LIBRARY = ['gunit.state.recovered', 'gunit.state.unreadable']

const libraryKeys = () =>
  Object.keys(localStorage).filter(
    (k) => k.startsWith(LIBRARY_PREFIX) && !NOT_A_LIBRARY.some((skip) => k.startsWith(skip)),
  )

const btn =
  'inline-flex cursor-pointer items-center justify-center rounded-lg border px-4 py-2.5 ' +
  'text-[13px] leading-none font-semibold transition-colors'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null, confirmingReset: false }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // The stack belongs in the console, not on screen — it means nothing to a
    // reader and pushes the recovery actions out of view.
    console.error('[Gunit] render error:', error, info?.componentStack)
  }

  retry = () => this.setState({ error: null, confirmingReset: false })

  /**
   * Last resort when the saved data itself is what crashes rendering.
   *
   * The current payload is copied aside before anything is cleared, so choosing
   * this is not the same as losing the library — the bytes are still there to
   * recover by hand.
   */
  resetData = () => {
    try {
      const keys = libraryKeys()
      // Every copy written before anything is removed. Reversed, a failure
      // part way through would clear libraries whose copy was never made.
      const saved = {}
      for (const key of keys) saved[key] = localStorage.getItem(key)
      if (keys.length) localStorage.setItem(SALVAGE_KEY, JSON.stringify(saved))
      for (const key of keys) localStorage.removeItem(key)
    } catch {
      // Storage unavailable; reloading is still worth a try.
    }
    window.location.href = '/'
  }

  render() {
    if (!this.state.error) return this.props.children

    const { confirmingReset } = this.state

    return (
      <div
        role="alert"
        className="rise-in mx-auto flex max-w-[520px] flex-col items-center gap-4 px-4 py-24 text-center"
      >
        <div className="kicker text-err">Something broke</div>
        <h1 className="m-0 font-serif text-[34px] leading-[1.1] tracking-[-0.02em]">
          This page stopped working
        </h1>
        <p className="m-0 max-w-[400px] text-[15px] text-ink-2 text-pretty">
          Your decks are saved and were not affected. Trying again usually clears
          it; if it keeps happening, the saved data may be the cause.
        </p>

        {this.state.error?.message && (
          <p className="m-0 max-w-[420px] font-mono text-[12px] leading-[1.5] text-ink-3 break-words">
            {this.state.error.message}
          </p>
        )}

        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={this.retry}
            className={`${btn} border-ink bg-ink text-paper hover:bg-ink-2`}
          >
            Try again
          </button>
          <a href="/" className={`${btn} border-line bg-transparent text-ink hover:bg-raised`}>
            Back to dashboard
          </a>
        </div>

        <div className="mt-6 border-t border-line-soft pt-5">
          {confirmingReset ? (
            <div className="flex flex-col items-center gap-3">
              <p className="m-0 max-w-[380px] text-[13px] text-ink-2 text-pretty">
                This clears the decks stored in this browser. A copy is kept under{' '}
                <span className="font-mono text-[12px]">{SALVAGE_KEY}</span> so nothing is
                destroyed outright.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={this.resetData}
                  className={`${btn} border-err bg-err text-paper hover:opacity-90`}
                >
                  Yes, reset saved data
                </button>
                <button
                  type="button"
                  onClick={() => this.setState({ confirmingReset: false })}
                  className={`${btn} border-line bg-transparent text-ink hover:bg-raised`}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => this.setState({ confirmingReset: true })}
              className="cursor-pointer border-0 bg-transparent p-0 text-[13px] font-medium text-ink-3 underline-offset-4 transition-colors hover:text-err hover:underline"
            >
              Still broken? Reset saved data
            </button>
          )}
        </div>
      </div>
    )
  }
}
