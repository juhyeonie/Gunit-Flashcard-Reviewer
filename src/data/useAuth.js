import { useContext } from 'react'
import { AuthContext } from './authContext.js'

/**
 * Who is signed in, and what can be done about it.
 *
 * Safe to call anywhere: with no Supabase project configured it answers
 * `available: false` and a null user rather than throwing, because signing in
 * is an optional extra in Gunit rather than the way in.
 */
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
