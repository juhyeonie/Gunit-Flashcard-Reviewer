import { useEffect } from 'react'

const SUFFIX = 'Gunit'

/**
 * Keeps document.title in step with the route.
 *
 * A single-page app leaves the title alone unless told otherwise, so every
 * screen read as "Gunit": browser history and open tabs said nothing about
 * where you were, and screen readers announce the title on navigation, so they
 * said nothing either.
 */
export default function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · ${SUFFIX}` : SUFFIX
  }, [title])
}
