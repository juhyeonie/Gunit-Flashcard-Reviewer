// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { render } from '@testing-library/react'
import { AppProvider } from '../data/AppContext.jsx'
import Summary from './Summary.jsx'
import { deck, seed } from '../../test/render-app.jsx'

/**
 * The summary reports one session, and the figures arrive with the navigation
 * rather than from the deck. Nothing carries them across a reload, so the page
 * can be opened with nothing to report — which it has to admit rather than
 * fill in.
 */

/** Opens the summary with, or without, the state a finished session hands it. */
const open = (state) =>
  render(
    <AppProvider>
      <MemoryRouter initialEntries={[{ pathname: '/decks/republic/summary', state }]}>
        <Routes>
          <Route path="/decks/:id/summary" element={<Summary />} />
          <Route path="*" element={<span data-testid="pathname" />} />
        </Routes>
      </MemoryRouter>
    </AppProvider>,
  )

const tile = (label) => screen.getByText(label).previousSibling.textContent

beforeEach(() => {
  localStorage.clear()
  seed({ decks: [deck({ count: 6 })] })
})
afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('after a session', () => {
  const finished = { reviewed: 5, known: 4, again: 1, seconds: 91.4 }

  it('reports what was actually done', () => {
    open(finished)
    expect(screen.getByText('5 cards reviewed')).toBeTruthy()
    expect(tile('Reviewed')).toBe('5')
    expect(tile('Known')).toBe('4')
    expect(tile('Again')).toBe('1')
  })

  it('rounds the length, and never down to nothing', () => {
    open({ ...finished, seconds: 20 })
    // A twenty-second session is short, not absent.
    expect(screen.getByText(/· 1 minute$/)).toBeTruthy()
  })

  it('says card, singular, for one', () => {
    open({ ...finished, reviewed: 1 })
    expect(screen.getByText('1 card reviewed')).toBeTruthy()
  })

  it('announces itself as complete', () => {
    open(finished)
    expect(document.title).toMatch(/Session complete/)
  })
})

describe('with no session to report', () => {
  it('says so rather than reporting a session of zero', () => {
    // Reached by a typed URL, a bookmark or a new tab — a reload keeps the
    // figures, since router state rides in the history entry. Zeroes would
    // read as a session in which nothing was recalled.
    open(undefined)

    expect(screen.getByText('Nothing to report')).toBeTruthy()
    expect(screen.queryByText('0 cards reviewed')).toBe(null)
    expect(screen.queryByText('Reviewed')).toBe(null)
  })

  it('does not invent a minute that was never spent', () => {
    open(undefined)
    expect(screen.queryByText(/1 minute/)).toBe(null)
  })

  it('reassures that the studying itself is not what is missing', () => {
    open(undefined)
    expect(screen.getByText(/already in the deck/)).toBeTruthy()
  })

  it('still shows what is true of the deck either way', () => {
    open(undefined)
    expect(tile('Cards')).toBe('6')
    expect(screen.getByText('Streak')).toBeTruthy()
  })

  it('leaves the way back open', () => {
    open(undefined)
    expect(screen.getByRole('button', { name: 'Review again' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Take the quiz' })).toBeTruthy()
  })

  it('does not announce a session complete', () => {
    // The route announcer reads the document title out on arrival.
    open(undefined)
    expect(document.title).toMatch(/Nothing to report/)
  })
})

describe('when the deck is gone', () => {
  it('says so instead of summarising nothing', () => {
    localStorage.clear()
    seed({ decks: [deck({ id: 'other' })] })
    open({ reviewed: 3, known: 3, again: 0, seconds: 60 })
    expect(screen.getByText('That deck no longer exists.')).toBeTruthy()
  })
})
