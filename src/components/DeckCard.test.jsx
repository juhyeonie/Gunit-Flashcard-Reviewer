// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import DeckCard from './DeckCard.jsx'

/**
 * The deck card, drawn twice from one component.
 *
 * The dashboard and the library lay it out differently and say the same
 * things, so the tests are about what it claims rather than where it puts it:
 * which badge a deck has earned, whether it leads with what is waiting or with
 * when it was last opened, and that the whole card is clickable without the
 * edit button inside it becoming part of the link.
 *
 * That last one is the reason this is worth testing at all. The title's
 * ::after is stretched across the card to make it one target, and the edit
 * button has to be lifted above that layer — a change to either silently turns
 * "edit this deck" into "open this deck".
 */

const deck = (over = {}) => ({
  id: 'republic',
  title: 'Roman Republic',
  subject: 'Ancient Rome',
  desc: 'Magistracies.',
  progress: 0.5,
  studiedAt: null,
  cards: [
    { id: 'c0', front: 'Consul?', back: 'Senior magistrate.' },
    { id: 'c1', front: 'Praetor?', back: 'Judicial magistrate.' },
  ],
  schedule: {},
  ...over,
})

/** A card scheduled `dueIn` minutes from now. Negative is overdue. */
const entry = (dueIn) => ({
  last: 'good',
  due: Date.now() + dueIn * 60_000,
  interval: 1440,
  ease: 2.5,
  reps: 1,
  lapses: 0,
})

const show = (props = {}) =>
  render(
    <MemoryRouter>
      <DeckCard deck={deck()} {...props} />
    </MemoryRouter>,
  )

afterEach(cleanup)

describe('what it says about a deck', () => {
  it('links to the deck, by its title', () => {
    show()
    const link = screen.getByRole('link', { name: 'Roman Republic' })
    expect(link.getAttribute('href')).toBe('/decks/republic')
  })

  it('names the subject and counts the cards', () => {
    show()
    expect(screen.getByText('Ancient Rome')).toBeTruthy()
    expect(screen.getByText('2 cards')).toBeTruthy()
  })

  it('says "No cards" rather than "0 cards"', () => {
    // A deck someone has just made is empty, not broken, and the phrasing is
    // the difference between those two readings.
    show({ deck: deck({ cards: [], progress: 0 }) })
    expect(screen.getByText('No cards')).toBeTruthy()
  })

  it('rounds the percentage rather than printing a fraction', () => {
    show({ deck: deck({ progress: 0.6363636363636364 }), variant: 'dashboard' })
    expect(screen.getByText('64% known')).toBeTruthy()
  })
})

describe('the badge it has earned', () => {
  const badge = (over) => {
    show({ deck: deck(over) })
    return screen.getByText(/Draft|Mastered|In progress/).textContent
  }

  it('calls an empty deck a draft', () => {
    expect(badge({ cards: [], progress: 0 })).toBe('Draft')
  })

  it('calls a deck with cards and no progress "In progress"', () => {
    expect(badge({ progress: 0 })).toBe('In progress')
  })

  it('withholds "Mastered" just below the line', () => {
    expect(badge({ progress: 0.84 })).toBe('In progress')
  })

  it('awards it at exactly the line', () => {
    expect(badge({ progress: 0.85 })).toBe('Mastered')
  })
})

describe('what is waiting', () => {
  it('leads with the due count when cards are ready', () => {
    // More useful than when it was last opened, which is the point of it.
    show({ deck: deck({ schedule: { c0: entry(-10) } }) })
    expect(screen.getByText('2 due')).toBeTruthy()
  })

  it('counts a card that has never been seen as due', () => {
    // A new card is due by definition, or it would never come up.
    show({ deck: deck({ schedule: {} }) })
    expect(screen.getByText('2 due')).toBeTruthy()
  })

  it('falls back to when it was last studied once nothing is waiting', () => {
    show({ deck: deck({ schedule: { c0: entry(600), c1: entry(600) }, studiedAt: Date.now() }) })

    expect(screen.queryByText(/\d+ due/)).toBe(null)
    expect(screen.getByText(/just now/i)).toBeTruthy()
  })

  it('says a deck has never been studied rather than showing a blank', () => {
    show({ deck: deck({ schedule: { c0: entry(600), c1: entry(600) }, studiedAt: null }) })
    expect(screen.getByText(/never/i)).toBeTruthy()
  })
})

describe('the edit button', () => {
  it('names the deck it edits, since a page is full of them', () => {
    // "Edit" on its own tells a screen reader nothing about which deck.
    show()
    expect(screen.getByRole('button', { name: 'Edit Roman Republic' })).toBeTruthy()
  })

  it('hands the deck back rather than acting on it', async () => {
    const onEdit = vi.fn()
    const user = userEvent.setup()
    show({ onEdit })

    await user.click(screen.getByRole('button', { name: 'Edit Roman Republic' }))

    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(onEdit.mock.calls[0][0].id).toBe('republic')
  })

  it('sits above the title’s stretched hit area, not inside the link', async () => {
    // The whole card is clickable because the title's ::after covers it. If
    // the edit button were part of that layer, editing would open the deck.
    const onEdit = vi.fn()
    const user = userEvent.setup()
    show({ onEdit })

    const button = screen.getByRole('button', { name: 'Edit Roman Republic' })
    expect(button.closest('a')).toBe(null)

    await user.click(button)
    expect(onEdit).toHaveBeenCalled()
  })

  it('does not fail when nobody is listening', async () => {
    // The dashboard renders these without an edit handler.
    const user = userEvent.setup()
    show({ onEdit: undefined })

    await user.click(screen.getByRole('button', { name: 'Edit Roman Republic' }))
    expect(screen.getByRole('link', { name: 'Roman Republic' })).toBeTruthy()
  })
})

describe('the two layouts', () => {
  it('gives the library variant a level-2 heading by default', () => {
    show()
    expect(screen.getByRole('heading', { level: 2, name: 'Roman Republic' })).toBeTruthy()
  })

  it('takes the heading level from its surroundings', () => {
    // The dashboard puts these under a section heading, so they cannot all be
    // h2 without the outline going wrong.
    show({ headingLevel: 3 })
    expect(screen.getByRole('heading', { level: 3, name: 'Roman Republic' })).toBeTruthy()
  })

  it('shows the percentage on the dashboard and the meter in both', () => {
    const { unmount } = show({ variant: 'dashboard' })
    expect(screen.getByText('50% known')).toBeTruthy()
    expect(screen.getByRole('progressbar', { name: 'Roman Republic progress' })).toBeTruthy()
    unmount()

    show()
    expect(screen.queryByText('50% known')).toBe(null)
    expect(screen.getByRole('progressbar', { name: 'Roman Republic progress' })).toBeTruthy()
  })

  it('says the same things in both, however they are arranged', () => {
    const claims = () => {
      const article = screen.getByRole('article')
      return {
        title: within(article).getByRole('link').textContent,
        subject: within(article).getByText('Ancient Rome').textContent,
        cards: within(article).getByText('2 cards').textContent,
      }
    }

    const { unmount } = show()
    const library = claims()
    unmount()

    show({ variant: 'dashboard' })
    expect(claims()).toEqual(library)
  })
})
