/**
 * Reloads the page, and nothing more: local storage, the service worker's
 * caches and the signed-in session are all left exactly as they are, so the
 * reader comes back to the same library, as the same person.
 *
 * On its own so a test can stand in for it; jsdom cannot reload.
 */
export const reloadPage = () => window.location.reload()
