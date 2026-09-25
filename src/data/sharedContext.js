import { createContext, useContext } from 'react'

/**
 * The share a page under /shared/... is looking at, and what can be done
 * with it — kept beside the store rather than in it, because none of it is
 * the reader's library. Filled by SharedArea.
 */
export const SharedContext = createContext(null)

export function useShared() {
  const ctx = useContext(SharedContext)
  if (!ctx) throw new Error('useShared must be used inside a shared page')
  return ctx
}
