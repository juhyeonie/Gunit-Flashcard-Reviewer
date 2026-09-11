// @vitest-environment jsdom
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DeckDetail from './DeckDetail.jsx'
import { MIN_QUIZ_CARDS } from '../data/quiz.js'
import { deck, entry, renderRoute, seed, stored } from '../../test/render-app.jsx'
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
  onResetDeck: vi.fn(),
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

describe('what the menus announce', () => {
  beforeEach(() => seed({ decks: [deck({ count: 4 })] }))

  it('says the button opens a menu, not just that it expands', () => {
    open(props())
    for (const name of ['Study this deck', 'Add cards']) {
      const button = screen.getByRole('button', { name: new RegExp(name) })
      expect(button.getAttribute('aria-haspopup')).toBe('true')
      expect(button.getAttribute('aria-expanded')).toBe('false')
    }
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

describe('suspending a card', () => {
  /** Opens the kebab beside card `i` and returns the item asked for. */
  const cardMenu = async (i, item) => {
    await userEvent.click(screen.getAllByRole('button', { name: 'Card options' })[i])
    return screen.getByRole('button', { name: new RegExp(item) })
  }

  it('offers it on every card, without a confirmation', () => {
    // Nothing is lost by it and it is one click to undo, so a modal here would
    // be ceremony rather than a safeguard.
    seed({ decks: [deck({ count: 2 })] })
    open(props())
    return cardMenu(0, 'Suspend card').then((item) => expect(item).toBeTruthy())
  })

  it('marks the card and takes it out of the due count', async () => {
    seed({ decks: [deck({ count: 3 })] })
    open(props())
    expect(screen.getByText('Due now').previousSibling.textContent).toBe('3')

    await userEvent.click(await cardMenu(0, 'Suspend card'))

    expect(screen.getByText('Suspended', { selector: 'span' })).toBeTruthy()
    expect(screen.getByText('Due now').previousSibling.textContent).toBe('2')
  })

  it('counts them, so a deck with nothing due can explain itself', async () => {
    seed({ decks: [deck({ count: 1 })] })
    open(props())
    // Absent until it applies — a permanent "Suspended 0" is noise.
    expect(screen.queryByText('Suspended')).toBe(null)

    await userEvent.click(await cardMenu(0, 'Suspend card'))

    expect(screen.getByText('Due now').previousSibling.textContent).toBe('0')
    expect(screen.getAllByText('Suspended').some((el) => el.previousSibling?.textContent === '1')).toBe(
      true,
    )
  })

  it('offers the way back, and takes it', async () => {
    seed({ decks: [deck({ count: 2 })] })
    open(props())
    await userEvent.click(await cardMenu(0, 'Suspend card'))
    await userEvent.click(await cardMenu(0, 'Unsuspend card'))

    expect(screen.queryByText('Suspended', { selector: 'span' })).toBe(null)
    expect(screen.getByText('Due now').previousSibling.textContent).toBe('2')
  })

  it('keeps the card in the deck', async () => {
    // The whole point of it over deleting: the card and its history stay.
    seed({ decks: [deck({ count: 2, schedule: { c0: entry(-10) } })] })
    open(props())
    await userEvent.click(await cardMenu(0, 'Suspend card'))

    expect(screen.getByText('Cards').previousSibling.textContent).toBe('2')
    expect(screen.getByText('Question 0?')).toBeTruthy()
    expect(stored().decks[0].schedule.c0).toMatchObject({ reps: 1, suspended: true })
  })

  it('says which card it was, since the menu closes behind it', async () => {
    seed({ decks: [deck({ count: 2 })] })
    open(props())
    await userEvent.click(await cardMenu(1, 'Suspend card'))
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Card 2 suspended/))
  })
})

describe('resetting a deck', () => {
  const openDeckMenu = async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Deck options' }))
    return screen.getByRole('button', { name: /Reset progress/ })
  }

  it('hands the deck to the shell rather than clearing it here', async () => {
    // Destructive and irreversible, so it goes through the same confirmation
    // path as deleting a deck instead of firing from the menu.
    seed({ decks: [deck({ count: 2, schedule: { c0: entry(60) } })] })
    const p = props()
    open(p)

    await userEvent.click(await openDeckMenu())

    expect(p.onResetDeck).toHaveBeenCalledTimes(1)
    expect(p.onResetDeck.mock.calls[0][0].id).toBe('republic')
    // Nothing has happened to the library yet.
    expect(stored().decks[0].schedule.c0).toBeTruthy()
  })
})

describe('where the header menus open', () => {
  /**
   * The panel Menu renders, found by the classes it always carries.
   *
   * jsdom has no layout engine, so none of this can be measured here — what
   * is asserted is the anchoring that decides it. On a 375px screen the deck
   * menu opened 204px past the right edge and the add-cards menu 44px past,
   * because both were anchored to their own left edge on narrow screens while
   * sitting near the right of the row.
   */
  const panel = () =>
    document.querySelector('div.rise-in.absolute') ??
    [...document.querySelectorAll('div')].find(
      (d) => d.className.includes('rise-in') && d.className.includes('absolute'),
    )

  const openMenu = async (name) => {
    await userEvent.click(screen.getByRole('button', { name: new RegExp(name) }))
    return panel()
  }

  beforeEach(() => seed({ decks: [deck({ count: 2 })] }))

  it('opens the deck menu leftwards, since its button is at the right edge', async () => {
    open(props())
    const p = await openMenu('Deck options')
    expect(p.className).toContain('right-0')
    expect(p.className).not.toContain('left-0')
  })

  it('opens "Add cards" leftwards for the same reason', async () => {
    open(props())
    const p = await openMenu('Add cards')
    expect(p.className).toContain('right-0')
    expect(p.className).not.toContain('left-0')
  })

  it('leaves "Study this deck" opening rightwards, because it is first in the row', async () => {
    // Anchored right, its panel would start at -59 on a 375px screen. The two
    // cases genuinely differ, which is why they do not share a setting.
    open(props())
    const p = await openMenu('Study this deck')
    expect(p.className).toContain('left-0')
  })

  it('opens the card menus leftwards, which they always have', async () => {
    open(props())
    await userEvent.click(screen.getAllByRole('button', { name: 'Card options' })[0])
    expect(panel().className).toContain('right-0')
  })
})
