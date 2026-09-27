// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeProfileClient } from '../../test/fake-profile-client.js'

/**
 * The profile picture: what may be picked, where it goes, and what happens to
 * the one it replaces. The canvas work is replaced — jsdom has no canvas — and
 * everything around it is real.
 */

const USER = '686963f7-42a5-4f94-9225-52a8a0a4859a'
let client = null

vi.mock('./supabase.js', () => ({
  isConfigured: true,
  getSupabase: async () => client,
}))
vi.mock('./avatarImage.js', () => ({
  AVATAR_PIXELS: 256,
  squareAvatar: vi.fn(async () => new Blob(['square'], { type: 'image/webp' })),
  blobToDataUrl: vi.fn(async (blob) => `data:${blob.type};base64,${btoa(await blob.text())}`),
}))

const { MAX_AVATAR_FILE, checkAvatarFile, readAvatar, rememberAccountAvatar, removeAvatar, setAvatar } = await import(
  './avatar.js'
)
const { squareAvatar } = await import('./avatarImage.js')
const { avatarKey, forgetAccountLibrary } = await import('./storageKeys.js')

const photo = (type = 'image/jpeg', size = 2048) => {
  const file = new File(['x'], `photo.${type.split('/')[1]}`, { type })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

beforeEach(() => {
  localStorage.clear()
  client = fakeProfileClient({ userId: USER })
  squareAvatar.mockClear()
})
afterEach(() => localStorage.clear())

describe('what may be picked', () => {
  it('takes JPG, PNG and WebP', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) expect(checkAvatarFile(photo(type))).toBeNull()
  })

  it('refuses anything else, whatever it is called', () => {
    expect(checkAvatarFile(photo('image/gif'))).toBe('avatar.errors.type')
    expect(checkAvatarFile(new File(['x'], 'notes.jpg', { type: 'text/plain' }))).toBe('avatar.errors.type')
  })

  it('refuses a photo too large to be worth decoding, before decoding it', async () => {
    expect(checkAvatarFile(photo('image/jpeg', MAX_AVATAR_FILE + 1))).toBe('avatar.errors.tooLarge')
    await expect(setAvatar(USER, photo('image/jpeg', MAX_AVATAR_FILE + 1))).resolves.toEqual({
      error: 'avatar.errors.tooLarge',
    })
    expect(squareAvatar).not.toHaveBeenCalled()
    expect(client.uploads).toEqual([])
  })

  it('refuses a file that will not decode as a picture', async () => {
    squareAvatar.mockRejectedValueOnce(new Error('unreadable'))
    await expect(setAvatar(USER, photo())).resolves.toEqual({ error: 'avatar.errors.unreadable' })
    expect(client.uploads).toEqual([])
  })
})

describe('a guest’s picture', () => {
  it('is kept in this browser, and nowhere else', async () => {
    await expect(setAvatar(null, photo())).resolves.toEqual({ error: null })
    expect(readAvatar(null)).toMatchObject({ path: null, src: 'data:image/webp;base64,c3F1YXJl' })
    expect(client.uploads).toEqual([])
  })

  it('can be taken away again', async () => {
    await setAvatar(null, photo())
    await removeAvatar(null)
    expect(readAvatar(null)).toBeNull()
  })
})

describe('an account’s picture', () => {
  it('is cropped, sent to the reader’s own folder, and named on the profile', async () => {
    await expect(setAvatar(USER, photo('image/png'))).resolves.toEqual({ error: null })

    expect(squareAvatar).toHaveBeenCalledTimes(1)
    const [upload] = client.uploads
    expect(upload.bucket).toBe('avatars')
    expect(upload.path).toMatch(new RegExp(`^${USER}/[0-9a-f-]{36}\\.webp$`))
    expect(upload.options).toMatchObject({ contentType: 'image/webp', upsert: false })
    expect(client.row.avatar_path).toBe(upload.path)
    expect(readAvatar(USER)).toMatchObject({ path: upload.path, src: expect.stringMatching(/^data:image\/webp/) })
  })

  it('replaces the old file rather than leaving it behind', async () => {
    await setAvatar(USER, photo())
    const first = client.row.avatar_path
    await setAvatar(USER, photo())
    const second = client.row.avatar_path

    expect(second).not.toBe(first)
    expect(client.removed).toEqual([first])
    expect([...client.files.keys()]).toEqual([second])
  })

  it('is removed from the profile and from Storage', async () => {
    await setAvatar(USER, photo())
    const path = client.row.avatar_path
    await expect(removeAvatar(USER)).resolves.toEqual({ error: null })

    expect(client.row.avatar_path).toBeNull()
    expect(client.removed).toEqual([path])
    expect(readAvatar(USER)).toBeNull()
  })

  it('says so when there is no connection, and changes nothing', async () => {
    client.failUploads = { message: 'Failed to fetch' }
    await expect(setAvatar(USER, photo())).resolves.toEqual({ error: 'avatar.errors.offline' })
    expect(client.row.avatar_path).toBeNull()
    expect(readAvatar(USER)).toBeNull()
  })

  it('takes back a file the profile could not be pointed at', async () => {
    client.failUpdates = 'legacy'
    await expect(setAvatar(USER, photo())).resolves.toEqual({ error: 'avatar.errors.notSetUp' })
    expect(client.removed).toEqual([client.uploads[0].path])
    expect(client.files.size).toBe(0)
  })

  it('does not let a read from before a change put the old picture back', async () => {
    const readAt = Date.now() - 1000
    await setAvatar(USER, photo())
    const mine = client.row.avatar_path
    client.files.set(`${USER}/stale.webp`, new Blob(['old'], { type: 'image/webp' }))

    await rememberAccountAvatar(USER, `${USER}/stale.webp`, readAt)
    expect(readAvatar(USER).path).toBe(mine)
    // Not even fetched: it was known to be stale before anything was asked.
    expect(client.downloads).toEqual([])
  })

  it('comes off the machine with the rest of the account on signing out', async () => {
    await setAvatar(USER, photo())
    expect(localStorage.getItem(avatarKey(USER))).not.toBeNull()
    forgetAccountLibrary(USER)
    expect(localStorage.getItem(avatarKey(USER))).toBeNull()
  })
})
