import { DECKS, uid } from './seed.js'
import { grade } from './scheduler.js'
import { parseLegacyStudied } from './activity.js'

/**
 * Turning whatever is in storage into state the app can render.
 *
 * Pure and clock-injectable, so the migration paths can be tested without a
 * browser. The guiding rule is that a reader's own decks are worth more than
 * tidiness: bad data is repaired where it can be and dropped where it cannot,
 * but one unusable deck never costs someone the rest of their library.
 */

export const DEFAULT_SETTINGS = {
  cardsPer: 20,
  autoReveal: false,
  shuffleFirst: false,
  name: 'Mara Kessler',
  email: 'mara.kessler@university.edu',
  goalMinutes: 20,
}

export const DEFAULT_STATE = {
  decks: DECKS,
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
 */
export const progressOf = (deck) => {
  if (!deck.cards.length) return 0
  const known = deck.cards.filter((c) => {
    const last = deck.schedule?.[c.id]?.last
    return last && last !== 'again'
  }).length
  return known / deck.cards.length
}

/**
 * Brings a deck up to the current shape: every card carries an id (schedule
 * entries are keyed by it, so indices shifting on delete can't corrupt them),
 * and every deck carries a schedule map.
 *
 * Three older shapes are migrated in place:
 *   - a bare `progress` number (the seed decks) becomes concrete "good" grades
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
  }

  try {
    return normalizeDeck(repaired, now)
  } catch {
    return null
  }
}

const isSession = (s) => s && typeof s === 'object' && typeof s.at === 'number'

/**
 * Always returns renderable state. Decks are revived one at a time so a single
 * bad entry costs only itself, never the whole library.
 */
export function normalizeState(state, now = Date.now()) {
  const source = state && typeof state === 'object' ? state : {}
  const decks = Array.isArray(source.decks) ? source.decks : DEFAULT_STATE.decks

  return {
    theme: source.theme === 'dark' ? 'dark' : 'light',
    settings: { ...DEFAULT_SETTINGS, ...(source.settings ?? {}) },
    sessions: Array.isArray(source.sessions) ? source.sessions.filter(isSession) : [],
    decks: decks.map((d) => reviveDeck(d, now)).filter(Boolean),
  }
}

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
