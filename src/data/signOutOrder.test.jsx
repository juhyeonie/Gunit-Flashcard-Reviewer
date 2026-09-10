// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * One thing, in its own file because it needs a configured project and
 * AuthProvider.test.jsx is deliberately about the opposite.
 *
 * Signing out has to send whatever the debounce is still holding *before* it
 * ends the session. After `signOut` there is no session, so row level security
 * refuses every row and the change has nowhere left to go — while local
 * storage has already handed the browser its own library back and taken the
 * account's away. Getting these two the wrong way round loses the change in
 * both places at once, silently.
 *
 * So the order is the assertion. A test that only checked both were called
 * would pass against the bug.
 */

const order = []

vi.mock('./supabase.js', () => ({
  isConfigured: true,
  getSupabase: async () => ({
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut: async () => {
        order.push('signOut')
        return { error: null }
      },
    },
  }),
}))

vi.mock('./pendingSync.js', () => ({
  registerPendingSync: () => () => {},
  flushPendingSync: async () => {
    order.push('flush')
    return { error: null }
  },
}))

const { AuthProvider } = await import('./AuthProvider.jsx')
const { useAuth } = await import('./useAuth.js')

const auth = () => renderHook(() => useAuth(), { wrapper: AuthProvider })

beforeEach(() => {
  order.length = 0
})

afterEach(cleanup)

describe('signing out', () => {
  it('sends what is still queued before ending the session', async () => {
    const { result } = auth()
    await waitFor(() => expect(result.current.status).toBe('ready'))

    await result.current.signOut()

    expect(order).toEqual(['flush', 'signOut'])
  })

  it('signs out anyway when the flush fails', async () => {
    // The reader asked to sign out, very possibly because they are walking
    // away from the machine. Refusing would strand them signed in on it, which
    // is worse than a change that did not save — and they have been told.
    vi.resetModules()
    vi.doMock('./pendingSync.js', () => ({
      registerPendingSync: () => () => {},
      flushPendingSync: async () => {
        order.push('flush')
        return { error: new Error('offline') }
      },
    }))

    const { AuthProvider: Fresh } = await import('./AuthProvider.jsx')
    const { useAuth: freshUseAuth } = await import('./useAuth.js')
    const { result } = renderHook(() => freshUseAuth(), { wrapper: Fresh })
    await waitFor(() => expect(result.current.status).toBe('ready'))

    const { error } = await result.current.signOut()

    expect(order).toEqual(['flush', 'signOut'])
    expect(error).toBe(null)
  })
})
