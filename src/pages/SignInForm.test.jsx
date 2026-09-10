// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SignIn from './SignIn.jsx'
import { AuthContext } from '../data/authContext.js'

/**
 * The sign-in form itself, which the suite next door cannot reach: those tests
 * run with no project configured, which is the state a fresh clone is in, and
 * the page correctly shows a dead end rather than a form.
 *
 * The auth layer is supplied here rather than mocked at the module level, so
 * the page is exercised through the same context the app gives it. What is
 * asserted is the page's side of the bargain — that it calls the handler it
 * was given, reports what comes back, and does not act while it is waiting.
 */

const handlers = () => ({
  signIn: vi.fn(async () => ({ error: null })),
  signUp: vi.fn(async () => ({ error: null })),
  requestPasswordReset: vi.fn(async () => ({ error: null })),
})

let auth

const open = () =>
  render(
    <AuthContext.Provider value={{ ...auth, available: true, user: null, status: 'ready' }}>
      <MemoryRouter initialEntries={['/sign-in']}>
        <Routes>
          <Route path="/sign-in" element={<SignIn />} />
          <Route path="*" element={<div data-testid="elsewhere" />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )

beforeEach(() => {
  auth = handlers()
})
afterEach(cleanup)

describe('signing in', () => {
  it('hands the typed credentials to the existing handler', async () => {
    const user = userEvent.setup()
    open()

    await user.type(screen.getByLabelText('Email'), '  reader@example.com  ')
    await user.type(screen.getByLabelText('Password'), 'correcthorse')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    // Trimmed, as it always was — a pasted address often brings a space.
    expect(auth.signIn).toHaveBeenCalledWith('reader@example.com', 'correcthorse')
  })

  it('leaves the page on success', async () => {
    const user = userEvent.setup()
    open()
    await user.type(screen.getByLabelText('Email'), 'reader@example.com')
    await user.type(screen.getByLabelText('Password'), 'correcthorse')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByTestId('elsewhere')).toBeTruthy()
  })

  it('says "Signing in…" and refuses a second press while it waits', async () => {
    // Two presses is two sign-in attempts, and on a slow connection that is
    // exactly what an impatient reader does.
    let release
    auth.signIn = vi.fn(() => new Promise((resolve) => { release = () => resolve({ error: null }) }))
    const user = userEvent.setup()
    open()

    await user.type(screen.getByLabelText('Email'), 'reader@example.com')
    await user.type(screen.getByLabelText('Password'), 'correcthorse')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    const button = await screen.findByRole('button', { name: 'Signing in…' })
    expect(button.disabled).toBe(true)
    await user.click(button)
    expect(auth.signIn).toHaveBeenCalledTimes(1)

    release()
  })

  it('shows what went wrong inline, and stays put', async () => {
    auth.signIn = vi.fn(async () => ({ error: 'Invalid login credentials' }))
    const user = userEvent.setup()
    open()

    await user.type(screen.getByLabelText('Email'), 'reader@example.com')
    await user.type(screen.getByLabelText('Password'), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Invalid login credentials')).toBeTruthy()
    expect(screen.queryByTestId('elsewhere')).toBe(null)
    // In a live region, so it is announced rather than only drawn.
    expect(screen.getByText('Invalid login credentials').closest('[role="status"]')).toBeTruthy()
    // And the button comes back rather than staying stuck.
    expect(screen.getByRole('button', { name: 'Sign in' }).disabled).toBe(false)
  })

  it('clears a previous error when trying again', async () => {
    // One handler that changes its answer, rather than two: the context value
    // is spread at render, so swapping the function afterwards would leave the
    // page still holding the first one.
    let attempt = 0
    auth.signIn = vi.fn(async () =>
      (attempt += 1) === 1 ? { error: 'Invalid login credentials' } : { error: null },
    )
    const user = userEvent.setup()
    open()
    await user.type(screen.getByLabelText('Email'), 'reader@example.com')
    await user.type(screen.getByLabelText('Password'), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    await screen.findByText('Invalid login credentials')

    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => expect(screen.queryByText('Invalid login credentials')).toBe(null))
    expect(auth.signIn).toHaveBeenCalledTimes(2)
  })
})

describe('the password reveal', () => {
  const field = () => screen.getByLabelText('Password')

  it('starts hidden', () => {
    open()
    expect(field().type).toBe('password')
    expect(screen.getByRole('button', { name: 'Show password' })).toBeTruthy()
  })

  it('shows the password, and hides it again', async () => {
    const user = userEvent.setup()
    open()

    await user.click(screen.getByRole('button', { name: 'Show password' }))
    expect(field().type).toBe('text')

    await user.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(field().type).toBe('password')
  })

  it('says which state it is in, not just what it does', async () => {
    // The icon alone tells a screen reader nothing.
    const user = userEvent.setup()
    open()
    const toggle = screen.getByRole('button', { name: 'Show password' })
    expect(toggle.getAttribute('aria-pressed')).toBe('false')

    await user.click(toggle)
    expect(screen.getByRole('button', { name: 'Hide password' }).getAttribute('aria-pressed')).toBe(
      'true',
    )
  })

  it('does not submit the form', async () => {
    // A button inside a form is a submit button unless it says otherwise, and
    // revealing a password is not an attempt to sign in.
    const user = userEvent.setup()
    open()
    await user.type(screen.getByLabelText('Email'), 'reader@example.com')
    await user.click(screen.getByRole('button', { name: 'Show password' }))

    expect(auth.signIn).not.toHaveBeenCalled()
  })

  it('keeps what was typed', async () => {
    const user = userEvent.setup()
    open()
    await user.type(field(), 'correcthorse')
    await user.click(screen.getByRole('button', { name: 'Show password' }))
    expect(field().value).toBe('correcthorse')
  })
})

describe('the other two ways in', () => {
  it('reaches the sign-up flow from "Create one"', async () => {
    const user = userEvent.setup()
    open()
    await user.click(screen.getByRole('button', { name: 'Create one' }))

    expect(screen.getByRole('heading', { name: 'Make an account' })).toBeTruthy()
    expect(screen.getByLabelText('Your name')).toBeTruthy()

    await user.type(screen.getByLabelText('Email'), 'new@example.com')
    await user.type(screen.getByLabelText('Password'), 'correcthorse')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(auth.signUp).toHaveBeenCalled()
  })

  it('reaches the reset flow from "Forgot password?"', async () => {
    const user = userEvent.setup()
    open()
    await user.click(screen.getByRole('button', { name: 'Forgot password?' }))

    expect(screen.getByRole('heading', { name: 'Forgotten your password' })).toBeTruthy()
    // No password to type when you cannot remember it.
    expect(screen.queryByLabelText('Password')).toBe(null)

    await user.type(screen.getByLabelText('Email'), 'reader@example.com')
    await user.click(screen.getByRole('button', { name: 'Send reset link' }))
    expect(auth.requestPasswordReset).toHaveBeenCalledWith('reader@example.com')
  })

  it('confirms the link was sent rather than leaving the page', async () => {
    const user = userEvent.setup()
    open()
    await user.click(screen.getByRole('button', { name: 'Forgot password?' }))
    await user.type(screen.getByLabelText('Email'), 'reader@example.com')
    await user.click(screen.getByRole('button', { name: 'Send reset link' }))

    expect(await screen.findByText('Check your email')).toBeTruthy()
    expect(screen.queryByTestId('elsewhere')).toBe(null)
  })

  it('comes back to signing in', async () => {
    const user = userEvent.setup()
    open()
    await user.click(screen.getByRole('button', { name: 'Create one' }))
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeTruthy()
  })

  it('drops an error when the mode changes', async () => {
    // The message was about the thing you were doing, not the thing you are.
    auth.signIn = vi.fn(async () => ({ error: 'Invalid login credentials' }))
    const user = userEvent.setup()
    open()
    await user.type(screen.getByLabelText('Email'), 'reader@example.com')
    await user.type(screen.getByLabelText('Password'), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    await screen.findByText('Invalid login credentials')

    await user.click(screen.getByRole('button', { name: 'Create one' }))
    expect(screen.queryByText('Invalid login credentials')).toBe(null)
  })

  it('still offers the way out without an account at all', () => {
    open()
    expect(screen.getByRole('link', { name: 'Keep studying without an account' })).toBeTruthy()
  })
})
