// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppProvider, useApp } from './AppContext.jsx'

/**
 * The store: what every mutator leaves behind, and what survives a reload.
 *
 * These go through the provider rather than around it. Progress is re-derived
 * on almost every change and a schedule entry outlives the card it belongs to
 * if nobody removes it — the kind of thing that is invisible until the state
 * is inspected directly.
 */

const KEY = 'gunit.state.v2'

const store = () => renderHook(() => useApp(), { wrapper: AppProvider })

/** The one seeded deck these tests work against. */
const first = (result) => result.current.decks[0]

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('starting up', () => {
  it('seeds a library when there is nothing stored', () => {
    const { result } = store()
    expect(result.current.decks.length).toBeGreaterThan(0)
  })

  it('reads back what it wrote', () => {
    const { result, unmount } = store()
    act(() => result.current.addDeck({ title: 'Magistracies', subject: 'Rome', desc: '' }))
    unmount()

    const second = store()
    expect(second.result.current.decks.some((d) => d.title === 'Magistracies')).toBe(true)
  })

  it('keeps an unreadable payload instead of overwriting it', () => {
    // It is the reader's only copy. Losing it silently is worse than the
    // library resetting, which they can at least see happen.
    localStorage.setItem(KEY, '{ not json at all')
    store()
    expect(localStorage.getItem('gunit.state.unreadable')).toBe('{ not json at all')
  })

  it('starts anyway when storage refuses to answer', () => {
    // Private mode, blocked cookies. Running in memory beats not running.
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    const { result } = store()
    expect(result.current.decks.length).toBeGreaterThan(0)
    getItem.mockRestore()
  })
})

describe('decks', () => {
  it('adds one and hands back what it made', () => {
    const { result } = store()
    let made
    act(() => {
      made = result.current.addDeck({ title: 'Magistracies', subject: 'Rome', desc: 'Offices' })
    })
    // The caller needs the id to navigate to it, so it cannot be void.
    expect(made.id).toBeTruthy()
    expect(result.current.decks.find((d) => d.id === made.id).title).toBe('Magistracies')
  })

  it('edits only the fields it was given', () => {
    const { result } = store()
    const before = first(result)
    act(() => result.current.updateDeck(before.id, { title: 'Renamed' }))

    const after = result.current.decks.find((d) => d.id === before.id)
    expect(after.title).toBe('Renamed')
    expect(after.subject).toBe(before.subject)
    expect(after.cards).toHaveLength(before.cards.length)
  })

  it('removes one', () => {
    const { result } = store()
    const id = first(result).id
    act(() => result.current.removeDeck(id))
    expect(result.current.decks.some((d) => d.id === id)).toBe(false)
  })
})

describe('cards', () => {
  it('gives every added card an id of its own', () => {
    // Scheduling hangs off card ids; two cards sharing one would share a
    // review history.
    const { result } = store()
    const id = first(result).id
    act(() =>
      result.current.addCards(id, [
        { front: 'Consul', back: 'Senior magistrate' },
        { front: 'Praetor', back: 'Judicial magistrate' },
      ]),
    )

    const added = result.current.decks.find((d) => d.id === id).cards.slice(-2)
    expect(added.every((c) => c.id)).toBe(true)
    expect(added[0].id).not.toBe(added[1].id)
  })

  it('appends rather than replacing', () => {
    const { result } = store()
    const deck = first(result)
    act(() => result.current.addCards(deck.id, [{ front: 'Consul', back: 'Senior' }]))
    expect(result.current.decks.find((d) => d.id === deck.id).cards).toHaveLength(
      deck.cards.length + 1,
    )
  })

  it('edits a card in place', () => {
    const { result } = store()
    const deck = first(result)
    act(() => result.current.updateCard(deck.id, 0, { front: 'Rewritten', back: 'Also rewritten' }))

    const card = result.current.decks.find((d) => d.id === deck.id).cards[0]
    expect(card.front).toBe('Rewritten')
    expect(card.id).toBe(deck.cards[0].id)
  })

  it('takes a removed card out of the schedule with it', () => {
    // A schedule entry for a card that no longer exists is a leak, and it
    // would come back to life if that id were ever reused.
    const { result } = store()
    const deck = first(result)
    const goneId = deck.cards[0].id

    act(() => result.current.recordGrades(deck.id, { [goneId]: 'good' }))
    expect(result.current.decks.find((d) => d.id === deck.id).schedule[goneId]).toBeTruthy()

    act(() => result.current.removeCard(deck.id, 0))
    expect(result.current.decks.find((d) => d.id === deck.id).schedule[goneId]).toBeUndefined()
  })
})

