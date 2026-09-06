/**
 * What a review session is made of, apart from its screen.
 *
 * The order cards come in, what the summary counts, and what to tell someone
 * who has nothing due — all of it decided here rather than inside the page.
 * Logic that lives in a component is logic nobody can check: the library's
 * "Recently studied" sort was a no-op for weeks precisely because it sat
 * inline, where looking at the page could not reveal it.
 *
 * Nothing here reads the clock or the random number generator on its own.
 * Both are arguments, so a shuffle can be replayed and a summary can be
 * measured.
 */
import { buildQueue, entryFor, formatInterval } from './scheduler.js'

/**
 * Fisher–Yates, over a copy.
 *
 * Written out rather than reached for, because the tempting one-liner
 * (`sort(() => Math.random() - 0.5)`) is not a shuffle: comparison sorts
 * assume a consistent comparator, and with a random one the result is heavily
 * biased toward the order it started in.
 *
 * @param {number[]} order
 * @param {() => number} random a source in [0, 1), injectable so tests can fix it
 */
export function shuffle(order = [], random = Math.random) {
  const next = [...order]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    const swap = next[i]
    next[i] = next[j]
    next[j] = swap
  }
  return next
}

/**
 * The queue a session opens with: due cards soonest-first, then new ones,
 * capped at the reader's "cards per session" preference, and shuffled if they
 * asked for that.
 *
 * `ahead` drops the due filter, which is what "Review ahead" does — the whole
 * deck, still capped and still ordered.
 */
export function openingQueue(deck, { limit, shuffleFirst = false, ahead = false, now, random } = {}) {
  if (!deck) return []
  const queue = buildQueue(deck, { limit, all: ahead, ...(now === undefined ? {} : { now }) })
  return shuffleFirst ? shuffle(queue, random) : queue
}

/**
 * How long until the next card comes due, worded, or null when none is
 * scheduled ahead.
 *
 * Cards already due are excluded: this answers "come back when?", and the
 * answer for something due now is not a length of time.
 */
export function nextDueLabel(deck, now = Date.now()) {
  if (!deck) return null
  const upcoming = deck.cards
    .map((card) => entryFor(deck, card)?.due)
    .filter((due) => typeof due === 'number' && due > now)

  if (!upcoming.length) return null
  return formatInterval((Math.min(...upcoming) - now) / 60_000)
}

/**
 * The tally the summary screen is built from.
 *
 * `grades` is keyed by card id, so a card graded twice — rated, gone back to,
 * rated again — counts once, at whatever it was left on.
 *
 * Anything that is not "again" counts as known. "Good" and "easy" differ in
 * how long the card goes away for, not in whether it was recalled.
 */
export function summarise(grades = {}, { startedAt, now = Date.now() } = {}) {
  const values = Object.values(grades)
  return {
    reviewed: values.length,
    known: values.filter((v) => v !== 'again').length,
    again: values.filter((v) => v === 'again').length,
    seconds: startedAt === undefined ? 0 : Math.max(0, (now - startedAt) / 1000),
  }
}
