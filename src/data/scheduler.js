/**
 * Spaced-repetition scheduling — an SM-2 variant with the prototype's three
 * grades (Again / Good / Easy) rather than SM-2's six.
 *
 * Everything here is pure: given a card's current schedule entry and a grade,
 * it returns the next entry. Nothing reads state or the clock unless `now` is
 * passed in, so the whole module can be exercised without a browser.
 *
 * Intervals are held in MINUTES so a ten-minute relearning step and a
 * six-month mature interval use one unit.
 */

export const MINUTE = 1
export const HOUR = 60
export const DAY = 1440

export const GRADES = ['again', 'good', 'easy']

/**
 * First interval for a card that is new, or that has just lapsed. These match
 * the `DUE` table the prototype displayed ("10 minutes / 3 days / 10 days") —
 * the difference is that from here on the intervals grow.
 */
const FIRST = { again: 10 * MINUTE, good: 3 * DAY, easy: 10 * DAY }

const EASE_START = 2.5
const EASE_MIN = 1.3
const EASE_MAX = 3.0
const EASE_DELTA = { again: -0.2, good: 0, easy: 0.15 }

/** Easy grades stretch the interval beyond the plain ease multiplier. */
const EASY_BONUS = 1.3

/** Nothing is ever scheduled further out than a year. */
export const MAX_INTERVAL = 365 * DAY

const clamp = (n, min, max) => Math.min(max, Math.max(min, n))

export const newEntry = () => ({
  due: null,
  interval: 0,
  ease: EASE_START,
  reps: 0,
  lapses: 0,
  last: null,
})

/** A card with no entry, or one that has never been graded, is new. */
export const isNew = (entry) => !entry || !entry.last

/** New cards are always due; graded cards come due when their time passes. */
export const isDue = (entry, now = Date.now()) =>
  isNew(entry) || entry.due === null || entry.due <= now

/**
 * Applies a grade and returns the next schedule entry.
 *
 * "Again" drops the card back to the ten-minute relearning step and clears its
 * rep count, so the next "Good" restarts from the first interval rather than
 * resuming a long one.
 */
export function grade(entry, g, now = Date.now()) {
  if (!GRADES.includes(g)) throw new Error(`unknown grade: ${g}`)
  const prev = entry ?? newEntry()
  const ease = clamp(prev.ease + EASE_DELTA[g], EASE_MIN, EASE_MAX)

  let interval
  if (g === 'again') {
    interval = FIRST.again
  } else if (!prev.reps || !prev.interval) {
    // New, or relearning after a lapse.
    interval = FIRST[g]
  } else {
    interval = Math.round(prev.interval * ease * (g === 'easy' ? EASY_BONUS : 1))
  }
  interval = clamp(interval, FIRST.again, MAX_INTERVAL)

  return {
    due: now + interval * 60_000,
    interval,
    ease,
    reps: g === 'again' ? 0 : prev.reps + 1,
    lapses: prev.lapses + (g === 'again' ? 1 : 0),
    last: g,
  }
}

/** The interval a grade would produce, for labelling the rating buttons. */
export const preview = (entry, g, now = Date.now()) => grade(entry, g, now).interval

const plural = (n, unit) => `${n} ${unit}${n === 1 ? '' : 's'}`

/** "10 minutes", "3 days", "2 months" — the human form of an interval. */
export function formatInterval(minutes) {
  if (minutes < HOUR) return plural(Math.max(1, Math.round(minutes)), 'minute')
  if (minutes < DAY) return plural(Math.round(minutes / HOUR), 'hour')
  if (minutes < 30 * DAY) return plural(Math.round(minutes / DAY), 'day')
  if (minutes < 365 * DAY) return plural(Math.round(minutes / (30 * DAY)), 'month')
  return plural(Math.round(minutes / (365 * DAY)), 'year')
}

/** "Due now", "Due in 3 days", "Due in 2 hours". */
export function formatDue(entry, now = Date.now()) {
  if (isNew(entry)) return 'New'
  if (entry.due <= now) return 'Due now'
  return `Due in ${formatInterval((entry.due - now) / 60_000)}`
}

export const scheduleOf = (deck) => deck.schedule ?? {}

export const entryFor = (deck, card) => scheduleOf(deck)[card.id]

/** How many of a deck's cards are ready to be studied right now. */
export const dueCount = (deck, now = Date.now()) =>
  deck.cards.filter((c) => isDue(entryFor(deck, c), now)).length

/**
 * The study queue: cards that have come due, soonest first, with new cards
 * after them. `all` ignores due dates so a user can deliberately review ahead.
 * Returns card indices, capped at `limit`.
 */
export function buildQueue(deck, { limit = Infinity, now = Date.now(), all = false } = {}) {
  const candidates = deck.cards
    .map((card, index) => ({ index, entry: entryFor(deck, card) }))
    .filter(({ entry }) => all || isDue(entry, now))

  candidates.sort((a, b) => {
    const aNew = isNew(a.entry)
    const bNew = isNew(b.entry)
    if (aNew !== bNew) return aNew ? 1 : -1 // due reviews before new cards
    if (aNew) return a.index - b.index
    return (a.entry.due ?? 0) - (b.entry.due ?? 0)
  })

  return candidates.slice(0, limit).map(({ index }) => index)
}
