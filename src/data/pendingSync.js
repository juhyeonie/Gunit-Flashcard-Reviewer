/**
 * Somewhere for the sync to leave "there is still something to send", and for
 * signing out to find it.
 *
 * Pushes are debounced: a change waits a beat so that grading five cards is
 * one request rather than five. Signing out ends that beat early — the effect
 * that owns the timer tears down and clears it — and the same moment hands the
 * browser its own library back, taking the account's out of local storage. A
 * change caught in between was in neither place afterwards. It had not been
 * sent, and it was no longer here.
 *
 * The flush has to happen before `supabase.auth.signOut()`, not after: once
 * the session is gone every row is refused by row level security, so there is
 * no second chance to send it. That is why this is a module of its own rather
 * than something LibrarySync does on its way out — the component cannot get
 * between the button and the sign-out, and this can.
 *
 * A single slot, because there is one LibrarySync. Registering returns the
 * function that clears it, for the effect to use as its cleanup.
 */

let pending = null

export function registerPendingSync(flush) {
  pending = flush
  return () => {
    if (pending === flush) pending = null
  }
}

/**
 * Sends anything outstanding and waits for it.
 *
 * Answers `{ error }` like everything else in the sync path. Nothing
 * registered — signed out already, or no project configured — is not a
 * failure; it is the ordinary local-only app, which has nothing to send.
 */
export async function flushPendingSync() {
  return pending ? pending() : { error: null }
}
