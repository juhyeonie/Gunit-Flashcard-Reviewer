import { useSyncExternalStore } from 'react'
import { getSnapshot, subscribe } from './pwaState.js'

/** What the browser has said about installing and updating Gunit. */
export default function usePwa() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
