/**
 * Notifications as this device keeps them, one store per identity:
 * `gunit.notices.guest`, `gunit.notices.<user id>`.
 *
 *   local        news about this device — cards due, today's goal met, changes
 *                synced, a new version — made here and never sent anywhere
 *   remote       the account's own notifications, as last read, so they can
 *                be shown with no connection
 *   pendingRead  ids of account notifications marked read while offline, or
 *                'all', waiting to be told to the account
 *   pendingClear ids of account notifications cleared here, waiting to be
 *                removed from the account
 *   marks        what has already been said, so a reminder is said once a day
 *                and What's New once a version
 *
 * Deliberately few. Nothing here is made for ordinary edits: creating,
 * renaming or opening a deck is not news to the person who just did it.
 *
 * Kept outside React so the sync can say "your changes went up" without
 * knowing where it will be shown. Taken off the machine with the account's
 * library on sign-out.
 */
import { noticesKey } from './storageKeys.js'

const MAX_LOCAL = 40
const MAX_MARKS = 30

const empty = () => ({ local: [], remote: [], pendingRead: [], pendingClear: [], marks: {} })

const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v)

export function readNotices(userId) {
  try {
    const raw = JSON.parse(localStorage.getItem(noticesKey(userId)) ?? 'null')
    if (!isObject(raw)) return empty()
    return {
      local: Array.isArray(raw.local) ? raw.local.filter(isObject) : [],
      remote: Array.isArray(raw.remote) ? raw.remote.filter(isObject) : [],
      pendingRead: raw.pendingRead === 'all' ? 'all' : Array.isArray(raw.pendingRead) ? raw.pendingRead : [],
      pendingClear: Array.isArray(raw.pendingClear) ? raw.pendingClear.filter((id) => typeof id === 'string') : [],
      marks: isObject(raw.marks) ? raw.marks : {},
    }
  } catch {
    return empty()
  }
}

const listeners = new Set()
export const subscribeNotices = (listener) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function update(userId, change) {
  const next = change(readNotices(userId))
  try {
    localStorage.setItem(noticesKey(userId), JSON.stringify(next))
  } catch {
    // Storage refused: the notice is lost, which is the cheapest thing to lose.
  }
  for (const listener of listeners) listener(userId)
  return next
}

/**
 * Says something, unless it has been said already. `once` is the mark that
 * stops it being said again ("due:2026-09-26"); `group` replaces the previous
 * unread notice of the same group, so "saved locally" and "synced" do not pile
 * up — the newer one is the truth.
 */
export function addNotice(userId, { kind, title, message, action = null, once = null, group = null, now = Date.now() }) {
  return update(userId, (s) => {
    if (once && s.marks[once]) return s
    const kept = group ? s.local.filter((n) => !(n.group === group && !n.readAt)) : s.local
    const notice = {
      id: `local-${now}-${Math.random().toString(36).slice(2, 8)}`,
      kind,
      title,
      message,
      action,
      group,
      createdAt: now,
      readAt: null,
    }
    const marks = once ? { ...s.marks, [once]: now } : s.marks
    const trimmed = Object.fromEntries(Object.entries(marks).sort((a, b) => b[1] - a[1]).slice(0, MAX_MARKS))
    return { ...s, local: [notice, ...kept].slice(0, MAX_LOCAL), marks: trimmed }
  })
}

/** Whether something has been said already. */
export const hasSaid = (userId, once) => Boolean(readNotices(userId).marks[once])

/**
 * The account's list, as it just came back. Reads still waiting are kept
 * read, and anything cleared here stays cleared, whatever the account says.
 */
export function rememberRemote(userId, rows, now = Date.now()) {
  return update(userId, (s) => {
    const waiting = s.pendingRead === 'all' ? null : new Set(s.pendingRead)
    const cleared = new Set(s.pendingClear)
    const remote = (rows ?? []).filter((n) => !cleared.has(n.id)).map((n) =>
      n.read_at || !(waiting === null || waiting.has(n.id)) ? n : { ...n, read_at: new Date(now).toISOString() },
    )
    return { ...s, remote }
  })
}

/**
 * Marks read here at once, whatever the connection; account notifications
 * are also queued to tell the account. `ids` null is everything.
 */
export function markRead(userId, ids, now = Date.now()) {
  return update(userId, (s) => {
    const all = ids === null
    const wanted = new Set(ids ?? [])
    const stamp = new Date(now).toISOString()
    const local = s.local.map((n) => (!n.readAt && (all || wanted.has(n.id)) ? { ...n, readAt: now } : n))
    const remote = s.remote.map((n) => (!n.read_at && (all || wanted.has(n.id)) ? { ...n, read_at: stamp } : n))
    const remoteIds = s.remote.filter((n) => wanted.has(n.id)).map((n) => n.id)
    let pendingRead = s.pendingRead
    if (all) pendingRead = 'all'
    else if (pendingRead !== 'all' && remoteIds.length) pendingRead = [...new Set([...pendingRead, ...remoteIds])]
    return { ...s, local, remote, pendingRead }
  })
}

/** The account has been told; nothing waits any more. */
export const clearPendingRead = (userId) => update(userId, (s) => ({ ...s, pendingRead: [] }))

/**
 * Takes notifications out of the list at once, whatever the connection:
 * these ids, or everything on it with `null`. Account notifications are
 * queued to be removed from the account too — by id, always, even for "clear
 * all": one that arrived while this device was offline has not been seen,
 * and clearing what is on screen should not take it with it.
 */
export function clearNotices(userId, ids) {
  return update(userId, (s) => {
    const gone = new Set(ids ?? [...s.local.map((n) => n.id), ...s.remote.map((n) => n.id)])
    const remoteIds = s.remote.filter((n) => gone.has(n.id)).map((n) => n.id)
    return {
      ...s,
      local: s.local.filter((n) => !gone.has(n.id)),
      remote: s.remote.filter((n) => !gone.has(n.id)),
      pendingClear: [...new Set([...s.pendingClear, ...remoteIds])],
    }
  })
}

/** These have gone from the account; nothing is waiting on them any more. */
export const clearPendingClear = (userId, ids) =>
  update(userId, (s) => ({ ...s, pendingClear: s.pendingClear.filter((id) => !ids.includes(id)) }))

/** Account notifications (from the server) and local ones, as one list, newest first. */
export function mergedNotices(store) {
  const remote = store.remote.map((n) => ({
    id: n.id,
    source: 'account',
    kind: n.kind,
    createdAt: Date.parse(n.created_at) || 0,
    read: Boolean(n.read_at),
    data: n,
  }))
  const local = store.local.map((n) => ({
    id: n.id,
    source: 'device',
    kind: n.kind,
    createdAt: n.createdAt,
    read: Boolean(n.readAt),
    data: n,
  }))
  return [...remote, ...local].sort((a, b) => b.createdAt - a.createdAt)
}
