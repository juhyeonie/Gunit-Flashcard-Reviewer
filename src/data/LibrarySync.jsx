import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from './useApp.js'
import { useAuth } from './useAuth.js'
import { getSupabase } from './supabase.js'
import { registerPendingSync } from './pendingSync.js'
import {
  GUEST_KEY,
  clearPrefsUnsent,
  clearUnsent,
  hasDeclinedImport,
  hasPrefsUnsent,
  hasUnsent,
  markPrefsUnsent,
  markUnsent,
  readConfirmed,
  rememberConfirmed,
  rememberDeclinedImport,
  userKey,
} from './storageKeys.js'
import { isUntouchedExample, parseStoredState } from './normalize.js'
import { addNotice } from './notices.js'
import Modal from '../components/Modal.jsx'
import {
  anyRefused,
  changesBetween,
  confirmedIds,
  fromRows,
  isEmptyChange,
  profileToSettings,
  readRefused,
  removalsSince,
  settingsToProfile,
  toPayload,
  toRows,
  withoutDeletedElsewhere,
  withoutPreferenceColumns,
  withoutRefused,
  withoutRefusedRows,
} from './sync.js'
import { t } from '../i18n/index.js'
import { rememberAccountAvatar } from './avatar.js'

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

/**
 * The account's library as this browser holds it, and whether it really does.
 *
 * `readLibrary` answers a missing or unreadable key with the default library,
 * which is right for showing something and wrong for working out deletions:
 * compared with the record of what the account holds, an empty library reads
 * as every deck deleted. So the carry asks this instead, and sends removals
 * only when there is a real library here to have removed them from.
 */
function readOwnLibrary(key) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return { state: readLibrary(key), present: false }
    const { state, ok } = parseStoredState(raw)
    return { state, present: ok }
  } catch {
    return { state: { decks: [], sessions: [] }, present: false }
  }
}

/**
 * The guest's own decks — the ones worth offering to an account.
 *
 * The example deck is left out while it is still exactly as it was handed
 * out. It is a tutorial, not the reader's work, and "Bring your deck into this
 * account?" about a deck they never wrote would put it in their account on
 * every machine they sign in on. Once they have edited it, some of it is
 * theirs, and it is offered like anything else.
 */
const readGuestLibrary = () => {
  const guest = readLibrary(GUEST_KEY)
  return { ...guest, decks: guest.decks.filter((d) => !isUntouchedExample(d)) }
}

/**
 * The two sync notices the notification center keeps, as opposed to the
 * toasts that come and go. One each way, replacing each other: the newer is
 * the truth.
 */
const SAVED_OFFLINE = { kind: 'sync-offline', group: 'sync', params: {} }
const SYNCED = { kind: 'sync-done', group: 'sync', params: {} }

/** How long the library has to sit still before a push is worth making. */
const QUIET_MS = 1200

/**
 * How long the app has to have been away before coming back reads the account
 * again. Switching tabs to check a word is not a reason to fetch the library.
 */
const REFRESH_AFTER_MS = 60 * 1000

/**
 * Rows asked for per request: PostgREST's default `max-rows`. A project that
 * sets it lower answers with fewer, and nothing breaks — the end of a table is
 * found by counting rows, not by a page coming back short.
 */
const PAGE_ROWS = 1000

/**
 * Every row of one of the account's tables, a page at a time.
 *
 * A bare `select('*')` stops at `max-rows` without saying so. An account past
 * a thousand cards — or, sooner, a thousand sessions — was installed without
 * the rest on every sign-in: still in Postgres, gone from the app, and the
 * streak counted from part of the history.
 *
 * Each page starts after the last id the one before it ended on, rather than
 * at an offset. An offset counts rows, so a row deleted on another device
 * between two pages moved every later row back one and the first of them was
 * never read; one added moved them forward and a row was read twice. An id
 * stays where it is whatever happens around it. Any page failing fails the
 * table, and with it the whole pull — a library missing its later pages is
 * exactly what this exists to stop.
 *
 * A short page is not the end. Under a `max-rows` below `PAGE_ROWS` every page
 * is short, and stopping at the first one was the truncation all over again.
 * The first request asks for the table's size as well, and reading stops once
 * that many rows are in — so an ordinary library is still one request. A row
 * deleted elsewhere mid-read leaves the count too high, and an empty page ends
 * it instead; one added mid-read and missed arrives with the next pull, like
 * any row written after this one.
 */
