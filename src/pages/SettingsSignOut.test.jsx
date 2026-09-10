// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Settings from './Settings.jsx'
import Toast from '../components/Toast.jsx'
import { AppProvider } from '../data/AppContext.jsx'
import { AuthContext } from '../data/authContext.js'
import { useApp } from '../data/useApp.js'

/**
 * Signing out, which the suite next door cannot reach: it runs with no project
 * configured, so the page shows "Not signed in" and there is no button.
 *
 * The confirmation is here because signing out stopped being a one-click undo
 * when the storage was split — the account's library comes off the machine as
 * well as off the screen. Nothing is lost by it, but it is worth a sentence
 * beforehand rather than a surprise after, and the point of these tests is
 * that nothing happens until somebody says so.
 */

const USER = { id: '83b19958-70bb-4c66-a4e2-18b9c39dbec0', email: 'reader@example.com' }

let auth

/** The toast lives in the app shell, so a page's `say(...)` needs somewhere to go. */
function Feedback() {
  return <Toast message={useApp().toast} />
}

const open = () =>
  render(
    <AuthContext.Provider value={{ ...auth, available: true, user: USER, status: 'ready' }}>
      <AppProvider>
        <MemoryRouter initialEntries={['/settings']}>
          <Routes>
            <Route path="/settings" element={<Settings />} />
          </Routes>
          <Feedback />
        </MemoryRouter>
      </AppProvider>
    </AuthContext.Provider>,
  )

const pressSignOut = async (user) => user.click(screen.getByRole('button', { name: 'Sign out' }))

/*
 * The confirm button, found inside the dialog rather than on the page.
 *
 * Both are called "Sign out", which is not ambiguous in the app — Modal marks
 * the app root inert while it is open, so the one behind cannot be reached —
 * but this harness has no #root for that to apply to. Scoping the query is
 * more honest than renaming the button to suit the test.
 */
const confirm = () => within(screen.getByRole('dialog')).getByRole('button', { name: /Sign(ing)? out/ })

beforeEach(() => {
  localStorage.clear()
  auth = { signOut: vi.fn(async () => ({ error: null })) }
})
afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('signing out', () => {
  it('says who is signed in', () => {
    open()
    expect(screen.getByText(USER.email)).toBeTruthy()
  })

  it('asks before doing anything', async () => {
    const user = userEvent.setup()
    open()
    await pressSignOut(user)

    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(auth.signOut).not.toHaveBeenCalled()
  })

  it('says what signing out costs, since it is no longer only a screen', async () => {
    // The decks come off the machine. That is the sentence worth reading.
    const user = userEvent.setup()
    open()
    await pressSignOut(user)

    expect(screen.getByText(/taken off this machine/i)).toBeTruthy()
    expect(screen.getByText(/come back when you sign in/i)).toBeTruthy()
  })

  it('does nothing on "Stay signed in"', async () => {
    const user = userEvent.setup()
    open()
    await pressSignOut(user)
    await user.click(screen.getByRole('button', { name: 'Stay signed in' }))

    expect(auth.signOut).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBe(null)
    // And the way out is still there rather than consumed by the refusal.
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy()
  })

  it('does nothing on Escape either', async () => {
    const user = userEvent.setup()
    open()
    await pressSignOut(user)
    await user.keyboard('{Escape}')

    expect(auth.signOut).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBe(null)
  })

  it('signs out once confirmed', async () => {
    const user = userEvent.setup()
    open()
    await pressSignOut(user)
    await user.click(confirm())

    expect(auth.signOut).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Signed out/))
  })

  it('says "Signing out…" and refuses a second press while it waits', async () => {
    // It is a round trip now: whatever the push debounce is holding goes up
    // before the session ends. Two presses would be two sign-outs.
    let release
    auth.signOut = vi.fn(() => new Promise((r) => { release = () => r({ error: null }) }))
    const user = userEvent.setup()
    open()
    await pressSignOut(user)
    await user.click(confirm())

    const busy = await within(screen.getByRole('dialog')).findByRole('button', {
      name: 'Signing out…',
    })
    expect(busy.disabled).toBe(true)
    await user.click(busy)
    expect(auth.signOut).toHaveBeenCalledTimes(1)

    release()
  })

  it('reports a refusal rather than pretending it worked', async () => {
    auth.signOut = vi.fn(async () => ({ error: 'Network request failed' }))
    const user = userEvent.setup()
    open()
    await pressSignOut(user)
    await user.click(confirm())

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toMatch(/Network request failed/),
    )
  })
})
