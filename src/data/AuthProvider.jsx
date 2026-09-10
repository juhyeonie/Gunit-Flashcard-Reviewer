import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AuthContext } from './authContext.js'
import { getSupabase, isConfigured } from './supabase.js'
import { flushPendingSync } from './pendingSync.js'

/**
 * Who is signed in, if anyone, and the four things you can do about it.
 *
 * Signing in is optional in Gunit. With no project configured this provider
 * settles immediately into "no account on offer" and every page behaves
 * exactly as it did before there was such a thing as an account.
 *
 * Email confirmation is off, so signing up returns a session straight away and
 * a new reader is studying within a second of choosing a password. The one
 * thing that does need email is a forgotten password, which is why the project
 * needs its own SMTP: Supabase's built-in sender allows two messages an hour
 * and only to the project's own team.
 */
export function AuthProvider({ children }) {
  // `unavailable` is not a failure — it is the ordinary local-only app.
  const [status, setStatus] = useState(isConfigured ? 'loading' : 'unavailable')
  const [session, setSession] = useState(null)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  useEffect(() => {
    if (!isConfigured) return undefined

    let unsubscribe = () => {}

    getSupabase().then((supabase) => {
      if (!supabase || !alive.current) return

      supabase.auth.getSession().then(({ data }) => {
        if (!alive.current) return
        setSession(data.session ?? null)
        setStatus('ready')
      })

      // Covers sign-in, sign-out, token refresh, and arriving back from a
      // password-recovery link — all of which change who this browser is.
      const { data } = supabase.auth.onAuthStateChange((_event, next) => {
        if (!alive.current) return
        setSession(next ?? null)
        setStatus('ready')
      })
      unsubscribe = () => data.subscription.unsubscribe()
    })

    return () => unsubscribe()
  }, [])

  /**
   * Every call answers the same way — `{ error }`, with a message already
   * worded for the person reading it — so no caller has to know what shape a
   * Supabase error is, and an unconfigured project is simply an error like any
   * other rather than a crash.
   */
  const call = useCallback(async (run) => {
    const supabase = await getSupabase()
    if (!supabase) return { error: 'Accounts are not set up in this copy of Gunit' }
    try {
      const { error } = await run(supabase)
      return { error: error ? error.message : null }
    } catch (err) {
      return { error: err?.message || 'Something went wrong' }
    }
  }, [])

  const signUp = useCallback(
    (email, password, name) =>
      call((supabase) =>
        supabase.auth.signUp({
          email,
          password,
          // Read by the trigger that creates the profile row, so the greeting
          // says a name rather than an email address.
          options: { data: { name: name?.trim() || '' } },
        }),
      ),
    [call],
  )

  const signIn = useCallback(
    (email, password) => call((supabase) => supabase.auth.signInWithPassword({ email, password })),
    [call],
  )

  /**
   * Signing out, but not before whatever is still queued has gone up.
   *
   * Pushes are debounced, and signing out both cancels that timer and takes
   * the account's library out of local storage — so a change made in the last
   * second used to end up in neither place. It has to go first, too: after
   * `signOut` there is no session, and row level security refuses every row.
   */
  const signOut = useCallback(
    () =>
      call(async (supabase) => {
        // A failure here has already been reported to the reader. Signing out
        // is still what they asked for, and refusing to would strand them
        // signed in on a machine they may be walking away from.
        await flushPendingSync()
        return supabase.auth.signOut()
      }),
    [call],
  )

  /**
   * Sends the recovery email. `redirectTo` has to be a URL the project allows
   * — Supabase refuses any other — and it is where the link lands, carrying a
   * token that `detectSessionInUrl` turns into a short-lived session with
   * permission to set a new password.
   */
  const requestPasswordReset = useCallback(
    (email) =>
      call((supabase) =>
        supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        }),
      ),
    [call],
  )

  const updatePassword = useCallback(
    (password) => call((supabase) => supabase.auth.updateUser({ password })),
    [call],
  )

  const value = useMemo(
    () => ({
      available: isConfigured,
      status,
      session,
      user: session?.user ?? null,
      signUp,
      signIn,
      signOut,
      requestPasswordReset,
      updatePassword,
    }),
    [status, session, signUp, signIn, signOut, requestPasswordReset, updatePassword],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