describe('importing a deck', () => {
  const arriving = () => ({
    title: 'Late Antiquity',
    subject: 'Rome',
    desc: 'After Diocletian.',
    cards: [
      { front: 'Diocletian?', back: 'Split the empire.', scheduling: null },
      {
        front: 'Constantine?',
        back: 'Founded a city.',
        // `last` is what marks a card as seen; progress is derived from it.
        scheduling: { last: 'good', due: 1, interval: 1440, ease: 2.5 },
      },
    ],
  })

  it('puts it at the top of the library and hands it back', () => {
    const { result } = store()
    let made
    act(() => {
      made = result.current.importDeck(arriving())
    })
    expect(result.current.decks[0].id).toBe(made.id)
    expect(made.title).toBe('Late Antiquity')
  })

  it('issues ids here rather than trusting the file', () => {
    // An id only means something inside the library that issued it.
    const { result } = store()
    act(() => result.current.importDeck(arriving()))
    const added = result.current.decks[0]
    expect(new Set(added.cards.map((c) => c.id)).size).toBe(2)
    expect(added.cards.every((c) => c.id)).toBe(true)
  })

  it('keeps each card scheduling, re-keyed to its new id', () => {
    const { result } = store()
    act(() => result.current.importDeck(arriving()))
    const added = result.current.decks[0]
    expect(added.schedule[added.cards[1].id]).toMatchObject({ interval: 1440 })
    expect(added.schedule[added.cards[0].id]).toBeUndefined()
  })

  it('derives progress rather than taking it on trust', () => {
    // One of the two arrives with a grade behind it, so the deck lands at half
    // rather than at whatever a file claimed.
    const { result } = store()
    act(() => result.current.importDeck(arriving()))
    expect(result.current.decks[0].progress).toBe(0.5)
  })

  it('imports a deck with nothing in it', () => {
    const { result } = store()
    act(() => result.current.importDeck({ ...arriving(), cards: [] }))
    expect(result.current.decks[0].cards).toEqual([])
    expect(result.current.decks[0].progress).toBe(0)
  })
})

describe('studying', () => {
  it('records a grade and moves progress with it', () => {
    const { result } = store()
    const deck = first(result)
    const grades = Object.fromEntries(deck.cards.map((c) => [c.id, 'easy']))

    act(() => result.current.recordGrades(deck.id, grades))

    const after = result.current.decks.find((d) => d.id === deck.id)
    expect(after.progress).toBeGreaterThan(deck.progress)
    expect(after.studiedAt).toBeTruthy()
  })

  it('logs a finished session', () => {
    const { result } = store()
    const before = result.current.sessions.length
    act(() => result.current.recordSession({ deckId: 'republic', reviewed: 6, seconds: 91.4 }))

    const logged = result.current.sessions.at(-1)
    expect(result.current.sessions).toHaveLength(before + 1)
    expect(logged.reviewed).toBe(6)
    expect(logged.seconds).toBe(91)
  })

  it('does not log a session nobody reviewed anything in', () => {
    const { result } = store()
    const before = result.current.sessions.length
    act(() => result.current.recordSession({ deckId: 'republic', reviewed: 0, seconds: 3 }))
    expect(result.current.sessions).toHaveLength(before)
  })
})

describe('the toast', () => {
  it('says something and then stops saying it', () => {
    vi.useFakeTimers()
    const { result } = store()

    act(() => result.current.say('Deck created'))
    expect(result.current.toast).toBe('Deck created')

    act(() => vi.advanceTimersByTime(2500))
    expect(result.current.toast).toBe(null)
    vi.useRealTimers()
  })

  it('restarts the clock when something else is said', () => {
    // Otherwise the second message inherits the first one's remaining time and
    // vanishes almost immediately.
    vi.useFakeTimers()
    const { result } = store()

    act(() => result.current.say('First'))
    act(() => vi.advanceTimersByTime(2000))
    act(() => result.current.say('Second'))
    act(() => vi.advanceTimersByTime(1000))

    expect(result.current.toast).toBe('Second')
    vi.useRealTimers()
  })
})

describe('the theme', () => {
  it('writes itself onto the document, which is where the tokens read it', () => {
    const { result } = store()
    const started = result.current.theme
    expect(document.documentElement.getAttribute('data-theme')).toBe(started)

    act(() => result.current.toggleTheme())
    expect(result.current.theme).not.toBe(started)
    expect(document.documentElement.getAttribute('data-theme')).toBe(result.current.theme)
  })
})
