import { describe, expect, it } from 'vitest'
import {
  changesBetween,
  fromRows,
  isEmptyChange,
  isUuid,
  newId,
  profileToSettings,
  settingsToProfile,
  toRows,
} from './sync.js'

const USER = '11111111-2222-4333-8444-555555555555'
const NOW = 1_700_000_000_000

const entry = (over = {}) => ({
  due: NOW + 86_400_000,
  interval: 1440,
  ease: 2.5,
  reps: 3,
  lapses: 0,
  last: 'good',
  ...over,
})

const library = (over = {}) => ({
  decks: [
    {
      id: 'republic',
      title: 'Roman Republic',
      subject: 'Ancient Rome',
      desc: 'Magistracies.',
      studiedAt: NOW,
      cards: [
        { id: 'c0', front: 'Consul?', back: 'Senior magistrate.' },
        { id: 'c1', front: 'Praetor?', back: 'Judicial magistrate.' },
      ],
      schedule: { c0: entry() },
    },
  ],
  sessions: [{ at: NOW, deckId: 'republic', reviewed: 6, seconds: 91 }],
  ...over,
})

describe('newId', () => {
  it('makes something Postgres will accept as a uuid', () => {
    expect(isUuid(newId())).toBe(true)
  })

  it('does not make the same one twice', () => {
    expect(new Set(Array.from({ length: 200 }, newId)).size).toBe(200)
  })

  it('does not mistake a local id for one', () => {
    // Local ids are eight random characters; sending one as a uuid is a 400.
    expect(isUuid('a1b2c3d4')).toBe(false)
    expect(isUuid(undefined)).toBe(false)
  })
})

describe('toRows', () => {
  it('gives every row the signed-in user', () => {
    // Row level security refuses anything else, and silently — the insert
    // simply matches no policy.
    const { decks, cards, sessions } = toRows(library(), USER)
    for (const row of [...decks, ...cards, ...sessions]) expect(row.user_id).toBe(USER)
  })

  it('mints uuids for local ids, and keeps ones already minted', () => {
    const kept = '99999999-8888-4777-8666-555555555555'
    const { decks } = toRows(library({ decks: [{ ...library().decks[0], id: kept }] }), USER)
    expect(decks[0].id).toBe(kept)

    const { decks: fresh } = toRows(library(), USER)
    expect(isUuid(fresh[0].id)).toBe(true)
    expect(fresh[0].id).not.toBe('republic')
  })

  it('points every card at the deck it came from, under its new id', () => {
    // If these two disagreed the cards would be orphaned on upload.
    const { decks, cards } = toRows(library(), USER)
    for (const card of cards) expect(card.deck_id).toBe(decks[0].id)
  })

  it('spreads the scheduling across columns, and leaves a new card blank', () => {
    const { cards } = toRows(library(), USER)
    expect(cards[0]).toMatchObject({ interval: 1440, ease: 2.5, reps: 3, last_grade: 'good' })
    expect(cards[0].due).toBe(new Date(NOW + 86_400_000).toISOString())
    // c1 has never been graded.
    expect(cards[1]).toMatchObject({ interval: 0, reps: 0, last_grade: null, due: null })
  })

  it('keeps the order of the cards in a deck', () => {
    const { cards } = toRows(library(), USER)
    expect(cards.map((c) => c.position)).toEqual([0, 1])
  })

  it('does not send progress, which the database does not have', () => {
    const { decks } = toRows(library({ decks: [{ ...library().decks[0], progress: 0.5 }] }), USER)
    expect(decks[0].progress).toBeUndefined()
  })

  it('lets a session keep its place when its deck is not a uuid yet', () => {
    // The column is nullable so a deleted deck cannot cost you the streak.
    const { sessions } = toRows(library(), USER)
    expect(sessions[0].deck_id).toBe(null)
    expect(sessions[0].reviewed).toBe(6)
  })

  it('copes with an empty library', () => {
    expect(toRows({ decks: [], sessions: [] }, USER)).toEqual({ decks: [], cards: [], sessions: [] })
  })
})

