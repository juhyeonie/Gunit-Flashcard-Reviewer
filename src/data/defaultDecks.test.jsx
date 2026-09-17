// @vitest-environment jsdom
import { act, cleanup, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AppProvider } from './AppContext.jsx'
import { AuthContext } from './authContext.js'
import { useApp } from './useApp.js'
import { DECKS, EXAMPLE_DECK, RETIRED_DEFAULT_DECKS } from './seed.js'
import {
  DEFAULT_STATE,
  isRetiredDefault,
  isUntouchedExample,
  normalizeState,
  retireDefaultDecks,
} from './normalize.js'
import { grade } from './scheduler.js'
import { canQuiz } from './quiz.js'
import { GUEST_KEY, userKey } from './storageKeys.js'
import { renderRoute } from '../../test/render-app.jsx'
import Review from '../pages/Review.jsx'

/**
 * What a signed-out visitor starts with: one example deck, not six.
 *
 * Two halves. A browser with nothing stored is given the example. A browser
 * that ran an earlier version already has the six stored — and stored decks
 * are what the app reads — so those are retired on the way in, but only where
 * nobody has made them their own. Accounts are never touched by either.
 */

const T0 = Date.UTC(2026, 0, 5, 9)

/** A guest library exactly as an earlier version of Gunit stored it. */
const oldBrowser = (now = T0) => normalizeState({ decks: RETIRED_DEFAULT_DECKS, sessions: [] }, now)

const OLD_IDS = RETIRED_DEFAULT_DECKS.map((d) => d.id)

const wrapper = (user = null) => {
  function Identity({ children }) {
    return (
      <AuthContext.Provider value={{ user, available: Boolean(user), status: 'ready' }}>
        <AppProvider>{children}</AppProvider>
      </AuthContext.Provider>
    )
  }
  return Identity
}

const store = (user) => renderHook(() => useApp(), { wrapper: wrapper(user) })

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('the default library', () => {
  it('is one deck, and it is the example', () => {
    expect(DECKS).toEqual([EXAMPLE_DECK])
    expect(DEFAULT_STATE.decks).toEqual([EXAMPLE_DECK])
  })

  it('starts genuinely new, with nothing invented', () => {
    // The old defaults claimed "studied 2 hours ago" and 62% known on a
    // visitor's first second. The example claims nothing.
    const [deck] = normalizeState(DEFAULT_STATE, T0).decks
    expect(deck.schedule).toEqual({})
    expect(deck.progress).toBe(0)
    expect(deck.studiedAt).toBe(null)
  })

  it('has enough cards to show both reviewing and a quiz', () => {
    expect(canQuiz(EXAMPLE_DECK)).toBe(true)
  })

  it('gives every card a stable id of its own', () => {
    const ids = EXAMPLE_DECK.cards.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    // Stable, so a schedule written against them means the same card after a
    // reload rather than a freshly minted one.
    const again = normalizeState(DEFAULT_STATE, T0).decks[0].cards.map((c) => c.id)
    expect(again).toEqual(ids)
  })

  it('describes the app as it is', () => {
    // A tutorial that is wrong about the thing it teaches is worse than none.
    // Three grades, not four; and "again" is the ten-minute step.
    const text = EXAMPLE_DECK.cards.map((c) => `${c.front} ${c.back}`).join(' ')
    expect(text).toMatch(/three grades/i)
    expect(text).not.toMatch(/\bHard\b/)
    expect(text).toMatch(/ten minutes/)
  })
})

describe('a signed-out visitor', () => {
  it('sees exactly one deck on a first visit', () => {
    const { result } = store()
    expect(result.current.decks.map((d) => d.id)).toEqual([EXAMPLE_DECK.id])
  })

  it('sees none of the old defaults on a first visit', () => {
    const { result } = store()
    for (const id of OLD_IDS) expect(result.current.decks.some((d) => d.id === id)).toBe(false)
  })

  it('keeps the example once it is written, rather than making it again', () => {
    const { unmount } = store()
    unmount()
    const stored = JSON.parse(localStorage.getItem(GUEST_KEY))
    expect(stored.decks.map((d) => d.id)).toEqual([EXAMPLE_DECK.id])

    const { result } = store()
    expect(result.current.decks).toHaveLength(1)
  })

  it('does not get the example back after deleting it', () => {
    const first = store()
    act(() => first.result.current.removeDeck(EXAMPLE_DECK.id))
    first.unmount()

    const { result } = store()
    expect(result.current.decks).toEqual([])
  })

  it('can review the example deck without an account', async () => {
    renderRoute('/decks/example/review', '/decks/:id/review', <Review />)

    expect(screen.getByText(EXAMPLE_DECK.cards[0].front)).toBeTruthy()
    expect(screen.getByText(`1 / ${EXAMPLE_DECK.cards.length}`)).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: 'Reveal answer' }))
    await userEvent.click(screen.getByRole('button', { name: /^Good/ }))

    // The grade is saved against the example's own card id.
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(GUEST_KEY))
      const example = stored.decks.find((d) => d.id === EXAMPLE_DECK.id)
      expect(example.schedule[EXAMPLE_DECK.cards[0].id]?.last).toBe('good')
    })
    expect(await screen.findByText(EXAMPLE_DECK.cards[1].front)).toBeTruthy()
  })
})

