/**
 * The account's notifications, as calls to the database.
 *
 * Only sharing news lives in the account (supabase/migrations/
 * 0007_notifications.sql), written by the database itself when access is given,
 * changed or taken away. The browser reads its own and marks them read;
 * nothing here can write one.
 */
import { getSupabase } from './supabase.js'

async function rpc(name, args) {
  const supabase = await getSupabase()
  if (!supabase) return { data: null, error: 'unavailable' }
  try {
    const { data, error } = await supabase.rpc(name, args)
    return { data: error ? null : data, error: error ? (error.message ?? 'error') : null }
  } catch (e) {
    return { data: null, error: e?.message ?? 'offline' }
  }
}

export const fetchNotifications = () => rpc('notifications_list', { p_limit: 50 })

/** Marks these read, or every one of the caller's with `null`. */
export const markNotificationsRead = (ids) => rpc('notifications_mark_read', { p_ids: ids })

/**
 * Hears about a notification the moment the database writes one, while the
 * reader has Gunit open: Supabase Realtime, filtered to their own rows and
 * checked against row level security on the server. Answers the function
 * that stops listening.
 *
 * Keyed on the account, never the session: a token refresh must not tear this
 * down and rebuild it, any more than it re-reads the library.
 */
export function listenForNotifications(userId, onChange) {
  let channel = null
  let stopped = false
  getSupabase().then((supabase) => {
    if (!supabase || stopped || typeof supabase.channel !== 'function') return
    channel = supabase
      .channel(`notifications:${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, () =>
        onChange(),
      )
      .subscribe()
  })
  return () => {
    stopped = true
    if (channel) getSupabase().then((supabase) => supabase?.removeChannel(channel))
  }
}
