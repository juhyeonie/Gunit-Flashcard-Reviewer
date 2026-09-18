import { DECKS, EXAMPLE_DECK, RETIRED_DEFAULT_DECKS, uid } from './seed.js'
import { grade, isSuspended } from './scheduler.js'
import { parseLegacyStudied } from './activity.js'

/**
 * Turning whatever is in storage into state the app can render.
 *
 * Pure and clock-injectable, so the migration paths can be tested without a
 * browser. The guiding rule is that a reader's own decks are worth more than
 * tidiness: bad data is repaired where it can be and dropped where it cannot,
 * but one unusable deck never costs someone the rest of their library.
 */

/*
 * No `email` here any more. It was a preference nothing read, offered as
 * "used for the weekly study summary" — a summary this app has never sent. It
 * now also sat directly above the real address of a signed-in account, which
 * made two of them, one of which was fiction.
 *
 * A value someone typed into it is left alone: stored settings are spread over
 * these defaults, so the key survives in their storage even though nothing
 * seeds or shows it.
 */
export const DEFAULT_SETTINGS = {
  cardsPer: 20,
  autoReveal: false,
  shuffleFirst: false,
  /*
   * Nobody's name, because nobody has given one yet.
   *
   * This was 'Mara Kessler' — a name from the prototype's mockups, which meant
   * every new reader was greeted by a stranger and found her in their own
   * settings. A blank is honest: the greeting drops the name rather than
   * inventing one, and the field is empty until somebody fills it in.
   */
  name: '',
  goalMinutes: 20,
}

export const DEFAULT_STATE = {
  decks: DECKS,
  // One level, and optional: a deck is in one folder or in none.
  folders: [],
  theme: 'light',
  // When study actually happened. Drives the streak, the weekly chart and the
  // daily goal — all of which were hardcoded before this existed.
  sessions: [],
  settings: DEFAULT_SETTINGS,
}

/**
 * A card counts as known once its last grade was anything other than "again".
 * Cards never reviewed are not known, so a deck's progress reflects real
 * coverage rather than the fact that a session happened to finish.
 *
 * Suspended cards are left out of both halves of the fraction. They are the
 * cards a reader has decided not to study, and counting them as unknown would
 * put 100% permanently out of reach for anyone who ever used the feature.
 */
export const progressOf = (deck) => {
  const counted = deck.cards.filter((c) => !isSuspended(deck.schedule?.[c.id]))
  if (!counted.length) return 0
  const known = counted.filter((c) => {
    const last = deck.schedule?.[c.id]?.last
    return last && last !== 'again'
  }).length
  return known / counted.length
}

/**
 * Brings a deck up to the current shape: every card carries an id (schedule
 * entries are keyed by it, so indices shifting on delete can't corrupt them),
 * and every deck carries a schedule map.
 *
 * Three older shapes are migrated in place:
 *   - a bare `progress` number (the old default decks) becomes concrete "good" grades
 *   - a flat `outcomes` map becomes real schedule entries with due dates
 *   - a `studied` phrase ("2 hours ago") becomes a `studiedAt` timestamp
 *
 * After any of them, progress is always derived and never stored independently.
 */
export const normalizeDeck = (deck, now = Date.now()) => {
  const cards = deck.cards.map((c) => (c.id ? c : { ...c, id: uid() }))

  let schedule = deck.schedule
  if (!schedule) {
    schedule = {}
    if (deck.outcomes) {
      Object.entries(deck.outcomes).forEach(([cardId, g]) => {
        schedule[cardId] = grade(undefined, g, now)
      })
    } else {
      const knownCount = Math.round((deck.progress ?? 0) * cards.length)
      cards.slice(0, knownCount).forEach((c) => {
        schedule[c.id] = grade(undefined, 'good', now)
      })
    }
  }

  // Recency is a timestamp now: the old string never aged, so a deck saved as
  // "Just now" still claimed that weeks later, and it could not be sorted on.
  const studiedAt = deck.studiedAt ?? parseLegacyStudied(deck.studied, now)

  const { outcomes: _legacyOutcomes, studied: _legacyStudied, ...rest } = deck
  const next = { ...rest, cards, schedule, studiedAt }
  return { ...next, progress: progressOf(next) }
}

const isCard = (c) => c && typeof c === 'object' && typeof c.front === 'string'

