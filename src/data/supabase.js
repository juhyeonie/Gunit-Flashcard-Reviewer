/**
 * The Supabase client, loaded only if there is a project to talk to.
 *
 * Gunit works without an account: decks live in localStorage and always have.
 * Signing in adds a durable copy on top of that, it does not replace it — so
 * the app has to start, run and study perfectly well with no credentials
 * configured at all. A clone with no `.env` is a working flashcard app, not a
 * blank screen.
 *
 * The client is a dynamic import for the same reason every parser in this
 * project is one: nobody should download an auth and database library to
 * revise a deck offline.
 *
 * Only the anon key belongs here. It is a public value — row level security is
 * what protects the data, not the secrecy of that key. The service_role key
 * bypasses RLS entirely and must never be given to a browser, which in Vite
 * means it must never be named `VITE_*` and never be put in this file's reach.
 */

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/** Whether an account is even on offer. Cheap, and safe to call at render. */
export const isConfigured = Boolean(url && anonKey)

let client = null
let loading = null

/**
 * The shared client, created once. Returns null when nothing is configured,
 * so callers can treat "no project" and "not signed in" as the same quiet
 * absence rather than an error to handle.
 */
export async function getSupabase() {
  if (!isConfigured) return null
  if (client) return client

  loading ??= import('@supabase/supabase-js').then(({ createClient }) => {
    client = createClient(url, anonKey, {
      auth: {
        // The session is restored on load and refreshed in the background, so
        // a reader who signed in last week is still signed in.
        persistSession: true,
        autoRefreshToken: true,
        // Password recovery arrives back as a link containing a token in the
        // URL fragment; this is what reads it.
        detectSessionInUrl: true,
      },
    })
    return client
  })

  return loading
}
