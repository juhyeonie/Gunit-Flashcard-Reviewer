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
let signOutResult = { error: null }

const USER = '83b19958-70bb-4c66-a4e2-18b9c39dbec0'

vi.mock('./supabase.js', () => ({
  isConfigured: true,
  getSupabase: async () => ({
    auth: {
      getSession: async () => ({ data: { session: { user: { id: USER } } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut: async () => {
        order.push('signOut')
        return signOutResult
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
  signOutResult = { error: null }
  localStorage.clear()
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

describe('taking the account off the machine', () => {
  const key = `gunit.state.user.${USER}`

  it('removes that account’s library once it is safely up', async () => {
    // Signing out already stops the decks being shown. Leaving them on disk is
    // not the same as taking them off it, and students borrow machines.
    localStorage.setItem(key, '{"decks":[]}')
    const { result } = auth()
    await waitFor(() => expect(result.current.status).toBe('ready'))

    await result.current.signOut()

    expect(localStorage.getItem(key)).toBe(null)
  })

  it('keeps it when the flush failed, because that copy is the only one', async () => {
    vi.resetModules()
    vi.doMock('./pendingSync.js', () => ({
      registerPendingSync: () => () => {},
      flushPendingSync: async () => ({ error: new Error('offline') }),
    }))
    const { AuthProvider: Fresh } = await import('./AuthProvider.jsx')
    const { useAuth: freshUseAuth } = await import('./useAuth.js')

    localStorage.setItem(key, '{"decks":[]}')
    const { result } = renderHook(() => freshUseAuth(), { wrapper: Fresh })
    await waitFor(() => expect(result.current.status).toBe('ready'))

    await result.current.signOut()

    expect(localStorage.getItem(key)).toBeTruthy()
  })

  it('keeps it when the sign-out itself failed', async () => {
    // Still signed in. Removing it now would leave the reader looking at an
    // empty library on an account that is very much still theirs.
    signOutResult = { error: { message: 'Network request failed' } }
    localStorage.setItem(key, '{"decks":[]}')
    const { result } = auth()
    await waitFor(() => expect(result.current.status).toBe('ready'))

    await result.current.signOut()

    expect(localStorage.getItem(key)).toBeTruthy()
  })

  it('leaves the guest library alone', async () => {
    localStorage.setItem(key, '{"decks":[]}')
    localStorage.setItem('gunit.state.guest', '{"decks":[{"id":"mine"}]}')
    const { result } = auth()
    await waitFor(() => expect(result.current.status).toBe('ready'))

    await result.current.signOut()

    expect(JSON.parse(localStorage.getItem('gunit.state.guest')).decks).toHaveLength(1)
  })

  it('leaves other accounts on this machine alone', async () => {
    // Only the one signing out. Another reader's copy is theirs to sign out of.
    const other = 'gunit.state.user.5d3e2980-27a2-4ae5-8152-a9678180753a'
    localStorage.setItem(key, '{"decks":[]}')
    localStorage.setItem(other, '{"decks":[]}')
    const { result } = auth()
    await waitFor(() => expect(result.current.status).toBe('ready'))

    await result.current.signOut()

    expect(localStorage.getItem(other)).toBeTruthy()
  })
})
