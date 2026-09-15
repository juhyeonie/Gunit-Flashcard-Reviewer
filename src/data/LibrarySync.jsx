import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from './useApp.js'
import { useAuth } from './useAuth.js'
import { getSupabase } from './supabase.js'
import { registerPendingSync } from './pendingSync.js'
import {
  GUEST_KEY,
  clearUnsent,
  hasDeclinedImport,
  hasUnsent,
  markUnsent,
  rememberDeclinedImport,
  userKey,
} from './storageKeys.js'
import { parseStoredState } from './normalize.js'
import Modal from '../components/Modal.jsx'
import {
  changesBetween,
  fromRows,
  isEmptyChange,
  profileToSettings,
  settingsToProfile,
  toPayload,
  toRows,
} from './sync.js'

/**
 * Keeps the signed-in account's library and this browser's in step.
 *
 * Renders nothing. Local storage stays the thing the app reads — every page
 * still gets its decks synchronously, studying still works on a train, and a
 * paused free project is a sync that retries rather than an app that is gone.
 * This carries changes to Postgres afterwards.
 *
 * Signed out, or with no project configured, it does nothing at all.
 */

/**
 * A library, read straight from its key rather than from the store.
 *
 * Two callers need this and both need it for the same reason: they want a
 * library that is not the one on screen. The empty account adopting the
 * guest's decks cannot see them, because once signed in `decks` from the store
 * is the account's — that is the point of the split. And the carry below runs
 * inside an async pull, where the store's copy has been through renders this
 * function knows nothing about, while the key has not moved.
 *
 * Reading, never moving. Both keys are left exactly as they are, so a failed
 * upload costs nothing.
 */
function readLibrary(key) {
  try {
    return parseStoredState(localStorage.getItem(key)).state
  } catch {
    return { decks: [], sessions: [] }
  }
}

const readGuestLibrary = () => readLibrary(GUEST_KEY)

/** How long the library has to sit still before a push is worth making. */
const QUIET_MS = 1200

