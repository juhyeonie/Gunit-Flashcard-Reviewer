import { useCallback, useEffect, useRef, useState } from 'react'
import { reloadPage } from './reloadPage.js'

/**
 * How long the Home icon turns before the page reloads, in milliseconds. The
 * animation itself is `.home-refresh` in index.css; each wait is a little
 * longer than its animation, so the last frame is seen rather than cut off.
 */
export const REFRESH_MS = 520
/** With reduced motion the icon only dims for a moment — see index.css. */
export const REFRESH_REDUCED_MS = 180

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

/**
 * Tapping Home on the phone's tab bar while already home reloads the app,
 * after a short turn of the icon so the tap is seen to have done something.
 *
 * Answers whether it is refreshing, and `refresh(event)` for the tab's click.
 * The click's own navigation is stopped — it would go nowhere, being to the
 * page already open — and a second tap while waiting does nothing: one
 * reload, however many taps.
 *
 * Only a reload. Nothing is cleared: the library, the session and every cache
 * survive it, and whatever the sync is still holding is sent as the page
 * goes, as it is whenever the app is closed.
 */
export default function useHomeRefresh() {
  const [refreshing, setRefreshing] = useState(false)
  const timer = useRef(null)

  useEffect(() => () => clearTimeout(timer.current), [])

  const refresh = useCallback((event) => {
    event?.preventDefault()
    if (timer.current) return
    setRefreshing(true)
    timer.current = setTimeout(reloadPage, prefersReducedMotion() ? REFRESH_REDUCED_MS : REFRESH_MS)
  }, [])

  return { refreshing, refresh }
}
