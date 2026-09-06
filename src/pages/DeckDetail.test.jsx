// @vitest-environment jsdom
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DeckDetail from './DeckDetail.jsx'
import { MIN_QUIZ_CARDS } from '../data/quiz.js'
import { deck, entry, renderRoute, seed } from '../../test/render-app.jsx'

/**
 * The deck page, and the guards on the way out of it.
 *
 * Most of what this page does is hand work off — to a modal, or to a study
 * route. What is worth pinning is where it refuses: an empty deck cannot be
 * studied, and a deck of three cannot be quizzed, however the menu is reached.
 */

const props = () => ({
  onEditDeck: vi.fn(),
  onNewCard: vi.fn(),
  onEditCard: vi.fn(),
  onDeleteCard: vi.fn(),
  onImport: vi.fn(),
})

const open = (p, path = '/decks/republic') =>
  renderRoute(path, '/decks/:id', <DeckDetail {...p} />)

/** Opens one of the two dropdowns and returns the item asked for. */
const menuItem = async (opener, item) => {
  await userEvent.click(screen.getByRole('button', { name: new RegExp(opener) }))
  return screen.getByRole('button', { name: new RegExp(item) })
}

const at = () => screen.getByTestId('pathname').textContent

/** The page navigates by leaving its own route, so staying is the absence. */
const stillHere = () => expect(screen.queryByTestId('pathname')).toBe(null)

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('what it shows', () => {
  it('counts the cards, and how many are due', () => {
    seed({ decks: [deck({ count: 4, schedule: { c0: entry(-10), c1: entry(60) } })] })
    open(props())

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Roman Republic')
    expect(screen.getByText('Cards').previousSibling.textContent).toBe('4')
    // One overdue, plus the two that have never been seen — a new card is due
    // by definition, or it would never come up.
    expect(screen.getByText('Due now').previousSibling.textContent).toBe('3')
  })

  it('says a deck has never been studied rather than showing a blank', () => {
    seed({ decks: [deck()] })
    open(props())
    expect(screen.getByText('Last studied').previousSibling.textContent).toBe('Never')
  })

  it('says so when the deck is gone', () => {
    seed({ decks: [deck()] })
    open(props(), '/decks/deleted')
    expect(screen.getByText('That deck no longer exists.')).toBeTruthy()
  })
})

describe('starting a session', () => {
  it('opens flashcards', async () => {
    seed({ decks: [deck({ count: 4 })] })
    open(props())

    await userEvent.click(await menuItem('Study this deck', 'Flashcards'))
    await waitFor(() => expect(at()).toBe('/decks/republic/review'))
  })

  it('opens a quiz', async () => {
    seed({ decks: [deck({ count: 4 })] })
    open(props())

    await userEvent.click(await menuItem('Study this deck', 'Quiz'))
    await waitFor(() => expect(at()).toBe('/decks/republic/quiz'))
  })

  it('refuses to study an empty deck, and says what to do instead', async () => {
    seed({ decks: [deck({ count: 0 })] })
    open(props())

    await userEvent.click(await menuItem('Study this deck', 'Flashcards'))

    stillHere()
    expect(await screen.findByText('Add a card to this deck before studying')).toBeTruthy()
  })

  it('refuses a quiz on too few cards, and counts them', async () => {
    // The bar for a quiz is higher than for flashcards: without other cards to
    // draw wrong answers from, every question would show only the right one.
    seed({ decks: [deck({ count: MIN_QUIZ_CARDS - 1 })] })
    open(props())

    await userEvent.click(await menuItem('Study this deck', 'Quiz'))

    stillHere()
    expect(
      await screen.findByText(`A quiz needs ${MIN_QUIZ_CARDS} cards — this deck has 3`),
    ).toBeTruthy()
  })

  it('still allows flashcards on a deck too small to quiz', async () => {
    seed({ decks: [deck({ count: MIN_QUIZ_CARDS - 1 })] })
    open(props())

    await userEvent.click(await menuItem('Study this deck', 'Flashcards'))
    await waitFor(() => expect(at()).toBe('/decks/republic/review'))
  })
})

describe('adding cards', () => {
  beforeEach(() => seed({ decks: [deck({ count: 4 })] }))

  it('hands writing one to the card modal', async () => {
    const p = props()
    open(p)

    await userEvent.click(await menuItem('Add cards', 'Write your own'))
    expect(p.onNewCard).toHaveBeenCalledWith(expect.objectContaining({ id: 'republic' }))
  })

  it('hands importing to the import modal, against this deck', async () => {
    const p = props()
    open(p)

    await userEvent.click(await menuItem('Add cards', 'Import a file'))
    expect(p.onImport).toHaveBeenCalledWith(expect.objectContaining({ id: 'republic' }))
  })

  it('hands editing the deck to the deck modal', async () => {
    const p = props()
    open(p)

    await userEvent.click(screen.getByRole('button', { name: 'Edit deck' }))
    expect(p.onEditDeck).toHaveBeenCalledWith(expect.objectContaining({ id: 'republic' }))
  })
})
