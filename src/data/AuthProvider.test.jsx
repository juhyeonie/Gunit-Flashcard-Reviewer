// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from './AuthProvider.jsx'
import { useAuth } from './useAuth.js'

/**
 * The auth layer with no Supabase project configured — which is the state the
 * test environment is in, a fresh clone is in, and the app has to work in.
 *
 * Signing in is an optional extra in Gunit. Everything here is about that
 * staying true: no crash, no blocking spinner, no account UI offered that
 * cannot work.
 *
 * The signed-in paths are not covered here. They are a network round trip to
 * a live project, and faking `@supabase/supabase-js` well enough to be worth
 * anything would mostly test the fake.
 */

const auth = () => renderHook(() => useAuth(), { wrapper: AuthProvider })

afterEach(cleanup)

describe('with no project configured', () => {
  it('says an account is not on offer, rather than failing', () => {
    const { result } = auth()
    expect(result.current.available).toBe(false)
    expect(result.current.user).toBe(null)
  })

  it('settles at once instead of waiting on a network that is not there', () => {
    // A "loading" that never resolves would gate the whole app behind a
    // spinner for anyone who cloned this without credentials.
    const { result } = auth()
    expect(result.current.status).toBe('unavailable')
  })

  it('answers every action with a reason rather than throwing', async () => {
    const { result } = auth()
    for (const call of [
      () => result.current.signIn('a@b.c', 'password'),
      () => result.current.signUp('a@b.c', 'password', 'Mara'),
      () => result.current.signOut(),
      () => result.current.requestPasswordReset('a@b.c'),
      () => result.current.updatePassword('password'),
    ]) {
      await expect(call()).resolves.toMatchObject({ error: expect.stringMatching(/not set up/) })
    }
  })

  it('keeps the same function identities across renders', async () => {
    // The store's own value is memoised on these; new ones every render would
    // re-run effects that depend on them.
    const { result, rerender } = auth()
    const first = result.current.signIn
    rerender()
    await waitFor(() => expect(result.current.signIn).toBe(first))
  })
})

describe('outside the provider', () => {
  it('says which provider is missing', () => {
    // Rendering a page without it is a wiring mistake, and a null context
    // would surface three frames away as "cannot read property user of null".
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useAuth())).toThrow(/AuthProvider/)
    spy.mockRestore()
  })
})
