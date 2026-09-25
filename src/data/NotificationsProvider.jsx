import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { AuthContext } from './authContext.js'
import { NotificationsContext } from './notificationsContext.js'
import { useApp } from './useApp.js'
import usePwa from '../pwa/usePwa.js'
import { isDue, isNew } from './scheduler.js'
import { dayKey, minutesToday } from './activity.js'
import { launchWhatsNew } from './whatsNew.js'
import { leaveShare } from './sharing.js'
import { fetchNotifications, listenForNotifications, markNotificationsRead } from './notifications.js'
import {
  addNotice,
  clearPendingRead,
  markRead as markStoredRead,
  mergedNotices,
  readNotices,
  rememberRemote,
  subscribeNotices,
} from './notices.js'

/**
 * The notification center's state: the account's sharing news, and this
 * device's own few notices, as one list.
 *
 * What is shown always comes from the device's store, so the list is there
 * offline exactly as it was last seen. The account is asked when someone signs
 * in, when the connection comes back, when the panel is opened, and — while
 * Gunit is open — the moment the database writes something new, over
 * Realtime. Reads made offline are held and told to the account first thing
 * on reconnecting.
 *
 * Renders nothing of its own; the bell, the panel and the page read this.
 */
export default function NotificationsProvider({ children }) {
  const auth = useContext(AuthContext)
  const ready = auth?.status !== 'loading'
  const userId = auth?.available ? (auth.user?.id ?? null) : null
  const { decks, sessions, settings } = useApp()
  const { update } = usePwa()

  const [store, setStore] = useState(() => readNotices(userId))
  const [storeFor, setStoreFor] = useState(userId)
  if (storeFor !== userId) {
    setStoreFor(userId)
    setStore(readNotices(userId))
  }
  useEffect(
    () =>
      subscribeNotices((who) => {
        if ((who ?? null) === userId) setStore(readNotices(userId))
      }),
    [userId],
  )

  /** Whether the account could not be reached last time it was asked. */
  const [offline, setOffline] = useState(false)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const refresh = useCallback(async () => {
    if (!userId) return
    const waiting = readNotices(userId).pendingRead
    if (waiting === 'all' || waiting.length) {
      const { error } = await markNotificationsRead(waiting === 'all' ? null : waiting)
      if (!error) clearPendingRead(userId)
    }
    const { data, error } = await fetchNotifications()
    if (!alive.current) return
    if (error || !Array.isArray(data)) {
      setOffline(true)
      return
    }
    setOffline(false)
    rememberRemote(userId, data)
  }, [userId])

  // Signing in, and the connection coming back.
  useEffect(() => {
    if (!ready || !userId) return undefined
    // Asked for, not waited on: the list on screen is the stored one meanwhile.
    const again = async () => {
      await refresh()
    }
    again()
    window.addEventListener('online', again)
    return () => window.removeEventListener('online', again)
  }, [ready, userId, refresh])

  // While Gunit is open: the moment the database writes one.
  useEffect(() => {
    if (!ready || !userId) return undefined
    return listenForNotifications(userId, refresh)
  }, [ready, userId, refresh])

  /*
   * This device's own notices. Each is said at most once a day — or once a
   * version — however often the app is opened, and only once it is known
   * whose library this is.
   */
  /*
   * Reviews only: cards already studied whose time has come. New cards count
   * as due for studying, but a deck just written is not news — counted here,
   * adding a card would be what set the reminder off.
   */
  const due = useMemo(
    () =>
      decks.reduce(
        (n, d) =>
          n + d.cards.filter((c) => {
            const entry = d.schedule?.[c.id]
            return entry && !isNew(entry) && isDue(entry)
          }).length,
        0,
      ),
    [decks],
  )
  useEffect(() => {
    if (!ready || due <= 0) return
    const today = dayKey(Date.now())
    addNotice(userId, {
      kind: 'study-due',
      title: 'Cards to review',
      message: `You have ${due} ${due === 1 ? 'card' : 'cards'} due for review.`,
      action: { type: 'navigate', to: '/', label: 'Start reviewing' },
      once: `due:${today}`,
    })
  }, [ready, userId, due])

  const goal = settings.goalMinutes
  const doneToday = useMemo(() => minutesToday(sessions), [sessions])
  useEffect(() => {
    if (!ready || !goal || doneToday < goal) return
    const today = dayKey(Date.now())
    addNotice(userId, {
      kind: 'study-goal',
      title: 'Goal reached',
      message: `You completed today’s study goal of ${goal} minutes.`,
      once: `goal:${today}`,
    })
  }, [ready, userId, doneToday, goal])

  useEffect(() => {
    if (!ready) return
    const { version, entries } = launchWhatsNew()
    if (!entries.length) return
    addNotice(userId, {
      kind: 'whats-new',
      title: `Gunit v${version}`,
      message: 'New features are available. Check out What’s New.',
      action: { type: 'whats-new', label: 'See what’s new' },
      once: `whatsnew:${version}`,
    })
  }, [ready, userId])

  /*
   * A new version waiting for a reload is news only while it waits, so it is
   * never stored: once the reader reloads into it there is nothing to say.
   */
  const [updateRead, setUpdateRead] = useState(false)

  const items = useMemo(() => {
    const merged = mergedNotices(store)
    if (!update) return merged
    return [
      {
        id: 'update-ready',
        source: 'device',
        kind: 'update',
        // First, and with no time: it is true now, for as long as it waits.
        createdAt: Number.POSITIVE_INFINITY,
        read: updateRead,
        data: {
          title: 'Update ready',
          message: 'A new version of Gunit is ready. Reload to start using it.',
          action: { type: 'reload', label: 'Reload' },
        },
      },
      ...merged,
    ]
  }, [store, update, updateRead])

  const unread = items.filter((n) => !n.read).length

  const markRead = useCallback(
    (id) => {
      if (id === 'update-ready') {
        setUpdateRead(true)
        return
      }
      markStoredRead(userId, [id])
      if (userId) refresh()
    },
    [userId, refresh],
  )

  const markAllRead = useCallback(() => {
    setUpdateRead(true)
    markStoredRead(userId, null)
    if (userId) refresh()
  }, [userId, refresh])

  /** Declining a share is leaving it: the existing way to hand access back. */
  const decline = useCallback(
    async (item) => {
      const { error } = await leaveShare(item.data.share_id)
      if (error) return error
      markStoredRead(userId, [item.id])
      await refresh()
      return null
    },
    [userId, refresh],
  )

  const value = useMemo(
    () => ({ items, unread, offline, signedIn: Boolean(userId), refresh, markRead, markAllRead, decline, applyUpdate: update }),
    [items, unread, offline, userId, refresh, markRead, markAllRead, decline, update],
  )

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
}
