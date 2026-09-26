import { useEffect } from 'react'

/** Tailwind's `sm` is 640px: below it is a phone, and the floating tab bar. */
export const PHONE_QUERY = '(max-width: 639.98px)'

/**
 * Hides an element while the page scrolls down and brings it back when it
 * scrolls up — the phone's floating tab bar, out of the way of what is being
 * read, and back the moment the reader heads back up.
 *
 * Three things keep it calm rather than twitchy:
 *
 *   near the top it always shows — there is nothing to make room for yet
 *   it moves only after `threshold` pixels in one direction, so a thumb
 *     resting on the screen, or iOS's bounce, does not flicker it
 *   the scroll position is read at most once a frame
 *
 * And nothing re-renders. The state lives on the element as `data-hidden`,
 * which the element's own classes style; a scroll that changes nothing costs
 * one comparison.
 *
 * Only on a phone: on a wider screen the listener is not attached at all, and
 * a phone turned into a wide window stops listening and shows the bar.
 * Focus arriving in the element, and `resetKey` changing — a new page — both
 * bring it back.
 */
export default function useHideOnScroll(ref, { threshold = 12, top = 24, resetKey, query = PHONE_QUERY } = {}) {
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined

    const raf = window.requestAnimationFrame?.bind(window) ?? ((fn) => window.setTimeout(fn, 16))
    const cancel = window.cancelAnimationFrame?.bind(window) ?? window.clearTimeout
    const mq = window.matchMedia?.(query)

    let lastY = 0
    let travel = 0
    let frame = 0
    let listening = false

    // Read from the element rather than kept here, so anything else that
    // shows it — a new page, focus — is never out of step with this.
    const set = (hidden) => {
      const value = hidden ? 'true' : 'false'
      if (el.dataset.hidden !== value) el.dataset.hidden = value
    }

    const measure = () => {
      frame = 0
      const y = Math.max(0, window.scrollY)
      const dy = y - lastY
      lastY = y
      if (y <= top) {
        travel = 0
        set(false)
        return
      }
      if (!dy) return
      // A change of direction starts the count again.
      if (Math.sign(dy) !== Math.sign(travel)) travel = 0
      travel += dy
      if (travel > threshold) set(true)
      else if (travel < -threshold) set(false)
    }

    const onScroll = () => {
      if (!frame) frame = raf(measure)
    }

    const start = () => {
      if (listening) return
      listening = true
      lastY = Math.max(0, window.scrollY)
      window.addEventListener('scroll', onScroll, { passive: true })
    }

    const stop = () => {
      if (!listening) return
      listening = false
      window.removeEventListener('scroll', onScroll)
      if (frame) cancel(frame)
      frame = 0
      travel = 0
      set(false)
    }

    const follow = () => (mq ? mq.matches : true) ? start() : stop()
    follow()
    mq?.addEventListener?.('change', follow)

    // Tabbing into it, or a screen reader moving there: it must be there.
    const reveal = () => {
      travel = 0
      set(false)
    }
    el.addEventListener('focusin', reveal)

    return () => {
      stop()
      mq?.removeEventListener?.('change', follow)
      el.removeEventListener('focusin', reveal)
    }
  }, [ref, threshold, top, query])

  // A new page starts with it showing.
  useEffect(() => {
    const el = ref.current
    if (el) el.dataset.hidden = 'false'
  }, [ref, resetKey])
}
