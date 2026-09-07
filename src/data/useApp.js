import { useContext } from 'react'
import { AppContext } from './appContext.js'
import { progressOf } from './normalize.js'

/**
 * Reading the store. Separate from `AppContext.jsx` so that file exports
 * nothing but its component and fast refresh keeps working on it.
 */

export { progressOf }

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>')
  return ctx
}

export function useDeck(id) {
  const { decks } = useApp()
  return decks.find((d) => d.id === id)
}