describe('fromRows', () => {
  const rows = () => toRows(library(), USER)

  it('survives a round trip', () => {
    const back = fromRows(rows())
    expect(back.decks).toHaveLength(1)
    expect(back.decks[0]).toMatchObject({
      title: 'Roman Republic',
      subject: 'Ancient Rome',
      desc: 'Magistracies.',
      studiedAt: NOW,
    })
    expect(back.decks[0].cards.map((c) => c.front)).toEqual(['Consul?', 'Praetor?'])
  })

  it('rebuilds the schedule map, keyed by the card it belongs to', () => {
    const back = fromRows(rows())
    const [first, second] = back.decks[0].cards
    expect(back.decks[0].schedule[first.id]).toMatchObject({ interval: 1440, reps: 3, last: 'good' })
    // A card never graded has no entry, not an empty one — that is what tells
    // the scheduler it is new.
    expect(second.id in back.decks[0].schedule).toBe(false)
  })

  it('puts the cards back in their stored order, whatever order they arrive in', () => {
    const { decks, cards } = rows()
    const shuffled = { decks, cards: [...cards].reverse(), sessions: [] }
    expect(fromRows(shuffled).decks[0].cards.map((c) => c.front)).toEqual([
      'Consul?',
      'Praetor?',
    ])
  })

  it('ignores a card whose deck is not in the same answer', () => {
    // A partial read should not invent a deck to hang it from.
    const { decks, cards } = rows()
    const stray = { ...cards[0], deck_id: newId() }
    expect(fromRows({ decks, cards: [...cards, stray], sessions: [] }).decks[0].cards).toHaveLength(2)
  })

  it('does not read progress back', () => {
    expect(fromRows(rows()).decks[0].progress).toBeUndefined()
  })

  it('drops a session with no timestamp, which cannot be placed on a day', () => {
    const { sessions } = rows()
    const back = fromRows({ decks: [], cards: [], sessions: [...sessions, { ...sessions[0], at: null }] })
    expect(back.sessions).toHaveLength(1)
  })

  it('copes with nothing at all', () => {
    expect(fromRows({})).toEqual({ decks: [], sessions: [] })
  })
})

describe('settings', () => {
  const settings = {
    name: 'Mara Kessler',
    goalMinutes: 20,
    cardsPer: 20,
    autoReveal: false,
    shuffleFirst: true,
  }

  it('survives a round trip, theme included', () => {
    const back = profileToSettings(settingsToProfile(settings, 'dark'))
    expect(back.settings).toMatchObject(settings)
    expect(back.theme).toBe('dark')
  })

  it('never sends a nameless profile, which the column refuses', () => {
    expect(settingsToProfile({ ...settings, name: '   ' }, 'light').name).toBe('Student')
  })

  it('treats any unknown theme as light', () => {
    expect(profileToSettings({ ...settingsToProfile(settings, 'light'), theme: 'sepia' }).theme).toBe(
      'light',
    )
  })
})

describe('changesBetween', () => {
  const rows = () => toRows(library(), USER)

  it('sends nothing when nothing changed', () => {
    const before = rows()
    const change = changesBetween(before, before)
    expect(isEmptyChange(change)).toBe(true)
  })

  it('sends only the card that was graded', () => {
    // The whole point of diffing rather than pushing the library: rating one
    // card should not re-send every card in the deck.
    const before = rows()
    const after = {
      ...before,
      cards: before.cards.map((c, i) => (i === 0 ? { ...c, reps: 4, last_grade: 'easy' } : c)),
    }

    const change = changesBetween(before, after)
    expect(change.cards.upsert).toHaveLength(1)
    expect(change.cards.upsert[0].id).toBe(before.cards[0].id)
    expect(change.decks.upsert).toHaveLength(0)
  })

  it('sends a new deck and its cards', () => {
    const before = { decks: [], cards: [], sessions: [] }
    const after = rows()
    const change = changesBetween(before, after)
    expect(change.decks.upsert).toHaveLength(1)
    expect(change.cards.upsert).toHaveLength(2)
  })

  it('names a removed deck, and lets its cards go with it', () => {
    // The foreign key cascades, so listing the cards as well would be a second
    // round trip saying what the first already said.
    const before = rows()
    const after = { decks: [], cards: [], sessions: before.sessions }
    const change = changesBetween(before, after)
    expect(change.decks.remove).toEqual([before.decks[0].id])
    expect(change.cards.remove).toEqual([])
  })

  it('names a card deleted on its own', () => {
    const before = rows()
    const after = { ...before, cards: [before.cards[0]] }
    expect(changesBetween(before, after).cards.remove).toEqual([before.cards[1].id])
  })

  it('inserts a finished session and never touches an old one', () => {
    const before = rows()
    const fresh = { ...before.sessions[0], id: newId(), reviewed: 3 }
    const change = changesBetween(before, { ...before, sessions: [...before.sessions, fresh] })
    expect(change.sessions.insert).toEqual([fresh])
  })

  it('notices a renamed deck without resending its cards', () => {
    const before = rows()
    const after = { ...before, decks: [{ ...before.decks[0], title: 'Renamed' }] }
    const change = changesBetween(before, after)
    expect(change.decks.upsert).toHaveLength(1)
    expect(change.cards.upsert).toHaveLength(0)
  })
})
