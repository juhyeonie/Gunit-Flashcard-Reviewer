/**
 * The reader's profile picture.
 *
 * Where it lives depends on who is reading:
 *
 *   - A guest's is kept in this browser and nowhere else, like the rest of a
 *     guest's things.
 *   - An account's is a file in the private `avatars` bucket, in a folder
 *     named after the account (supabase/migrations/0009_preferences_avatar.sql),
 *     and `profiles.avatar_path` says which file is current. Each new picture
 *     gets a new name, so another device can tell from the path alone that it
 *     has changed, and the old file is removed once the new one is in place.
 *
 * Either way the picture on screen comes from this device's copy — a `data:`
 * URL under `gunit.avatar.<id|guest>` — so it is there offline, and there
 * instantly on launch. Nothing about it is ever part of the library itself.
 *
 * Changing an account's picture needs the connection; the Settings page says
 * so rather than letting it fail.
 */
import { getSupabase } from './supabase.js'
import { avatarKey } from './storageKeys.js'
import { blobToDataUrl, squareAvatar } from './avatarImage.js'

export const AVATAR_BUCKET = 'avatars'

/** What may be picked: the common photo formats. */
export const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/**
 * The largest photo worth decoding. A picture is cropped and shrunk before it
 * is stored, so this is not about storage — it keeps a 40-megapixel file from
 * taking a phone's memory down with it.
 */
export const MAX_AVATAR_FILE = 10 * 1024 * 1024

/** What Storage accepts, matching the bucket's own limit. The app's are a few KB. */
export const MAX_AVATAR_STORED = 512 * 1024

/** Why a file cannot be a picture, as a dictionary key, or null when it can. */
export function checkAvatarFile(file) {
  if (!file) return 'avatar.errors.unreadable'
  if (!AVATAR_TYPES.includes(file.type)) return 'avatar.errors.type'
  if (file.size > MAX_AVATAR_FILE) return 'avatar.errors.tooLarge'
  if (file.size === 0) return 'avatar.errors.unreadable'
  return null
}

/* ------------------------------------------------------------------------ */
/* This device's copy, as a tiny store components can subscribe to.         */
/* ------------------------------------------------------------------------ */

const listeners = new Set()
const snapshots = new Map()

