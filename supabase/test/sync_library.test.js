// @vitest-environment node
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { addUser, as, beginTest, endTest, freshDatabase, rpc } from './db.js'

/**
 * `sync_library` as 0005 left it: a deletion sticks, whichever device made it
 * and whichever device is still holding the row.
 */

const id = (n) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`
const U = { id: '11111111-1111-4111-8111-111111111111', email: 'u@example.com' }
const V = { id: '22222222-2222-4222-8222-222222222222', email: 'v@example.com' }
const [F, D1, D2, D3, C1, C2, C3, C9, C10, S1] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(id)

const deck = (did, title, folder_id = null) => ({
  id: did, user_id: U.id, title, subject: 'S', description: '', studied_at: null, folder_id,
})
const card = (cid, did, front) => ({
  id: cid, deck_id: did, user_id: U.id, front, back: 'b', position: 0,
  due: null, interval: 0, ease: 2.5, reps: 0, lapses: 0, last_grade: null, suspended: false,
})
const NONE = { folders: [], decks: [], cards: [] }

let db
const sync = (payload) => rpc(db, U, 'sync_library', [JSON.stringify(payload)])
const rows = async (sql) => (await db.query(sql)).rows

beforeAll(async () => {
  db = await freshDatabase()
  await addUser(db, U.id, U.email, 'U')
  await addUser(db, V.id, V.email, 'V')
  await sync({
    folders_upsert: [{ id: F, user_id: U.id, name: 'Term 1' }],
    decks_upsert: [deck(D1, 'Alpha', F), deck(D2, 'Beta')],
    cards_upsert: [card(C1, D1, 'one'), card(C2, D1, 'two'), card(C3, D2, 'three')],
  })
})
beforeEach(() => beginTest(db))
afterEach(() => endTest(db))

describe('a deletion made on another device', () => {
  it('records the deck, and its cards with it', async () => {
    expect(await sync({ decks_remove: [D2] })).toEqual(NONE)
    expect((await rows(`select kind, id from deleted_rows order by kind`)).map((r) => `${r.kind}:${r.id}`)).toEqual([
      `card:${C3}`,
      `deck:${D2}`,
    ])
  })

  it('is not undone by an edit from a device still holding the deck', async () => {
    await sync({ decks_remove: [D2] })
    expect(await sync({ decks_upsert: [deck(D2, 'Beta, edited')], cards_upsert: [card(C3, D2, 'three, edited')] })).toEqual({
      folders: [],
      decks: [D2],
      cards: [C3],
    })
    expect(await rows(`select 1 from decks where id = '${D2}'`)).toEqual([])
  })

  it('is not undone for a card, or for a folder, and the folder’s deck lands ungrouped', async () => {
    await sync({ cards_remove: [C2], folders_remove: [F] })
    expect(
      await sync({
        cards_upsert: [card(C2, D1, 'two, edited')],
        folders_upsert: [{ id: F, user_id: U.id, name: 'Renamed' }],
        decks_upsert: [deck(D1, 'Alpha', F)],
      }),
    ).toEqual({ folders: [F], decks: [], cards: [C2] })
    expect(await rows(`select 1 from folders`)).toEqual([])
    expect((await rows(`select folder_id from decks where id = '${D1}'`))[0].folder_id).toBe(null)
  })

  it('refuses a card added to the gone deck, and names the deck, instead of failing the key', async () => {
    await sync({ decks_remove: [D2] })
    expect(await sync({ cards_upsert: [card(C9, D2, 'new')] })).toEqual({ folders: [], decks: [D2], cards: [C9] })
  })

  it('logs a session against the gone deck with no deck, instead of failing the key', async () => {
    await sync({ decks_remove: [D2] })
    await sync({ sessions_insert: [{ id: S1, user_id: U.id, deck_id: D2, at: '2026-09-24T10:00:00Z', reviewed: 3, seconds: 30 }] })
    expect((await rows(`select deck_id from sessions where id = '${S1}'`))[0].deck_id).toBe(null)
  })

  it('still lets new work through beside a refusal', async () => {
    await sync({ decks_remove: [D2] })
    expect(await sync({ decks_upsert: [deck(D3, 'Gamma'), deck(D2, 'Beta again')], cards_upsert: [card(C10, D3, 'g')] }))
      .toEqual({ folders: [], decks: [D2], cards: [] })
    expect((await rows(`select title from decks order by title`)).map((r) => r.title)).toEqual(['Alpha', 'Gamma'])
  })
})

describe('the record itself', () => {
  it('is invisible to another account, cannot be written in your name, and blocks nothing of yours', async () => {
    await as(db, V, async () => {
      expect(await db.query(`select * from deleted_rows`).then((r) => r.rows)).toEqual([])
    })
    await expect(as(db, V, () => db.query(`insert into deleted_rows (user_id, id, kind) values ($1, $2, 'deck')`, [U.id, D1])))
      .rejects.toThrow(/row-level security/)
    await as(db, V, () => db.query(`insert into deleted_rows (user_id, id, kind) values ($1, $2, 'deck')`, [V.id, D1]))
    expect(await sync({ decks_upsert: [deck(D1, 'Alpha, still mine')] })).toEqual(NONE)
  })

  it('cannot be taken back out, even by its owner', async () => {
    await sync({ decks_remove: [D2] })
    const affected = async (sql) => (await as(db, U, () => db.query(sql))).affectedRows ?? 0
    expect(await affected(`delete from deleted_rows`)).toBe(0)
    expect(await affected(`update deleted_rows set kind = 'card'`)).toBe(0)
    expect((await sync({ decks_upsert: [deck(D2, 'Beta, once more')] })).decks).toEqual([D2])
  })

  it('is behind sync_library, which nobody signed out can call', async () => {
    await expect(rpc(db, null, 'sync_library', ['{}'])).rejects.toThrow(/permission denied for function/)
  })
})