describe('a browser that ran an earlier version', () => {
  const load = (library) => {
    localStorage.setItem(GUEST_KEY, JSON.stringify(library))
    return store()
  }

  it('has the untouched old defaults replaced by the example', () => {
    const { result } = load(oldBrowser())
    expect(result.current.decks.map((d) => d.id)).toEqual([EXAMPLE_DECK.id])
  })

  it('writes that back, so it happens once', () => {
    const { unmount } = load(oldBrowser())
    unmount()
    const stored = JSON.parse(localStorage.getItem(GUEST_KEY))
    expect(stored.decks.map((d) => d.id)).toEqual([EXAMPLE_DECK.id])
  })

  it('keeps the reader’s own decks, and puts the example in front of them', () => {
    const library = oldBrowser()
    library.decks.push({ id: 'mine', title: 'Organic chemistry', subject: 'Chemistry', desc: '', cards: [], schedule: {} })
    const { result } = load(library)
    expect(result.current.decks.map((d) => d.id)).toEqual([EXAMPLE_DECK.id, 'mine'])
  })

  it('keeps an old default the reader has studied', () => {
    const library = oldBrowser()
    const republic = library.decks.find((d) => d.id === 'republic')
    const unseen = republic.cards.at(-1).id
    republic.schedule[unseen] = grade(undefined, 'good', T0 + 60_000)

    const { result } = load(library)
    expect(result.current.decks.map((d) => d.id)).toEqual([EXAMPLE_DECK.id, 'republic'])
  })
})

describe('telling an untouched default from somebody’s work', () => {
  const pristine = (id) => oldBrowser().decks.find((d) => d.id === id)
  const kept = (deck, sessions = []) => !isRetiredDefault(deck, sessions)

  it('recognises every old default as it was stored', () => {
    for (const id of OLD_IDS) expect(isRetiredDefault(pristine(id))).toBe(true)
  })

  it('recognises one stored at any time, not only today', () => {
    // The made-up grades were stamped with whatever moment the browser first
    // loaded, so the dates themselves cannot be part of the fingerprint.
    const later = normalizeState({ decks: RETIRED_DEFAULT_DECKS }, T0 + 90 * 86_400_000).decks
    for (const deck of later) expect(isRetiredDefault(deck)).toBe(true)
  })

  it('keeps a deck with a newly studied card', () => {
    const deck = pristine('punic')
    const next = deck.cards.at(-1).id
    deck.schedule[next] = grade(undefined, 'good', T0)
    expect(kept(deck)).toBe(true)
  })

  it('keeps a deck whose known card was reviewed again', () => {
    const deck = pristine('republic')
    const [id] = Object.keys(deck.schedule)
    deck.schedule[id] = grade(deck.schedule[id], 'good', T0 + 86_400_000)
    expect(deck.schedule[id].reps).toBe(2)
    expect(kept(deck)).toBe(true)
  })

  it('keeps a deck where a card was forgotten and relearned', () => {
    // "Again" then "Good" lands back on one rep, but the lapse stays.
    const deck = pristine('republic')
    const [id] = Object.keys(deck.schedule)
    deck.schedule[id] = grade(grade(deck.schedule[id], 'again', T0), 'good', T0 + 600_000)
    expect(deck.schedule[id].reps).toBe(1)
    expect(kept(deck)).toBe(true)
  })

  it('keeps a deck with a card graded easy', () => {
    const deck = pristine('republic')
    const [id] = Object.keys(deck.schedule)
    deck.schedule[id] = { ...deck.schedule[id], last: 'easy' }
    expect(kept(deck)).toBe(true)
  })

  it('keeps a deck with a suspended card', () => {
    const deck = pristine('latin')
    const [id] = Object.keys(deck.schedule)
    deck.schedule[id] = { ...deck.schedule[id], suspended: true }
    expect(kept(deck)).toBe(true)
  })

  it('keeps a deck whose progress was reset', () => {
    // Resetting is something a reader chose to do to it.
    const deck = { ...pristine('emperors'), schedule: {} }
    expect(kept(deck)).toBe(true)
  })

  it('keeps a renamed, re-described or re-filed deck', () => {
    expect(kept({ ...pristine('city'), title: 'Rome for my exam' })).toBe(true)
    expect(kept({ ...pristine('city'), desc: 'My notes' })).toBe(true)
    expect(kept({ ...pristine('city'), subject: 'History' })).toBe(true)
  })

  it('keeps a deck with a card added, edited or removed', () => {
    const deck = pristine('latin')
    expect(kept({ ...deck, cards: [...deck.cards, { id: 'x', front: 'dolus', back: 'Fraud.' }] })).toBe(true)
    expect(kept({ ...deck, cards: [{ ...deck.cards[0], back: 'Mine now.' }, ...deck.cards.slice(1)] })).toBe(true)
    expect(kept({ ...deck, cards: deck.cards.slice(1) })).toBe(true)
  })

  it('keeps the empty old deck once it has cards', () => {
    const deck = pristine('late')
    expect(isRetiredDefault(deck)).toBe(true)
    expect(kept({ ...deck, cards: [{ id: 'x', front: 'Who was Stilicho?', back: 'A general.' }] })).toBe(true)
  })

  it('keeps a deck with a study session on record', () => {
    expect(kept(pristine('punic'), [{ at: T0, deckId: 'punic', reviewed: 3, seconds: 40 }])).toBe(true)
  })

  it('never matches a deck that only borrows a title', () => {
    const original = RETIRED_DEFAULT_DECKS[0]
    expect(
      isRetiredDefault({ ...pristine(original.id), id: 'd0f9a2b4-0000-4000-8000-000000000000' }),
    ).toBe(false)
  })
})

