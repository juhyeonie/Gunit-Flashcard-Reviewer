import { useCallback, useEffect, useRef } from 'react'
import { useApp } from './useApp.js'
import { useAuth } from './useAuth.js'
import { getSupabase } from './supabase.js'
import { registerPendingSync } from './pendingSync.js'
import { GUEST_KEY } from './storageKeys.js'
import { parseStoredState } from './normalize.js'
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
 * The guest library, read straight from its key.
 *
 * Once signed in, `decks` from the store is the *account's* library — that is
 * the point of the split — so the one case that needs the guest's decks, an
 * empty account adopting them, has to go and get them. Reading rather than
 * moving: the guest key is left exactly as it is, so a failed upload costs
 * nothing and signing out still finds them.
 */
function readGuestLibrary() {
  try {
    return parseStoredState(localStorage.getItem(GUEST_KEY)).state
  } catch {
    return { decks: [], sessions: [] }
  }
}

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

    const pull = async () => {
      const supabase = await getSupabase()
      if (!supabase || cancelled) return

      const [deckRes, cardRes, sessionRes, profileRes] = await Promise.all([
        supabase.from('decks').select('*'),
        supabase.from('cards').select('*'),
        supabase.from('sessions').select('*'),
        supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      ])

      const failure = deckRes.error || cardRes.error || sessionRes.error
      if (failure) {
        // The account's own key may already hold a copy from last time, which
        // is what the reader is looking at. Studying carries on offline.
        trouble('Signed in, but your library could not be refreshed')
        return
      }
      if (cancelled || !alive.current) return

      const guest = readGuestLibrary()
      if (deckRes.data.length === 0 && guest.decks.length > 0) {
        // Nothing up there yet: the guest library becomes the account's. It is
        // copied rather than moved — the guest key is left exactly as it is,
        // so a failed upload costs nothing and signing out still finds it.
        // Fresh ids, always. A uuid in the guest library means some account
        // uploaded it once — possibly another one on a shared browser — and
        // offering those ids back reaches for rows this user does not own.
        const rows = toRows(guest, userId, { reissueIds: true })
        const { error } = await write(supabase, {
          decks: { upsert: rows.decks, remove: [] },
          cards: { upsert: rows.cards, remove: [] },
          sessions: { insert: rows.sessions },
        })
        if (cancelled || !alive.current) return
        if (error) {
          trouble('Signed in, but your decks could not be uploaded')
          return
        }
        synced.current = rows
        installLibrary(fromRows(rows))
        say(`Uploaded ${rows.decks.length} ${rows.decks.length === 1 ? 'deck' : 'decks'}`)
        return
      }

      const rows = { decks: deckRes.data, cards: cardRes.data, sessions: sessionRes.data }
      synced.current = toRows(fromRows(rows), userId)

      const profile = profileRes.data ? profileToSettings(profileRes.data) : {}
      installLibrary({ ...fromRows(rows), ...profile })
      say(`Signed in — ${deckRes.data.length} ${deckRes.data.length === 1 ? 'deck' : 'decks'}`)
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
    return { error: null }
  }, [available, say])

  useEffect(() => registerPendingSync(flushNow), [flushNow])

  /** Carries whatever changed since the last confirmed push. */
  useEffect(() => {
    if (!available || !userId || !synced.current) return undefined

    clearTimeout(pushTimer.current)
    pushTimer.current = setTimeout(async () => {
      if (busy.current || !alive.current) return

      const next = toRows({ decks, sessions }, userId)
      const change = changesBetween(synced.current, next)
      if (isEmptyChange(change)) return

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

  return null
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
