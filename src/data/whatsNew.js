/**
 * Whether this launch of Gunit should say what is new, and what.
 *
 * The version is the one this code was built as — `VITE_APP_VERSION`, from
 * package.json — so it is always the version actually running. A new version
 * downloaded by the service worker and waiting for a reload is not running
 * yet, and is not announced: the code that would announce it is not the code
 * on screen. Reloading into it is what makes it this version, and then it is.
 *
 * What was last seen is one key in local storage, for the whole device: the
 * notes are about the app, not about whose library is open, so a guest and
 * every account on this browser share it, and signing in or out neither asks
 * the network nor changes the answer.
 *
 * A browser that has never run Gunit is told nothing. There is nothing new to
 * someone for whom everything is new; its version is recorded as seen, and the
 * next release is the first they hear about.
 */
import { RELEASE_NOTES } from './releaseNotes.js'

export const SEEN_KEY = 'gunit.whatsNew.seen'

export const CATEGORIES = [
  { key: 'new', label: 'New' },
  { key: 'improved', label: 'Improved' },
  { key: 'fixed', label: 'Fixed' },
  { key: 'removed', label: 'Removed' },
]

/** "1.10.0" after "1.9.2". Anything that is not a version sorts before them all. */
export function compareVersions(a, b) {
  const parts = (v) => String(v ?? '').split(/[.+-]/).slice(0, 3).map((n) => Number.parseInt(n, 10))
  const [x, y] = [parts(a), parts(b)]
  for (let i = 0; i < 3; i += 1) {
    const [p, q] = [Number.isNaN(x[i]) ? -1 : x[i], Number.isNaN(y[i]) ? -1 : y[i]]
    if (p !== q) return p < q ? -1 : 1
  }
  return 0
}

/** An entry's lists, cleaned: only the categories that have something in them. */
export function sectionsOf(entry) {
  return CATEGORIES.map(({ key, label }) => ({
    key,
    label,
    items: (Array.isArray(entry?.[key]) ? entry[key] : [])
      .map((item) => (typeof item === 'string' ? { title: item, detail: null } : item))
      .filter((item) => item && typeof item.title === 'string' && item.title.trim()),
  })).filter((section) => section.items.length > 0)
}

/**
 * The entries to show on this launch, newest first: every version after the
 * one last seen, up to the one running, that has something to say. With no
 * record at all — a reader from before this existed — just the running one's.
 */
export function unseenNotes(notes, current, seen) {
  return notes
    .filter((entry) => compareVersions(entry.version, current) <= 0)
    .filter((entry) => (seen ? compareVersions(entry.version, seen) > 0 : compareVersions(entry.version, current) === 0))
    .filter((entry) => sectionsOf(entry).length > 0)
    .sort((a, b) => compareVersions(b.version, a.version))
}

const read = (storage, key) => {
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

/** Remembers this version as seen. Best effort, like everything in storage. */
export function markSeen(version, storage = globalThis.localStorage) {
  try {
    storage.setItem(SEEN_KEY, version)
  } catch {
    // Storage refused: then it is asked again next launch, which is harmless.
  }
}

/** Has this browser ever run Gunit? Anything of ours in storage says it has. */
function hasRunBefore(storage) {
  try {
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i)
      if (key && key.startsWith('gunit.') && key !== SEEN_KEY) return true
    }
  } catch {
    // Unreadable storage: treat as new, and say nothing.
  }
  return false
}

/**
 * The decision for this launch. Pure apart from recording a first visit as
 * seen; everything it depends on is passed in, so it can be asked about any
 * version and any storage.
 */
export function decide({ version, notes = RELEASE_NOTES, storage = globalThis.localStorage }) {
  if (!version || !storage) return { version, entries: [] }
  const seen = read(storage, SEEN_KEY)
  if (seen && compareVersions(seen, version) >= 0) return { version, entries: [] }
  if (!seen && !hasRunBefore(storage)) {
    markSeen(version, storage)
    return { version, entries: [] }
  }
  const entries = unseenNotes(notes, version, seen)
  // Nothing to announce for these versions: remembered, so older notes are
  // not brought up again by a later release that has none of its own.
  if (!entries.length) markSeen(version, storage)
  return { version, entries }
}

/*
 * Taken once per page load, and before the store writes anything: a first
 * visit is told apart from a returning reader by what is already in storage,
 * and a moment later the store has written the guest library there too.
 */
let launch = null
const listeners = new Set()
const announce = () => {
  for (const listener of listeners) listener()
}

export const subscribeWhatsNew = (listener) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function launchWhatsNew() {
  launch ??= decide({ version: import.meta.env.VITE_APP_VERSION })
  return launch
}

/**
 * Shows the running version's notes again, when the reader asks for them —
 * from its notification. Nothing about what was seen changes.
 */
export function reopenWhatsNew(notes = RELEASE_NOTES) {
  const version = import.meta.env.VITE_APP_VERSION
  launch = { version, entries: unseenNotes(notes, version, null) }
  announce()
}

/** Read: remembered for good, and not shown again in this page load either. */
export function dismissWhatsNew(version) {
  markSeen(version)
  launch = { version, entries: [] }
  announce()
}

/** For tests: a fresh page load. */
export const resetLaunch = () => {
  launch = null
  announce()
}
