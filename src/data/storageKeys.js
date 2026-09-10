/**
 * Where a library lives in this browser.
 *
 * One key per library, and never two libraries in one key. That is the whole
 * of the change this module exists for.
 *
 * The old arrangement kept everything under `gunit.state.v2` and swapped the
 * contents on the way in and out of an account, with a second key holding
 * whichever library was not currently in use and a `syncedFor` field to say
 * which was which. Every sync bug found so far was that arrangement: the slot
 * overwritten by a second pull, the slot overwritten by a reload, and a change
 * lost in the swap because the swap and the upload raced.
 *
 * Signing in and out is now a change of key. Nothing is copied, nothing is
 * swapped, and nothing is destroyed by either — so there is no window in which
 * a library can fall between the two.
 */

const PREFIX = 'gunit.state'

/** The signed-out library. Guests have always had one; now it has its own key. */
export const GUEST_KEY = `${PREFIX}.guest`

/** One per account, per browser. Kept while signed in, so studying works offline. */
export const userKey = (userId) => `${PREFIX}.user.${userId}`

/** Whichever library the given identity reads. */
export const keyFor = (userId) => (userId ? userKey(userId) : GUEST_KEY)

/**
 * The keys the previous arrangement used. Read on first run and then left
 * exactly where they are.
 *
 * Not removed, and not in the same release that stops reading them. They are
 * a few hundred kilobytes and they are the only way back if the forward
 * migration below turns out to be wrong about someone's library.
 */
export const LEGACY_KEY = `${PREFIX}.v2`
export const LEGACY_PRESYNC_KEY = `${PREFIX}.presync`

/** Where an unreadable payload is parked rather than overwritten. */
export const SALVAGE_KEY = `${PREFIX}.unreadable`

const read = (key) => {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

/**
 * Moves a browser from the single-key arrangement to this one, once.
 *
 * The hard part is that `gunit.state.v2` holds different things depending on
 * whether the reader was signed in when they last closed the tab, and the two
 * are not distinguishable by content — both are just a library.
 *
 * `syncedFor` settles it. It was added to say which account a stored library
 * belongs to, and it is exactly the question being asked here:
 *
 *   - set    → v2 is that account's library, and the stash holds the guest's
 *   - null   → v2 is the guest's library, and the stash, if any, holds an
 *              account library that cannot be attributed to an account
 *
 * That last case is left alone rather than guessed at. Its contents are in
 * Postgres, and a wrong guess would put one reader's decks under another
 * reader's key.
 *
 * Returns what it did, so the caller can say so and so a test can assert it.
 */
export function migrateLegacyStorage() {
  // Already migrated, or a browser that has never run the old version.
  if (read(GUEST_KEY)) return { migrated: false, reason: 'already' }

  const legacy = read(LEGACY_KEY)
  if (!legacy) return { migrated: false, reason: 'nothing to migrate' }

  const stash = read(LEGACY_PRESYNC_KEY)
  const account = typeof legacy.syncedFor === 'string' ? legacy.syncedFor : null

  if (account) {
    // Signed in when they last left. The account's library goes to its own
    // key, and the stash is what this browser was holding before that.
    write(userKey(account), legacy)
    write(GUEST_KEY, stash ?? { decks: [], sessions: [] })
    return { migrated: true, account, guestFromStash: Boolean(stash) }
  }

  write(GUEST_KEY, legacy)
  return { migrated: true, account: null, guestFromStash: false }
}
