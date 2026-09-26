// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { addUser, as, beginTest, endTest, freshDatabase, rpc } from './db.js'

/** Building Postgres and running every migration takes a while on a busy machine. */
const SETUP_TIMEOUT = 60_000

/**
 * Notifications, where they are made: in Postgres, by triggers on the sharing
 * tables, readable only by the person they are for.
 */

const id = (n) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`
const OWNER = { id: '11111111-1111-4111-8111-111111111111', email: 'maria@example.com' }
const AMY = { id: '22222222-2222-4222-8222-222222222222', email: 'amy@example.com' }
const BEN = { id: '33333333-3333-4333-8333-333333333333', email: 'ben@example.com' }
const LATE = { id: '44444444-4444-4444-8444-444444444444', email: 'late@example.com' }
const [FOLDER, DECK, OTHER] = [id(1), id(2), id(3)]

let db
const deck = (did, title, folder_id = null) => ({
  id: did, user_id: OWNER.id, title, subject: 'CC 116', description: '', studied_at: null, folder_id,
})

beforeAll(async () => {
  db = await freshDatabase()
  await addUser(db, OWNER.id, OWNER.email, 'Maria')
  await addUser(db, AMY.id, AMY.email, 'Amy')
  await addUser(db, BEN.id, BEN.email, 'Ben')
  await rpc(db, OWNER, 'sync_library', [
    JSON.stringify({
      folders_upsert: [{ id: FOLDER, user_id: OWNER.id, name: 'Midterm Reviewers' }],
      decks_upsert: [deck(DECK, 'CC 116 Algorithms'), deck(OTHER, 'Networks', FOLDER)],
    }),
  ])
}, SETUP_TIMEOUT)
beforeEach(() => beginTest(db))
afterEach(() => endTest(db))

const share = (kind, rid, access = 'invited', role = 'viewer') => rpc(db, OWNER, 'share_set', [kind, rid, access, role])
const invite = (s, who, role = 'viewer') => rpc(db, OWNER, 'share_invite', [s.id, who.email, role])
const list = (who) => rpc(db, who, 'notifications_list', [50])
const summary = (items) => items.map((n) => `${n.kind}:${n.resource_name}`)

describe('sharing with someone', () => {
  it('tells an invited reader who shared what, with a way to open it', async () => {
    const s = await share('deck', DECK)
    await invite(s, AMY, 'editor')
    const [n] = await list(AMY)
    expect(n).toMatchObject({
      kind: 'share_received',
      actor_name: 'Maria',
      resource_kind: 'deck',
      resource_name: 'CC 116 Algorithms',
      role: 'editor',
      read_at: null,
      token: s.token,
    })
  })

  it('says the same for a folder', async () => {
    const s = await share('folder', FOLDER)
    await invite(s, BEN)
    expect(summary(await list(BEN))).toEqual(['share_received:Midterm Reviewers'])
  })

  it('waits for an address with no account yet, and tells it once it signs up and claims', async () => {
    const s = await share('deck', DECK)
    await rpc(db, OWNER, 'share_invite', [s.id, LATE.email, 'viewer'])
    await addUser(db, LATE.id, LATE.email, 'Late')
    expect(summary(await list(LATE))).toEqual(['share_received:CC 116 Algorithms'])
    // Asking again does not tell it again.
    expect(await list(LATE)).toHaveLength(1)
  })

  it('does not repeat itself for the same invitation sent twice', async () => {
    const s = await share('deck', DECK)
    await invite(s, AMY)
    await invite(s, AMY)
    expect(await list(AMY)).toHaveLength(1)
  })

  it('tells nobody about a link nobody was sent, and nothing to someone who joined it themselves', async () => {
    const s = await share('deck', DECK, 'link')
    await rpc(db, AMY, 'share_join', [s.token])
    expect(await list(AMY)).toEqual([])
    expect(await list(OWNER)).toEqual([])
  })
})

describe('changing and removing access', () => {
  it('tells a reader their role changed', async () => {
    const s = await share('deck', DECK)
    await invite(s, AMY)
    await rpc(db, AMY, 'share_open', [s.token])
    const { members } = await rpc(db, OWNER, 'share_settings', ['deck', DECK])
    await rpc(db, OWNER, 'share_member_role', [members[0].id, 'editor'])
    const [latest] = await list(AMY)
    expect(latest).toMatchObject({ kind: 'share_role_changed', role: 'editor', token: s.token })
  })

  it('tells a reader who was removed, and no longer offers the link', async () => {
    const s = await share('deck', DECK)
    await invite(s, AMY)
    await rpc(db, AMY, 'share_open', [s.token])
    const { members } = await rpc(db, OWNER, 'share_settings', ['deck', DECK])
    await rpc(db, OWNER, 'share_member_remove', [members[0].id])
    const items = await list(AMY)
    expect(summary(items)).toEqual(['share_removed:CC 116 Algorithms', 'share_received:CC 116 Algorithms'])
    expect(items.map((n) => n.token)).toEqual([null, null])
  })

  it('does not claim access was removed when the link still opens it', async () => {
    const s = await share('folder', FOLDER, 'link')
    await invite(s, AMY, 'editor')
    await rpc(db, AMY, 'share_open', [s.token])
    const { members } = await rpc(db, OWNER, 'share_settings', ['folder', FOLDER])
    await rpc(db, OWNER, 'share_member_remove', [members[0].id])
    const items = await list(AMY)
    expect(summary(items)).toEqual(['share_received:Midterm Reviewers'])
    // And the link still opens it, so the notification still can.
    expect(items[0].token).toBe(s.token)
  })

  it('tells everyone on it when sharing stops', async () => {
    const s = await share('folder', FOLDER)
    await invite(s, AMY)
    await invite(s, BEN)
    await rpc(db, AMY, 'share_open', [s.token])
    await rpc(db, BEN, 'share_open', [s.token])
    await rpc(db, OWNER, 'share_stop', [s.id])
    expect((await list(AMY))[0]).toMatchObject({ kind: 'share_removed', resource_name: 'Midterm Reviewers' })
    expect((await list(BEN))[0]).toMatchObject({ kind: 'share_removed' })
  })

  it('tells link members when the link narrows to invited people only', async () => {
    const s = await share('deck', DECK, 'link')
    await rpc(db, AMY, 'share_join', [s.token])
    await share('deck', DECK, 'invited')
    expect(summary(await list(AMY))).toEqual(['share_removed:CC 116 Algorithms'])
  })

  it('tells members when the owner deletes the deck', async () => {
    const s = await share('deck', DECK)
    await invite(s, AMY)
    await rpc(db, AMY, 'share_open', [s.token])
    await rpc(db, OWNER, 'sync_library', [JSON.stringify({ decks_remove: [DECK] })])
    expect((await list(AMY))[0]).toMatchObject({ kind: 'share_deleted', resource_kind: 'deck', token: null })
  })

  it('says nothing when a reader leaves by choice', async () => {
    const s = await share('deck', DECK)
    await invite(s, AMY)
    await rpc(db, AMY, 'share_open', [s.token])
    await rpc(db, AMY, 'share_leave', [s.id])
    expect(summary(await list(AMY))).toEqual(['share_received:CC 116 Algorithms'])
  })
})

describe('who can see and change them', () => {
  it('shows each reader their own and nobody else’s, and nothing to a guest', async () => {
    const s = await share('deck', DECK)
    await invite(s, AMY)
    await invite(s, BEN)
    expect(await list(AMY)).toHaveLength(1)
    await as(db, AMY, async () => {
      expect((await db.query(`select user_id from notifications`)).rows).toEqual([{ user_id: AMY.id }])
    })
    await as(db, OWNER, async () => {
      expect((await db.query(`select * from notifications`)).rows).toEqual([])
    })
    await expect(rpc(db, null, 'notifications_list', [50])).rejects.toThrow(/permission denied for function/)
  })

  it('cannot be written, changed or deleted from the browser, even one’s own', async () => {
    const s = await share('deck', DECK)
    await invite(s, AMY)
    const sql = (text, args) => as(db, AMY, () => db.query(text, args))
    await expect(sql(`insert into notifications (user_id, kind, resource_kind) values ($1, 'share_received', 'deck')`, [BEN.id]))
      .rejects.toThrow(/row-level security/)
    await expect(sql(`insert into notifications (user_id, kind, resource_kind) values ($1, 'share_received', 'deck')`, [AMY.id]))
      .rejects.toThrow(/row-level security/)
    expect((await sql(`update notifications set resource_name = 'x'`)).affectedRows ?? 0).toBe(0)
    expect((await sql(`delete from notifications`)).affectedRows ?? 0).toBe(0)
    await expect(rpc(db, AMY, 'notify_share', [BEN.id, 'share_received', null, null])).rejects.toThrow(/permission denied/)
  })

  it('marks one read, or all, and only ever the caller’s own', async () => {
    const d = await share('deck', DECK)
    const f = await share('folder', FOLDER)
    await invite(d, AMY)
    await invite(f, AMY)
    await invite(d, BEN)
    const [first] = await list(AMY)
    const [bens] = await list(BEN)

    await rpc(db, AMY, 'notifications_mark_read', [[first.id, bens.id]])
    expect((await list(AMY)).map((n) => Boolean(n.read_at))).toEqual([true, false])
    expect((await list(BEN))[0].read_at).toBe(null)

    await rpc(db, AMY, 'notifications_mark_read', [null])
    expect((await list(AMY)).every((n) => n.read_at)).toBe(true)
    expect((await list(BEN))[0].read_at).toBe(null)
  })
})

describe('clearing', () => {
  it('removes the caller’s own — the given ones, or all — and never anyone else’s', async () => {
    const d = await share('deck', DECK)
    const f = await share('folder', FOLDER)
    await invite(d, AMY)
    await invite(f, AMY)
    await invite(d, BEN)
    const [first] = await list(AMY)
    const [bens] = await list(BEN)

    // One of hers, and one of his sent along with it.
    await rpc(db, AMY, 'notifications_clear', [[first.id, bens.id]])
    expect(await list(AMY)).toHaveLength(1)
    expect(await list(BEN)).toHaveLength(1)

    await rpc(db, AMY, 'notifications_clear', [null])
    expect(await list(AMY)).toEqual([])
    expect(await list(BEN)).toHaveLength(1)
  })

  it('is not open to anyone signed out', async () => {
    await expect(rpc(db, null, 'notifications_clear', [null])).rejects.toThrow(/permission denied for function/)
  })
})

describe('Realtime', () => {
  it('adds the table to Supabase’s publication where there is one, and runs cleanly where there is not', async () => {
    // Where there is not: this database, which ran every migration already.
    expect((await db.query(`select 1 from pg_publication_tables where tablename = 'notifications'`)).rows).toEqual([])
    await db.exec(`create publication supabase_realtime`)
    const sql = readFileSync(fileURLToPath(new URL('../migrations/0007_notifications.sql', import.meta.url)), 'utf8')
      .replace(/^begin;$/m, '')
      .replace(/^commit;$/m, '')
    await db.exec(sql)
    await db.exec(sql)
    expect((await db.query(`select tablename from pg_publication_tables where pubname = 'supabase_realtime'`)).rows)
      .toEqual([{ tablename: 'notifications' }])
  })
})
