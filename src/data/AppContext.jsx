import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { uid } from './seed.js'
import { grade, newEntry } from './scheduler.js'
import { MAX_SESSIONS, appendSession } from './activity.js'
import { DEFAULT_STATE, normalizeState, parseStoredState, progressOf } from './normalize.js'
import { AppContext } from './appContext.js'
import { AuthContext } from './authContext.js'
import { GUEST_KEY, SALVAGE_KEY, keyFor, migrateLegacyStorage } from './storageKeys.js'

/**
 * Reads the library at one key.
 *
 * An empty guest library seeds itself, because a first visit should have
 * something to study. An empty *account* library does not — it means the
 * account is new, or that this browser has not pulled it yet, and inventing
 * six decks of Roman history in someone's account would be worse than a blank
 * page.
 */
const load = (key) => {
  let raw = null
  try {
    raw = localStorage.getItem(key)
  } catch {
    // Storage unavailable (private mode, blocked cookies): run in memory.
    return normalizeState(DEFAULT_STATE)
  }

  if (!raw) {
    return key === GUEST_KEY
      ? normalizeState(DEFAULT_STATE)
      : normalizeState({ decks: [], sessions: [] })
  }

  const { state, ok } = parseStoredState(raw)
  if (!ok) {
    try {
      localStorage.setItem(`${SALVAGE_KEY}.${key}`, raw)
    } catch {
      // Nothing more to do; the app still starts.
    }
  }
  return state
}

