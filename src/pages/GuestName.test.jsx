// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Dashboard from './Dashboard.jsx'
import { TopNav } from '../components/Navbar.jsx'
import { AppProvider } from '../data/AppContext.jsx'
import { DEFAULT_SETTINGS, normalizeState } from '../data/normalize.js'
import { GUEST_KEY } from '../data/storageKeys.js'

/**
 * What a reader is called before they have said.
 *
 * The default used to be 'Mara Kessler', a name out of the prototype's
 * mockups. It meant a new reader was greeted by a stranger, found her in their
 * own settings, and had her initials in the corner of every page — and because
 * it was a default rather than something anybody typed, it looked like the app
 * had confused them with somebody else.
 *
 * Blank is the honest answer, which makes the absence something the rest of
 * the app has to handle rather than something it can assume away.
 */

const withLibrary = (settings) => {
  localStorage.setItem(
    GUEST_KEY,
    JSON.stringify({ decks: [], sessions: [], theme: 'light', settings }),
  )
}

const showDashboard = () =>
  render(
    <AppProvider>
      <MemoryRouter>
        <Dashboard onNewDeck={vi.fn()} onEditDeck={vi.fn()} onImport={vi.fn()} />
      </MemoryRouter>
    </AppProvider>,
  )

const showNav = () =>
  render(
    <AppProvider>
      <MemoryRouter>
        <TopNav />
      </MemoryRouter>
    </AppProvider>,
  )

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('a reader who has not given a name', () => {
  it('is not called anything by default', () => {
    expect(DEFAULT_SETTINGS.name).toBe('')
  })

  it('is greeted without one rather than addressed as nobody', () => {
    // "Good morning, ." is what happens if the greeting assumes a name.
    showDashboard()
    const greeting = screen.getByRole('heading', { level: 1 }).textContent
    expect(greeting).toMatch(/^Good (morning|afternoon|evening)\.$/)
    expect(greeting).not.toMatch(/,/)
  })

  it('has no initials in the corner, rather than an empty disc', () => {
    showNav()
    // The streak pill is still there; what is gone is the avatar beside it.
    expect(screen.getByText(/streak/i)).toBeTruthy()
    expect(screen.queryByText(/^[A-Z]{1,2}$/)).toBe(null)
  })
})

describe('a reader who has', () => {
  it('is greeted by their first name', () => {
    withLibrary({ ...DEFAULT_SETTINGS, name: 'Tine Pelgone' })
    showDashboard()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(
      /^Good (morning|afternoon|evening), Tine\.$/,
    )
  })

  it('gets their initials back', () => {
    withLibrary({ ...DEFAULT_SETTINGS, name: 'Tine Pelgone' })
    showNav()
    expect(screen.getByText('TP')).toBeTruthy()
  })

  it('is not tripped up by extra spaces', () => {
    withLibrary({ ...DEFAULT_SETTINGS, name: '  Tine   Pelgone  ' })
    showNav()
    expect(screen.getByText('TP')).toBeTruthy()
  })

  it('is treated as nameless if all they typed was spaces', () => {
    withLibrary({ ...DEFAULT_SETTINGS, name: '   ' })
    showDashboard()
    expect(screen.getByRole('heading', { level: 1 }).textContent).not.toMatch(/,/)
  })
})

describe('browsers that already have the mock name stored', () => {
  it('forgets it, or the change would fix this for nobody', () => {
    // Changing the default alone helps only browsers that have never opened
    // Gunit. Everyone else has 'Mara Kessler' sitting in their stored
    // settings, which is exactly the set of people who reported it.
    const state = normalizeState({ settings: { ...DEFAULT_SETTINGS, name: 'Mara Kessler' } })
    expect(state.settings.name).toBe('')
  })

  it('clears only that exact name', () => {
    // It is somebody's data, even if nobody typed it. Anything else stays.
    const state = normalizeState({ settings: { ...DEFAULT_SETTINGS, name: 'Mara Kesslerson' } })
    expect(state.settings.name).toBe('Mara Kesslerson')
  })

  it('leaves the rest of the settings alone while doing it', () => {
    const state = normalizeState({
      settings: { ...DEFAULT_SETTINGS, name: 'Mara Kessler', cardsPer: 33, autoReveal: true },
    })
    expect(state.settings).toMatchObject({ name: '', cardsPer: 33, autoReveal: true })
  })
})
