import { useSyncExternalStore } from 'react'

/*
 * Whether the browser believes it has a connection.
 *
 * `navigator.onLine` is a claim about the network interface, not a promise
 * that Supabase will answer: true on a captive portal, true with a dead router.
 * So it is only ever used to say something honest when it is false — "signing
 * in needs a connection" — never to decide that the account is reachable. The
 * sync still finds that out by trying.
 */
const subscribe = (onChange) => {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

const getSnapshot = () => navigator.onLine !== false

// Rendered on a server, there is nothing to say; assume online.
const getServerSnapshot = () => true

export default function useOnline() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
