import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { DECKS, uid } from './seed.js'
import { grade } from './scheduler.js'
import { appendSession } from './activity.js'

const STORAGE_KEY = 'gunit.state.v2'

const AppContext = createContext(null)

const DEFAULTS = {
  decks: DECKS,
  theme: 'light',
  // When study actually happened. Drives the streak, the weekly chart and the
  // daily goal — all of which were hardcoded before this existed.
  sessions: [],
  settings: {
    cardsPer: 20,
    autoReveal: false,
    shuffleFirst: false,
    name: 'Mara Kessler',
    email: 'mara.kessler@university.edu',
    goalMinutes: 20,
  },
}

/**
 * A card counts as known once its last grade was anything other than "again".
 * Cards never reviewed are not known, so a deck's progress reflects real
 * coverage rather than the fact that a session happened to finish.
 */
export const progressOf = (deck) => {
  if (!deck.cards.length) return 0
  const known = deck.cards.filter((c) => {
    const last = deck.schedule?.[c.id]?.last
    return last && last !== 'again'
  }).length
  return known / deck.cards.length
}

/**
 * Brings a deck up to the current shape: every card carries an id (schedule
 * entries are keyed by it, so indices shifting on delete can't corrupt them),
 * and every deck carries a schedule map.
 *
 * Two older shapes are migrated in place:
 *   - a bare `progress` number (the seed decks) becomes concrete "good" grades
 *   - a flat `outcomes` map becomes real schedule entries with due dates
 *
 * After either, progress is always derived and never stored independently.
 */
const normalizeDeck = (deck, now = Date.now()) => {
  const cards = deck.cards.map((c) => (c.id ? c : { ...c, id: uid() }))

  let schedule = deck.schedule
  if (!schedule) {
    schedule = {}
    if (deck.outcomes) {
      Object.entries(deck.outcomes).forEach(([cardId, g]) => {
        schedule[cardId] = grade(undefined, g, now)
      })
    } else {
      const knownCount = Math.round((deck.progress ?? 0) * cards.length)
      cards.slice(0, knownCount).forEach((c) => {
        schedule[c.id] = grade(undefined, 'good', now)
      })
    }
  }

  const { outcomes: _legacy, ...rest } = deck
  const next = { ...rest, cards, schedule }
  return { ...next, progress: progressOf(next) }
}

// Wrapped rather than passed to map directly: map would supply the array index
// as normalizeDeck's `now`, scheduling every card relative to epoch 0.
const normalize = (state, now = Date.now()) => ({
  ...state,
  decks: state.decks.map((deck) => normalizeDeck(deck, now)),
  sessions: Array.isArray(state.sessions) ? state.sessions : [],
})

const load = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return normalize({ ...DEFAULTS, ...JSON.parse(raw) })
  } catch {
    // Corrupt or unavailable storage falls back to the seed content.
  }
  return normalize(DEFAULTS)
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
      studied: 'Never',
      progress: 0,
      cards: [],
      schedule: {},
    }
    setState((s) => ({ ...s, decks: [deck, ...s.decks] }))
    return deck
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
        const next = { ...d, studied: 'Just now', schedule }
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
      updateDeck,
      removeDeck,
      addCards,
      updateCard,
      removeCard,
      recordGrades,
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
      updateDeck,
      removeDeck,
      addCards,
      updateCard,
      removeCard,
      recordGrades,
      recordSession,
    ],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>')
  return ctx
}

export function useDeck(id) {
  const { decks } = useApp()
  return decks.find((d) => d.id === id)
}
