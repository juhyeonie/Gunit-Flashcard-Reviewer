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

/**
 * What this browser keeps about decks shared with an identity: the reader's
 * own progress on them, and a copy of each for studying offline. Never part of
 * the library itself — see sharedLibrary.js.
 */
export const sharedKey = (userId) => `gunit.shared.${userId ?? 'guest'}`

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

/**
 * Whether this account has already been offered the guest library and said no.
 *
 * Without it the offer returns on every sign-in for as long as the account
 * stays empty, which is nagging rather than asking. The answer is per account
 * and per browser, which is the same scope as the question.
 */
const declinedKey = (userId) => `gunit.offer.declined.${userId}`

export function hasDeclinedImport(userId) {
  try {
    return localStorage.getItem(declinedKey(userId)) === 'yes'
  } catch {
    // No storage means no memory of the answer; asking again is the safe way
    // round, since the alternative is never offering at all.
    return false
  }
}

export function rememberDeclinedImport(userId) {
  try {
    localStorage.setItem(declinedKey(userId), 'yes')
  } catch {
    // Then it will be asked again. Not worth failing a sign-in over.
  }
}

/**
 * Whether this browser is holding a change the account has not confirmed.
 *
 * A push waits 1200ms for the library to sit still, so that grading five cards
 * is one request rather than five. Close the tab inside that beat and the
 * request is never made — and the change, which is safely in local storage,
 * was then thrown away by the next sign-in, because the pull installs the
 * account's copy over whatever is here.
 *
 * So the wait is recorded rather than only timed. This is set the moment the
 * library changes, before any waiting, and cleared only by a push the database
 * confirmed. While it is set, the pull carries this browser's copy up instead
 * of writing over it.
 *
 * It is allowed to be wrong in one direction only. A change that lands exactly
 * as a push succeeds can leave this set with nothing to send, which costs one
 * empty comparison on the next sign-in. Clearing it early would cost the
 * change itself, so nothing here is optimised in that direction.
 *
 * Per account and per browser: it describes this machine's copy, and another
 * machine's copy is not its business.
 */
const unsentKey = (userId) => `gunit.sync.unsent.${userId}`

export function markUnsent(userId) {
  if (!userId) return
  try {
    localStorage.setItem(unsentKey(userId), 'yes')
  } catch {
    // A browser that refuses storage has no local library to protect: the one
    // copy of everything is already the account's.
  }
}

export function clearUnsent(userId) {
  if (!userId) return
  try {
    localStorage.removeItem(unsentKey(userId))
  } catch {
    // Left set, which is the safe direction: the next sign-in sends a copy of
    // something the account already has.
  }
}

export function hasUnsent(userId) {
  if (!userId) return false
  try {
    return localStorage.getItem(unsentKey(userId)) === 'yes'
  } catch {
    return false
  }
}

/**
 * The ids the account last confirmed, as this browser saw them.
 *
 * The unsent mark says *that* something here has not gone up; this says what
 * the account held when it last agreed with this browser, and outlives the
 * page for the same reason the mark does. Without it, a change carried up
 * after a relaunch cannot tell a deck deleted here from a deck added on
 * another machine — both are simply absent from one side — and so the carry
 * could only ever add, and a deletion made offline came back.
 *
 * Written only when the account has confirmed the library: a pull installed,
 * or a push accepted. Per account and per browser, like the mark.
 */
const confirmedKey = (userId) => `gunit.sync.confirmed.${userId}`

export function rememberConfirmed(userId, ids) {
  if (!userId) return
  try {
    localStorage.setItem(confirmedKey(userId), JSON.stringify(ids))
  } catch {
    // Left as it was. A stale record is safe in both directions: an id it
    // lacks is never removed, and an id the account no longer has is a
    // removal of nothing.
  }
}

/**
 * Forgets what the sync knew about the library under this key, if it is an
 * account's: the record, and the unsent mark.
 *
 * Called by the store when it finds that library missing or unreadable and
 * starts the account from a stand-in instead. Both described the copy that is
 * gone. The record, kept, would be compared with the stand-in and read every
 * deck the account holds as deleted here; the mark, kept, would carry the
 * stand-in up as the reader's work. With neither, the next pull simply installs
 * the account, which is what a browser with no copy of it should do.
 */
export function forgetSyncStateFor(key) {
  const prefix = `${PREFIX}.user.`
  if (typeof key !== 'string' || !key.startsWith(prefix)) return
  const userId = key.slice(prefix.length)
  try {
    localStorage.removeItem(confirmedKey(userId))
    localStorage.removeItem(unsentKey(userId))
  } catch {
    // Storage refused: then there is no record to read back either.
  }
}

export function readConfirmed(userId) {
  if (!userId) return null
  try {
    const raw = localStorage.getItem(confirmedKey(userId))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/**
 * Takes an account's library off this machine.
 *
 * Called on an explicit sign-out, and only once whatever was queued has gone
 * up. Signing out already stops the account's decks being *shown* — the store
 * reads the guest key again — but leaving them on disk is not the same as
 * taking them off it, and students borrow machines.
 *
 * Nothing is lost by it. The library is in Postgres and signing in again
 * fetches it. What it costs is the offline copy: sign in somewhere with no
 * network after signing out here, and there is nothing to read until there is
 * a connection. That is the trade, and it is the right way round — a copy of
 * somebody's revision left on a library PC is worse than a sign-in that needs
 * the network.
 */
export function forgetAccountLibrary(userId) {
  if (!userId) return false
  try {
    localStorage.removeItem(userKey(userId))
    // The record describes the copy just taken away. Left behind, the next
    // sign-in would compare it with a library that is not there.
    localStorage.removeItem(confirmedKey(userId))
    // So is their progress on decks shared with them, and the offline copies
    // of those decks: somebody else's reviewer, left on a borrowed machine.
    localStorage.removeItem(sharedKey(userId))
    return true
  } catch {
    // Storage refused. The decks stay, which is the safe direction to fail in.
    return false
  }
}
