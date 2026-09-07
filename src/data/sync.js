/**
 * Turning the library between the shape the app holds and the shape the
 * database holds, and working out what actually changed.
 *
 * All of it is pure. The network layer above decides when to push; this
 * decides what a push would even contain, and that is the part worth being
 * able to test without a project to talk to.
 *
 * Two shapes are in play. In the app a deck carries its cards inline and its
 * scheduling in a `schedule` map keyed by card id. In Postgres a card is a row
 * with its scheduling spread across columns, because that is what an index on
 * "this reader's cards, soonest due" can be built over.
 */

/**
 * Local ids are eight random characters; Postgres wants a uuid. Anything that
 * already looks like one is kept, so ids stay stable once a library has been
 * uploaded and the diff below can match rows across a session.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const isUuid = (id) => typeof id === 'string' && UUID.test(id)

/** Prefers the platform generator; the fallback is for older browsers only. */
export function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

const text = (value, fallback = '') => (typeof value === 'string' ? value.trim() : fallback)

/** A timestamp in milliseconds as Postgres wants it, or null. */
const asStamp = (ms) => (typeof ms === 'number' && isFinite(ms) ? new Date(ms).toISOString() : null)

/** And back again. */
const asMillis = (stamp) => {
  if (!stamp) return null
  const ms = Date.parse(stamp)
  return Number.isNaN(ms) ? null : ms
}

/**
 * The app's library as database rows.
 *
 * Ids are minted here rather than left to Postgres so that the caller can put
 * the same ids into local state: a deck that exists under one id locally and
 * another remotely would be uploaded again on every sign-in.
 */
export function toRows(state, userId) {
  const decks = []
  const cards = []

  for (const deck of state.decks ?? []) {
    const deckId = isUuid(deck.id) ? deck.id : newId()
    decks.push({
      id: deckId,
      user_id: userId,
      title: text(deck.title, 'Untitled deck') || 'Untitled deck',
      subject: text(deck.subject, 'General') || 'General',
      description: text(deck.desc),
      studied_at: asStamp(deck.studiedAt),
    })

    deck.cards.forEach((card, position) => {
      const entry = deck.schedule?.[card.id] ?? null
      cards.push({
        id: isUuid(card.id) ? card.id : newId(),
        deck_id: deckId,
        user_id: userId,
        front: card.front,
        back: card.back,
        position,
        due: asStamp(entry?.due),
        interval: entry?.interval ?? 0,
        ease: entry?.ease ?? 2.5,
        reps: entry?.reps ?? 0,
        lapses: entry?.lapses ?? 0,
        last_grade: entry?.last ?? null,
      })
    })
  }

  const sessions = (state.sessions ?? []).map((s) => ({
    id: isUuid(s.id) ? s.id : newId(),
    user_id: userId,
    // A session logged against a deck that has since been deleted keeps its
    // place in the streak, which is why the column is nullable.
    deck_id: isUuid(s.deckId) ? s.deckId : null,
    at: asStamp(s.at),
    reviewed: s.reviewed,
    seconds: s.seconds ?? 0,
  }))

  return { decks, cards, sessions }
}

/**
 * Database rows as the app's library.
 *
 * Progress is not read back. It is derived from the schedule wherever it is
 * needed, and a stored copy would only be a second opinion.
 */
export function fromRows({ decks = [], cards = [], sessions = [] }) {
  const byDeck = new Map(decks.map((d) => [d.id, []]))
  for (const card of cards) {
    if (byDeck.has(card.deck_id)) byDeck.get(card.deck_id).push(card)
  }

  return {
    decks: decks.map((deck) => {
      const rows = (byDeck.get(deck.id) ?? []).sort((a, b) => a.position - b.position)
      const schedule = {}

      for (const row of rows) {
        // `last_grade` is what marks a card as seen; a row with none has never
        // been graded and gets no entry at all, exactly as a new card locally.
        if (row.last_grade) {
          schedule[row.id] = {
            due: asMillis(row.due),
            interval: row.interval ?? 0,
            ease: row.ease ?? 2.5,
            reps: row.reps ?? 0,
            lapses: row.lapses ?? 0,
            last: row.last_grade,
          }
        }
      }

      return {
        id: deck.id,
        title: deck.title,
        subject: deck.subject,
        desc: deck.description ?? '',
        studiedAt: asMillis(deck.studied_at),
        cards: rows.map((r) => ({ id: r.id, front: r.front, back: r.back })),
        schedule,
      }
    }),
    sessions: sessions
      .map((s) => ({ id: s.id, at: asMillis(s.at), deckId: s.deck_id, reviewed: s.reviewed, seconds: s.seconds }))
      .filter((s) => s.at !== null)
      .sort((a, b) => a.at - b.at),
  }
}

/** The settings the app keeps, as the profile row holds them, and back. */
export const settingsToProfile = (settings, theme) => ({
  name: text(settings.name, 'Student') || 'Student',
  goal_minutes: settings.goalMinutes,
  cards_per: settings.cardsPer,
  auto_reveal: settings.autoReveal,
  shuffle_first: settings.shuffleFirst,
  theme,
})

export const profileToSettings = (profile) => ({
  settings: {
    name: profile.name,
    goalMinutes: profile.goal_minutes,
    cardsPer: profile.cards_per,
    autoReveal: profile.auto_reveal,
    shuffleFirst: profile.shuffle_first,
  },
  theme: profile.theme === 'dark' ? 'dark' : 'light',
})

const sameRow = (a, b) => JSON.stringify(a) === JSON.stringify(b)

/**
 * What changed between two snapshots of the library, as rows to write.
 *
 * Pushing the whole library on every keystroke would work and would be far
 * simpler, but grading one card would send every card in it. This sends the
 * card that was graded.
 *
 * Deletions are returned as ids to remove. Cards deleted because their whole
 * deck went are left out — the deck's own removal cascades, and naming them
 * as well would be a second round trip saying the same thing.
 */
export function changesBetween(before, after) {
  const index = (rows) => new Map(rows.map((r) => [r.id, r]))

  const deckWas = index(before.decks)
  const deckNow = index(after.decks)
  const cardWas = index(before.cards)
  const cardNow = index(after.cards)
  const sessionWas = index(before.sessions)

  const goneDecks = [...deckWas.keys()].filter((id) => !deckNow.has(id))
  const goneDeckIds = new Set(goneDecks)

  return {
    decks: {
      upsert: after.decks.filter((d) => !sameRow(deckWas.get(d.id), d)),
      remove: goneDecks,
    },
    cards: {
      upsert: after.cards.filter((c) => !sameRow(cardWas.get(c.id), c)),
      remove: [...cardWas.keys()].filter(
        (id) => !cardNow.has(id) && !goneDeckIds.has(cardWas.get(id).deck_id),
      ),
    },
    // The log is append-only; nothing edits or removes a finished session.
    sessions: { insert: after.sessions.filter((s) => !sessionWas.has(s.id)) },
  }
}

/** Whether a change set would send anything at all. */
export const isEmptyChange = (change) =>
  !change.decks.upsert.length &&
  !change.decks.remove.length &&
  !change.cards.upsert.length &&
  !change.cards.remove.length &&
  !change.sessions.insert.length

/**
 * A change set as the `sync_library` function wants it.
 *
 * Flat arrays under fixed keys rather than the nested shape above, because
 * `jsonb_to_recordset` reads one array per table and nothing else.
 */
export const toPayload = (change) => ({
  decks_upsert: change.decks.upsert,
  cards_upsert: change.cards.upsert,
  sessions_insert: change.sessions.insert,
  cards_remove: change.cards.remove,
  decks_remove: change.decks.remove,
})
