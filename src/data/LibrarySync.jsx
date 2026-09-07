import { useCallback, useEffect, useRef } from 'react'
import { useApp } from './useApp.js'
import { useAuth } from './useAuth.js'
import { getSupabase } from './supabase.js'
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

/** How long the library has to sit still before a push is worth making. */
const QUIET_MS = 1200

export default function LibrarySync() {
  const { user, available } = useAuth()
  /*
   * The account, not the session object it arrived in.
   *
   * Supabase publishes a fresh session — and so a fresh `user` — on every
   * token refresh, roughly hourly. Keyed on that object, the effects below
   * re-ran on a timer: the library was re-fetched for no reason, and worse,
   * `replaceLibrary` stashed the state again each time, overwriting the
   * pre-sign-in library that signing out is supposed to hand back. An hour in,
   * signing out returned the account's decks instead of your own.
   *
   * The id only changes when the account does.
   */
  const userId = user?.id ?? null
  const { decks, sessions, settings, theme, replaceLibrary, releaseSyncedLibrary, say } =
    useApp()

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
   * Signing in: read the account's library and decide which one wins.
   *
   * An account with nothing in it adopts whatever this browser was holding —
   * that is the migration, and it is the only case where local wins. Once the
   * account has decks, the account is the library, because it is the copy the
   * reader's other machines also see.
   */
  useEffect(() => {
    if (!available || !userId) {
      synced.current = null
      complained.current = false

      // Signing out, rather than never having signed in. The account's decks
      // do not stay behind on the machine.
      if (wasSignedInAs.current) {
        wasSignedInAs.current = null
        releaseSyncedLibrary()
        say('Signed out — your own decks are back')
      }
      return
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
        trouble('Signed in, but your library could not be loaded')
        return
      }
      if (cancelled || !alive.current) return

      if (deckRes.data.length === 0 && decks.length > 0) {
        // Nothing up there yet: this browser's library becomes the account's.
        const rows = toRows({ decks, sessions }, userId)
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
        // Ids were minted during the upload; local state has to adopt them or
        // the next push would upload the same library a second time.
        replaceLibrary(fromRows(rows))
        say(`Uploaded ${rows.decks.length} ${rows.decks.length === 1 ? 'deck' : 'decks'}`)
        return
      }

      const rows = { decks: deckRes.data, cards: cardRes.data, sessions: sessionRes.data }
      synced.current = toRows(fromRows(rows), userId)

      const profile = profileRes.data ? profileToSettings(profileRes.data) : {}
      replaceLibrary({ ...fromRows(rows), ...profile })
      say(`Signed in — ${deckRes.data.length} ${deckRes.data.length === 1 ? 'deck' : 'decks'}`)
    }

    pull()
    return () => {
      cancelled = true
    }
    // Deliberately keyed on the account alone. Including the library would
    // re-pull on every edit, and pulling is what the push below is for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available, userId, replaceLibrary, releaseSyncedLibrary, say, trouble])

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

  /** Preferences are small and change rarely; no diffing earns its keep. */
  useEffect(() => {
    if (!available || !userId || !synced.current) return
    getSupabase().then((supabase) => {
      supabase?.from('profiles').update(settingsToProfile(settings, theme)).eq('id', userId)
    })
  }, [available, userId, settings, theme])

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
