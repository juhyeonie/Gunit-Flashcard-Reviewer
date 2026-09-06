// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Decks from './Decks.jsx'
import { deck, renderRoute, seed } from '../../test/render-app.jsx'

/**
 * The library page. `library.js` covers the filtering and sorting themselves;
 * what is here is the empty state, which has to describe what the reader
 * actually did rather than what it assumes they did.
 */

const open = () =>
  renderRoute('/decks', '/decks', <Decks onNewDeck={vi.fn()} onEditDeck={vi.fn()} />)

const search = () => screen.getByLabelText('Search decks and cards')

beforeEach(() => {
  localStorage.clear()
  seed({
    decks: [
      deck({ id: 'republic', title: 'Roman Republic', count: 4 }),
      deck({ id: 'punic', title: 'The Punic Wars', count: 2 }),
    ],
  })
})
afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('finding a deck', () => {
  it('lists them all to begin with', () => {
    open()
    expect(screen.getByRole('heading', { name: 'Roman Republic' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'The Punic Wars' })).toBeTruthy()
  })

  it('narrows to what was typed', async () => {
    open()
    await userEvent.type(search(), 'punic')

    expect(screen.getByRole('heading', { name: 'The Punic Wars' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Roman Republic' })).toBe(null)
  })
})

describe('when nothing matches', () => {
  it('quotes the search back, and offers to clear it', async () => {
    open()
    await userEvent.type(search(), 'photosynthesis')

    expect(screen.getByText(/Nothing matches/)).toBeTruthy()
    expect(screen.getByText(/Try a shorter search term/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Clear search' })).toBeTruthy()
  })

  it('does not tell someone to shorten a search they never typed', async () => {
    // Reached by a filter alone. "Try a shorter search term" is advice about
    // something that did not happen, and "Clear search" names the wrong thing.
    open()
    await userEvent.click(screen.getByRole('button', { name: 'Mastered' }))

    expect(screen.getByText('Nothing matches that filter')).toBeTruthy()
    expect(screen.queryByText(/shorter search term/)).toBe(null)
    expect(screen.getByRole('button', { name: 'Clear filter' })).toBeTruthy()
  })

  it('puts every deck back', async () => {
    open()
    await userEvent.click(screen.getByRole('button', { name: 'Mastered' }))
    await userEvent.click(screen.getByRole('button', { name: 'Clear filter' }))

    expect(screen.getByRole('heading', { name: 'Roman Republic' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'The Punic Wars' })).toBeTruthy()
  })
})
