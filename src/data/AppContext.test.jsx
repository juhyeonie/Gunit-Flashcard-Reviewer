// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppProvider } from './AppContext.jsx'
import { AuthProvider } from './AuthProvider.jsx'
import { useApp } from './useApp.js'

/**
 * The store: what every mutator leaves behind, and what survives a reload.
 *
 * These go through the provider rather than around it. Progress is re-derived
 * on almost every change and a schedule entry outlives the card it belongs to
 * if nobody removes it — the kind of thing that is invisible until the state
 * is inspected directly.
 */

const KEY = 'gunit.state.v2'

/** The store, inside the auth provider the app always puts it in. */
const wrapper = ({ children }) => (
  <AuthProvider>
    <AppProvider>{children}</AppProvider>
  </AuthProvider>
)

const store = () => renderHook(() => useApp(), { wrapper })

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

describe('restoring a backup', () => {
  const backup = () => ({
    decks: [
      { title: 'Late Antiquity', subject: 'Rome', desc: '', cards: [
        { front: 'Diocletian?', back: 'Split the empire.', scheduling: null },
      ] },
      { title: 'Latin Verbs', subject: 'Latin', desc: '', cards: [
        { front: 'amo?', back: 'I love.', scheduling: { last: 'good', due: 1, interval: 1440, ease: 2.5, reps: 1 } },
      ] },
    ],
    sessions: [{ at: 1000, deckId: 'x', reviewed: 4, seconds: 60 }],
  })

  it('adds to the library rather than replacing it', () => {
    // A restore that wiped what was here would be one misclick from losing
    // everything, and merging costs only duplicates a reader can see.
    const { result } = store()
    const before = result.current.decks.length
    act(() => result.current.restoreLibrary(backup()))
    expect(result.current.decks).toHaveLength(before + 2)
  })

  it('reports what it took in', () => {
    const { result } = store()
    let report
    act(() => {
      report = result.current.restoreLibrary(backup())
    })
    expect(report).toEqual({ decks: 2, sessions: 1 })
  })

  it('brings the review history with each card', () => {
    const { result } = store()
    act(() => result.current.restoreLibrary(backup()))
    const latin = result.current.decks.find((d) => d.title === 'Latin Verbs')
    expect(latin.schedule[latin.cards[0].id]).toMatchObject({ reps: 1 })
    expect(latin.progress).toBe(1)
  })

  it('does not double a streak when the same backup lands twice', () => {
    // Sessions are merged on their timestamp, so restoring twice is safe.
    const { result } = store()
    act(() => result.current.restoreLibrary(backup()))
    const after = result.current.sessions.length
    act(() => result.current.restoreLibrary(backup()))
    expect(result.current.sessions).toHaveLength(after)
  })

  it('keeps the log in order', () => {
    const { result } = store()
    act(() => result.current.recordSession({ deckId: 'republic', reviewed: 2, seconds: 30 }))
    act(() => result.current.restoreLibrary(backup()))
    const at = result.current.sessions.map((s) => s.at)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
  })

  it('restores a backup with nothing in it', () => {
    const { result } = store()
    const before = result.current.decks.length
    act(() => result.current.restoreLibrary({ decks: [], sessions: [] }))
    expect(result.current.decks).toHaveLength(before)
  })
})

describe('adopting an account’s library', () => {
  const arriving = {
    decks: [
      {
        id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        title: 'From the account',
        subject: 'Rome',
        desc: '',
        studiedAt: null,
        cards: [{ id: 'ffffffff-1111-4222-8333-444444444444', front: 'Q', back: 'A' }],
        schedule: {},
      },
    ],
    sessions: [{ at: 1000, deckId: null, reviewed: 3, seconds: 60 }],
  }

  it('swaps the library for the one signing in brought', () => {
    const { result } = store()
    act(() => result.current.replaceLibrary(arriving))

    expect(result.current.decks).toHaveLength(1)
    expect(result.current.decks[0].title).toBe('From the account')
    expect(result.current.sessions).toHaveLength(1)
  })

  it('keeps what this browser had rather than dropping it', () => {
    // "You signed in and your decks went" is not a sentence this app should
    // ever cause. The same reasoning as the salvage key for a bad payload.
    const { result } = store()
    const had = result.current.decks.map((d) => d.title)

    act(() => result.current.replaceLibrary(arriving))

    const kept = JSON.parse(localStorage.getItem('gunit.state.presync'))
    expect(kept.decks.map((d) => d.title)).toEqual(had)
  })

  it('takes the account’s settings and theme when they come with it', () => {
    const { result } = store()
    act(() =>
      result.current.replaceLibrary({ ...arriving, settings: { goalMinutes: 45 }, theme: 'dark' }),
    )
    expect(result.current.settings.goalMinutes).toBe(45)
    expect(result.current.theme).toBe('dark')
  })

  it('leaves settings alone when they do not', () => {
    const { result } = store()
    const before = result.current.settings.goalMinutes
    act(() => result.current.replaceLibrary(arriving))
    expect(result.current.settings.goalMinutes).toBe(before)
  })

  it('adopts an empty library without complaint', () => {
    const { result } = store()
    act(() => result.current.replaceLibrary({ decks: [], sessions: [] }))
    expect(result.current.decks).toEqual([])
  })
})

