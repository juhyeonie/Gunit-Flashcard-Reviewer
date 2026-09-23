import { describe, expect, it } from 'vitest'
import {
  changesBetween,
  confirmedIds,
  fromRows,
  isEmptyChange,
  isUuid,
  newId,
  profileToSettings,
  removalsSince,
  settingsToProfile,
  toPayload,
  toRows,
  withoutDeletedElsewhere,
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
    expect(toRows({ decks: [], sessions: [] }, USER)).toEqual({ folders: [], decks: [], cards: [], sessions: [] })
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
    expect(fromRows({})).toEqual({ decks: [], sessions: [], folders: [] })
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

describe('toPayload', () => {
  const rows = () => toRows(library(), USER)

  it('flattens to the keys the function reads', () => {
    // jsonb_to_recordset takes one array per table and nothing nested.
    const payload = toPayload(changesBetween({ decks: [], cards: [], sessions: [] }, rows()))
    expect(Object.keys(payload).sort()).toEqual([
      'cards_remove',
      'cards_upsert',
      'decks_remove',
      'decks_upsert',
      'folders_remove',
      'folders_upsert',
      'sessions_insert',
    ])
  })

  it('carries every row through unchanged', () => {
    const before = { decks: [], cards: [], sessions: [] }
    const after = rows()
    const payload = toPayload(changesBetween(before, after))

    expect(payload.decks_upsert).toEqual(after.decks)
    expect(payload.cards_upsert).toEqual(after.cards)
    expect(payload.sessions_insert).toEqual(after.sessions)
  })

  it('sends empty arrays rather than nothing at all', () => {
    // The function coalesces a missing key, but an array it can read without
    // guessing is one less thing depending on that.
    const before = rows()
    const payload = toPayload(changesBetween(before, before))
    for (const key of Object.keys(payload)) expect(Array.isArray(payload[key])).toBe(true)
  })

  it('names removals as bare ids, which is what the delete expects', () => {
    const before = rows()
    const after = { ...before, cards: [before.cards[0]] }
    const payload = toPayload(changesBetween(before, after))
    expect(payload.cards_remove).toEqual([before.cards[1].id])
    expect(typeof payload.cards_remove[0]).toBe('string')
  })
})

describe('suspension over the wire', () => {
  const held = (over = {}) =>
    library({
      decks: [{ ...library().decks[0], schedule: { c0: entry({ suspended: true }), ...over } }],
    })

  it('goes up as a column, and every other card answers false', () => {
    // Not null: the column is `not null default false`, and a three-valued
    // answer would need handling everywhere it is read.
    const { cards } = toRows(held(), USER)
    expect(cards[0].suspended).toBe(true)
    expect(cards[1].suspended).toBe(false)
  })

  it('comes back down onto the entry it belongs to', () => {
    const back = fromRows(toRows(held(), USER))
    const [first] = back.decks[0].cards
    expect(back.decks[0].schedule[first.id].suspended).toBe(true)
    expect(back.decks[0].schedule[first.id].reps).toBe(3)
  })

  it('keeps an entry for a card suspended before it was ever graded', () => {
    // A row with no last_grade normally gets no entry at all. Without this
    // exception there would be nothing to hang the flag on, and signing in on
    // another machine would silently unsuspend the card.
    const never = library({
      decks: [{ ...library().decks[0], schedule: { c1: { ...entry(), last: null, suspended: true } } }],
    })
    const back = fromRows(toRows(never, USER))
    const second = back.decks[0].cards[1]
    expect(back.decks[0].schedule[second.id]).toMatchObject({ suspended: true, last: null })
  })

  it('does not put the key on an ordinary card', () => {
    const back = fromRows(toRows(library(), USER))
    const [first] = back.decks[0].cards
    expect('suspended' in back.decks[0].schedule[first.id]).toBe(false)
  })

  it('is a change worth pushing on its own', () => {
    // Suspending a card edits nothing visible on the row but the flag. If the
    // diff missed it, the decision would live on one machine only.
    const before = toRows(library(), USER)
    const after = { ...before, cards: before.cards.map((c, i) => (i === 0 ? { ...c, suspended: true } : c)) }
    const change = changesBetween(before, after)
    expect(change.cards.upsert).toHaveLength(1)
    expect(change.cards.upsert[0].suspended).toBe(true)
  })
})

describe('adopting a library into an account', () => {
  const uploaded = () => {
    // A library that some account has already uploaded: every id is a uuid.
    const { decks, cards } = toRows(library(), USER)
    return fromRows({ decks, cards, sessions: [] })
  }

  it('mints new ids even for ones that already look like uuids', () => {
    // A uuid in a local library is not a promise that it belongs to *this*
    // account. On a shared browser it is very often another reader's, and the
    // upsert then reaches for rows this user does not own: row level security
    // refuses the whole change set and nothing is adopted.
    const before = uploaded()
    const { decks, cards } = toRows(before, USER, { reissueIds: true })

    expect(decks[0].id).not.toBe(before.decks[0].id)
    expect(isUuid(decks[0].id)).toBe(true)
    for (const card of cards) expect(before.decks[0].cards.some((c) => c.id === card.id)).toBe(false)
  })

  it('keeps the cards pointing at their deck under the new ids', () => {
    const { decks, cards } = toRows(uploaded(), USER, { reissueIds: true })
    for (const card of cards) expect(card.deck_id).toBe(decks[0].id)
  })

  it('carries the review history across the reissue', () => {
    // The schedule is keyed by the card's local id and looked up before the
    // new one is written. Get that wrong and adopting a library silently
    // resets every card's history.
    const before = uploaded()
    const { cards } = toRows(before, USER, { reissueIds: true })
    const graded = cards.find((c) => c.front === 'Consul?')
    expect(graded).toMatchObject({ interval: 1440, ease: 2.5, reps: 3, last_grade: 'good' })
  })

  it('leaves ids alone when not asked to reissue', () => {
    const before = uploaded()
    expect(toRows(before, USER).decks[0].id).toBe(before.decks[0].id)
  })
})

describe('folders', () => {
  const FOLDER = 'aaaaaaaa-1111-4111-8111-111111111111'
  const OTHER = 'bbbbbbbb-2222-4222-8222-222222222222'
  const DECK = 'cccccccc-3333-4333-8333-333333333333'

  const state = (over = {}) => ({
    folders: [{ id: FOLDER, name: 'Biology' }],
    decks: [
      { id: DECK, title: 'Cells', subject: 'Bio', desc: '', folderId: FOLDER, studiedAt: null, cards: [], schedule: {} },
    ],
    sessions: [],
    ...over,
  })

  it('go up as rows of their own, owned by the account', () => {
    expect(toRows(state(), USER).folders).toEqual([{ id: FOLDER, user_id: USER, name: 'Biology' }])
  })

  it('are pointed at by each deck, not the other way round', () => {
    expect(toRows(state(), USER).decks[0].folder_id).toBe(FOLDER)
  })

  it('send an ungrouped deck with an explicit null', () => {
    // Present and null, not absent: the database only re-files a deck that
    // says where it is, so an absent key would leave it in its old folder.
    const rows = toRows(state({ decks: [{ ...state().decks[0], folderId: null }] }), USER)
    expect(rows.decks[0]).toHaveProperty('folder_id', null)
  })

  it('never point a deck at a folder the library does not hold', () => {
    expect(toRows(state({ folders: [] }), USER).decks[0].folder_id).toBe(null)
  })

  it('keep their decks when ids are reissued for a new account', () => {
    const rows = toRows(state(), USER, { reissueIds: true })
    expect(rows.folders[0].id).not.toBe(FOLDER)
    expect(rows.decks[0].folder_id).toBe(rows.folders[0].id)
  })

  it('survive a round trip', () => {
    const back = fromRows(toRows(state(), USER))
    expect(back.folders).toEqual([{ id: FOLDER, name: 'Biology' }])
    expect(back.decks[0].folderId).toBe(FOLDER)
  })

  it('come back ungrouped for a deck whose folder row is missing', () => {
    const back = fromRows({ ...toRows(state(), USER), folders: [] })
    expect(back.decks[0].folderId).toBe(null)
  })

  describe('as changes', () => {
    const before = () => toRows(state(), USER)

    it('send nothing when nothing moved', () => {
      expect(isEmptyChange(changesBetween(before(), toRows(state(), USER)))).toBe(true)
    })

    it('send a new folder', () => {
      const after = toRows(state({ folders: [...state().folders, { id: OTHER, name: 'Chemistry' }] }), USER)
      const change = changesBetween(before(), after)
      expect(change.folders.upsert.map((f) => f.name)).toEqual(['Chemistry'])
      expect(isEmptyChange(change)).toBe(false)
    })

    it('send a rename as one folder row, not every deck in it', () => {
      const after = toRows(state({ folders: [{ id: FOLDER, name: 'Biology 101' }] }), USER)
      const change = changesBetween(before(), after)
      expect(change.folders.upsert).toEqual([{ id: FOLDER, user_id: USER, name: 'Biology 101' }])
      expect(change.decks.upsert).toEqual([])
    })

    it('send a move as the deck’s row', () => {
      const after = toRows(
        state({
          folders: [...state().folders, { id: OTHER, name: 'Chemistry' }],
          decks: [{ ...state().decks[0], folderId: OTHER }],
        }),
        USER,
      )
      expect(changesBetween(before(), after).decks.upsert[0].folder_id).toBe(OTHER)
    })

    it('send a deleted folder as a removal, and its decks as ungrouped', () => {
      const after = toRows(state({ folders: [], decks: [{ ...state().decks[0], folderId: null }] }), USER)
      const change = changesBetween(before(), after)
      expect(change.folders.remove).toEqual([FOLDER])
      expect(change.decks.upsert[0].folder_id).toBe(null)
      // No deck goes with it.
      expect(change.decks.remove).toEqual([])
    })

    it('flatten into the payload the function reads', () => {
      const after = toRows(state({ folders: [], decks: [{ ...state().decks[0], folderId: null }] }), USER)
      const payload = toPayload(changesBetween(before(), after))
      expect(payload.folders_remove).toEqual([FOLDER])
      expect(payload.folders_upsert).toEqual([])
    })
  })
})

describe('ids minted by the app', () => {
  it('are kept by the sync, so a second push of the same library is empty', () => {
    // The bug this closes: local ids used to be re-minted on every push.
    const id = newId()
    const library = {
      folders: [{ id: newId(), name: 'F' }],
      decks: [
        {
          id,
          title: 'T',
          subject: 'S',
          desc: '',
          folderId: null,
          studiedAt: null,
          cards: [{ id: newId(), front: 'Q', back: 'A' }],
          schedule: {},
        },
      ],
      sessions: [{ id: newId(), at: 1, deckId: id, reviewed: 1, seconds: 1 }],
    }
    expect(isEmptyChange(changesBetween(toRows(library, USER), toRows(library, USER)))).toBe(true)
  })
})

describe('what this device deleted since the account last agreed with it', () => {
  const F = 'f0000000-0000-4000-8000-000000000001'
  const D1 = 'd0000000-0000-4000-8000-000000000001'
  const D2 = 'd0000000-0000-4000-8000-000000000002'
  const C1 = 'c0000000-0000-4000-8000-000000000001'
  const C2 = 'c0000000-0000-4000-8000-000000000002'
  const C3 = 'c0000000-0000-4000-8000-000000000003'

  const library = () => ({
    folders: [{ id: F, name: 'Term' }],
    decks: [
      { id: D1, cards: [{ id: C1 }, { id: C2 }] },
      { id: D2, cards: [{ id: C3 }] },
    ],
  })

  it('records real ids only, with cards grouped under their deck', () => {
    const lib = library()
    lib.decks.push({ id: 'example', cards: [{ id: 'example-1' }] })
    lib.decks[0].cards.push({ id: 'abc12345' })
    expect(confirmedIds(lib)).toEqual({ folders: [F], decks: { [D1]: [C1, C2], [D2]: [C3] } })
  })

  it('names nothing when nothing was deleted', () => {
    expect(removalsSince(confirmedIds(library()), library())).toEqual({ folders: [], decks: [], cards: [] })
  })

  it('names a deleted deck, and leaves its cards to the cascade', () => {
    const now = library()
    now.decks = now.decks.filter((d) => d.id !== D2)
    expect(removalsSince(confirmedIds(library()), now)).toEqual({ folders: [], decks: [D2], cards: [] })
  })

  it('names a card deleted from a deck that is still here', () => {
    const now = library()
    now.decks[0].cards = [{ id: C1 }]
    expect(removalsSince(confirmedIds(library()), now).cards).toEqual([C2])
  })

  it('names a deleted folder', () => {
    const now = { ...library(), folders: [] }
    expect(removalsSince(confirmedIds(library()), now).folders).toEqual([F])
  })

  it('never names what was not in the record — a deck added on another machine', () => {
    const before = confirmedIds({ folders: [], decks: [{ id: D1, cards: [] }] })
    // D2 and F are here and were never recorded; nothing about them is removed.
    expect(removalsSince(before, library())).toEqual({ folders: [], decks: [], cards: [] })
  })

  it('names nothing without a record, or with one that is not a record', () => {
    for (const bad of [null, undefined, 'x', 7, { decks: 'x', folders: 'y' }, { decks: [D1] }]) {
      expect(removalsSince(bad, { folders: [], decks: [] })).toEqual({ folders: [], decks: [], cards: [] })
    }
  })
})

describe('a carry with what another device deleted taken out', () => {
  const F = 'f0000000-0000-4000-8000-000000000001'
  const D1 = 'd0000000-0000-4000-8000-000000000001'
  const D2 = 'd0000000-0000-4000-8000-000000000002'
  const D3 = 'd0000000-0000-4000-8000-000000000003'
  const C1 = 'c0000000-0000-4000-8000-000000000001'
  const C2 = 'c0000000-0000-4000-8000-000000000002'
  const C3 = 'c0000000-0000-4000-8000-000000000003'
  const S1 = 'e0000000-0000-4000-8000-000000000001'

  const lib = {
    folders: [{ id: F, name: 'Term' }],
    decks: [
      { id: D1, title: 'One', subject: 'S', desc: '', folderId: F, cards: [{ id: C1, front: 'a', back: 'b' }, { id: C2, front: 'c', back: 'd' }] },
      { id: D2, title: 'Two', subject: 'S', desc: '', folderId: null, cards: [{ id: C3, front: 'e', back: 'f' }] },
    ],
    sessions: [{ id: S1, at: 1, deckId: D2, reviewed: 1, seconds: 1 }],
  }
  const mine = () => toRows(lib, USER)
  const record = confirmedIds(lib)
  // The account as another device left it: everything, unless a test takes it away.
  const account = (drop = {}) => {
    const rows = mine()
    return {
      folders: rows.folders.filter((f) => !(drop.folders ?? []).includes(f.id)),
      decks: rows.decks.filter((d) => !(drop.decks ?? []).includes(d.id)),
      cards: rows.cards.filter((c) => !(drop.cards ?? []).includes(c.id) && !(drop.decks ?? []).includes(c.deck_id)),
    }
  }

  it('changes nothing when the account still holds everything it held', () => {
    const rows = mine()
    expect(withoutDeletedElsewhere(rows, record, account())).toBe(rows)
  })

  it('changes nothing without a record to tell by', () => {
    const rows = mine()
    expect(withoutDeletedElsewhere(rows, null, account({ decks: [D2] }))).toBe(rows)
  })

  it('leaves out a deck deleted elsewhere, with its cards, and keeps its session undecked', () => {
    const out = withoutDeletedElsewhere(mine(), record, account({ decks: [D2] }))
    expect(out.decks.map((d) => d.id)).toEqual([D1])
    expect(out.cards.map((c) => c.id)).toEqual([C1, C2])
    expect(out.sessions).toEqual([expect.objectContaining({ id: S1, deck_id: null })])
  })

  it('leaves out a card deleted elsewhere from a deck that is still there', () => {
    const out = withoutDeletedElsewhere(mine(), record, account({ cards: [C2] }))
    expect(out.cards.map((c) => c.id)).toEqual([C1, C3])
    expect(out.decks).toHaveLength(2)
  })

  it('leaves out a folder deleted elsewhere, and sends its deck ungrouped', () => {
    const out = withoutDeletedElsewhere(mine(), record, account({ folders: [F] }))
    expect(out.folders).toEqual([])
    expect(out.decks.find((d) => d.id === D1).folder_id).toBe(null)
  })

  it('still sends what was made here, which the account has never held', () => {
    const withNew = { ...lib, decks: [...lib.decks, { id: D3, title: 'New', subject: 'S', desc: '', cards: [] }] }
    const out = withoutDeletedElsewhere(toRows(withNew, USER), record, account({ decks: [D2] }))
    expect(out.decks.map((d) => d.id)).toEqual([D1, D3])
  })
})
