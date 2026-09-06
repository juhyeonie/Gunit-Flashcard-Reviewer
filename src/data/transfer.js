/**
 * Carrying a deck out of the app, and back in.
 *
 * A library lives in one browser's `localStorage` and nowhere else. Clearing
 * site data takes it with you, a second machine cannot see it, and there is no
 * way to hand a deck to anyone. A file fixes all three.
 *
 * Review history rides on the card rather than in a table beside it. Ids are
 * only meaningful inside the library that issued them, so exporting a schedule
 * keyed by id would mean re-keying it on the way back in — and getting that
 * subtly wrong is how someone else's ease factors end up on your cards.
 */

/** Stamped into the file so a stray .json is recognised as not one of ours. */
export const FORMAT = 'gunit.deck'

/** Raised when the shape changes in a way older builds could not read. */
export const VERSION = 1

const text = (value) => (typeof value === 'string' ? value.trim() : '')

/**
 * A card's scheduling, or null. Exactly the fields `newEntry` defines and
 * `grade` reads back — `reps` among them, since an interval without the
 * repetition count behind it is graded as though the card were new again — and
 * nothing else, so a hand-edited file cannot smuggle anything into the store.
 */
const schedulingOf = (entry) => {
  if (!entry || typeof entry !== 'object') return null
  const { due, last, interval, ease, reps, lapses } = entry
  return { due, last, interval, ease, reps, lapses }
}

const numberOr = (value, fallback) => (typeof value === 'number' && isFinite(value) ? value : fallback)

/**
 * What gets written to the file. Progress is left out — it is derived from the
 * schedule on the way in, so storing it would only give it a chance to
 * disagree.
 */
export function toTransfer(deck, { now = Date.now() } = {}) {
  return {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date(now).toISOString(),
    title: deck.title,
    subject: deck.subject,
    desc: deck.desc ?? '',
    cards: deck.cards.map((card) => ({
      front: card.front,
      back: card.back,
      scheduling: schedulingOf(deck.schedule?.[card.id]),
    })),
  }
}

/** A filename that survives being saved on any of the three big platforms. */
export function fileNameFor(deck) {
  const stem =
    deck.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'deck'
  return `${stem}.gunit.json`
}

/**
 * Reads a file back, and says why not when it cannot.
 *
 * Never throws, and never half-imports: either a whole deck comes back or an
 * error does. A file that is almost right — our format, but with two cards
 * missing a back — loses those cards and says how many, rather than importing
 * blanks or refusing the other forty.
 *
 * @returns {{ deck: object|null, error: string|null, skipped: number }}
 */
export function fromTransfer(source) {
  let data
  try {
    data = typeof source === 'string' ? JSON.parse(source) : source
  } catch {
    return { deck: null, error: 'That file is not readable JSON', skipped: 0 }
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { deck: null, error: 'That file does not hold a deck', skipped: 0 }
  }
  if (data.format !== FORMAT) {
    return { deck: null, error: 'That file was not exported from Gunit', skipped: 0 }
  }
  if (numberOr(data.version, 0) > VERSION) {
    return {
      deck: null,
      // Better to say so than to import half of a shape we do not understand.
      error: 'That deck was exported by a newer version of Gunit',
      skipped: 0,
    }
  }
  if (!Array.isArray(data.cards)) {
    return { deck: null, error: 'That deck has no cards in it', skipped: 0 }
  }

  const usable = data.cards.filter((c) => c && text(c.front) && text(c.back))

  return {
    deck: {
      title: text(data.title) || 'Imported deck',
      subject: text(data.subject) || 'General',
      desc: text(data.desc),
      cards: usable.map((c) => ({
        front: text(c.front),
        back: text(c.back),
        scheduling: schedulingOf(c.scheduling),
      })),
    },
    error: null,
    skipped: data.cards.length - usable.length,
  }
}
