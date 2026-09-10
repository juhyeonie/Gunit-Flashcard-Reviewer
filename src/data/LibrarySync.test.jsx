// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The two things the sync does that no unit test could catch by reading.
 *
 * Both of these were found by pointing the app at a real Supabase project and
 * watching what arrived, which is the only reason they are here: one wrote
 * nothing at all and reported no error, and the other wrote the right thing to
 * the wrong place.
 */

const USER = '686963f7-42a5-4f94-9225-52a8a0a4859a'

/*
 * A stand-in for the PostgREST client, and the point of it is the laziness.
 *
 * A query builder sends no request when it is built. It sends one when
 * something calls `then` on it — awaiting it, or handing it to Promise.all.
 * Written without an await, `from(...).update(...).eq(...)` is a request that
 * is assembled and dropped, and nothing anywhere reports a problem, because
 * nothing went wrong: nothing happened.
 *
 * So this records building and executing separately. A test that only checked
 * `update` was called would pass against the bug.
 */
function fakeClient({ decks = [], cards = [], sessions = [], profile = null } = {}) {
  const built = []
  const executed = []

  const rows = { decks, cards, sessions }

  const client = {
    built,
    executed,
    from(table) {
      return {
        select() {
          const answer = Promise.resolve({ data: rows[table] ?? [], error: null })
          answer.eq = () => answer
          answer.maybeSingle = () => Promise.resolve({ data: profile, error: null })
          return answer
        },
        update(values) {
          built.push({ table, values })
          const builder = {
            eq: () => builder,
            then(resolve, reject) {
              executed.push({ table, values })
              return Promise.resolve({ data: null, error: null }).then(resolve, reject)
            },
          }
          return builder
        },
      }
    },
    rpcPayloads: [],
    async rpc(_name, { payload }) {
      client.rpcPayloads.push(payload)
      // The real function writes, so the next select sees what was pushed.
      // Without this the upload path and the pull path cannot follow one
      // another, which is exactly the sequence that goes wrong.
      rows.decks = [...rows.decks, ...(payload.decks_upsert ?? [])]
      rows.cards = [...rows.cards, ...(payload.cards_upsert ?? [])]
      rows.sessions = [...rows.sessions, ...(payload.sessions_insert ?? [])]
      return { error: null }
    },
  }
  return client
}

let client
let api

vi.mock('./supabase.js', () => ({
  isConfigured: true,
  getSupabase: async () => client,
}))

const { AppProvider } = await import('./AppContext.jsx')
const { useApp } = await import('./useApp.js')
const { default: LibrarySync } = await import('./LibrarySync.jsx')
const { AuthContext } = await import('./authContext.js')
const { GUEST_KEY } = await import('./storageKeys.js')
const { flushPendingSync } = await import('./pendingSync.js')

/** Hands the store out so a test can change settings the way a reader would. */
function Harness() {
  api = useApp()
  return null
}

/*
 * Signing in and out, from the one place the app reads it.
 *
 * The store keys its storage off this context and the sync keys its effects
 * off the same one. Mocking `useAuth` for the sync alone would leave the two
 * disagreeing about who is signed in — the sync pulling an account's library
 * into the guest's key — which is a state the app cannot actually be in.
 */
let signInAs
function Identity({ children }) {
  const [user, setUser] = useState(null)
  useEffect(() => {
    signInAs = setUser
  }, [])
  return (
    <AuthContext.Provider value={{ user, available: true, status: 'ready' }}>
      {children}
    </AuthContext.Provider>
  )
}

/** Mounts signed out and then signs in, which is the order a reader arrives in. */
const mountSignedIn = async () => {
  mount()
  await act(async () => {
    signInAs({ id: USER })
  })
}

const mount = () =>
  render(
    <Identity>
      <AppProvider>
        <LibrarySync />
        <Harness />
      </AppProvider>
    </Identity>,
  )

