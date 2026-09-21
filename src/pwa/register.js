import { registerSW } from 'virtual:pwa-register'
import { offerUpdate } from './pwaState.js'

/**
 * Registers the service worker, in production builds only.
 *
 * `registerType: 'prompt'`: a new version installs in the background and then
 * waits. The reader is told, and takes it with a reload when it suits them —
 * never mid-review. If they ignore it, it takes over by itself the next time
 * every Gunit window is closed, which for an installed app is most days.
 *
 * An installed app can stay open for days without a navigation, which is when
 * a browser normally checks for a new service worker. So it also checks every
 * hour, and whenever the app comes back to the foreground; either way a check
 * is one small request for sw.js, answered from the network, never a cache.
 */
const HOUR = 60 * 60 * 1000

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return

  const applyUpdate = registerSW({
    onNeedRefresh() {
      offerUpdate(() => applyUpdate(true))
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return
      const check = () => {
        if (navigator.onLine) registration.update().catch(() => {})
      }
      setInterval(check, HOUR)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
    },
  })
}