/**
 * Everything the account holds, as requests that go together.
 *
 * A failed folders read fails the whole pull, the same as a failed deck
 * read. Installing decks without their folders would put every one of
 * them in Ungrouped and then push that back up as the truth — the local
 * copy, folders and all, is left on screen instead, and nothing is sent
 * until a pull succeeds.
 */
async function readAccount(supabase, userId) {
  const [deckRes, cardRes, sessionRes, folderRes, profileRes] = await Promise.all([
    selectAll(supabase, 'decks'),
    selectAll(supabase, 'cards'),
    selectAll(supabase, 'sessions'),
    selectAll(supabase, 'folders'),
    supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
  ])
  return {
    error: deckRes.error || cardRes.error || sessionRes.error || folderRes.error,
    rows: {
      decks: deckRes.data,
      cards: cardRes.data,
      sessions: sessionRes.data,
      folders: folderRes.data ?? [],
    },
    profile: profileRes.data ? profileToSettings(profileRes.data) : {},
    // The row as it is, for telling what the account actually holds from
    // what this device would merge it into.
    profileRow: profileRes.data ?? null,
  }
}

/**
 * The preferences the account holds, in the shape `settingsToProfile` sends,
 * so the two can be compared as text.
 *
 * A column that is there but empty reads as null — nobody has chosen, and
 * this device's choice is owed to it. A column that is not there at all — a
 * project before 0009 — reads as whatever this device has: there is nowhere
 * to send it, and counting it as different would send the row again on every
 * read.
 */
const accountPrefs = (row, shape) =>
  JSON.stringify(
    Object.fromEntries(
      Object.keys(shape).map((key) => [key, row && key in row ? (row[key] ?? null) : shape[key]]),
    ),
  )

/** PostgREST refusing a column the table does not have: 0009 not run yet. */
const missingColumn = (error) =>
  error?.code === 'PGRST204' || /could not find the .* column|column .* does not exist/i.test(error?.message ?? '')

