import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { DECKS, uid } from './seed.js'

const STORAGE_KEY = 'gunit.state.v2'

const AppContext = createContext(null)

const DEFAULTS = {
  decks: DECKS,
  theme: 'light',
  settings: {
    cardsPer: 20,
    autoReveal: false,
    shuffleFirst: false,
    name: 'Mara Kessler',
    email: 'mara.kessler@university.edu',
    goalMinutes: 20,
  },
}

const load = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    // Corrupt or unavailable storage falls back to the seed content.
  }
  return DEFAULTS
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
    setState((s) => ({
      ...s,
      decks: s.decks.map((d) => (d.id === deckId ? { ...d, cards: [...d.cards, ...cards] } : d)),
    }))
  }, [])

  const updateCard = useCallback((deckId, index, card) => {
    setState((s) => ({
      ...s,
      decks: s.decks.map((d) =>
        d.id === deckId ? { ...d, cards: d.cards.map((c, i) => (i === index ? card : c)) } : d,
      ),
    }))
  }, [])

  const removeCard = useCallback((deckId, index) => {
    setState((s) => ({
      ...s,
      decks: s.decks.map((d) =>
        d.id === deckId ? { ...d, cards: d.cards.filter((_, i) => i !== index) } : d,
      ),
    }))
  }, [])

  /** Records the outcome of a review session against the deck. */
  const recordSession = useCallback((deckId, { known, total }) => {
    setState((s) => ({
      ...s,
      decks: s.decks.map((d) =>
        d.id === deckId
          ? {
              ...d,
              studied: 'Just now',
              progress: total ? Math.max(d.progress, known / total) : d.progress,
            }
          : d,
      ),
    }))
  }, [])

  const value = useMemo(
    () => ({
      decks: state.decks,
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
      recordSession,
    }),
    [
      state.decks,
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
