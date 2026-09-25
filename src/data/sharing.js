/**
 * Sharing, as calls to the database.
 *
 * Every rule about who may do what lives in Postgres (supabase/migrations/
 * 0006_sharing.sql): these are thin wrappers that send the request and turn
 * the answer, or the refusal, into something a page can show. Nothing here
 * decides access. Hiding a button is a courtesy; the function refusing is the
 * rule.
 *
 * Everything answers `{ data, error }`, with `error` a sentence for a reader
 * rather than a Postgres message.
 */
import { getSupabase } from './supabase.js'

/** The link a reader is handed. The token, never an id. */
export const shareUrl = (kind, token, origin = globalThis.location?.origin ?? '') =>
  `${origin}/shared/${kind}/${token}`

/** Where a shared deck or folder lives in this app, for navigation. */
export const sharePath = (kind, token) => `/shared/${kind}/${token}`

/** Postgres and PostgREST refusals, as something to say. */
function explain(error) {
  if (!error) return null
  const text = `${error.message ?? ''} ${error.details ?? ''}`
  if (error.code === 'PGRST202' || error.code === '42883' || /could not find the function/i.test(text)) {
    return 'Sharing isn’t set up on this Gunit project yet.'
  }
  if (/that is you/.test(text)) return 'That’s your own address — you already have this.'
  if (/not an email/.test(text)) return 'That doesn’t look like an email address.'
  if (/share is off/.test(text)) return 'Turn sharing back on before inviting anyone.'
  if (/not your (deck|folder)/.test(text)) {
    return 'This hasn’t reached your account yet. Give it a moment and try again.'
  }
  if (/not an editor|sign in to edit|deck is not in this share/.test(text)) {
    return 'You can study this, but not change it.'
  }
  if (/failed to fetch|network/i.test(text)) return 'You’re offline. Sharing needs a connection.'
  return 'Something went wrong. Try again in a moment.'
}

async function call(name, args) {
  const supabase = await getSupabase()
  if (!supabase) return { data: null, error: 'Sharing needs a Gunit account, and this copy has none.' }
  try {
    const { data, error } = await supabase.rpc(name, args)
    return { data: error ? null : data, error: explain(error) }
  } catch (e) {
    return { data: null, error: explain(e) }
  }
}

// ---------------------------------------------------------------------------
// The owner's side.
// ---------------------------------------------------------------------------

/** How a deck or folder is shared now, or `data: null` if it never has been. */
export const shareSettings = (kind, id) => call('share_settings', { p_kind: kind, p_id: id })

/** Shares it, or changes who and how. Answers the settings as they now are. */
export const setShare = (kind, id, access, role) =>
  call('share_set', { p_kind: kind, p_id: id, p_access: access, p_role: role })

export const resetShareLink = (shareId) => call('share_reset_link', { p_share: shareId })
export const stopSharing = (shareId) => call('share_stop', { p_share: shareId })
export const inviteToShare = (shareId, email, role) =>
  call('share_invite', { p_share: shareId, p_email: email, p_role: role })
export const setMemberRole = (memberId, role) => call('share_member_role', { p_member: memberId, p_role: role })
export const removeMember = (memberId) => call('share_member_remove', { p_member: memberId })

// ---------------------------------------------------------------------------
// The recipient's side.
// ---------------------------------------------------------------------------

/**
 * Opens a link. `data.status` says what to show — see `share_open` — and is
 * 'ok' only with content attached.
 */
export const openShare = (token) => call('share_open', { p_token: token })
export const joinShare = (token) => call('share_join', { p_token: token })
export const leaveShare = (shareId) => call('share_leave', { p_share: shareId })
export const listSharedWithMe = () => call('shared_with_me', {})

/**
 * An editor's change to a shared deck's cards: content only. `upsert` is
 * `{ id, front, back, position }`; `remove` is card ids.
 */
export const editSharedCards = (token, deckId, upsert = [], remove = []) =>
  call('share_edit_cards', { p_token: token, p_deck: deckId, p_upsert: upsert, p_remove: remove })

// ---------------------------------------------------------------------------
// A recipient's own progress on shared cards. Straight to the table: row level
// security is the whole of the rule here, and it is the reader's own rows.
// ---------------------------------------------------------------------------

const asStamp = (ms) => (typeof ms === 'number' && Number.isFinite(ms) ? new Date(ms).toISOString() : null)
const asMillis = (stamp) => {
  const ms = stamp ? Date.parse(stamp) : NaN
  return Number.isNaN(ms) ? null : ms
}

/** A schedule entry as a `card_progress` row. */
export const progressRow = (userId, cardId, entry) => ({
  user_id: userId,
  card_id: cardId,
  due: asStamp(entry.due),
  interval: entry.interval ?? 0,
  ease: entry.ease ?? 2.5,
  reps: entry.reps ?? 0,
  lapses: entry.lapses ?? 0,
  last_grade: entry.last ?? null,
  suspended: entry.suspended === true,
})

/**
 * And back. A row never graded and not suspended is no entry at all, which is
 * how the app tells a new card from one seen and forgotten.
 */
export const entryFromRow = (row) =>
  row.last_grade || row.suspended
    ? {
        due: asMillis(row.due),
        interval: row.interval ?? 0,
        ease: row.ease ?? 2.5,
        reps: row.reps ?? 0,
        lapses: row.lapses ?? 0,
        last: row.last_grade ?? null,
        ...(row.suspended ? { suspended: true } : {}),
      }
    : null

export async function fetchProgress(cardIds) {
  const supabase = await getSupabase()
  if (!supabase || !cardIds.length) return { data: [], error: null }
  try {
    const { data, error } = await supabase.from('card_progress').select('*').in('card_id', cardIds)
    return { data: data ?? [], error: explain(error) }
  } catch (e) {
    return { data: null, error: explain(e) }
  }
}

export async function saveProgress(rows) {
  const supabase = await getSupabase()
  if (!supabase || !rows.length) return { error: null }
  try {
    const { error } = await supabase.from('card_progress').upsert(rows, { onConflict: 'user_id,card_id' })
    return { error: explain(error) }
  } catch (e) {
    return { error: explain(e) }
  }
}