/**
 * Repairs one deck, or returns null if it is beyond saving.
 *
 * A deck missing its cards array is still a deck the reader named, so it comes
 * back empty rather than disappearing. Only something with no usable identity
 * is dropped.
 */
export const reviveDeck = (deck, now = Date.now()) => {
  if (!deck || typeof deck !== 'object' || Array.isArray(deck)) return null
  if (typeof deck.id !== 'string' || !deck.id) return null

  const repaired = {
    ...deck,
    title: typeof deck.title === 'string' && deck.title ? deck.title : 'Untitled deck',
    subject: typeof deck.subject === 'string' ? deck.subject : 'General',
    desc: typeof deck.desc === 'string' ? deck.desc : '',
    cards: Array.isArray(deck.cards) ? deck.cards.filter(isCard) : [],
    schedule: deck.schedule && typeof deck.schedule === 'object' ? deck.schedule : undefined,
    // Every deck saved before folders existed arrives here with none, and
    // null is what "ungrouped" means. Whether a named folder still exists is
    // checked in normalizeState, which can see the folders.
    folderId: typeof deck.folderId === 'string' && deck.folderId ? deck.folderId : null,
  }

  try {
    return normalizeDeck(repaired, now)
  } catch {
    return null
  }
}

const isSession = (s) => s && typeof s === 'object' && typeof s.at === 'number'

/** The longest folder name kept; the database holds the same limit. */
export const FOLDER_NAME_MAX = 80

/**
 * One folder, repaired or dropped.
 *
 * A folder is only a name and an id — the decks point at it, not the other
 * way round — so there is nothing inside one to lose. One with no usable id or
 * no name is dropped, and any deck that pointed at it falls back to ungrouped.
 */
export const reviveFolder = (folder) => {
  if (!folder || typeof folder !== 'object' || Array.isArray(folder)) return null
  if (typeof folder.id !== 'string' || !folder.id) return null
  const name = typeof folder.name === 'string' ? folder.name.trim().slice(0, FOLDER_NAME_MAX) : ''
  if (!name) return null
  return { id: folder.id, name }
}

/**
 * The folders, cleaned, and every deck's folderId checked against them.
 *
 * A deck pointing at a folder that is not there — deleted on another device, or
 * lost from a hand-edited backup — is not an error to report. It is simply
 * ungrouped again, which is where a deck with no folder lives.
 */
export const fileDecks = (decks, folders) => {
  const known = new Set(folders.map((f) => f.id))
  return decks.map((d) =>
    d.folderId === null || known.has(d.folderId) ? d : { ...d, folderId: null },
  )
}

const reviveFolders = (list) => {
  const seen = new Set()
  const folders = []
  for (const entry of Array.isArray(list) ? list : []) {
    const folder = reviveFolder(entry)
    if (!folder || seen.has(folder.id)) continue
    seen.add(folder.id)
    folders.push(folder)
  }
  return folders
}

/*
 * A session logged before sessions carried ids is given one, once, here. It is
 * written back with the rest of the library on the first render, so it is the
 * same id on every push after — which is what stops the sync inserting the same
 * session again each time.
 */
const withId = (s) => (typeof s.id === 'string' && s.id ? s : { ...s, id: uid() })

/**
 * Always returns renderable state. Decks are revived one at a time so a single
 * bad entry costs only itself, never the whole library.
 */
/*
 * The mock name, cleared once on the way in.
 *
 * Every browser that ran an earlier version has 'Mara Kessler' stored, so
 * changing the default alone would fix this for nobody who has already opened
 * Gunit. It is only ever cleared when it matches exactly, and it was never
 * typed by anyone — it arrived as a default. Somebody who really is called
 * that can put it back, once.
 */
const MOCK_NAME = 'Mara Kessler'
const forgetMockName = (settings) => (settings?.name === MOCK_NAME ? { name: '' } : {})

export function normalizeState(state, now = Date.now()) {
  const source = state && typeof state === 'object' ? state : {}
  const decks = Array.isArray(source.decks) ? source.decks : DEFAULT_STATE.decks
  const folders = reviveFolders(source.folders)

  return {
    theme: source.theme === 'dark' ? 'dark' : 'light',
    settings: { ...DEFAULT_SETTINGS, ...(source.settings ?? {}), ...forgetMockName(source.settings) },
    sessions: Array.isArray(source.sessions) ? source.sessions.filter(isSession).map(withId) : [],
    folders,
    decks: fileDecks(decks.map((d) => reviveDeck(d, now)).filter(Boolean), folders),
  }
}