async function selectAll(supabase, table) {
  const rows = []
  let total = null
  for (;;) {
    let page = supabase
      .from(table)
      .select('*', total === null ? { count: 'exact' } : undefined)
      .order('id')
      .limit(PAGE_ROWS)
    if (rows.length) page = page.gt('id', rows.at(-1).id)
    const { data, error, count } = await page
    if (error) return { data: null, error }
    // No count in the answer: read on until a page is empty.
    if (total === null) total = count ?? Infinity
    if (!data?.length) return { data: rows, error: null }
    rows.push(...data)
    if (rows.length >= total) return { data: rows, error: null }
  }
}

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
  const { decks, folders, sessions, settings, theme, installLibrary, forgetDeletedElsewhere, say } = useApp()

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

  /*
   * Bumped to read the account again — when the connection comes back after a
   * pull that failed. Keyed into the pull effect alongside the account.
   */
  const [pullTick, setPullTick] = useState(0)

  /*
   * The library as it was loaded, before anything was done to it, and whether
   * this device had anything unsent at that moment.
   *
   * It matters when the first pull fails — a reader opening the app with no
   * signal. Until now nothing was marked unsent without a confirmed pull, so
   * whatever they did offline sat in local storage unmarked, and the next pull
   * that worked installed the account's older copy straight over it.
   *
   * A clean start also makes this the account's last confirmed state as far as
   * this device knows, which is what lets reconnecting send a precise
   * difference — deletions included — rather than only upserts.
   */
  const baseline = useRef(null)

  /** Whether this offline spell has been noted in the notification center. */
  const toldOffline = useRef(false)

  /** When the account was last read and installed, for the refresh below. */
  const lastRead = useRef(0)

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
      /*
       * With no connection at all, the account did not fail and saying so
       * would be untrue. The reader's work is safe on this device, and that is
       * the one thing worth telling them.
       */
      say(
        typeof navigator !== 'undefined' && navigator.onLine === false
          ? t('sync.offline')
          : message,
      )
    },
    [say],
  )

  /**
   * The account has agreed with this browser: these are its rows now.
   *
   * The rows are what the next push is diffed against, in memory. The ids go
   * to storage as well, because the memory does not outlive the page and the
   * record has to — it is what lets the next launch tell a deletion made here
   * from a row added somewhere else.
   */
  const confirm = useCallback((rows, library, uid) => {
    synced.current = rows
    rememberConfirmed(uid, confirmedIds(library))
  }, [])

  /**
   * A push has landed: confirm what the account now holds.
   *
   * Usually that is exactly what was sent. When the account refused some of
   * it — rows another device deleted while this one was open, and still had
   * — it is what was sent without them, and they come off this device too.
   * Confirmed as sent, they would sit here looking synced until the next
   * sign-in, and every edit to them would be refused again without a word.
   */
  const settle = useCallback(
    (sent, library, uid, refused) => {
      if (!anyRefused(refused)) {
        confirm(sent, library, uid)
        return
      }
      confirm(withoutRefusedRows(sent, refused), withoutRefused(library, refused), uid)
      forgetDeletedElsewhere(refused)
      say(deletedElsewhere(refused))
    },
    [confirm, forgetDeletedElsewhere, say],
  )

  /*
   * Preferences — the profile row: name, theme, language, text size and the
   * review settings.
   *
   * `prefs` is what this device has, as of the last render. `prefsAccount` is
   * what the account holds as far as this device knows: read from the row, or
   * written to it — and, until the first read lands, what this device started
   * with, so an unchanged launch offline is not mistaken for a change.
   *
   * A change is marked unsent before it is sent (storageKeys.js), exactly as
   * a library change is, and while the mark is set the account's copy is
   * never installed over this device's: the next read that works sends this
   * device's up instead. Before, a language picked offline was put back by the
   * first read after reconnecting.
   */
  const prefs = useRef({ settings, theme })
  const prefsAccount = useRef(null)
  /** Set once the project turns out not to have 0009's columns yet. */
  const legacyProfile = useRef(false)
  /**
   * When a preference last changed on this device. A read of the account that
   * started before then is older than what is here, even if the change has
   * already gone up and its mark been cleared by the time the read lands.
   */
  const prefsTouched = useRef(0)

  /**
   * Sends this device's preferences, and answers `{ error }`.
   *
   * Awaited, and that is the whole point. A PostgREST query builder is a lazy
   * thenable: `from(...).update(...).eq(...)` builds a request and sends
   * nothing until something calls `then` on it. Written without the await this
   * silently did nothing at all — the row kept its defaults while the browser
   * showed the reader's own settings, and signing in on a second machine
   * pulled those defaults back over them.
   */
  const pushPrefs = useCallback(async (uid) => {
    const supabase = await getSupabase()
    if (!supabase) return { error: new Error('No project configured') }
    const row = settingsToProfile(prefs.current.settings, prefs.current.theme)
    const sent = JSON.stringify(row)
    const update = (values) => supabase.from('profiles').update(values).eq('id', uid)
    let { error } = await update(legacyProfile.current ? withoutPreferenceColumns(row) : row)
    if (error && !legacyProfile.current && missingColumn(error)) {
      // A project that has not run 0009: the name and theme still go up.
      legacyProfile.current = true
      ;({ error } = await update(withoutPreferenceColumns(row)))
    }
    if (error) return { error }
    prefsAccount.current = { userId: uid, json: sent }
    // A change made while this was in flight is still owed, and stays marked.
    const now = JSON.stringify(settingsToProfile(prefs.current.settings, prefs.current.theme))
    if (now === sent) clearPrefsUnsent(uid)
    return { error: null }
  }, [])

  /**
   * What a read of the account, begun at `readAt`, does with the profile row:
   * installs its preferences, unless this device has its own waiting to go up
   * — then sends those instead — or changed them after the read began. Answers
   * what to install.
   */
  const receivePrefs = useCallback(
    (uid, profile, profileRow, readAt) => {
      // Stale: this device's copy is newer, and has been or is being sent.
      if (prefsTouched.current >= readAt) return {}
      const shape = settingsToProfile(prefs.current.settings, prefs.current.theme)
      prefsAccount.current = { userId: uid, json: accountPrefs(profileRow, shape) }
      if (!hasPrefsUnsent(uid)) return profile
      pushPrefs(uid).then(({ error }) => {
        if (error && alive.current) trouble(t('sync.prefsNotSaved'))
      })
      return {}
    },
    [pushPrefs, trouble],
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
        say(t('sync.signedOut'))
      }
      return undefined
    }

    wasSignedInAs.current = userId

    let cancelled = false

    const select = (supabase) => readAccount(supabase, userId)

    const pull = async () => {
      const supabase = await getSupabase()
      if (!supabase || cancelled) return

      const readAt = Date.now()
      let { error, rows, profile, profileRow } = await select(supabase)
      if (error) {
        // The account's own key may already hold a copy from last time, which
        // is what the reader is looking at. Studying carries on offline.
        trouble(t('sync.notRefreshed'))
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
       * Never a plain difference against what was just fetched: that would
       * read every row another machine has added since as a row this one
       * deleted, and send five deletions to tidy up. Everything here is
       * written, and only what the record below proves was deleted here is
       * removed.
       */
      let carriedUp = false
      if (hasUnsent(userId)) {
        const own = readOwnLibrary(userKey(userId))
        const confirmed = own.present ? readConfirmed(userId) : null
        /*
         * Deletions, both ways, now that there is something to tell them
         * apart by.
         *
         * The record is what the account held the last time it agreed with
         * this browser. A row in it that is missing here was deleted here — on
         * a train, say, with the app closed before the connection came back —
         * and is removed. A row in it that is missing from the account was
         * deleted on another device, and is not sent back up. A row another
         * machine added since was never in it, and is left alone, so the rule
         * above still holds: nothing that exists only elsewhere is destroyed.
         */
        const mine = withoutDeletedElsewhere(toRows(own.state, userId), confirmed, rows)
        const gone = removalsSince(confirmed, own.state)
        const carried = {
          folders: { upsert: mine.folders, remove: gone.folders },
          decks: { upsert: mine.decks, remove: gone.decks },
          cards: { upsert: mine.cards, remove: gone.cards },
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
            trouble(t('sync.carryFailed'))
            return
          }
          clearUnsent(userId)

          const again = await select(supabase)
          if (again.error) {
            trouble(t('sync.notRefreshed'))
            return
          }
          if (cancelled || !alive.current) return
          rows = again.rows
          profile = again.profile
          profileRow = again.profileRow
          carriedUp = true
          addNotice(userId, SYNCED)
        }
      }

      const library = fromRows(rows)
      confirm(toRows(library, userId), library, userId)
      installLibrary({ ...library, ...receivePrefs(userId, profile, profileRow, readAt) })
      rememberAccountAvatar(userId, profileRow ? (profileRow.avatar_path ?? null) : undefined, readAt)
      lastRead.current = Date.now()

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
          ? t('sync.upToDate')
          : t('sync.signedIn', { count: rows.decks.length }),
      )
    }

    pull()
    return () => {
      cancelled = true
    }
    // Keyed on the account alone, and now honestly so: the library this reads
    // comes from its key rather than from props, so there is nothing missing
    // from this list. It used to need a lint exception to say the same thing.
  }, [available, userId, installLibrary, say, trouble, pullTick, confirm, receivePrefs])

  /*
   * The latest library, for the flush below to read.
   *
   * The flush is registered once and called from outside React, so a closure
   * over this render's props would send whatever was on screen when it was
   * registered rather than what is there when it runs — which is precisely the
   * change it exists to rescue.
   */
  const latest = useRef({ decks, folders, sessions, userId })
  // Written after each render rather than during one: a ref updated in the
  // render body is a value React may have thrown away and re-derived.
  useEffect(() => {
    latest.current = { decks, folders, sessions, userId }
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

    const {
      decks: nowDecks,
      folders: nowFolders,
      sessions: nowSessions,
      userId: nowUser,
    } = latest.current
    if (!available || !nowUser || !synced.current) return { error: null }

    // Preferences first: signing out takes them off this machine with the library.
    let prefsSent = false
    if (hasPrefsUnsent(nowUser)) {
      const { error } = await pushPrefs(nowUser)
      if (error) {
        say(t('sync.prefsNotSaved'))
        return { error }
      }
      prefsSent = true
    }

    const next = toRows({ decks: nowDecks, folders: nowFolders, sessions: nowSessions }, nowUser)
    const change = changesBetween(synced.current, next)
    if (isEmptyChange(change)) return { error: null, sent: prefsSent }

    const supabase = await getSupabase()
    const { error, refused } = await write(supabase, change)
    if (error) {
      // Said plainly rather than through `trouble`, which is worded for a
      // change that is still safely on this device. After signing out it will
      // not be — the library is about to be swapped away.
      say(t('sync.lastNotSaved'))
      return { error }
    }
    settle(next, { decks: nowDecks, folders: nowFolders }, nowUser, refused)
    clearUnsent(nowUser)
    return { error: null, sent: true }
  }, [available, say, settle, pushPrefs])

  /*
   * Asked when a session ends without going through the sign-out button, to
   * decide whether the account's library may come off this machine.
   *
   * Read from storage rather than from a ref, because the ref only knows about
   * this page. A change lost to a closed tab is outstanding when the browser
   * opens again, and that is exactly the copy that must not be swept up.
   */
  const outstanding = useCallback((id) => {
    const who = id ?? latest.current.userId
    return hasUnsent(who) || hasPrefsUnsent(who)
  }, [])
  useEffect(() => registerPendingSync(flushNow, outstanding), [flushNow, outstanding])

  /**
   * The connection coming back.
   *
   * If the account had been read, all that is owed is whatever the debounce
   * could not send, and a flush sends it. Nothing is read again: going online
   * is not a reason to reload a library that is already right.
   *
   * If it had not — the app was opened offline — the pull is run again. When
   * this device was clean as it started, what it loaded is exactly what the
   * account last confirmed, so it becomes the base and the offline work goes up
   * first as an ordinary difference: a deck deleted on the train is removed,
   * not brought back by the read that follows. A device that was not clean
   * falls to the pull's own carry, which only ever adds.
   */
  useEffect(() => {
    if (!available || !userId) return undefined

    const reconnect = async () => {
      complained.current = false
      const noteSynced = (result) => {
        if (!result?.error && result?.sent && toldOffline.current) addNotice(userId, SYNCED)
        if (!result?.error) toldOffline.current = false
      }
      if (synced.current) {
        noteSynced(await flushNow())
        return
      }
      const b = baseline.current
      if (b && b.userId === userId && b.clean) {
        synced.current = toRows({ decks: b.decks, folders: b.folders, sessions: b.sessions }, userId)
        noteSynced(await flushNow())
      }
      if (alive.current) setPullTick((n) => n + 1)
    }

    window.addEventListener('online', reconnect)
    return () => window.removeEventListener('online', reconnect)
  }, [available, userId, flushNow])

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

  /**
   * Coming back to the app reads the account again, so what changed elsewhere
   * while it was in the background — a card a co-editor added to a shared
   * deck, a deck renamed on the phone — is here without signing in again.
   *
   * Only ever onto a library with nothing of its own outstanding. Installing
   * the account's copy replaces what is on screen, so it is done only when
   * what is on screen is exactly what the account last confirmed: nothing
   * unsent, no push in flight, no difference from the confirmed rows. The same
   * is checked again once the read is back, because the reader may have done
   * something while it was out; then this one stands down, and the next
   * return tries again. Quietly, too: it says nothing and asks nothing, since
   * the reader did not ask for it.
   */
  useEffect(() => {
    if (!available || !userId) return undefined
    let reading = false

    const settled = () => {
      if (!synced.current || busy.current || hasUnsent(userId)) return false
      const now = latest.current
      if (now.userId !== userId) return false
      const here = toRows({ decks: now.decks, folders: now.folders, sessions: now.sessions }, userId)
      return isEmptyChange(changesBetween(synced.current, here))
    }

    const refresh = async () => {
      if (document.visibilityState !== 'visible' || reading) return
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return
      if (Date.now() - lastRead.current < REFRESH_AFTER_MS || !settled()) return
      reading = true
      try {
        const supabase = await getSupabase()
        if (!supabase) return
        const readAt = Date.now()
        const { error, rows, profile, profileRow } = await readAccount(supabase, userId)
        if (error || !alive.current || !settled()) return
        const library = fromRows(rows)
        confirm(toRows(library, userId), library, userId)
        installLibrary({ ...library, ...receivePrefs(userId, profile, profileRow, readAt) })
        rememberAccountAvatar(userId, profileRow ? (profileRow.avatar_path ?? null) : undefined, readAt)
        lastRead.current = Date.now()
      } finally {
        reading = false
      }
    }

    document.addEventListener('visibilitychange', refresh)
    return () => document.removeEventListener('visibilitychange', refresh)
  }, [available, userId, confirm, installLibrary, receivePrefs])

  /** Carries whatever changed since the last confirmed push. */
  useEffect(() => {
    if (!available || !userId) {
      baseline.current = null
      return undefined
    }

    /*
     * No confirmed picture of the account yet — the pull is in flight, or it
     * failed because there is no connection. Nothing can be sent, but a change
     * still has to be recorded as unsent, or the next pull that works will
     * install the account's copy over it.
     *
     * The first run for an account records what was loaded; any run after it
     * with a different library is the reader's own doing.
     */
    if (!synced.current) {
      const b = baseline.current
      if (!b || b.userId !== userId) {
        baseline.current = { userId, decks, folders, sessions, clean: !hasUnsent(userId) }
      } else if (b.decks !== decks || b.folders !== folders || b.sessions !== sessions) {
        markUnsent(userId)
        if (typeof navigator !== 'undefined' && navigator.onLine === false && !toldOffline.current) {
          toldOffline.current = true
          addNotice(userId, SAVED_OFFLINE)
        }
      }
      return undefined
    }

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

      const next = toRows({ decks, folders, sessions }, userId)
      const change = changesBetween(synced.current, next)
      if (isEmptyChange(change)) {
        clearUnsent(userId)
        return
      }

      busy.current = true
      const supabase = await getSupabase()
      const { error, refused } = await write(supabase, change)
      busy.current = false

      if (!alive.current) return
      if (error) {
        // synced.current is left where it was, so the next change retries all
        // of this rather than skipping past it.
        trouble(t('sync.changeNotSaved'))
        if (typeof navigator !== 'undefined' && navigator.onLine === false && !toldOffline.current) {
          toldOffline.current = true
          addNotice(userId, SAVED_OFFLINE)
        }
        return
      }
      settle(next, { decks, folders }, userId, refused)
      clearUnsent(userId)
      complained.current = false
    }, QUIET_MS)

    return () => clearTimeout(pushTimer.current)
  }, [available, userId, decks, folders, sessions, trouble, settle])

  /**
   * A preference changed. Preferences are small and change rarely; no diffing
   * earns its keep — the whole row goes up.
   *
   * Marked unsent first, and sent only once the account has been read: before
   * that there is nothing confirmed to compare with, and the read that follows
   * sends it anyway (`receivePrefs`).
   */
  useEffect(() => {
    prefs.current = { settings, theme }
    if (!available || !userId) {
      prefsAccount.current = null
      return
    }
    const now = JSON.stringify(settingsToProfile(settings, theme))
    const known = prefsAccount.current
    if (!known || known.userId !== userId) {
      // Where this device started, for this account.
      prefsAccount.current = { userId, json: now }
      return
    }
    if (known.json === now) return
    prefsTouched.current = Date.now()
    markPrefsUnsent(userId)
    if (!synced.current) {
      if (typeof navigator !== 'undefined' && navigator.onLine === false && !toldOffline.current) {
        toldOffline.current = true
        addNotice(userId, SAVED_OFFLINE)
      }
      return
    }
    pushPrefs(userId).then(({ error }) => {
      if (error && alive.current) trouble(t('sync.prefsNotSaved'))
    })
  }, [available, userId, settings, theme, trouble, pushPrefs])

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
    // Folders come with their decks, under new ids that the decks follow.
    const rows = toRows(guest, uid, { reissueIds: true })
    const { error } = await write(supabase, {
      folders: { upsert: rows.folders, remove: [] },
      decks: { upsert: rows.decks, remove: [] },
      cards: { upsert: rows.cards, remove: [] },
      sessions: { insert: rows.sessions },
    })
    if (!alive.current) return
    if (error) {
      trouble(t('sync.importFailed'))
      return
    }
    const adopted = fromRows(rows)
    confirm(rows, adopted, uid)
    installLibrary(adopted)
    say(t('sync.broughtIn', { count: rows.decks.length }))
  }, [installLibrary, say, trouble, confirm])

  /** No: remembered, so signing in again does not ask the same thing forever. */
  const declineOffer = useCallback(() => {
    setOffer(null)
    if (latest.current.userId) rememberDeclinedImport(latest.current.userId)
    say(t('sync.leftDecks'))
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
      kicker={t('sync.offer.kicker')}
      title={t('sync.offer.title', { count: offer?.decks ?? 0 })}
      body={t('sync.offer.body')}
      confirmLabel={t('sync.offer.confirm')}
      cancelLabel={t('common.notNow')}
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
  if (!supabase) return { error: new Error('No project configured'), refused: readRefused(null) }
  const { data, error } = await supabase.rpc('sync_library', { payload: toPayload(change) })
  return { error, refused: readRefused(error ? null : data) }
}

/** Said once, about the largest thing that went: a deck's cards go with it. */
function deletedElsewhere({ folders, decks, cards }) {
  const [count, kind] = decks.length
    ? [decks.length, 'decks']
    : folders.length
      ? [folders.length, 'folders']
      : [cards.length, 'cards']
  return t(`sync.deletedElsewhere.${kind}`, { count })
}
