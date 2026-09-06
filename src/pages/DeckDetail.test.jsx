// @vitest-environment jsdom
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DeckDetail from './DeckDetail.jsx'
import { MIN_QUIZ_CARDS } from '../data/quiz.js'
import { deck, entry, renderRoute, seed } from '../../test/render-app.jsx'
import { FORMAT } from '../data/transfer.js'

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

describe('exporting the deck', () => {
  /** Catches what the anchor was pointed at, without a real download. */
  const captureSave = () => {
    const saved = {}
    const blobs = []
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      blobs.push(blob)
      return 'blob:deck'
    })
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
      saved.name = this.download
      saved.href = this.href
    })
    return { saved, blobs }
  }

  afterEach(() => vi.restoreAllMocks())

  it('saves a file named after the deck', async () => {
    seed({ decks: [deck({ count: 2 })] })
    const { saved } = captureSave()
    open(props())

    await userEvent.click(screen.getByRole('button', { name: 'Export deck' }))

    expect(saved.name).toBe('roman-republic.gunit.json')
    expect(saved.href).toBe('blob:deck')
  })

  it('writes the deck and its cards into it', async () => {
    seed({ decks: [deck({ count: 2, schedule: { c0: entry(60) } })] })
    const { blobs } = captureSave()
    open(props())

    await userEvent.click(screen.getByRole('button', { name: 'Export deck' }))

    const written = JSON.parse(await blobs[0].text())
    expect(written.format).toBe(FORMAT)
    expect(written.title).toBe('Roman Republic')
    expect(written.cards).toHaveLength(2)
    // The review history rides on the card that earned it.
    expect(written.cards[0].scheduling).toMatchObject({ interval: 1440 })
    expect(written.cards[1].scheduling).toBe(null)
  })

  it('says what it saved', async () => {
    seed({ decks: [deck({ count: 1 })] })
    captureSave()
    open(props())

    await userEvent.click(screen.getByRole('button', { name: 'Export deck' }))
    expect(await screen.findByText('Saved roman-republic.gunit.json')).toBeTruthy()
  })

  it('exports an empty deck rather than refusing', async () => {
    seed({ decks: [deck({ count: 0 })] })
    const { blobs } = captureSave()
    open(props())

    await userEvent.click(screen.getByRole('button', { name: 'Export deck' }))
    expect(JSON.parse(await blobs[0].text()).cards).toEqual([])
  })
})