export default function LibrarySync() {
  const { user, available } = useAuth()
  /*
   * The account, not the session object it arrived in.
   *
   * Supabase publishes a fresh session — and so a fresh `user` — on every
   * token refresh, roughly hourly. Keyed on that object the effects below
   * re-ran on a timer, re-fetching the library for no reason. The id only
   * changes when the account does.
   */
  const userId = user?.id ?? null
  const { decks, sessions, settings, theme, installLibrary, say } = useApp()

  /*
   * The rows as the database last confirmed them. Every push is the difference
   * between this and now, so it is only ever advanced by a push that actually
   * succeeded — a failed one leaves it behind, and the next change retries
   * everything since.
   */
  const synced = useRef(null)
  const pushTimer = useRef(null)
  const busy = useRef(false)
  const complained = useRef(false)
  const alive = useRef(true)
  // Who was signed in last time this ran, so signing out is distinguishable
  // from having never signed in.
  const wasSignedInAs = useRef(null)
  /** The guest library waiting to be offered to an empty account, if any. */
  const [offer, setOffer] = useState(null)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      clearTimeout(pushTimer.current)
    }
  }, [])

  const trouble = useCallback(
    (message) => {
      // Said once. A failing network would otherwise narrate every keystroke.
      if (complained.current) return
      complained.current = true
      say(message)
    },
    [say],
  )

  /**
   * Signing in: read the account's library into this browser's copy of it.
   *
   * An account with nothing in it adopts whatever the guest library was
   * holding — that is the migration, and it is the only case where local wins.
   * Once the account has decks, the account is the library, because it is the
   * copy the reader's other machines also see.
   *
   * Nothing is stashed and nothing is swapped. The guest library sits under
   * its own key throughout, and signing out reads it again.
   */
  useEffect(() => {
    if (!available || !userId) {
      synced.current = null
      complained.current = false
      if (wasSignedInAs.current) {
        wasSignedInAs.current = null
        say('Signed out — your own decks are back')
      }
      return undefined
    }

    wasSignedInAs.current = userId

    let cancelled = false

    /** Everything the account holds, as four requests that go together. */
    const select = async (supabase) => {
      const [deckRes, cardRes, sessionRes, profileRes] = await Promise.all([
        supabase.from('decks').select('*'),
        supabase.from('cards').select('*'),
        supabase.from('sessions').select('*'),
        supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      ])
      return {
        error: deckRes.error || cardRes.error || sessionRes.error,
        rows: { decks: deckRes.data, cards: cardRes.data, sessions: sessionRes.data },
        profile: profileRes.data ? profileToSettings(profileRes.data) : {},
      }
    }

    const pull = async () => {
      const supabase = await getSupabase()
      if (!supabase || cancelled) return

      let { error, rows, profile } = await select(supabase)
      if (error) {
        // The account's own key may already hold a copy from last time, which
        // is what the reader is looking at. Studying carries on offline.
        trouble('Signed in, but your library could not be refreshed')
        return
      }
      if (cancelled || !alive.current) return

      /*
       * A change this browser made and never managed to send: send it now,
       * before anything is installed over it.
       *
       * This is the other half of the debounce. The push waits a beat, and a
       * tab closed inside that beat leaves the change in local storage and
       * nowhere else — where, until this existed, the next sign-in's install
       * quietly wrote the account's older copy straight over it.
       *
       * Carried as upserts with nothing removed, which is the whole of the
       * safety here. A plain difference against what was just fetched would
       * read every row another machine has added since as a row this one
       * deleted, and send five deletions to tidy up. So rows are only ever
       * written or left alone: at worst a card deleted in the lost beat comes
       * back, and nothing that exists anywhere is destroyed.
       */
      let carriedUp = false
      if (hasUnsent(userId)) {
        const mine = toRows(readLibrary(userKey(userId)), userId)
        const carried = {
          decks: { upsert: mine.decks, remove: [] },
          cards: { upsert: mine.cards, remove: [] },
          sessions: { insert: mine.sessions },
        }

        if (isEmptyChange(carried)) {
          clearUnsent(userId)
        } else {
          const { error: carryError } = await write(supabase, carried)
          if (carryError) {
            /*
             * Nothing is installed and the mark is left set. The reader keeps
             * looking at their own copy, and the next sign-in tries again.
             *
             * `synced.current` stays null on purpose, which stops this session
             * pushing at all: there is no confirmed picture of the account to
             * compare against, and the nearest thing to one — the rows just
             * fetched — is exactly the comparison that would send deletions.
             */
            trouble('Signed in — a change made here last time has not gone up yet')
            return
          }
          clearUnsent(userId)

          const again = await select(supabase)
          if (again.error) {
            trouble('Signed in, but your library could not be refreshed')
            return
          }
          if (cancelled || !alive.current) return
          rows = again.rows
          profile = again.profile
          carriedUp = true
        }
      }

      synced.current = toRows(fromRows(rows), userId)
      installLibrary({ ...fromRows(rows), ...profile })

      /*
       * An empty account, and decks sitting in the guest library: ask.
       *
       * This used to happen by itself. Copying somebody's decks into an
       * account is not a thing to do quietly on a shared browser — the decks
       * in front of you when you sign up are not always yours, and once they
       * are in an account they are visible from every machine that account
       * signs in on. The account's library is installed either way; the offer
       * sits on top of it.
       */
      const guest = readGuestLibrary()
      if (rows.decks.length === 0 && guest.decks.length > 0 && !hasDeclinedImport(userId)) {
        setOffer({ decks: guest.decks.length })
        return
      }

      // Said rather than left to be trusted: a change that spent a night on
      // this machine instead of in the account is worth hearing about once.
      say(
        carriedUp
          ? 'Signed in — your last changes are up to date'
          : `Signed in — ${rows.decks.length} ${rows.decks.length === 1 ? 'deck' : 'decks'}`,
      )
    }

    pull()
    return () => {
      cancelled = true
    }
    // Keyed on the account alone, and now honestly so: the library this reads
    // comes from its key rather than from props, so there is nothing missing
    // from this list. It used to need a lint exception to say the same thing.
  }, [available, userId, installLibrary, say, trouble])

  /*
   * The latest library, for the flush below to read.
   *
   * The flush is registered once and called from outside React, so a closure
   * over this render's props would send whatever was on screen when it was
   * registered rather than what is there when it runs — which is precisely the
   * change it exists to rescue.
   */
  const latest = useRef({ decks, sessions, userId })
  // Written after each render rather than during one: a ref updated in the
  // render body is a value React may have thrown away and re-derived.
  useEffect(() => {
    latest.current = { decks, sessions, userId }
  })

  /**
   * Sends anything the debounce is still sitting on, and waits for it.
   *
   * Signing out clears that timer and hands the browser its own library back
   * in the same breath, so a change made in the last second was sent nowhere
   * and then taken off the machine. This is what signing out calls first,
   * while there is still a session for row level security to accept.
   */
  const flushNow = useCallback(async () => {
    clearTimeout(pushTimer.current)

    const { decks: nowDecks, sessions: nowSessions, userId: nowUser } = latest.current
    if (!available || !nowUser || !synced.current) return { error: null }

    const next = toRows({ decks: nowDecks, sessions: nowSessions }, nowUser)
    const change = changesBetween(synced.current, next)
    if (isEmptyChange(change)) return { error: null }

    const supabase = await getSupabase()
    const { error } = await write(supabase, change)
    if (error) {
      // Said plainly rather than through `trouble`, which is worded for a
      // change that is still safely on this device. After signing out it will
      // not be — the library is about to be swapped away.
      say('Your last changes could not be saved to your account')
      return { error }
    }
    synced.current = next
    clearUnsent(nowUser)
    return { error: null }
  }, [available, say])

  /*
   * Asked when a session ends without going through the sign-out button, to
   * decide whether the account's library may come off this machine.
   *
   * Read from storage rather than from a ref, because the ref only knows about
   * this page. A change lost to a closed tab is outstanding when the browser
   * opens again, and that is exactly the copy that must not be swept up.
   */
  const outstanding = useCallback((id) => hasUnsent(id ?? latest.current.userId), [])
  useEffect(() => registerPendingSync(flushNow, outstanding), [flushNow, outstanding])

  /**
   * Leaving the page ends the wait early.
   *
   * The debounce exists so that grading five cards is one request. It is not
   * meant to survive the reader walking away, and on a phone walking away is
   * how this app is normally left: the tab is never closed, it is switched
   * away from and eventually discarded. `visibilitychange` is the signal that
   * arrives for that; `pagehide` is the one that arrives for a closed tab and
   * a followed link.
   *
   * Nothing waits on it. There is no later to report an error into, and the
   * request may well be killed in flight — which is why the mark in storage
   * exists underneath this rather than instead of it. This narrows the window
   * to nearly nothing; the mark is what covers the rest, and a flat battery.
   */
  useEffect(() => {
    if (!available || !userId) return undefined

    const leave = () => flushNow()
    const onHidden = () => {
      if (document.visibilityState === 'hidden') leave()
    }

    document.addEventListener('visibilitychange', onHidden)
    window.addEventListener('pagehide', leave)
    return () => {
      document.removeEventListener('visibilitychange', onHidden)
      window.removeEventListener('pagehide', leave)
    }
  }, [available, userId, flushNow])

  /** Carries whatever changed since the last confirmed push. */
  useEffect(() => {
    if (!available || !userId || !synced.current) return undefined

    /*
     * Marked here, before the wait, rather than inside it.
     *
     * The wait is the window: a tab closed during it makes no request, and
     * until this line the only record of that was a timer that died with the
     * page. Marking on every change rather than on every *difference* means
     * the odd empty mark, which costs one comparison; working out the
     * difference first would mean diffing the whole library on every
     * keystroke, and getting it wrong would cost the change.
     */
    markUnsent(userId)

    clearTimeout(pushTimer.current)
    pushTimer.current = setTimeout(async () => {
      if (busy.current || !alive.current) return

      const next = toRows({ decks, sessions }, userId)
      const change = changesBetween(synced.current, next)
      if (isEmptyChange(change)) {
        clearUnsent(userId)
        return
      }

      busy.current = true
      const supabase = await getSupabase()
      const { error } = await write(supabase, change)
      busy.current = false

      if (!alive.current) return
      if (error) {
        // synced.current is left where it was, so the next change retries all
        // of this rather than skipping past it.
        trouble('Your last change is saved on this device but not to your account')
        return
      }
      synced.current = next
      clearUnsent(userId)
      complained.current = false
    }, QUIET_MS)

    return () => clearTimeout(pushTimer.current)
  }, [available, userId, decks, sessions, trouble])

  /**
   * Preferences are small and change rarely; no diffing earns its keep.
   *
   * Awaited, and that is the whole point. A PostgREST query builder is a lazy
   * thenable: `from(...).update(...).eq(...)` builds a request and sends
   * nothing until something calls `then` on it. Written without the await this
   * silently did nothing at all — the row kept its defaults while the browser
   * showed the reader's own settings, and signing in on a second machine
   * pulled those defaults back over them.
   */
  useEffect(() => {
    if (!available || !userId || !synced.current) return
    getSupabase().then(async (supabase) => {
      if (!supabase) return
      const { error } = await supabase
        .from('profiles')
        .update(settingsToProfile(settings, theme))
        .eq('id', userId)
      if (error) trouble('Your preferences are saved on this device but not to your account')
    })
  }, [available, userId, settings, theme, trouble])

  /**
   * Yes: the guest library is copied into the account.
   *
   * Copied, not moved. The guest key is left exactly as it is, so a failed
   * upload costs nothing and signing out still finds those decks where they
   * were. Fresh ids, always — a uuid in the guest library means some account
   * uploaded it once, possibly another one on this browser, and offering those
   * ids back reaches for rows this user does not own.
   */
  const acceptOffer = useCallback(async () => {
    setOffer(null)
    const { userId: uid } = latest.current
    const supabase = await getSupabase()
    if (!supabase || !uid) return

    const guest = readGuestLibrary()
    const rows = toRows(guest, uid, { reissueIds: true })
    const { error } = await write(supabase, {
      decks: { upsert: rows.decks, remove: [] },
      cards: { upsert: rows.cards, remove: [] },
      sessions: { insert: rows.sessions },
    })
    if (!alive.current) return
    if (error) {
      trouble('Your decks could not be brought into this account')
      return
    }
    synced.current = rows
    installLibrary(fromRows(rows))
    say(`Brought ${rows.decks.length} ${rows.decks.length === 1 ? 'deck' : 'decks'} in`)
  }, [installLibrary, say, trouble])

  /** No: remembered, so signing in again does not ask the same thing forever. */
  const declineOffer = useCallback(() => {
    setOffer(null)
    if (latest.current.userId) rememberDeclinedImport(latest.current.userId)
    say('Left your own decks where they were')
  }, [say])

  /*
   * The one thing this component draws. Everything else it does is invisible,
   * but a question cannot be.
   */
  return (
    <Modal
      /*
       * Gated on there being a session rather than cleared on the way out.
       * Signing out simply stops asking, and the next sign-in sets its own
       * offer or none — which saves clearing state from inside an effect for
       * no behaviour anyone can see.
       */
      open={Boolean(offer) && Boolean(userId)}
      onClose={declineOffer}
      kicker="Your decks"
      title={
        offer?.decks === 1
          ? 'Bring your deck into this account?'
          : `Bring your ${offer?.decks ?? 0} decks into this account?`
      }
      body="This account is empty. Copying them in makes them available on your other machines — they also stay on this browser either way."
      confirmLabel="Bring them in"
      cancelLabel="Not now"
      onConfirm={acceptOffer}
      maxWidth={420}
    />
  )
}

/**
 * Applies one change set.
 *
 * A single call, because `sync_library` is one statement to Postgres and
 * therefore one transaction. Sent as five separate requests it could fail part
 * way and leave the account holding decks whose cards never arrived — which
 * the next sign-in would then read back as the truth.
 */
async function write(supabase, change) {
  if (!supabase) return { error: new Error('No project configured') }
  const { error } = await supabase.rpc('sync_library', { payload: toPayload(change) })
  return { error }
}