describe('handing the account’s library back', () => {
  const account = {
    decks: [
      {
        id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        title: 'From the account',
        subject: 'Rome',
        desc: '',
        studiedAt: null,
        cards: [{ id: 'ffffffff-1111-4222-8333-444444444444', front: 'Q', back: 'A' }],
        schedule: {},
      },
    ],
    sessions: [{ at: 1000, deckId: null, reviewed: 3, seconds: 60 }],
  }

  it('gives back what this browser had before it signed in', () => {
    // Signing out on a shared laptop must not leave someone else's revision
    // sitting there for the next person.
    const { result } = store()
    const mine = result.current.decks.map((d) => d.title)

    act(() => result.current.replaceLibrary(account))
    expect(result.current.decks[0].title).toBe('From the account')

    act(() => result.current.releaseSyncedLibrary())
    expect(result.current.decks.map((d) => d.title)).toEqual(mine)
  })

  it('keeps the account’s library rather than dropping it on the way out', () => {
    // It is in Postgres too, but the two simply swap places here — neither
    // copy is destroyed by the other arriving or leaving.
    const { result } = store()
    act(() => result.current.replaceLibrary(account))
    act(() => result.current.releaseSyncedLibrary())

    const kept = JSON.parse(localStorage.getItem('gunit.state.presync'))
    expect(kept.decks[0].title).toBe('From the account')
  })

  it('leaves an empty library rather than someone else’s when there is nothing to give back', () => {
    const { result } = store()
    act(() => result.current.replaceLibrary(account))
    localStorage.removeItem('gunit.state.presync')

    act(() => result.current.releaseSyncedLibrary())
    expect(result.current.decks).toEqual([])
  })

  it('survives an unreadable stash the same way', () => {
    const { result } = store()
    act(() => result.current.replaceLibrary(account))
    localStorage.setItem('gunit.state.presync', '{ not json')

    act(() => result.current.releaseSyncedLibrary())
    expect(result.current.decks).toEqual([])
  })

  it('brings back the settings that came with it', () => {
    const { result } = store()
    act(() => result.current.updateSettings({ goalMinutes: 35 }))
    act(() => result.current.replaceLibrary({ ...account, settings: { goalMinutes: 5 } }))
    expect(result.current.settings.goalMinutes).toBe(5)

    act(() => result.current.releaseSyncedLibrary())
    expect(result.current.settings.goalMinutes).toBe(35)
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

describe('taking a grade back', () => {
  it('puts a card’s scheduling back the way it was', () => {
    const { result } = store()
    const deck = first(result)
    const cardId = deck.cards[0].id

    act(() => result.current.recordGrades(deck.id, { [cardId]: 'good' }))
    const wasGood = result.current.decks.find((d) => d.id === deck.id).schedule[cardId]

    act(() => result.current.recordGrades(deck.id, { [cardId]: 'easy' }))
    expect(result.current.decks.find((d) => d.id === deck.id).schedule[cardId]).not.toEqual(wasGood)

    act(() => result.current.restoreSchedule(deck.id, cardId, wasGood))
    expect(result.current.decks.find((d) => d.id === deck.id).schedule[cardId]).toEqual(wasGood)
  })

  it('takes the entry out entirely for a card that had never been graded', () => {
    // A card never seen is not the same as one seen and forgotten: leaving a
    // hollow entry behind would make it count as reviewed.
    const { result } = store()
    const deck = first(result)
    const cardId = deck.cards[0].id

    act(() => result.current.restoreSchedule(deck.id, cardId, null))
    const after = result.current.decks.find((d) => d.id === deck.id)
    expect(cardId in after.schedule).toBe(false)
  })

  it('re-derives progress rather than leaving it where the grade put it', () => {
    const { result } = store()
    const deck = first(result)
    const cardId = deck.cards[0].id
    const before = deck.progress

    act(() => result.current.recordGrades(deck.id, { [cardId]: 'good' }))
    act(() => result.current.restoreSchedule(deck.id, cardId, null))

    expect(result.current.decks.find((d) => d.id === deck.id).progress).toBeLessThanOrEqual(before)
  })

  it('leaves every other card alone', () => {
    const { result } = store()
    const deck = first(result)
    const [one, two] = deck.cards

    act(() => result.current.recordGrades(deck.id, { [one.id]: 'good', [two.id]: 'good' }))
    const kept = result.current.decks.find((d) => d.id === deck.id).schedule[two.id]

    act(() => result.current.restoreSchedule(deck.id, one.id, null))
    expect(result.current.decks.find((d) => d.id === deck.id).schedule[two.id]).toEqual(kept)
  })

  it('leaves other decks alone', () => {
    const { result } = store()
    const [deck, other] = result.current.decks
    const snapshot = JSON.stringify(other)

    act(() => result.current.restoreSchedule(deck.id, deck.cards[0].id, null))
    expect(JSON.stringify(result.current.decks.find((d) => d.id === other.id))).toBe(snapshot)
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

describe('resetting a deck', () => {
  /** Grades every card in the seeded deck, so there is progress to lose. */
  const studied = (result) => {
    const deck = first(result)
    const grades = Object.fromEntries(deck.cards.map((c) => [c.id, 'good']))
    act(() => result.current.recordGrades(deck.id, grades))
    return result.current.decks.find((d) => d.id === deck.id)
  }

  it('puts every card back to new and progress back to zero', () => {
    const { result } = store()
    const deck = studied(result)
    expect(deck.progress).toBe(1)

    act(() => result.current.resetDeck(deck.id))

    const after = result.current.decks.find((d) => d.id === deck.id)
    expect(after.schedule).toEqual({})
    expect(after.progress).toBe(0)
  })

  it('keeps the cards themselves', () => {
    // The only way to clear a schedule before this was deleting the deck.
    const { result } = store()
    const deck = studied(result)
    act(() => result.current.resetDeck(deck.id))

    const after = result.current.decks.find((d) => d.id === deck.id)
    expect(after.cards).toEqual(deck.cards)
  })

  it('does not rewrite the session log the streak is built from', () => {
    // Resetting a deck says nothing about which days the reader sat down and
    // worked, and the streak is a record of that rather than of progress.
    const { result } = store()
    act(() => result.current.recordSession({ deckId: 'republic', reviewed: 6, seconds: 90 }))
    const before = result.current.sessions.length

    act(() => result.current.resetDeck(first(result).id))
    expect(result.current.sessions).toHaveLength(before)
  })

  it('leaves suspended cards suspended', () => {
    // Suspension is a decision about which cards to study, not a record of
    // having studied them, so a reset is not an answer to it.
    const { result } = store()
    const deck = studied(result)
    const [held] = deck.cards

    act(() => result.current.setCardSuspended(deck.id, held.id, true))
    act(() => result.current.resetDeck(deck.id))

    const after = result.current.decks.find((d) => d.id === deck.id)
    expect(after.schedule[held.id]).toMatchObject({ suspended: true, last: null, reps: 0 })
    expect(Object.keys(after.schedule)).toEqual([held.id])
  })

  it('touches no other deck', () => {
    const { result } = store()
    const [target, other] = result.current.decks
    const before = other.schedule

    act(() => result.current.resetDeck(target.id))
    expect(result.current.decks.find((d) => d.id === other.id).schedule).toEqual(before)
  })

  it('survives a reload', () => {
    const { result, unmount } = store()
    const deck = studied(result)
    act(() => result.current.resetDeck(deck.id))
    unmount()

    const second = store()
    expect(second.result.current.decks.find((d) => d.id === deck.id).schedule).toEqual({})
  })
})

describe('suspending a card', () => {
  it('records the flag against the card', () => {
    const { result } = store()
    const deck = first(result)
    const [card] = deck.cards

    act(() => result.current.setCardSuspended(deck.id, card.id, true))

    const after = result.current.decks.find((d) => d.id === deck.id)
    expect(after.schedule[card.id].suspended).toBe(true)
  })

  it('keeps the schedule underneath, so unsuspending resumes it', () => {
    // The alternative to suspending is deleting, which loses the history. If
    // unsuspending started the card over, this would only be slower deleting.
    const { result } = store()
    const deck = first(result)
    const [card] = deck.cards
    act(() => result.current.recordGrades(deck.id, { [card.id]: 'easy' }))

    const graded = result.current.decks.find((d) => d.id === deck.id).schedule[card.id]

    act(() => result.current.setCardSuspended(deck.id, card.id, true))
    act(() => result.current.setCardSuspended(deck.id, card.id, false))

    expect(result.current.decks.find((d) => d.id === deck.id).schedule[card.id]).toEqual(graded)
  })

  it('leaves no entry behind for a card that was never graded', () => {
    // An empty entry in the map is indistinguishable from a record of study,
    // and would make a new card look seen.
    const { result } = store()
    const deck = first(result)
    const fresh = deck.cards.find((c) => !deck.schedule[c.id])

    act(() => result.current.setCardSuspended(deck.id, fresh.id, true))
    act(() => result.current.setCardSuspended(deck.id, fresh.id, false))

    expect(fresh.id in result.current.decks.find((d) => d.id === deck.id).schedule).toBe(false)
  })

  it('moves progress, because the card stops being counted', () => {
    const { result } = store()
    const deck = first(result)
    const grades = Object.fromEntries(deck.cards.map((c, i) => [c.id, i === 0 ? 'again' : 'good']))
    act(() => result.current.recordGrades(deck.id, grades))

    const before = result.current.decks.find((d) => d.id === deck.id).progress
    act(() => result.current.setCardSuspended(deck.id, deck.cards[0].id, true))
    const after = result.current.decks.find((d) => d.id === deck.id).progress

    expect(before).toBeLessThan(1)
    expect(after).toBe(1)
  })

  it('survives a reload', () => {
    const { result, unmount } = store()
    const deck = first(result)
    const [card] = deck.cards
    act(() => result.current.setCardSuspended(deck.id, card.id, true))
    unmount()

    const second = store()
    const after = second.result.current.decks.find((d) => d.id === deck.id)
    expect(after.schedule[card.id].suspended).toBe(true)
  })
})

describe('the pre-sign-in stash', () => {
  const PRESYNC = 'gunit.state.presync'
  const account = { decks: [{ id: 'acc', title: 'From the account', subject: 'S', desc: '', cards: [], schedule: {} }], sessions: [] }
  const other = { decks: [{ id: 'oth', title: 'A later pull', subject: 'S', desc: '', cards: [], schedule: {} }], sessions: [] }

  it('keeps what the browser was holding', () => {
    const { result } = store()
    const mine = result.current.decks.map((d) => d.title)

    act(() => result.current.replaceLibrary(account))

    expect(JSON.parse(localStorage.getItem(PRESYNC)).decks.map((d) => d.title)).toEqual(mine)
  })

  it('does not let a second replacement overwrite it', () => {
    // The stash is one slot. Overwritten while signed in it holds the
    // account's library rather than the browser's, and signing out then hands
    // the account's decks back to the machine instead of taking them off it.
    // A second call is not hypothetical: StrictMode runs every effect twice.
    const { result } = store()
    const mine = result.current.decks.map((d) => d.title)

    act(() => result.current.replaceLibrary(account, { stash: true }))
    act(() => result.current.replaceLibrary(other, { stash: false }))

    expect(JSON.parse(localStorage.getItem(PRESYNC)).decks.map((d) => d.title)).toEqual(mine)
    expect(result.current.decks.map((d) => d.title)).toEqual(['A later pull'])
  })

  it('hands the browser back its own library, not the account it just left', () => {
    const { result } = store()
    const mine = result.current.decks.map((d) => d.title)

    act(() => result.current.replaceLibrary(account, { stash: true }))
    act(() => result.current.replaceLibrary(other, { stash: false }))
    act(() => result.current.releaseSyncedLibrary())

    expect(result.current.decks.map((d) => d.title)).toEqual(mine)
  })

  it('still stashes by default, for callers that do not say', () => {
    const { result } = store()
    const mine = result.current.decks.map((d) => d.title)
    act(() => result.current.replaceLibrary(account))
    expect(JSON.parse(localStorage.getItem(PRESYNC)).decks.map((d) => d.title)).toEqual(mine)
  })
})
