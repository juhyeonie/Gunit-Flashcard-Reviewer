/**
 * What this browser keeps about decks shared with its reader.
 *
 * Kept apart from the reader's own library, under its own key, for the same
 * reason the database keeps it apart: a shared deck is somebody else's. Its
 * cards are not the reader's to sync, delete or export, so they never enter
 * the library that LibrarySync carries to the account. What *is* the reader's
 * is their progress on those cards, and that is what this holds, by card id:
 *
 *   progress   the reader's own schedule for each shared card they've studied
 *   studied    when they last studied each shared deck
 *   pending    card ids whose progress has not reached the account yet
 *   cache      what each link last returned, so a deck opened once can be
 *              studied again with no connection
 *   copies     shared deck id -> the reader's own copy, from Add to My Gunit
 *
 * One store per identity — `gunit.shared.guest`, `gunit.shared.<user id>` —
 * like the libraries, and taken off the machine with the account's library
 * when the reader signs out.
 *
 * Everything here is pure: state in, state out. The page that holds it
 * decides when to read and write storage.
 */
import { grade as gradeEntry, newEntry } from './scheduler.js'
import { progressOf } from './normalize.js'
import { entryFromRow } from './sharing.js'

export { sharedKey } from './storageKeys.js'

export const EMPTY_SHARED = Object.freeze({ progress: {}, studied: {}, pending: [], cache: {}, copies: {} })

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

/** Whatever is under the key, made safe to read. Anything unreadable is empty. */
export function readShared(key) {
  let raw = null
  try {
    raw = JSON.parse(localStorage.getItem(key) ?? 'null')
  } catch {
    raw = null
  }
  if (!isObject(raw)) return { ...EMPTY_SHARED }
  return {
    progress: isObject(raw.progress) ? raw.progress : {},
    studied: isObject(raw.studied) ? raw.studied : {},
    pending: Array.isArray(raw.pending) ? raw.pending.filter((id) => typeof id === 'string') : [],
    cache: isObject(raw.cache) ? raw.cache : {},
    copies: isObject(raw.copies) ? raw.copies : {},
  }
}

export function writeShared(key, state) {
  try {
    localStorage.setItem(key, JSON.stringify(state))
  } catch {
    // Best effort, like the library: studying still works for this session.
  }
}

/** Keeps what a link returned, for opening it again offline. */
export const remember = (state, token, answer, now = Date.now()) => ({
  ...state,
  cache: { ...state.cache, [token]: { answer, at: now } },
})

/** Drops a link that no longer opens, so it is not studied from a stale copy. */
export const forget = (state, token) => {
  if (!state.cache[token]) return state
  const { [token]: _gone, ...cache } = state.cache
  return { ...state, cache }
}

/**
 * The decks a link returned, in the shape the study pages read: the owner's
 * content, with this reader's own schedule laid over it and nobody else's.
 */
export function studyDecks(answer, state) {
  return (answer?.decks ?? []).map((deck) => {
    const cards = [...(deck.cards ?? [])]
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((c) => ({ id: c.id, front: c.front, back: c.back }))
    const schedule = {}
    for (const card of cards) {
      if (state.progress[card.id]) schedule[card.id] = state.progress[card.id]
    }
    const shaped = {
      id: deck.id,
      title: deck.title,
      subject: deck.subject,
      desc: deck.description ?? '',
      folderId: null,
      studiedAt: state.studied[deck.id] ?? null,
      updatedAt: deck.updated_at ?? null,
      cards,
      schedule,
    }
    return { ...shaped, progress: progressOf(shaped) }
  })
}

const pendingWith = (pending, ids) => [...new Set([...pending, ...ids])]

/** Grades folded into the reader's own schedule, exactly as `recordGrades` does. */
export function applyGrades(state, deckId, grades, now = Date.now()) {
  const progress = { ...state.progress }
  for (const [cardId, g] of Object.entries(grades)) progress[cardId] = gradeEntry(progress[cardId], g, now)
  return {
    ...state,
    progress,
    studied: { ...state.studied, [deckId]: now },
    pending: pendingWith(state.pending, Object.keys(grades)),
  }
}

/** One card's schedule put back, or taken out with `null`: Review's undo. */
export function setEntry(state, cardId, entry) {
  const { [cardId]: _replaced, ...rest } = state.progress
  return {
    ...state,
    progress: entry ? { ...rest, [cardId]: entry } : rest,
    pending: pendingWith(state.pending, [cardId]),
  }
}

/** Suspending a shared card is the reader's choice, and only theirs. */
export function setSuspended(state, cardId, suspended) {
  const { suspended: _was, ...kept } = state.progress[cardId] ?? newEntry()
  const entry = suspended ? { ...kept, suspended: true } : kept
  return setEntry(state, cardId, entry.last || entry.suspended ? entry : null)
}

export const clearPending = (state, ids) => ({
  ...state,
  pending: state.pending.filter((id) => !ids.includes(id)),
})

/**
 * The account's copy of this reader's progress, laid under what is here.
 * A card still waiting to go up keeps the local entry: it is newer.
 */
export function mergeProgress(state, rows) {
  const waiting = new Set(state.pending)
  const progress = { ...state.progress }
  for (const row of rows ?? []) {
    if (waiting.has(row.card_id)) continue
    const entry = entryFromRow(row)
    if (entry) progress[row.card_id] = entry
    else delete progress[row.card_id]
  }
  return { ...state, progress }
}

export const rememberCopy = (state, sharedDeckId, ownDeckId) => ({
  ...state,
  copies: { ...state.copies, [sharedDeckId]: ownDeckId },
})
