import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { uid } from './seed.js'
import { grade } from './scheduler.js'
import { appendSession } from './activity.js'
import { DEFAULT_STATE, normalizeState, parseStoredState, progressOf } from './normalize.js'

const STORAGE_KEY = 'gunit.state.v2'

// Where an unreadable payload is parked. Overwriting it on the next save would
// destroy the only copy of whatever the reader had.
const SALVAGE_KEY = 'gunit.state.unreadable'

const AppContext = createContext(null)

export { progressOf }

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