/*
 * Retiring the six decks every visitor used to start with.
 *
 * Changing the default only changes what an empty browser is given. Every
 * browser that opened an earlier version already has the six stored, and
 * stored decks are what the app reads — so without this, nobody who had ever
 * visited would see the change.
 *
 * The hard part is not removing them; it is being sure a deck is still the
 * default and not somebody's work. A reader may have studied one, renamed it,
 * added their own cards to it. Those are theirs now and are kept. Only a deck
 * that is exactly what was handed out — same words, same cards, and no study
 * of any kind — is taken away.
 */

const sameCards = (cards, original) =>
  cards.length === original.length &&
  cards.every((c, i) => c.front === original[i].front && c.back === original[i].back)

/**
 * Whether a stored schedule is still the one the default was born with.
 *
 * The old decks carried a made-up `progress`, which normalizeDeck turned into
 * one "good" grade on each of the first N cards. Anything a reader does leaves
 * a different shape: a second review raises `reps`, "again" records a lapse, a
 * newly studied card adds an entry, suspending sets a flag, and a reset clears
 * the lot. Grades are saved as they happen rather than at the end of a
 * session, so this is the check that catches a review abandoned half way.
 */
const untouchedSchedule = (deck, original) => {
  const knownCount = Math.round((original.progress ?? 0) * original.cards.length)
  const expected = deck.cards.slice(0, knownCount).map((c) => c.id)
  const entries = Object.entries(deck.schedule ?? {})

  return (
    entries.length === expected.length &&
    entries.every(
      ([cardId, e]) =>
        expected.includes(cardId) &&
        e?.last === 'good' &&
        e.reps === 1 &&
        e.lapses === 0 &&
        !e.suspended,
    )
  )
}

const RETIRED = new Map(RETIRED_DEFAULT_DECKS.map((d) => [d.id, d]))

export const isRetiredDefault = (deck, sessions = []) => {
  const original = RETIRED.get(deck?.id)
  if (!original) return false
  return (
    deck.title === original.title &&
    deck.subject === original.subject &&
    deck.desc === original.desc &&
    sameCards(deck.cards, original.cards) &&
    untouchedSchedule(deck, original) &&
    !sessions.some((s) => s.deckId === deck.id)
  )
}

/**
 * Takes the untouched old defaults out of a guest library, and puts the
 * example deck in their place.
 *
 * The example is added only in the same pass that removed something, which is
 * what makes this safe to run on every load: once the old decks are gone there
 * is nothing left to match, so a reader who later deletes the example deck
 * does not find it back the next day.
 *
 * Pure, and for the guest library only. An account's decks carry database
 * ids and can never match these, but the caller does not rely on that.
 */
export function retireDefaultDecks(state, now = Date.now()) {
  const kept = state.decks.filter((d) => !isRetiredDefault(d, state.sessions))
  if (kept.length === state.decks.length) return state

  const hasExample = kept.some((d) => d.id === EXAMPLE_DECK.id)
  return {
    ...state,
    decks: hasExample ? kept : [normalizeDeck(EXAMPLE_DECK, now), ...kept],
  }
}

/**
 * Whether a deck is the example exactly as it was handed out.
 *
 * Studying it does not count as changing it: progress on a tutorial is not
 * something anyone needs carried into an account. Editing its words or its
 * cards does, because then some of it is the reader's.
 */
export const isUntouchedExample = (deck) =>
  deck?.id === EXAMPLE_DECK.id &&
  deck.title === EXAMPLE_DECK.title &&
  deck.subject === EXAMPLE_DECK.subject &&
  deck.desc === EXAMPLE_DECK.desc &&
  sameCards(deck.cards, EXAMPLE_DECK.cards)

/**
 * Parses a stored payload.
 *
 * `ok` is false when the payload could not be read at all — the caller keeps
 * the original bytes instead of overwriting them, so nothing is lost for good.
 */
export function parseStoredState(raw, now = Date.now()) {
  if (!raw) return { state: normalizeState(DEFAULT_STATE, now), ok: true }
  try {
    return { state: normalizeState(JSON.parse(raw), now), ok: true }
  } catch {
    return { state: normalizeState(DEFAULT_STATE, now), ok: false }
  }
}