beforeEach(() => {
  localStorage.clear()
  api = null
})

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('carrying preferences to the account', () => {
  /** An account that already holds a deck, so the pull settles and a push can follow. */
  const account = () =>
    fakeClient({
      decks: [
        {
          id: '95c84be2-9060-42c7-a072-9b7e7c7b5591',
          user_id: USER,
          title: 'From the account',
          subject: 'Rome',
          description: '',
          studied_at: null,
        },
      ],
      profile: {
        id: USER,
        name: 'Tine',
        goal_minutes: 20,
        cards_per: 20,
        auto_reveal: false,
        shuffle_first: false,
        theme: 'light',
      },
    })

  it('sends the update rather than only building it', async () => {
    // The bug: `supabase.from('profiles').update(...).eq(...)` with no await.
    // The builder was made and thrown away, so the row kept its defaults while
    // the browser showed the reader's own settings — and signing in on a
    // second machine pulled those defaults back over them.
    client = account()
    await mountSignedIn()

    await waitFor(() => expect(api.decks.map((d) => d.title)).toEqual(['From the account']))

    await act(async () => {
      api.updateSettings({ cardsPer: 33 })
    })

    await waitFor(() => expect(client.executed.length).toBeGreaterThan(0))
    expect(client.executed.at(-1).table).toBe('profiles')
    expect(client.executed.at(-1).values.cards_per).toBe(33)
  })

  it('carries the theme, which lives beside the settings rather than in them', async () => {
    client = account()
    await mountSignedIn()
    await waitFor(() => expect(api.decks).toHaveLength(1))

    await act(async () => {
      api.toggleTheme()
    })

    await waitFor(() => expect(client.executed.some((c) => c.values.theme === 'dark')).toBe(true))
  })

  it('builds nothing at all before the first pull has settled', async () => {
    // Until `synced.current` is set there is no confirmed picture of the
    // account, and a write now would be against one this browser has not read.
    client = account()
    mount()
    expect(client.built).toHaveLength(0)
  })

  it('writes no preferences at all while signed out', async () => {
    // The local-only path, which is most of this app's use. There is no
    // account to carry them to and nothing should be attempted.
    client = account()
    mount()
    await act(async () => {
      api.updateSettings({ cardsPer: 44 })
    })
    expect(client.executed).toHaveLength(0)
  })
})

/*
 * The describe that stood here tested the single-slot handover: what was put
 * aside on the way in, and whether a second pull or a reload overwrote it.
 * There is no slot any more — the guest library and each account's have their
 * own keys and are never copied into one another — so the questions it asked
 * no longer have an answer. What replaced it is in identityStorage.test.jsx.
 */

describe('what the account hands back', () => {
  it('derives progress, which the database does not store', async () => {
    // Progress is a function of the schedule and is never sent up, so decks
    // coming back carry none. Installed raw, every page rendering
    // `Math.round(deck.progress * 100)` showed NaN% until the next reload.
    client = fakeClient({
      decks: [
        { id: '95c84be2-9060-42c7-a072-9b7e7c7b5591', user_id: USER, title: 'From the account', subject: 'Rome', description: '', studied_at: null },
      ],
      cards: [
        { id: 'aaaaaaaa-0000-4000-8000-000000000001', deck_id: '95c84be2-9060-42c7-a072-9b7e7c7b5591', user_id: USER, front: 'Q1', back: 'A1', position: 0, due: null, interval: 1440, ease: 2.5, reps: 1, lapses: 0, last_grade: 'good', suspended: false },
        { id: 'aaaaaaaa-0000-4000-8000-000000000002', deck_id: '95c84be2-9060-42c7-a072-9b7e7c7b5591', user_id: USER, front: 'Q2', back: 'A2', position: 1, due: null, interval: 0, ease: 2.5, reps: 0, lapses: 0, last_grade: null, suspended: false },
      ],
      profile: null,
    })
    await mountSignedIn()

    await waitFor(() => expect(api.decks).toHaveLength(1))
    const [deck] = api.decks
    expect(typeof deck.progress).toBe('number')
    expect(Number.isNaN(deck.progress)).toBe(false)
    // One of two cards has been graded something other than "again".
    expect(deck.progress).toBe(0.5)
    expect(Math.round(deck.progress * 100)).toBe(50)
  })
})

