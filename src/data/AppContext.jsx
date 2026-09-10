import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { uid } from './seed.js'
import { grade, newEntry } from './scheduler.js'
import { MAX_SESSIONS, appendSession } from './activity.js'
import { DEFAULT_STATE, normalizeState, parseStoredState, progressOf } from './normalize.js'
import { AppContext } from './appContext.js'

const STORAGE_KEY = 'gunit.state.v2'

// Where an unreadable payload is parked. Overwriting it on the next save would
// destroy the only copy of whatever the reader had.
const SALVAGE_KEY = 'gunit.state.unreadable'

// What this browser held before an account's library replaced it.
const PRESYNC_KEY = 'gunit.state.presync'

const load = () => {
  let raw = null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    // Storage unavailable (private mode, blocked cookies): run in memory.
    return normalizeState(DEFAULT_STATE)
  }

  const { state, ok } = parseStoredState(raw)
  if (!ok && raw) {
    try {
      localStorage.setItem(SALVAGE_KEY, raw)
    } catch {
      // Nothing more to do; the app still starts.
    }
  }
  return state
}

export function AppProvider({ children }) {
  const [state, setState] = useState(load)
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // Persistence is best-effort; the app still works in memory.
    }
  }, [state])

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
   * Swaps the whole library for another one. Used only by the sync layer, when
   * signing in hands this browser the account's library.
   *
   * Whatever was here first is written to its own key rather than dropped. It
   * is somebody's revision, and "you signed in and your decks went" is not a
   * sentence this app should ever cause — the same reasoning as the salvage
   * key for an unreadable payload.
   */
  /**
   * Swaps in an account's library, keeping what was here for the swap back.
   *
   * `stash` is how the caller says whether this is the first replacement of a
   * sign-in. It has to, because the stash is a single slot: overwritten on a
   * second call it holds the account's library rather than the browser's, and
   * signing out then hands the account's decks straight back to the machine
   * instead of taking them off it.
   */
  const replaceLibrary = useCallback(
    ({ decks, sessions, settings, theme }, { stash = true, syncedFor = null } = {}) => {
      setState((s) => {
        try {
          if (stash) localStorage.setItem(PRESYNC_KEY, JSON.stringify(s))
        } catch {
          // Storage full or refused; the swap still happens.
        }
        return {
          ...s,
          /*
           * Progress derived here, not taken from the caller.
           *
           * It is never stored in the database — it is a function of the
           * schedule and a second copy could only disagree — so the decks that
           * come back from an account carry no `progress` at all. Installed
           * raw, every page that renders `Math.round(deck.progress * 100)`
           * showed NaN%, from signing in until the next reload put the state
           * back through normalizeState.
           */
          decks: decks.map((deck) => ({ ...deck, progress: progressOf(deck) })),
          sessions: sessions ?? s.sessions,
          settings: settings ? { ...s.settings, ...settings } : s.settings,
          theme: theme ?? s.theme,
          syncedFor,
        }
      })
    },
    [],
  )

  /**
   * Hands this browser back the library it had before an account's arrived.
   *
   * Signing out used to leave the account's decks sitting in localStorage. On
   * a shared laptop or a library machine the next person opened Gunit and
   * found somebody else's revision, which is the wrong default for an app
   * students use on borrowed computers.
   *
   * Nothing is lost by it: the account's library is in Postgres, and what
   * comes back is what this browser was holding before it signed in — kept by
   * `replaceLibrary` for exactly this. The two swap places rather than one
   * overwriting the other.
   */
  const releaseSyncedLibrary = useCallback(() => {
    let before = null
    try {
      const raw = localStorage.getItem(PRESYNC_KEY)
      if (raw) before = normalizeState(JSON.parse(raw))
    } catch {
      // Unreadable or refused: an empty library is still better than someone
      // else's, and theirs is safe in their account either way.
    }

    setState((s) => {
      try {
        localStorage.setItem(PRESYNC_KEY, JSON.stringify(s))
      } catch {
        // As above.
      }
      return {
        ...s,
        decks: before?.decks ?? [],
        sessions: before?.sessions ?? [],
        settings: before?.settings ?? s.settings,
        // What is here now is the browser's own again, not an account's.
        syncedFor: null,
      }
    })
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
      syncedFor: state.syncedFor,
      theme: state.theme,
      settings: state.settings,
      toast,
      say,
      toggleTheme,
      updateSettings,
      addDeck,
      importDeck,
      restoreLibrary,
      replaceLibrary,
      releaseSyncedLibrary,
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
      state.syncedFor,
      state.theme,
      state.settings,
      toast,
      say,
      toggleTheme,
      updateSettings,
      addDeck,
      importDeck,
      restoreLibrary,
      replaceLibrary,
      releaseSyncedLibrary,
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
