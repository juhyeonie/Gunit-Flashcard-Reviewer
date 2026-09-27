// @vitest-environment node
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { addUser, as, beginTest, endTest, freshDatabase } from './db.js'

/** Building Postgres and running every migration takes a while on a busy machine. */
const SETUP_TIMEOUT = 60_000

/**
 * Migration 0009: the reader's language, text size and picture, on their own
 * profile row, and the picture's file in a private bucket they alone can
 * reach — checked against row level security itself rather than read off the
 * SQL.
 */

const AMY = { id: '22222222-2222-4222-8222-222222222222', email: 'amy@example.com' }
const BEN = { id: '33333333-3333-4333-8333-333333333333', email: 'ben@example.com' }

let db

beforeAll(async () => {
  db = await freshDatabase()
  await addUser(db, AMY.id, AMY.email, 'Amy')
  await addUser(db, BEN.id, BEN.email, 'Ben')
}, SETUP_TIMEOUT)
beforeEach(() => beginTest(db))
afterEach(() => endTest(db))

const query = (who, sql, params = []) => as(db, who, async () => (await db.query(sql, params)).rows)
const update = (who, sql, params = []) => as(db, who, async () => (await db.query(sql, params)).affectedRows)

describe('preferences on the profile', () => {
  it('starts a new account with nothing chosen, so its first device can say', async () => {
    const [row] = await query(AMY, 'select language, font_size, avatar_path from public.profiles where id = $1', [AMY.id])
    expect(row).toEqual({ language: null, font_size: null, avatar_path: null })
  })

  it('lets a reader set their own language, text size and picture', async () => {
    const changed = await update(
      AMY,
      `update public.profiles set language = 'fil', font_size = 'large', avatar_path = $2 where id = $1`,
      [AMY.id, `${AMY.id}/one.webp`],
    )
    expect(changed).toBe(1)
    const [row] = await query(AMY, 'select language, font_size, avatar_path from public.profiles where id = $1', [AMY.id])
    expect(row).toEqual({ language: 'fil', font_size: 'large', avatar_path: `${AMY.id}/one.webp` })
  })

  it('shows a reader only their own row, and changes nobody else’s', async () => {
    const seen = await query(AMY, 'select id from public.profiles')
    expect(seen.map((r) => r.id)).toEqual([AMY.id])

    const changed = await update(AMY, `update public.profiles set language = 'fil' where id = $1`, [BEN.id])
    expect(changed).toBe(0)
    const [ben] = await query(BEN, 'select language from public.profiles where id = $1', [BEN.id])
    expect(ben.language).toBeNull()
  })

  it('shows a signed-out visitor no profile at all', async () => {
    await expect(query(null, 'select id from public.profiles')).resolves.toEqual([])
  })

  it('accepts any language code, so adding a language needs no migration', async () => {
    await expect(update(AMY, `update public.profiles set language = 'es' where id = $1`, [AMY.id])).resolves.toBe(1)
    await expect(update(AMY, `update public.profiles set language = 'pt-BR' where id = $1`, [AMY.id])).resolves.toBe(1)
  })

  it('refuses a language that is not a code, and a size that is not one of the three', async () => {
    await expect(update(AMY, `update public.profiles set language = 'English!' where id = $1`, [AMY.id])).rejects.toThrow(
      /language_is_a_code/,
    )
    await expect(update(AMY, `update public.profiles set font_size = 'huge' where id = $1`, [AMY.id])).rejects.toThrow(
      /font_size_is_known/,
    )
  })

  it('refuses a picture from anyone else’s folder', async () => {
    await expect(
      update(AMY, 'update public.profiles set avatar_path = $2 where id = $1', [AMY.id, `${BEN.id}/theirs.webp`]),
    ).rejects.toThrow(/avatar_is_own/)
  })
})

describe('the avatars bucket', () => {
  const put = (who, name) =>
    update(who, `insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [name])

  it('is private, and limited to small pictures in the three formats', async () => {
    const [bucket] = await query(AMY, `select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'avatars'`)
    expect(bucket).toEqual({
      public: false,
      file_size_limit: 524288,
      allowed_mime_types: ['image/webp', 'image/jpeg', 'image/png'],
    })
  })

  it('lets a reader put a picture in their own folder, and read it back', async () => {
    await expect(put(AMY, `${AMY.id}/one.webp`)).resolves.toBe(1)
    const rows = await query(AMY, `select name from storage.objects where bucket_id = 'avatars'`)
    expect(rows.map((r) => r.name)).toEqual([`${AMY.id}/one.webp`])
  })

  it('refuses a picture in someone else’s folder, or at the top of the bucket', async () => {
    await expect(put(AMY, `${BEN.id}/sneaky.webp`)).rejects.toThrow(/row-level security/)
    await expect(put(AMY, 'loose.webp')).rejects.toThrow(/row-level security/)
  })

  it('hides one reader’s picture from another, who cannot change or delete it either', async () => {
    await put(BEN, `${BEN.id}/ben.webp`)

    await expect(query(AMY, `select name from storage.objects where bucket_id = 'avatars'`)).resolves.toEqual([])
    await expect(
      update(AMY, `update storage.objects set name = $1 where bucket_id = 'avatars'`, [`${AMY.id}/stolen.webp`]),
    ).resolves.toBe(0)
    await expect(update(AMY, `delete from storage.objects where bucket_id = 'avatars'`)).resolves.toBe(0)

    const still = await query(BEN, `select name from storage.objects where bucket_id = 'avatars'`)
    expect(still.map((r) => r.name)).toEqual([`${BEN.id}/ben.webp`])
  })

  it('lets a reader replace and remove their own', async () => {
    await put(AMY, `${AMY.id}/old.webp`)
    await expect(
      update(AMY, `update storage.objects set name = $1 where name = $2`, [`${AMY.id}/new.webp`, `${AMY.id}/old.webp`]),
    ).resolves.toBe(1)
    await expect(update(AMY, `delete from storage.objects where name = $1`, [`${AMY.id}/new.webp`])).resolves.toBe(1)
  })

  it('gives a signed-out visitor nothing', async () => {
    await put(AMY, `${AMY.id}/one.webp`)
    await expect(query(null, `select name from storage.objects`)).resolves.toEqual([])
    await expect(put(null, `${AMY.id}/two.webp`)).rejects.toThrow(/row-level security/)
  })
})