describe('retiring them', () => {
  it('changes nothing when there is nothing to retire', () => {
    const state = { decks: [{ id: 'mine', title: 'Mine', cards: [], schedule: {} }], sessions: [] }
    expect(retireDefaultDecks(state, T0)).toBe(state)
  })

  it('does not add a second example', () => {
    const library = oldBrowser()
    const example = normalizeState({ decks: [EXAMPLE_DECK] }, T0).decks[0]
    const next = retireDefaultDecks({ ...library, decks: [example, ...library.decks] }, T0)
    expect(next.decks.filter((d) => d.id === EXAMPLE_DECK.id)).toHaveLength(1)
    expect(next.decks).toHaveLength(1)
  })

  it('leaves sessions alone', () => {
    const library = { ...oldBrowser(), sessions: [{ at: T0, deckId: 'mine', reviewed: 2, seconds: 30 }] }
    expect(retireDefaultDecks(library, T0).sessions).toBe(library.sessions)
  })
})

describe('an account', () => {
  const USER = { id: '686963f7-42a5-4f94-9225-52a8a0a4859a' }

  it('is never given the example', () => {
    const { result } = store(USER)
    expect(result.current.decks).toEqual([])
  })

  it('is never put through the retirement, whatever it holds', () => {
    // Account decks carry database ids and could not match anyway, but this
    // does not rely on that: an account is the reader's, whatever it holds.
    localStorage.setItem(userKey(USER.id), JSON.stringify(oldBrowser()))
    const { result } = store(USER)
    expect(result.current.decks.map((d) => d.id)).toEqual(OLD_IDS)
  })

  it('leaves the guest library where it was while signed in', () => {
    localStorage.setItem(GUEST_KEY, JSON.stringify(oldBrowser()))
    const { unmount } = store(USER)
    unmount()
    // Retirement happens when the guest library is read, and a signed-in
    // browser never reads it.
    const guest = JSON.parse(localStorage.getItem(GUEST_KEY))
    expect(guest.decks.map((d) => d.id)).toEqual(OLD_IDS)
  })
})

describe('the example deck and the sign-up offer', () => {
  it('is recognised while untouched, studied or not', () => {
    const example = normalizeState({ decks: [EXAMPLE_DECK] }, T0).decks[0]
    expect(isUntouchedExample(example)).toBe(true)
    const studied = { ...example, schedule: { [example.cards[0].id]: grade(undefined, 'good', T0) } }
    expect(isUntouchedExample(studied)).toBe(true)
  })

  it('stops being the tutorial once edited', () => {
    expect(isUntouchedExample({ ...EXAMPLE_DECK, title: 'My deck' })).toBe(false)
    expect(isUntouchedExample({ ...EXAMPLE_DECK, cards: EXAMPLE_DECK.cards.slice(1) })).toBe(false)
  })
})
