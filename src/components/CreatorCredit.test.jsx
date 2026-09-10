// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CreatorCredit from './CreatorCredit.jsx'
import Landing from '../pages/Landing.jsx'
import Settings from '../pages/Settings.jsx'
import SignIn from '../pages/SignIn.jsx'
import { AppProvider } from '../data/AppContext.jsx'
import { AuthContext } from '../data/authContext.js'

/**
 * Where the credit appears, and — as much to the point — where it does not.
 *
 * The risk with a credit is not that it goes missing; it is that it spreads.
 * A line under a landing page is a signature, and the same line on every deck,
 * modal and review screen is a watermark. So these pin both halves: the three
 * places it belongs, and the study screens it must stay off.
 */

const CREDIT = /Designed & developed by/

const auth = (over = {}) => ({ available: true, status: 'ready', user: null, ...over })

const inRouter = (node, value = auth()) =>
  render(
    <AuthContext.Provider value={value}>
      <AppProvider>
        <MemoryRouter>{node}</MemoryRouter>
      </AppProvider>
    </AuthContext.Provider>,
  )

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('the credit itself', () => {
  it('reads the way it was asked to', () => {
    render(<CreatorCredit />)
    expect(screen.getByText(CREDIT).textContent).toBe('Designed & developed by Justine Pelgone')
  })

  it('is a sentence, so it is read as one', () => {
    render(<CreatorCredit />)
    expect(screen.getByText(CREDIT).tagName).toBe('P')
  })

  it('separates the name by weight rather than by colour', () => {
    // Colour alone would say nothing on a monochrome display, or to anyone who
    // cannot tell the greys apart.
    render(<CreatorCredit />)
    const name = screen.getByText('Justine Pelgone')
    expect(name.className).toMatch(/font-medium/)
  })

  it('is not set in the grey that fails contrast at this size', () => {
    // text-ink-3 is the app's usual grey for asides and measures 3.99:1
    // against paper - under the 4.5:1 WCAG AA asks for twelve-pixel text.
    render(<CreatorCredit />)
    const credit = screen.getByText(CREDIT)
    expect(credit.className).toMatch(/text-ink-2/)
    expect(credit.className).not.toMatch(/text-ink-3/)
  })
})

describe('where it appears', () => {
  it('sits at the foot of the landing page', () => {
    inRouter(<Landing />)
    expect(screen.getByText(CREDIT)).toBeTruthy()
  })

  it('is under the sign-in form, not among it', () => {
    inRouter(<SignIn />)
    const credit = screen.getByText(CREDIT)
    expect(credit).toBeTruthy()
    // Outside the form: it is not part of signing in.
    expect(credit.closest('form')).toBe(null)
  })

  it('carries across to making an account, and to asking for a reset link', async () => {
    // Sign-up is a mode of the same page, so this is one placement rather than
    // two that have to be kept in step. Switching mode has to keep it.
    const user = userEvent.setup()
    inRouter(<SignIn />)

    await user.click(screen.getByRole('button', { name: 'Create one' }))
    expect(screen.getByRole('heading', { name: 'Make an account' })).toBeTruthy()
    expect(screen.getByText(CREDIT)).toBeTruthy()

    // "Forgot password?" lives on the password row and only in sign-in mode,
    // so the way back to it is the way a reader would take.
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    await user.click(screen.getByRole('button', { name: 'Forgot password?' }))
    expect(screen.getByRole('heading', { name: /Forgotten your password/ })).toBeTruthy()
    expect(screen.getByText(CREDIT)).toBeTruthy()
  })

  it('appears on the settings page, where app credits belong', () => {
    inRouter(<Settings />)
    const about = screen.getByRole('heading', { name: 'About' }).parentElement
    expect(within(about).getByText('Gunit')).toBeTruthy()
    expect(within(about).getByText(CREDIT)).toBeTruthy()
  })

  it('names the app there, which the other two placements do not need to', () => {
    inRouter(<Settings />)
    const about = screen.getByRole('heading', { name: 'About' }).parentElement
    expect(within(about).getByText('Gunit').className).toMatch(/font-serif/)
  })

  it('is not the same section as "About you", which is the reader', () => {
    inRouter(<Settings />)
    const aboutYou = screen.getByRole('heading', { name: 'About you' }).parentElement
    expect(within(aboutYou).queryByText(CREDIT)).toBe(null)
  })
})

describe('where it must not appear', () => {
  it('stays off the dashboard', async () => {
    const { default: Dashboard } = await import('../pages/Dashboard.jsx')
    inRouter(<Dashboard onNewDeck={vi.fn()} onEditDeck={vi.fn()} onImport={vi.fn()} />)
    expect(screen.queryByText(CREDIT)).toBe(null)
  })

  it('stays off the deck library', async () => {
    const { default: Decks } = await import('../pages/Decks.jsx')
    inRouter(<Decks onNewDeck={vi.fn()} onEditDeck={vi.fn()} />)
    expect(screen.queryByText(CREDIT)).toBe(null)
  })

  it('stays out of the navigation, which is on every screen', async () => {
    const { TopNav } = await import('./Navbar.jsx')
    inRouter(<TopNav />)
    expect(screen.queryByText(CREDIT)).toBe(null)
  })
})