describe('signing out without reloading first', () => {
  const DECK = '95c84be2-9060-42c7-a072-9b7e7c7b5591'

  const account = () =>
    fakeClient({
      decks: [
        { id: DECK, user_id: USER, title: 'From the account', subject: 'Rome', description: '', studied_at: null },
      ],
      cards: [
        { id: 'aaaaaaaa-0000-4000-8000-000000000001', deck_id: DECK, user_id: USER, front: 'Q1', back: 'A1', position: 0, due: null, interval: 0, ease: 2.5, reps: 0, lapses: 0, last_grade: null, suspended: false },
      ],
      profile: null,
    })

  /** Mounts signed out, signs in, and returns the guest library left behind. */
  const signedIn = async () => {
    client = account()
    mount()
    // Signed out first, so there is a guest library to leave behind — which is
    // how a reader arrives at a sign-in page in the first place.
    await waitFor(() => expect(api.decks.length).toBeGreaterThan(0))
    const guest = JSON.parse(localStorage.getItem(GUEST_KEY)).decks.map((d) => d.title)

    await act(async () => {
      signInAs({ id: USER })
    })
    await waitFor(() => expect(api.decks.map((d) => d.title)).toEqual(['From the account']))
    return guest
  }

  it('sends a card added seconds earlier, instead of dropping it', async () => {
    // The bug: pushes are debounced, and signing out clears that timer while
    // handing the browser its own library back. A card added inside the last
    // beat was never sent and no longer here — gone from both places.
    const mine = await signedIn()

    await act(async () => {
      api.addCards(DECK, [{ front: 'Added while signed in', back: 'And not yet pushed' }])
    })

    // No waiting: this is a reader who adds a card and signs out at once.
    await act(async () => {
      await flushPendingSync()
      signInAs(null)
    })

    const pushed = client.rpcPayloads.flatMap((p) => p.cards_upsert ?? [])
    expect(pushed.map((c) => c.front)).toContain('Added while signed in')

    // And the swap still happens: this browser gets its own decks back.
    await waitFor(() => expect(api.decks.map((d) => d.title)).toEqual(mine))
  })

  it('sends an edit to an existing card', async () => {
    await signedIn()

    await act(async () => {
      api.updateCard(DECK, 0, { front: 'Edited while signed in', back: 'A1' })
    })
    await act(async () => {
      await flushPendingSync()
      signInAs(null)
    })

    const pushed = client.rpcPayloads.flatMap((p) => p.cards_upsert ?? [])
    expect(pushed.map((c) => c.front)).toContain('Edited while signed in')
  })

  it('sends a deletion', async () => {
    await signedIn()

    await act(async () => {
      api.removeCard(DECK, 0)
    })
    await act(async () => {
      await flushPendingSync()
      signInAs(null)
    })

    const removed = client.rpcPayloads.flatMap((p) => p.cards_remove ?? [])
    expect(removed).toContain('aaaaaaaa-0000-4000-8000-000000000001')
  })

  it('sends nothing when nothing changed', async () => {
    // Signing out of a library nobody touched should not write to the account.
    await signedIn()
    const before = client.rpcPayloads.length

    await act(async () => {
      await flushPendingSync()
      signInAs(null)
    })

    expect(client.rpcPayloads.length).toBe(before)
  })

  it('has nothing to flush once signed out', async () => {
    await signedIn()
    await act(async () => {
      signInAs(null)
    })
    await expect(flushPendingSync()).resolves.toEqual({ error: null })
  })
})

