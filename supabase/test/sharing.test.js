// @vitest-environment node
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { addUser, as, beginTest, endTest, freshDatabase, rpc } from './db.js'

/** Building Postgres and running every migration takes a while on a busy machine. */
const SETUP_TIMEOUT = 60_000

/**
 * Sharing, checked where it is enforced: in Postgres, as each kind of caller.
 *
 * Every "cannot" here is a request the browser could send by hand — a select
 * on another reader's table, an insert into shares, a function called with
 * someone else's ids — and every one is refused by the database, not by a
 * button being hidden.
 */

const id = (n) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`
const OWNER = { id: '11111111-1111-4111-8111-111111111111', email: 'olive@example.com' }
const AMY = { id: '22222222-2222-4222-8222-222222222222', email: 'amy@example.com' }
const BEN = { id: '33333333-3333-4333-8333-333333333333', email: 'ben@example.com' }
const ANON = null

const FOLDER = id(1)
const [MOD1, MOD2, SOLO, OTHER] = [id(11), id(12), id(13), id(14)]
const [C1, C2, S1, S2, X1] = [id(21), id(22), id(31), id(32), id(41)]

const deck = (did, title, folder_id = null) => ({
  id: did, user_id: OWNER.id, title, subject: 'CC 116', description: 'Reviewer', studied_at: null, folder_id,
})
/** A card the owner has studied: its schedule is the owner's and nobody else's. */
const studied = (cid, did, front, position) => ({
  id: cid, deck_id: did, user_id: OWNER.id, front, back: `${front}, answered`, position,
  due: '2026-10-01T00:00:00Z', interval: 1440, ease: 2.1, reps: 5, lapses: 1, last_grade: 'good', suspended: false,
})

let db

// Built and seeded once. Each test runs in a transaction rolled back after it.
beforeAll(async () => {
  db = await freshDatabase()
  await addUser(db, OWNER.id, OWNER.email, 'Olive')
  await addUser(db, AMY.id, AMY.email, 'Amy')
  await addUser(db, BEN.id, BEN.email, 'Ben')
  await rpc(db, OWNER, 'sync_library', [
    JSON.stringify({
      folders_upsert: [{ id: FOLDER, user_id: OWNER.id, name: 'CC 116' }],
      decks_upsert: [deck(MOD1, 'Module 1', FOLDER), deck(MOD2, 'Module 2', FOLDER), deck(SOLO, 'Module 6'), deck(OTHER, 'Private')],
      cards_upsert: [
        studied(C1, MOD1, 'What is a thread?', 0),
        studied(C2, MOD2, 'What is a process?', 0),
        studied(S1, SOLO, 'What is paging?', 0),
        studied(S2, SOLO, 'What is a TLB?', 1),
        studied(X1, OTHER, 'Not shared', 0),
      ],
    }),
  ])
}, SETUP_TIMEOUT)

beforeEach(() => beginTest(db))
afterEach(() => endTest(db))

const shareDeck = (deckId, access = 'link', role = 'viewer') => rpc(db, OWNER, 'share_set', ['deck', deckId, access, role])
const shareFolder = (access = 'link', role = 'viewer') => rpc(db, OWNER, 'share_set', ['folder', FOLDER, access, role])
const open = (user, token) => rpc(db, user, 'share_open', [token])
const cardsIn = (answer) => answer.decks.flatMap((d) => d.cards)
const edit = (user, token, deckId, upsert = [], remove = []) =>
  rpc(db, user, 'share_edit_cards', [token, deckId, JSON.stringify(upsert), remove])
const denied = (promise) => expect(promise).rejects.toThrow(/permission denied|not your|not an editor|row-level security|not in this share|sign in/)
const ownerCard = async (cid) => (await db.query(`select * from cards where id = $1`, [cid])).rows[0]

describe('a link', () => {
  it('is a random token, not an id', async () => {
    const share = await shareDeck(SOLO)
    expect(share.token).toMatch(/^[0-9a-f]{32}$/)
    expect(share.token).not.toContain(SOLO.replace(/-/g, ''))
    expect(share).toMatchObject({ kind: 'deck', access: 'link', role: 'viewer', active: true })
  })

  it('opens for anyone, signed in or not, with the content and none of the owner’s schedule', async () => {
    const { token } = await shareDeck(SOLO)
    for (const who of [ANON, AMY]) {
      const answer = await open(who, token)
      expect(answer).toMatchObject({ status: 'ok', kind: 'deck', name: 'Module 6', role: 'viewer', owner_name: 'Olive' })
      expect(cardsIn(answer).map((c) => c.front)).toEqual(['What is paging?', 'What is a TLB?'])
      const text = JSON.stringify(answer)
      for (const key of ['due', 'ease', 'reps', 'lapses', 'last_grade', 'interval', 'suspended', 'user_id', 'email']) {
        expect(text).not.toContain(`"${key}"`)
      }
    }
  })

  it('answers every kind of dead link with a status rather than an error', async () => {
    expect(await open(AMY, 'nope')).toEqual({ status: 'not_found' })
    const share = await shareDeck(SOLO)
    await rpc(db, OWNER, 'share_stop', [share.id])
    expect(await open(AMY, share.token)).toMatchObject({ status: 'revoked', kind: 'deck' })
    expect(await open(ANON, share.token)).toMatchObject({ status: 'revoked' })
    // The owner still sees their own, to turn it back on.
    expect(await open(OWNER, share.token)).toMatchObject({ status: 'ok', role: 'owner' })
  })

  it('caps a reader who is not signed in at viewer, even on an editor link', async () => {
    const { token } = await shareDeck(SOLO, 'link', 'editor')
    expect((await open(ANON, token)).role).toBe('viewer')
    expect((await open(AMY, token)).role).toBe('editor')
  })

  it('stops working when reset, and the new one works', async () => {
    const share = await shareDeck(SOLO)
    const fresh = await rpc(db, OWNER, 'share_reset_link', [share.id])
    expect(fresh.token).not.toBe(share.token)
    expect(await open(AMY, share.token)).toEqual({ status: 'not_found' })
    expect((await open(AMY, fresh.token)).status).toBe('ok')
  })

  it('goes with the deck when the owner deletes it', async () => {
    const { token } = await shareDeck(SOLO)
    await rpc(db, OWNER, 'sync_library', [JSON.stringify({ decks_remove: [SOLO] })])
    expect(await open(AMY, token)).toEqual({ status: 'not_found' })
  })
})

describe('the tables themselves', () => {
  it('stay the owner’s: a recipient reads none of their decks, cards or schedule directly', async () => {
    const { token } = await shareDeck(SOLO)
    await rpc(db, AMY, 'share_join', [token])
    await as(db, AMY, async () => {
      expect((await db.query(`select * from cards`)).rows).toEqual([])
      expect((await db.query(`select * from decks`)).rows).toEqual([])
      expect((await db.query(`select * from shares`)).rows).toEqual([])
    })
    await as(db, ANON, async () => {
      expect((await db.query(`select * from cards`)).rows).toEqual([])
    })
  })

  it('refuse a share, a membership or a token change written by hand', async () => {
    const share = await shareDeck(SOLO)
    // Each its own request, as it would arrive.
    const sql = (user, text, args) => as(db, user, () => db.query(text, args))
    await denied(sql(AMY, `insert into shares (owner_id, deck_id) values ($1, $2)`, [AMY.id, SOLO]))
    await denied(sql(AMY, `insert into share_members (share_id, user_id, via) values ($1, $2, 'link')`, [share.id, AMY.id]))
    expect((await sql(AMY, `update shares set role = 'editor'`)).affectedRows ?? 0).toBe(0)
    // Not even the owner writes these by hand: the functions are the only way in.
    expect((await sql(OWNER, `update shares set token = 'guessable'`)).affectedRows ?? 0).toBe(0)
    expect((await sql(OWNER, `delete from share_members`)).affectedRows ?? 0).toBe(0)
    expect((await open(AMY, share.token)).status).toBe('ok')
  })

  it('refuse the owner’s functions to anyone else', async () => {
    const share = await shareDeck(SOLO)
    await denied(rpc(db, AMY, 'share_set', ['deck', SOLO, 'link', 'editor']))
    await denied(rpc(db, AMY, 'share_settings', ['deck', SOLO]))
    await denied(rpc(db, AMY, 'share_reset_link', [share.id]))
    await denied(rpc(db, AMY, 'share_stop', [share.id]))
    await denied(rpc(db, AMY, 'share_invite', [share.id, 'amy@example.com', 'editor']))
    // Not signed in is refused before the function even runs: no grant at all.
    for (const [name, args] of [
      ['share_set', ['deck', SOLO, 'link', 'editor']],
      ['share_settings', ['deck', SOLO]],
      ['share_stop', [share.id]],
      ['share_join', [share.token]],
      ['share_edit_cards', [share.token, SOLO, '[]', []]],
      ['shared_with_me', []],
      ['deck_role', [SOLO]],
    ]) {
      await expect(rpc(db, ANON, name, args)).rejects.toThrow(/permission denied for function/)
    }
    // And the helpers nobody calls directly are callable by nobody.
    for (const name of ['member_role', 'share_access', 'claim_invitations', 'shared_deck_json', 'owned_share']) {
      const args = name === 'member_role' ? [share.id, AMY.id] : name === 'claim_invitations' ? [] : [share.id]
      await expect(rpc(db, AMY, name, args)).rejects.toThrow(/permission denied for function/)
    }
  })
})

describe('editing', () => {
  it('is refused to a viewer, and to anyone not signed in', async () => {
    const { token } = await shareDeck(SOLO, 'link', 'viewer')
    await rpc(db, AMY, 'share_join', [token])
    await denied(edit(AMY, token, SOLO, [{ id: S1, front: 'Vandalised', back: 'x', position: 0 }]))
    await denied(edit(ANON, token, SOLO, [{ id: S1, front: 'Vandalised', back: 'x', position: 0 }]))
    expect((await ownerCard(S1)).front).toBe('What is paging?')
  })

  it('is refused to a signed-in stranger holding the link of an invited-only share', async () => {
    // Their role is null, not 'viewer' — the case a careless `not in` lets through.
    const share = await shareDeck(SOLO, 'invited', 'editor')
    await rpc(db, OWNER, 'share_invite', [share.id, BEN.email, 'editor'])
    await denied(edit(AMY, share.token, SOLO, [{ id: S1, front: 'Vandalised', back: 'x', position: 0 }]))
    expect((await ownerCard(S1)).front).toBe('What is paging?')
  })

  it('lets an editor change content, and never the owner’s schedule', async () => {
    const { token } = await shareDeck(SOLO, 'link', 'editor')
    const NEW = id(99)
    await edit(AMY, token, SOLO, [
      { id: S1, front: 'What is demand paging?', back: 'Loading pages when needed.', position: 0 },
      { id: NEW, front: 'What is thrashing?', back: 'Paging more than working.', position: 2 },
    ])
    expect(await ownerCard(S1)).toMatchObject({ front: 'What is demand paging?', ease: 2.1, reps: 5, last_grade: 'good' })
    // Added as the owner's card, and new to them.
    expect(await ownerCard(NEW)).toMatchObject({ user_id: OWNER.id, deck_id: SOLO, reps: 0, due: null, last_grade: null })
    // And the owner's own library reads it back like any other.
    await as(db, OWNER, async () => {
      expect((await db.query(`select id from cards where deck_id = $1`, [SOLO])).rows).toHaveLength(3)
    })
  })

  it('removes a card as the owner’s deletion, so the owner’s devices do not send it back', async () => {
    const { token } = await shareDeck(SOLO, 'link', 'editor')
    await edit(AMY, token, SOLO, [], [S2])
    expect(await ownerCard(S2)).toBeUndefined()
    const answer = await rpc(db, OWNER, 'sync_library', [JSON.stringify({ cards_upsert: [studied(S2, SOLO, 'What is a TLB?', 1)] })])
    expect(answer.cards).toEqual([S2])
    expect(await ownerCard(S2)).toBeUndefined()
  })

  it('cannot reach past the shared deck: not another deck, not another deck’s card', async () => {
    const { token } = await shareDeck(SOLO, 'link', 'editor')
    await denied(edit(AMY, token, OTHER, [{ id: X1, front: 'Vandalised', back: 'x', position: 0 }]))
    // A card id from another deck, sent as though it were in this one.
    const answer = await edit(AMY, token, SOLO, [{ id: X1, front: 'Moved in', back: 'x', position: 0 }])
    expect(answer.refused).toEqual([X1])
    expect(await ownerCard(X1)).toMatchObject({ deck_id: OTHER, front: 'Not shared' })
    // Removal of a card elsewhere does nothing.
    await edit(AMY, token, SOLO, [], [X1])
    expect(await ownerCard(X1)).toBeDefined()
  })
})

describe('private progress', () => {
  const progress = (user, cardId, reps) =>
    as(db, user, () =>
      db.query(
        `insert into card_progress (user_id, card_id, due, interval, ease, reps, last_grade)
         values ($1, $2, now(), 10, 2.6, $3, 'good')
         on conflict (user_id, card_id) do update set reps = excluded.reps`,
        [user.id, cardId, reps],
      ),
    )

  it('is one set per reader: twenty students, twenty schedules, none of them the owner’s', async () => {
    const { token } = await shareDeck(SOLO)
    await rpc(db, AMY, 'share_join', [token])
    await rpc(db, BEN, 'share_join', [token])
    await progress(AMY, S1, 3)
    await progress(BEN, S1, 7)

    await as(db, AMY, async () => {
      expect((await db.query(`select user_id, reps from card_progress`)).rows).toEqual([{ user_id: AMY.id, reps: 3 }])
    })
    await as(db, OWNER, async () => {
      expect((await db.query(`select * from card_progress`)).rows).toEqual([])
    })
    expect(await ownerCard(S1)).toMatchObject({ reps: 5, ease: 2.1 })
  })

  it('is refused on a card the reader cannot study, or under someone else’s name', async () => {
    const { token } = await shareDeck(SOLO)
    await denied(progress(AMY, S1, 1)) // not joined: no membership to go on
    await rpc(db, AMY, 'share_join', [token])
    await denied(progress(AMY, X1, 1)) // a card that is not shared
    await denied(as(db, AMY, () => db.query(
      `insert into card_progress (user_id, card_id) values ($1, $2)`, [BEN.id, S1])))
  })

  it('stops being writable when access goes, and stays the reader’s to read', async () => {
    const { token, id: shareId } = await shareDeck(SOLO)
    await rpc(db, AMY, 'share_join', [token])
    await progress(AMY, S1, 1)
    await rpc(db, OWNER, 'share_stop', [shareId])
    await denied(progress(AMY, S1, 2))
    await as(db, AMY, async () => {
      expect((await db.query(`select reps from card_progress`)).rows).toEqual([{ reps: 1 }])
    })
  })
})

describe('invited only', () => {
  it('turns away a reader who is not invited, and one who only had the link', async () => {
    const { token, id: shareId } = await shareDeck(SOLO, 'link', 'viewer')
    await rpc(db, AMY, 'share_join', [token])
    await rpc(db, OWNER, 'share_set', ['deck', SOLO, 'invited', 'viewer'])

    expect(await open(AMY, token)).toMatchObject({ status: 'no_access' })
    expect(await open(ANON, token)).toMatchObject({ status: 'sign_in' })
    expect(await rpc(db, AMY, 'share_join', [token])).toEqual({ status: 'no_access' })
    expect(await rpc(db, AMY, 'shared_with_me')).toEqual([])
    // The owner's list no longer counts her either.
    const settings = await rpc(db, OWNER, 'share_settings', ['deck', SOLO])
    expect(settings.members).toEqual([])
    expect(settings.id).toBe(shareId)
  })

  it('lets an invited reader in with the role they were given, claimed by their address', async () => {
    const share = await shareDeck(SOLO, 'invited', 'viewer')
    await rpc(db, OWNER, 'share_invite', [share.id, '  BEN@Example.com ', 'editor'])
    const answer = await open(BEN, share.token)
    expect(answer).toMatchObject({ status: 'ok', role: 'editor', joined: true })
    const [item] = await rpc(db, BEN, 'shared_with_me')
    expect(item).toMatchObject({ kind: 'deck', name: 'Module 6', owner_name: 'Olive', role: 'editor', cards: 2, token: share.token })
  })

  it('shows an invitation on Shared with me before the link is ever opened', async () => {
    const share = await shareDeck(SOLO, 'invited', 'viewer')
    await rpc(db, OWNER, 'share_invite', [share.id, BEN.email, 'viewer'])
    expect((await rpc(db, BEN, 'shared_with_me')).map((i) => i.name)).toEqual(['Module 6'])
  })

  it('keeps an invitation sent twice as one, with the later role', async () => {
    const share = await shareDeck(SOLO, 'invited', 'viewer')
    await rpc(db, OWNER, 'share_invite', [share.id, BEN.email, 'viewer'])
    const settings = await rpc(db, OWNER, 'share_invite', [share.id, BEN.email, 'editor'])
    expect(settings.members).toEqual([expect.objectContaining({ email: BEN.email, role: 'editor' })])
  })

  it('refuses the owner’s own address, and something that is not an address', async () => {
    const share = await shareDeck(SOLO, 'invited', 'viewer')
    await expect(rpc(db, OWNER, 'share_invite', [share.id, 'Olive@Example.com', 'viewer'])).rejects.toThrow(/that is you/)
    await expect(rpc(db, OWNER, 'share_invite', [share.id, 'not an address', 'viewer'])).rejects.toThrow(/not an email/)
  })

  it('lets the owner change a role and take someone off', async () => {
    const share = await shareDeck(SOLO, 'invited', 'viewer')
    await rpc(db, OWNER, 'share_invite', [share.id, BEN.email, 'viewer'])
    await open(BEN, share.token)
    let settings = await rpc(db, OWNER, 'share_settings', ['deck', SOLO])
    settings = await rpc(db, OWNER, 'share_member_role', [settings.members[0].id, 'editor'])
    expect(settings.members[0]).toMatchObject({ role: 'editor', name: 'Ben', joined: true })
    await rpc(db, OWNER, 'share_member_remove', [settings.members[0].id])
    expect(await open(BEN, share.token)).toMatchObject({ status: 'no_access' })
  })
})

describe('a shared folder', () => {
  it('opens with the decks in it now, and nothing outside it', async () => {
    const { token } = await shareFolder()
    const answer = await open(AMY, token)
    expect(answer).toMatchObject({ status: 'ok', kind: 'folder', name: 'CC 116' })
    expect(answer.decks.map((d) => d.title)).toEqual(['Module 1', 'Module 2'])
    expect(cardsIn(answer).map((c) => c.id)).toEqual([C1, C2])
  })

  it('follows a deck moved out, a deck moved in, and a deck deleted', async () => {
    const { token } = await shareFolder()
    await rpc(db, AMY, 'share_join', [token])
    await rpc(db, OWNER, 'sync_library', [
      JSON.stringify({ decks_upsert: [deck(MOD2, 'Module 2', null), deck(SOLO, 'Module 6', FOLDER)], decks_remove: [MOD1] }),
    ])
    expect((await open(AMY, token)).decks.map((d) => d.title)).toEqual(['Module 6'])
    expect(await rpc(db, AMY, 'deck_role', [MOD2])).toBe(null)
    expect(await rpc(db, AMY, 'deck_role', [SOLO])).toBe('viewer')
  })

  it('lets an editor edit a deck in it, and no deck outside it', async () => {
    const { token } = await shareFolder('link', 'editor')
    await edit(AMY, token, MOD1, [{ id: C1, front: 'What is a thread, exactly?', back: 'x', position: 0 }])
    expect((await ownerCard(C1)).front).toBe('What is a thread, exactly?')
    await denied(edit(AMY, token, SOLO, [{ id: S1, front: 'Vandalised', back: 'x', position: 0 }]))
  })

  it('goes with the folder when the owner deletes it', async () => {
    const { token } = await shareFolder()
    await rpc(db, OWNER, 'sync_library', [JSON.stringify({ folders_remove: [FOLDER] })])
    expect(await open(AMY, token)).toEqual({ status: 'not_found' })
  })
})

describe('joining and leaving', () => {
  it('puts a joined link on Shared with me, and leaving takes it off', async () => {
    const { token, id: shareId } = await shareFolder()
    expect(await rpc(db, AMY, 'share_join', [token])).toEqual({ status: 'ok', role: 'viewer' })
    expect(await rpc(db, AMY, 'share_join', [token])).toEqual({ status: 'ok', role: 'viewer' })
    const [item] = await rpc(db, AMY, 'shared_with_me')
    expect(item).toMatchObject({ kind: 'folder', name: 'CC 116', decks: 2, cards: 2, role: 'viewer' })
    await rpc(db, AMY, 'share_leave', [shareId])
    expect(await rpc(db, AMY, 'shared_with_me')).toEqual([])
    // The link itself still works for her; leaving is not being banned.
    expect((await open(AMY, token)).status).toBe('ok')
  })

  it('is not something the owner does with their own', async () => {
    const { token } = await shareDeck(SOLO)
    expect(await rpc(db, OWNER, 'share_join', [token])).toEqual({ status: 'owner' })
    expect(await rpc(db, OWNER, 'shared_with_me')).toEqual([])
  })

  it('takes a link member’s editing away when the link drops to viewer', async () => {
    const { token } = await shareDeck(SOLO, 'link', 'editor')
    await rpc(db, AMY, 'share_join', [token])
    await rpc(db, OWNER, 'share_set', ['deck', SOLO, 'link', 'viewer'])
    await denied(edit(AMY, token, SOLO, [{ id: S1, front: 'Too late', back: 'x', position: 0 }]))
  })

  it('starts a share turned off and on again with a new link and nobody on it', async () => {
    const share = await shareDeck(SOLO)
    await rpc(db, AMY, 'share_join', [share.token])
    await rpc(db, OWNER, 'share_stop', [share.id])
    const again = await shareDeck(SOLO)
    expect(again.token).not.toBe(share.token)
    expect(again.members).toEqual([])
    expect(await rpc(db, AMY, 'shared_with_me')).toEqual([])
  })
})
