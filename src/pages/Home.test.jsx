// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Home from './Home.jsx'
import { AppProvider } from '../data/AppContext.jsx'
import { AuthContext } from '../data/authContext.js'

/**
 * What `/` is, which depends on who is asking.
 *
 * The dashboard is somebody's own library — their streak, their decks, what is
 * due — and it said nothing about what Gunit is to a visitor who had never
 * signed in. Now it answers by identity, and the cases worth pinning are the
 * two that are not simply signed in or out: a copy with no project to sign
 * into, and the moment before a configured one knows who this is.
 */

const auth = (over = {}) => ({ available: true, status: 'ready', user: null, ...over })

/** Where the buttons went, and with what. */
function Elsewhere() {
  const { pathname, state } = useLocation()
  return (
    <div data-testid="elsewhere" data-mode={state?.mode ?? ''}>
      {pathname}
    </div>
  )
}

const open = (value) =>
  render(
    <AuthContext.Provider value={value}>
      <AppProvider>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route
              path="/"
              element={<Home onNewDeck={vi.fn()} onEditDeck={vi.fn()} onImport={vi.fn()} />}
            />
            <Route path="*" element={<Elsewhere />} />
          </Routes>
        </MemoryRouter>
      </AppProvider>
    </AuthContext.Provider>,
  )

const onLanding = () => screen.queryByRole('heading', { level: 1 })?.textContent ?? null
const at = () => screen.getByTestId('elsewhere').textContent

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('who gets what at /', () => {
  it('shows the landing page to a visitor who has not signed in', () => {
    open(auth())
    expect(onLanding()).toMatch(/reads your notes/i)
    // And not somebody's library.
    expect(screen.queryByText(/day streak|Due now/i)).toBe(null)
  })

  it('shows the dashboard to a visitor who has', () => {
    open(auth({ user: { id: 'u1', email: 'reader@example.com' } }))
    expect(onLanding()).not.toMatch(/reads your notes/i)
    expect(screen.getByRole('link', { name: /All decks|My decks/i })).toBeTruthy()
  })

  it('shows the dashboard when there is no project to sign in to', () => {
    // A clone with no .env has no accounts to offer, so a landing page would
    // be two buttons leading to "this copy of Gunit is local only". It has
    // always shown the app, and the README promises it will.
    open(auth({ available: false, status: 'unavailable' }))
    expect(onLanding()).not.toMatch(/reads your notes/i)
  })

  it('shows neither while a configured project is still working out who this is', () => {
    // Answering now means showing one page and replacing it a moment later:
    // every returning reader would watch the landing page flash past on the
    // way to their own decks.
    const { container } = open(auth({ status: 'loading' }))
    expect(onLanding()).toBe(null)
    expect(container.textContent).toBe('')
  })
})

describe('the ways off the landing page', () => {
  it('sends "Sign in" to the sign-in page', async () => {
    const user = userEvent.setup()
    open(auth())
    await user.click(screen.getByRole('link', { name: 'Sign in' }))

    expect(at()).toBe('/sign-in')
  })

  it('asks the sign-in page for its sign-up mode', async () => {
    // Sign-up is a mode rather than a route, so the request rides along with
    // the navigation instead of being a different address.
    const user = userEvent.setup()
    open(auth())
    await user.click(screen.getByRole('link', { name: 'Create an account' }))

    expect(at()).toBe('/sign-in')
    expect(screen.getByTestId('elsewhere').dataset.mode).toBe('up')
  })

  it('keeps the way in without an account', async () => {
    // An account is optional in Gunit and always has been. A front door that
    // only opened for people with one would be a change to what this is.
    const user = userEvent.setup()
    open(auth())
    await user.click(screen.getByRole('link', { name: /without one/i }))

    expect(at()).toBe('/decks')
  })

  it('says what Gunit is, not just how to get in', () => {
    open(auth())
    expect(screen.getByText(/spaced-repetition/i)).toBeTruthy()
    expect(screen.getByText(/An account carries them between machines/i)).toBeTruthy()
  })

  it('shows the wordmark', () => {
    open(auth())
    expect(screen.getByRole('img', { name: 'Gunit' })).toBeTruthy()
  })
})
