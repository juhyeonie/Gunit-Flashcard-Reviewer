import { useCallback, useEffect, useRef, useState } from 'react'
import { reloadPage } from './reloadPage.js'

/**
 * How long the spinner shows before the page reloads, in milliseconds: long
 * enough to be seen and read as "refreshing", short enough not to be a wait.
 * The same with reduced motion, where the spinner stands still but still has
 * to be seen.
 */
export const REFRESH_MS = 500

/**
 * Tapping Home on the phone's tab bar while already home reloads the app,
 * with a spinner in place of the house meanwhile, so the tap is seen to have
 * done something.
 *
 * Answers whether it is refreshing, and `refresh(event)` for the tab's click.
 * The click's own navigation is stopped — it would go nowhere, being to the
 * page already open — and a second tap while waiting does nothing: one
 * reload, however many taps.
 *
 * Only a reload. Nothing is cleared: the library, the session, the offline
 * copies and the service worker all survive it, and whatever the sync is
 * still holding is sent as the page goes, as it is whenever the app is closed.
 */
export default function useHomeRefresh() {
  const [refreshing, setRefreshing] = useState(false)
  const timer = useRef(null)

  useEffect(() => () => clearTimeout(timer.current), [])

  const refresh = useCallback((event) => {
    event?.preventDefault()
    if (timer.current) return
    setRefreshing(true)
    timer.current = setTimeout(reloadPage, REFRESH_MS)
  }, [])

  return { refreshing, refresh }
}