describe('offering the guest library to a new account', () => {
  /** An account with nothing in it, which is what signing up produces. */
  const emptyAccount = () => fakeClient({ profile: null })

  const signIn = async () => {
    mount()
    await waitFor(() => expect(api.decks.length).toBeGreaterThan(0))
    const guest = api.decks.length
    await act(async () => {
      signInAs({ id: USER })
    })
    return guest
  }

  it('asks rather than copying them in by itself', async () => {
    // Copying decks into an account is not a thing to do quietly on a shared
    // browser: what is on screen when you sign up is not always yours, and
    // once it is in an account it is visible from every machine that account
    // signs in on.
    client = emptyAccount()
    const guest = await signIn()

    // Asserted through the dialog's accessible name, which is what a screen
    // reader announces when it opens.
    expect(await screen.findByRole('dialog', { name: new RegExp(`Bring your ${guest} decks`) })).toBeTruthy()
    // Nothing has gone up while the question is on screen.
    expect(client.rpcPayloads).toHaveLength(0)
  })

  it('installs the account’s own library underneath the question', async () => {
    // The offer is not a gate. An empty account is an empty library, and that
    // is what the reader is looking at while they decide.
    client = emptyAccount()
    await signIn()
    expect(api.decks).toEqual([])
  })

  it('copies them in when accepted, and leaves the guest library alone', async () => {
    client = emptyAccount()
    const guest = await signIn()
    const before = localStorage.getItem(GUEST_KEY)

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Bring them in' }))
    })

    const pushed = client.rpcPayloads.flatMap((p) => p.decks_upsert ?? [])
    expect(pushed).toHaveLength(guest)
    expect(api.decks).toHaveLength(guest)
    expect(localStorage.getItem(GUEST_KEY)).toBe(before)
  })

  it('mints fresh ids on the way in', async () => {
    // A uuid in the guest library means some account uploaded it once, quite
    // possibly a different one on this browser. Offered back under the same
    // ids the upsert reaches for rows this user does not own, and row level
    // security refuses the whole change set.
    client = emptyAccount()
    await signIn()
    const guestIds = JSON.parse(localStorage.getItem(GUEST_KEY)).decks.map((d) => d.id)

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Bring them in' }))
    })

    const pushed = client.rpcPayloads.flatMap((p) => p.decks_upsert ?? [])
    for (const deck of pushed) expect(guestIds).not.toContain(deck.id)
  })

  it('sends nothing when declined', async () => {
    client = emptyAccount()
    await signIn()

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Not now' }))
    })

    expect(client.rpcPayloads).toHaveLength(0)
    expect(api.decks).toEqual([])
    expect(screen.queryByRole('dialog')).toBe(null)
  })

  it('does not ask the same account twice', async () => {
    // Otherwise the question returns on every sign-in for as long as the
    // account stays empty, which is nagging rather than asking.
    client = emptyAccount()
    await signIn()
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Not now' }))
    })

    cleanup()
    client = emptyAccount()
    await signIn()

    expect(screen.queryByRole('dialog')).toBe(null)
  })

  it('does not ask when the account already has decks', async () => {
    client = fakeClient({
      decks: [
        { id: '95c84be2-9060-42c7-a072-9b7e7c7b5591', user_id: USER, title: 'From the account', subject: 'Rome', description: '', studied_at: null },
      ],
      profile: null,
    })
    await signIn()
    await waitFor(() => expect(api.decks.map((d) => d.title)).toEqual(['From the account']))
    expect(screen.queryByRole('dialog')).toBe(null)
  })

  it('does not ask when there is nothing to offer', async () => {
    localStorage.setItem(GUEST_KEY, JSON.stringify({ decks: [], sessions: [] }))
    client = emptyAccount()
    mount()
    await act(async () => {
      signInAs({ id: USER })
    })
    await waitFor(() => expect(api.decks).toEqual([]))
    expect(screen.queryByRole('dialog')).toBe(null)
  })
})
