// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import SignIn from './SignIn.jsx'
import ResetPassword from './ResetPassword.jsx'
import { deck, renderRoute, seed } from '../../test/render-app.jsx'

/**
 * Both auth pages with no project configured — the state a fresh clone is in.
 *
 * The point of these is that neither page dead-ends. A student sent a link to
 * a copy of Gunit that has no accounts should be told so and pointed back at
 * their decks, not shown a form that silently cannot work.
 */

const openSignIn = () => renderRoute('/sign-in', '/sign-in', <SignIn />)
const openReset = () => renderRoute('/reset-password', '/reset-password', <ResetPassword />)

beforeEach(() => {
  localStorage.clear()
  seed({ decks: [deck()] })
})
afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('the sign-in page with no accounts configured', () => {
  it('says so plainly rather than showing a form that cannot work', () => {
    openSignIn()
    expect(screen.getByText('This copy of Gunit is local only')).toBeTruthy()
    expect(screen.queryByLabelText('Email')).toBe(null)
  })

  it('says the decks are not missing, only unsynced', () => {
    openSignIn()
    expect(screen.getByText(/back them up from Settings/i)).toBeTruthy()
  })

  it('offers the way back to studying', () => {
    openSignIn()
    expect(screen.getByRole('link', { name: 'Back to studying' })).toBeTruthy()
  })
})

describe('a reset link arriving at a copy with no accounts', () => {
  it('explains rather than showing a password field', () => {
    openReset()
    expect(screen.getByText('This copy of Gunit has no accounts')).toBeTruthy()
    expect(screen.queryByLabelText('New password')).toBe(null)
  })
})