export function AppProvider({ children }) {
  /*
   * Which library this browser is reading, and the only thing signing in or
   * out changes.
   *
   * There is no swap and no stash any more. The guest library and each
   * account's library have their own keys and simply sit there; changing
   * identity changes which one is read. Nothing is copied on the way in and
   * nothing is destroyed on the way out, so there is no moment at which a
   * library can fall between the two.
   */
  /*
   * Read straight from the context rather than through `useAuth`, which throws
   * when there is no provider above it.
   *
   * The store must not require the auth layer to be mounted. Signing in is an
   * optional extra in this app — a clone with no project never mounts a
   * session at all — and a store that refused to render without one would make
   * the local-only path depend on the thing it is supposed to be independent
   * of. No provider simply means nobody is signed in, which is the truth.
   */
  const auth = useContext(AuthContext)
  const storageKey = keyFor(auth?.user?.id ?? null)

  // Once, before anything reads a key: move a browser off the single-key
  // arrangement. Runs during the first render so the first read sees the
  // result, and does nothing at all on a browser that has already been moved.
  const migrated = useRef(false)
  if (!migrated.current) {
    migrated.current = true
    migrateLegacyStorage()
  }

  const [state, setState] = useState(() => load(storageKey))
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)

  /*
   * Following the key.
   *
   * Signing in or out swaps `storageKey`, and the library at the new key is
   * what the app should now be showing. Written as a render-phase comparison
   * rather than an effect so that no frame is ever painted with the previous
   * identity's decks — a signed-out reader must never see a flash of the
   * account's library, or the other way round.
   */
  const readingKey = useRef(storageKey)
  if (readingKey.current !== storageKey) {
    readingKey.current = storageKey
    setState(load(storageKey))
  }

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state))
    } catch {
      // Persistence is best-effort; the app still works in memory.
    }
  }, [state, storageKey])

  // The prototype themes off a data-theme attribute, and so do our tokens.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', state.theme)
  }, [state.theme])

  useEffect(() => () => clearTimeout(toastTimer.current), [])

  const say = useCallback((message) => {
    clearTimeout(toastTimer.current)
    setToast(message)
    toastTimer.current = setTimeout(() => setToast(null), 2400)
  }, [])

  const toggleTheme = useCallback(() => {
    setState((s) => ({ ...s, theme: s.theme === 'dark' ? 'light' : 'dark' }))
  }, [])

  const updateSettings = useCallback((patch) => {
    setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }))
  }, [])

  const addDeck = useCallback(({ title, subject, desc }) => {
    const deck = {
      id: uid(),
      title: title.trim(),
      subject: subject.trim() || 'General',
      desc: desc.trim(),
      studiedAt: null,
      progress: 0,
      cards: [],
      schedule: {},
    }
    setState((s) => ({ ...s, decks: [deck, ...s.decks] }))
    return deck
  }, [])

  /**
   * Takes a deck read out of a file and gives it a place in this library.
   *
   * Ids are issued here rather than carried in, because they only mean
   * anything inside the library that issued them. Each card's scheduling comes
   * across with the card, so a restored deck is due when it was due.
   */
  const importDeck = useCallback(({ title, subject, desc, cards }) => {
    const schedule = {}
    const withIds = cards.map((c) => {
      const id = uid()
      if (c.scheduling) schedule[id] = c.scheduling
      return { id, front: c.front, back: c.back }
    })

    const deck = {
      id: uid(),
      title,
      subject,
      desc,
      studiedAt: null,
      cards: withIds,
      schedule,
    }
    const placed = { ...deck, progress: progressOf(deck) }

    setState((s) => ({ ...s, decks: [placed, ...s.decks] }))
    return placed
  }, [])

  /**
   * Restores a backup by adding to the library rather than replacing it.
   *
   * A restore that wiped what was already here would be one misclick from
   * losing everything, and merging costs only duplicates — which a reader can
   * see and delete. Sessions are merged on their timestamp, so restoring the
   * same backup twice does not double a streak.
   */
  const restoreLibrary = useCallback(({ decks, sessions = [] }) => {
    const placed = decks.map((incoming) => {
      const schedule = {}
      const cards = incoming.cards.map((c) => {
        const id = uid()
        if (c.scheduling) schedule[id] = c.scheduling
        return { id, front: c.front, back: c.back }
      })
      const deck = {
        id: uid(),
        title: incoming.title,
        subject: incoming.subject,
        desc: incoming.desc,
        studiedAt: null,
        cards,
        schedule,
      }
      return { ...deck, progress: progressOf(deck) }
    })

    let added = 0
    setState((s) => {
      const seen = new Set(s.sessions.map((x) => `${x.at}`))
      const fresh = sessions.filter((x) => !seen.has(`${x.at}`))
      added = fresh.length
      return {
        ...s,
        decks: [...placed, ...s.decks],
        sessions: [...s.sessions, ...fresh].sort((a, b) => a.at - b.at).slice(-MAX_SESSIONS),
      }
    })

    return { decks: placed.length, sessions: added }
  }, [])

  /**
   * Installs the library an account just handed over.
   *
   * All this does now is put it in state, from where the persist effect writes
   * it to that account's own key. There is nothing to stash and nothing to
   * swap: the guest library is sitting untouched under its own key, and
   * signing out reads it again.
   *
   * Progress is derived here rather than taken from the caller. It is never
   * stored in the database — it is a function of the schedule, and a second
   * copy could only disagree — so decks arriving from an account carry none.
   * Installed raw, every page rendering `Math.round(deck.progress * 100)`
   * showed NaN%.
   */
  const installLibrary = useCallback(({ decks, sessions, settings, theme }) => {
    setState((s) => ({
      ...s,
      decks: decks.map((deck) => ({ ...deck, progress: progressOf(deck) })),
      sessions: sessions ?? s.sessions,
      settings: settings ? { ...s.settings, ...settings } : s.settings,
      theme: theme ?? s.theme,
    }))
  }, [])

  const updateDeck = useCallback((id, patch) => {
    setState((s) => ({
      ...s,
      decks: s.decks.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    }))
  }, [])

  const removeDeck = useCallback((id) => {
    setState((s) => ({ ...s, decks: s.decks.filter((d) => d.id !== id) }))
  }, [])

  const addCards = useCallback((deckId, cards) => {
    const withIds = cards.map((c) => ({ ...c, id: uid() }))
    setState((s) => ({
      ...s,
      decks: s.decks.map((d) =>
        d.id === deckId ? { ...d, cards: [...d.cards, ...withIds], progress: progressOf({ ...d, cards: [...d.cards, ...withIds] }) } : d,
      ),
    }))
  }, [])

  const updateCard = useCallback((deckId, index, card) => {
    setState((s) => ({
      ...s,
      decks: s.decks.map((d) =>
        d.id === deckId
          ? { ...d, cards: d.cards.map((c, i) => (i === index ? { ...card, id: c.id } : c)) }
          : d,
      ),
    }))
  }, [])

  const removeCard = useCallback((deckId, index) => {
    setState((s) => ({
      ...s,
      decks: s.decks.map((d) => {
        if (d.id !== deckId) return d
        const gone = d.cards[index]
        const { [gone?.id]: _dropped, ...schedule } = d.schedule ?? {}
        const next = { ...d, cards: d.cards.filter((_, i) => i !== index), schedule }
        return { ...next, progress: progressOf(next) }
      }),
    }))
  }, [])

  /**
   * Applies a session's grades through the scheduler and re-derives progress.
   * `grades` maps card id to 'again' | 'good' | 'easy'; each is folded into the
   * card's existing schedule entry so intervals grow across sessions.
   */
  const recordGrades = useCallback((deckId, grades) => {
    const now = Date.now()
    setState((s) => ({
      ...s,
      decks: s.decks.map((d) => {
        if (d.id !== deckId) return d
        const schedule = { ...d.schedule }
        Object.entries(grades).forEach(([cardId, g]) => {
          schedule[cardId] = grade(schedule[cardId], g, now)
        })
        const next = { ...d, studiedAt: Date.now(), schedule }
        return { ...next, progress: progressOf(next) }
      }),
    }))
  }, [])

  /**
   * Puts one card's scheduling back the way it was.
   *
   * Grading is otherwise one-way: `grade` folds the new rating into whatever
   * was there and the previous state is gone. Rate a card "easy" by mistake
   * and it disappears for ten days, with nothing to do about it but delete the
   * card and lose its whole history.
   *
   * `entry` of null means the card had never been graded, so its scheduling is
   * taken out of the map rather than set to something empty — a card that has
   * never been seen is not the same as one seen and forgotten.
   */
  const restoreSchedule = useCallback((deckId, cardId, entry) => {
    setState((s) => ({
      ...s,
      decks: s.decks.map((d) => {
        if (d.id !== deckId) return d
        const { [cardId]: _replaced, ...rest } = d.schedule ?? {}
        const schedule = entry ? { ...rest, [cardId]: entry } : rest
        const next = { ...d, schedule }
        return { ...next, progress: progressOf(next) }
      }),
    }))
  }, [])

  /**
   * Puts a deck back to unstudied: every card new again, progress at zero.
   *
   * There is otherwise no way out of a schedule. A deck imported with someone
   * else's ratings, or one crammed the night before an exam and now wanted
   * from scratch, can only be reset by deleting it and losing the cards too.
   *
   * Two things deliberately survive. Suspension is a decision about which
   * cards to study rather than a record of studying them, so a suspended card
   * stays suspended. And the session log is untouched: it says which days the
   * reader sat down and worked, the streak is built from it, and resetting a
   * deck is not grounds for rewriting that history.
   */
  const resetDeck = useCallback((deckId) => {
    setState((s) => ({
      ...s,
      decks: s.decks.map((d) => {
        if (d.id !== deckId) return d
        const schedule = {}
        for (const [cardId, entry] of Object.entries(d.schedule ?? {})) {
          if (entry?.suspended) schedule[cardId] = { ...newEntry(), suspended: true }
        }
        const next = { ...d, schedule }
        return { ...next, progress: progressOf(next) }
      }),
    }))
  }, [])

  /**
   * Takes one card out of the rotation, or puts it back.
   *
   * The alternative a reader has today is deleting the card, which also throws
   * away its history and the fact they ever knew it. This keeps both: the
   * entry is left exactly as it was apart from the flag, so unsuspending
   * resumes the schedule rather than starting it over.
   */
  const setCardSuspended = useCallback((deckId, cardId, suspended) => {
    setState((s) => ({
      ...s,
      decks: s.decks.map((d) => {
        if (d.id !== deckId) return d
        const { [cardId]: current, ...others } = d.schedule ?? {}
        const { suspended: _was, ...kept } = current ?? newEntry()
        const entry = suspended ? { ...kept, suspended: true } : kept

        // A card neither graded nor suspended needs no entry at all. An empty
        // one would sit in the map looking like a record of something.
        const schedule = entry.last || entry.suspended ? { ...others, [cardId]: entry } : others
        const next = { ...d, schedule }
        return { ...next, progress: progressOf(next) }
      }),
    }))
  }, [])

  /**
   * Logs a finished study session. `seconds` is real elapsed time, measured by
   * the page that ran the session, not estimated from the card count.
   */
  const recordSession = useCallback(({ deckId, reviewed, seconds }) => {
    if (!reviewed) return
    setState((s) => ({
      ...s,
      sessions: appendSession(s.sessions, {
        at: Date.now(),
        deckId,
        reviewed,
        seconds: Math.max(0, Math.round(seconds)),
      }),
    }))
  }, [])

  const value = useMemo(
    () => ({
      decks: state.decks,
      sessions: state.sessions,
      theme: state.theme,
      settings: state.settings,
      toast,
      say,
      toggleTheme,
      updateSettings,
      addDeck,
      importDeck,
      restoreLibrary,
      installLibrary,
      updateDeck,
      removeDeck,
      addCards,
      updateCard,
      removeCard,
      recordGrades,
      restoreSchedule,
      resetDeck,
      setCardSuspended,
      recordSession,
    }),
    [
      state.decks,
      state.sessions,
      state.theme,
      state.settings,
      toast,
      say,
      toggleTheme,
      updateSettings,
      addDeck,
      importDeck,
      restoreLibrary,
      installLibrary,
      updateDeck,
      removeDeck,
      addCards,
      updateCard,
      removeCard,
      recordGrades,
      restoreSchedule,
      resetDeck,
      setCardSuspended,
      recordSession,
    ],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