export function subscribeAvatar(listener) {
  listeners.add(listener)
  const onStorage = (e) => {
    if (e.key?.startsWith('gunit.avatar.')) listener()
  }
  // Another tab changing the picture shows here too.
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

/**
 * `{ path, src, at }` or null. The same object for as long as storage holds
 * the same text, which is what useSyncExternalStore needs.
 */
export function readAvatar(userId) {
  const key = avatarKey(userId)
  let raw = null
  try {
    raw = localStorage.getItem(key)
  } catch {
    return null
  }
  const known = snapshots.get(key)
  if (known && known.raw === raw) return known.value
  let value = null
  try {
    const parsed = raw ? JSON.parse(raw) : null
    value = parsed && typeof parsed.src === 'string' && parsed.src.startsWith('data:image/') ? parsed : null
  } catch {
    value = null
  }
  snapshots.set(key, { raw, value })
  return value
}

function write(userId, value) {
  try {
    if (value) localStorage.setItem(avatarKey(userId), JSON.stringify({ ...value, at: Date.now() }))
    else localStorage.removeItem(avatarKey(userId))
  } catch {
    // Storage full or refused: the picture shows until the page is closed.
  }
  for (const listener of listeners) listener()
}

/* ------------------------------------------------------------------------ */
/* Changing it.                                                               */
/* ------------------------------------------------------------------------ */

const extensionOf = (type) => (type === 'image/webp' ? 'webp' : type === 'image/png' ? 'png' : 'jpg')

/** Storage and PostgREST refusals, as dictionary keys. */
function problemOf(error) {
  const text = `${error?.message ?? ''} ${error?.error ?? ''} ${error?.statusCode ?? ''}`
  if (/failed to fetch|network|offline/i.test(text)) return 'avatar.errors.offline'
  if (/bucket not found|avatar_path|PGRST204|schema cache/i.test(text) || error?.code === 'PGRST204') {
    return 'avatar.errors.notSetUp'
  }
  if (/payload too large|exceeded the maximum|413/i.test(text)) return 'avatar.errors.tooLarge'
  return 'avatar.errors.upload'
}

/** Removes a file that is no longer the picture. Best effort: a stray file costs a few KB. */
async function discard(supabase, path) {
  if (!path) return
  try {
    await supabase.storage.from(AVATAR_BUCKET).remove([path])
  } catch {
    // Left in the reader's own folder, where only they can see it.
  }
}

/**
 * Makes `file` the picture for `userId` (null for a guest). Answers
 * `{ error }`, with a dictionary key when it did not work.
 */
export async function setAvatar(userId, file) {
  const problem = checkAvatarFile(file)
  if (problem) return { error: problem }

  let blob
  try {
    blob = await squareAvatar(file)
  } catch {
    return { error: 'avatar.errors.unreadable' }
  }
  if (!blob || blob.size > MAX_AVATAR_STORED) return { error: 'avatar.errors.tooLarge' }
  const src = await blobToDataUrl(blob)

  if (!userId) {
    write(null, { path: null, src })
    return { error: null }
  }

  const supabase = await getSupabase()
  if (!supabase) return { error: 'avatar.errors.notSetUp' }
  const previous = readAvatar(userId)?.path ?? null
  const path = `${userId}/${globalThis.crypto.randomUUID()}.${extensionOf(blob.type)}`

  try {
    const uploaded = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(path, blob, { contentType: blob.type, cacheControl: '3600', upsert: false })
    if (uploaded.error) return { error: problemOf(uploaded.error) }

    const { error } = await supabase.from('profiles').update({ avatar_path: path }).eq('id', userId)
    if (error) {
      // The file is useless without the row pointing at it.
      await discard(supabase, path)
      return { error: problemOf(error) }
    }
  } catch (error) {
    return { error: problemOf(error) }
  }

  write(userId, { path, src })
  if (previous !== path) await discard(supabase, previous)
  return { error: null }
}

/** Takes the picture away, leaving the fallback. Answers `{ error }`. */
export async function removeAvatar(userId) {
  if (!userId) {
    write(null, null)
    return { error: null }
  }
  const supabase = await getSupabase()
  if (!supabase) return { error: 'avatar.errors.notSetUp' }
  const previous = readAvatar(userId)?.path ?? null
  try {
    const { error } = await supabase.from('profiles').update({ avatar_path: null }).eq('id', userId)
    if (error) return { error: problemOf(error) }
  } catch (error) {
    return { error: problemOf(error) }
  }
  write(userId, null)
  await discard(supabase, previous)
  return { error: null }
}

/**
 * The account has said which picture is current: `path` from its profile row,
 * read at `readAt`. Fetched once when it differs from this device's copy, and
 * kept; a failed fetch leaves the old picture showing until the next read.
 *
 * A read that started before a change made on this device is stale by the
 * time it lands, and is ignored rather than allowed to put the old picture
 * back.
 */
export async function rememberAccountAvatar(userId, path, readAt = Date.now()) {
  if (!userId || path === undefined) return
  const mine = readAvatar(userId)
  if (mine?.at && mine.at > readAt) return
  if ((mine?.path ?? null) === (path ?? null)) return
  if (!path) {
    write(userId, null)
    return
  }
  const supabase = await getSupabase()
  if (!supabase) return
  try {
    const { data, error } = await supabase.storage.from(AVATAR_BUCKET).download(path)
    if (error || !data) return
    const src = await blobToDataUrl(data)
    const now = readAvatar(userId)
    if (now?.at && now.at > readAt) return
    write(userId, { path, src })
  } catch {
    // Offline, or the file is gone: the picture on screen stays as it was.
  }
}
