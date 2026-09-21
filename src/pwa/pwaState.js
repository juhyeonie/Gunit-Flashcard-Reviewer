/**
 * What the browser has said about Gunit as an installed app.
 *
 * Three facts, each announced by the browser once and at a time of its own
 * choosing, which is why they are caught here, at module load, rather than in
 * a component:
 *
 *   installPrompt  `beforeinstallprompt` fires once, early, and only in
 *                  browsers that support installing (Chromium on desktop and
 *                  Android). A component mounted later would miss it — Settings
 *                  is rarely the first page — so it is kept until it is used.
 *   installed      running as the installed app, or just installed from here.
 *   update         a new version is waiting; calling it takes it and reloads.
 *
 * Safari and Firefox never fire the event, so on those `installPrompt` stays
 * null and Gunit offers no install button — the browser's own "Add to Home
 * Screen" is the way, and pretending otherwise would be a button that does
 * nothing.
 *
 * No framework and no service-worker code in here, so it can be tested and
 * imported anywhere; registration lives in register.js.
 */

let state = {
  installPrompt: null,
  installed: false,
  update: null,
}

const listeners = new Set()

const set = (patch) => {
  state = { ...state, ...patch }
  for (const listener of listeners) listener()
}

export const subscribe = (listener) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const getSnapshot = () => state

/** Running as an installed app rather than in a browser tab. */
export const isStandalone = (win = typeof window === 'undefined' ? undefined : window) => {
  if (!win) return false
  return (
    win.matchMedia?.('(display-mode: standalone)').matches === true ||
    // iOS Safari's own flag for a home-screen app.
    win.navigator?.standalone === true
  )
}

/**
 * Shows the browser's install dialog, from a click the reader made.
 *
 * The prompt can be used once; after it, whatever the answer, it is gone, and
 * the browser decides whether to offer it again later.
 */
export async function promptInstall() {
  const prompt = state.installPrompt
  if (!prompt) return 'unavailable'
  set({ installPrompt: null })
  await prompt.prompt()
  const { outcome } = await prompt.userChoice
  return outcome
}

/** For register.js: a new version is ready, and this takes it. */
export const offerUpdate = (apply) => set({ update: apply })

/** Listens for the browser's announcements. Called once, from main.jsx. */
export function watchInstallability(win = window) {
  set({ installed: isStandalone(win) })

  win.addEventListener('beforeinstallprompt', (event) => {
    // Held rather than shown: Gunit offers installing in Settings, where the
    // reader goes looking for it, not as a banner over what they came to do.
    event.preventDefault()
    if (!isStandalone(win)) set({ installPrompt: event })
  })

  win.addEventListener('appinstalled', () => set({ installed: true, installPrompt: null }))

  // Opening the installed app from a tab that was already running it.
  win.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', (e) => {
    if (e.matches) set({ installed: true, installPrompt: null })
  })
}

/** For tests: back to a browser that has said nothing yet. */
export const resetPwaState = () => {
  state = { installPrompt: null, installed: false, update: null }
  for (const listener of listeners) listener()
}
