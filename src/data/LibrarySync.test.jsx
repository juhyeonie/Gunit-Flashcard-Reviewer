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
/*
 * `maxRows` is PostgREST's cap on a single response, 1,000 unless a project
 * raises it. Every read is cut to it however many rows were asked for, and
 * nothing in the response says so — which is how an account past a thousand
 * cards came back short with no error to notice.
 *
 * `onRead` runs after each read has been answered, which is the gap between
 * two pages — where another device's write lands in real life.
 *
 * `count: 'exact'` answers with how many rows match, before the cap, the way
 * PostgREST reads it off `Content-Range`.
 */
function fakeClient({
  decks = [],
  cards = [],
  sessions = [],
  folders = [],
  profile = null,
  maxRows = 1000,
  onRead = () => {},
} = {}) {
  const built = []
  const executed = []

  const rows = { decks, cards, sessions, folders }

  const client = {
    built,
    executed,
    from(table) {
      return {
        select(_columns, { count: counting } = {}) {
          let orderBy = null
          let after = null
          let limit = Infinity
          const query = {
            eq: () => query,
            order(column) {
              orderBy = column
              return query
            },
            gt(column, value) {
              after = { column, value }
              return query
            },
            limit(n) {
              limit = n
              return query
            },
            maybeSingle: () => Promise.resolve({ data: profile, error: null }),
            then(resolve, reject) {
              /*
               * Postgres promises no order without `order by`, so two pages
               * read without one may overlap or leave a gap. Refused here
               * rather than simulated: returning rows in whatever order they
               * were stored would let a pager with no order pass.
               */
              if ((after || limit !== Infinity) && !orderBy) {
                return Promise.resolve({ data: null, error: new Error('paged without order()') }).then(resolve, reject)
              }
              let all = [...(rows[table] ?? [])]
              if (orderBy) all.sort((a, b) => (a[orderBy] < b[orderBy] ? -1 : a[orderBy] > b[orderBy] ? 1 : 0))
              if (after) all = all.filter((r) => r[after.column] > after.value)
              const data = all.slice(0, Math.min(limit, maxRows))
              const count = counting === 'exact' ? all.length : null
              onRead(table, data)
              return Promise.resolve({ data, count, error: null }).then(resolve, reject)
            },
          }
          return query
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
      /*
       * The real function writes, so the next select sees what was pushed.
       * Without this the upload path and the pull path cannot follow one
       * another, which is exactly the sequence that goes wrong.
       *
       * Upserted by id, the way `sync_library` does it — `on conflict (id) do
       * update`. Appending instead would hand a second select two rows with
       * one id, which no database would, and a test written against that
       * would be testing the stand-in.
       */
      const upsert = (was, put) => {
        const by = new Map(was.map((r) => [r.id, r]))
        for (const row of put) by.set(row.id, { ...by.get(row.id), ...row })
        return [...by.values()]
      }
      const drop = (was, ids) => was.filter((r) => !ids.includes(r.id))

      // Folders first, as in 0004, so a deck can be filed in a new one.
      rows.folders = upsert(rows.folders, payload.folders_upsert ?? [])
      // A deck is only filed in a folder that exists; otherwise ungrouped.
      const filed = (d) =>
        'folder_id' in d && !rows.folders.some((f) => f.id === d.folder_id) ? { ...d, folder_id: null } : d
      rows.decks = upsert(rows.decks, (payload.decks_upsert ?? []).map(filed))
      rows.cards = upsert(rows.cards, payload.cards_upsert ?? [])
      // Sessions are append-only and the real one is `on conflict do nothing`.
      rows.sessions = upsert(rows.sessions, payload.sessions_insert ?? [])
      rows.cards = drop(rows.cards, payload.cards_remove ?? [])
      rows.decks = drop(rows.decks, payload.decks_remove ?? [])
      // Last, and `on delete set null (folder_id)`: the decks stay, ungrouped.
      const goneFolders = payload.folders_remove ?? []
      rows.folders = drop(rows.folders, goneFolders)
      rows.decks = rows.decks.map((d) => (goneFolders.includes(d.folder_id) ? { ...d, folder_id: null } : d))
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
const { GUEST_KEY, hasUnsent, userKey } = await import('./storageKeys.js')
const { EXAMPLE_DECK } = await import('./seed.js')
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

  /*
   * Decks the visitor made before signing up — which is what the offer is
   * for. The default library used to stand in for these, but the default is
   * now one example deck, and that is deliberately never offered.
   */
  const ownDeck = (id, title) => ({
    id,
    title,
    subject: 'Biology',
    desc: '',
    cards: [
      { id: `${id}-1`, front: `${title}: first`, back: 'One' },
      { id: `${id}-2`, front: `${title}: second`, back: 'Two' },
    ],
    schedule: {},
  })

  beforeEach(() => {
    localStorage.setItem(
      GUEST_KEY,
      JSON.stringify({ decks: [ownDeck('cells', 'Cells'), ownDeck('genes', 'Genes')], sessions: [] }),
    )
  })

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

  it('does not offer the example deck, which is a tutorial rather than their work', async () => {
    // A first-time visitor who signs up straight away has only the example.
    // Asking to copy it would put a tutorial into their account on every
    // machine they ever sign in on.
    localStorage.removeItem(GUEST_KEY)
    client = emptyAccount()
    mount()
    await waitFor(() => expect(api.decks.map((d) => d.id)).toEqual([EXAMPLE_DECK.id]))

    await act(async () => {
      signInAs({ id: USER })
    })
    await waitFor(() => expect(api.decks).toEqual([]))
    expect(screen.queryByRole('dialog')).toBe(null)
    expect(client.rpcPayloads).toHaveLength(0)
  })

  it('offers only their own decks when the example sits beside them', async () => {
    const example = { ...EXAMPLE_DECK, schedule: {} }
    localStorage.setItem(
      GUEST_KEY,
      JSON.stringify({ decks: [example, ownDeck('cells', 'Cells')], sessions: [] }),
    )
    client = emptyAccount()
    await signIn()

    expect(await screen.findByRole('dialog', { name: 'Bring your deck into this account?' })).toBeTruthy()
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Bring them in' }))
    })
    const pushed = client.rpcPayloads.flatMap((p) => p.decks_upsert ?? []).map((d) => d.title)
    expect(pushed).toEqual(['Cells'])
  })

  it('offers the example once the reader has made it their own', async () => {
    // Cards they wrote into it are theirs, and would otherwise be left behind.
    const edited = {
      ...EXAMPLE_DECK,
      schedule: {},
      cards: [...EXAMPLE_DECK.cards, { id: 'mine', front: 'A card I wrote', back: 'Mine' }],
    }
    localStorage.setItem(GUEST_KEY, JSON.stringify({ decks: [edited], sessions: [] }))
    client = emptyAccount()
    await signIn()

    expect(await screen.findByRole('dialog', { name: 'Bring your deck into this account?' })).toBeTruthy()
  })
})

/**
 * The beat between a change and the request that carries it.
 *
 * Pushes wait 1200ms so that grading five cards is one request. Close the tab
 * inside that beat and no request is ever made — and the change, which is
 * safely in local storage, was then written over by the next sign-in, because
 * the pull installs the account's copy on arrival. Local storage held the only
 * copy, and the pull is what destroyed it.
 *
 * Two halves fix it, and both are here: leaving the page ends the wait early,
 * and a mark in storage covers the cases where nothing can be sent at all — a
 * killed request, a flat battery, a network that was never there.
 */
describe('a change the page was closed on top of', () => {
  const DECK = '95c84be2-9060-42c7-a072-9b7e7c7b5591'
  const CARD = 'aaaaaaaa-0000-4000-8000-000000000001'

  const deckRow = (id = DECK, title = 'From the account') => ({
    id,
    user_id: USER,
    title,
    subject: 'Rome',
    description: '',
    studied_at: null,
  })

  const account = () =>
    fakeClient({
      decks: [deckRow()],
      cards: [
        {
          id: CARD,
          deck_id: DECK,
          user_id: USER,
          front: 'Q1',
          back: 'A1',
          position: 0,
          due: null,
          interval: 0,
          ease: 2.5,
          reps: 0,
          lapses: 0,
          last_grade: null,
          suspended: false,
        },
      ],
      profile: null,
    })

  const settled = () =>
    waitFor(() => expect(api.decks.map((d) => d.title)).toEqual(['From the account']))

  const pushedCards = () =>
    client.rpcPayloads.flatMap((p) => p.cards_upsert ?? []).map((c) => c.front)

  /** A change made, and the page gone before the beat is up. */
  const changeThenClose = async () => {
    client = account()
    await mountSignedIn()
    await settled()

    await act(async () => {
      api.addCards(DECK, [{ front: 'Added in the last second', back: 'And never sent' }])
    })
    expect(client.rpcPayloads).toHaveLength(0)

    cleanup()
  }

  it('is carried up by the next sign-in rather than written over', async () => {
    await changeThenClose()

    // Reopened: the same browser and the same storage, with a fresh client, as
    // a real page load would have.
    client = account()
    await mountSignedIn()

    await waitFor(() => expect(pushedCards()).toContain('Added in the last second'))
    await waitFor(() =>
      expect(api.decks[0].cards.map((c) => c.front)).toContain('Added in the last second'),
    )
  })

  it('never deletes what another machine added while this one was away', async () => {
    // The carry is upserts with nothing removed, and this is why. A plain
    // difference against the rows just fetched would read every deck this
    // browser has not seen as one it had deleted, and tidy them away.
    await changeThenClose()

    client = fakeClient({
      decks: [deckRow(), deckRow('7a3dd1c0-1d0c-4c1e-9d9a-9a6a6a1f0b21', 'Added on the phone')],
      cards: [],
      profile: null,
    })
    await mountSignedIn()

    await waitFor(() => expect(client.rpcPayloads.length).toBeGreaterThan(0))
    expect(client.rpcPayloads.flatMap((p) => p.decks_remove ?? [])).toEqual([])
    await waitFor(() =>
      expect(api.decks.map((d) => d.title).sort()).toEqual([
        'Added on the phone',
        'From the account',
      ]),
    )
  })

  it('keeps the change here when the carry itself fails', async () => {
    // Nothing is installed over it and the mark stays set, so the next sign-in
    // tries again. Installing the account's copy after a failed carry would
    // lose the change on the one path that exists to save it.
    await changeThenClose()

    client = account()
    client.rpc = async () => ({ error: new Error('offline') })
    await mountSignedIn()

    await waitFor(() =>
      expect(api.decks[0].cards.map((c) => c.front)).toContain('Added in the last second'),
    )
    expect(hasUnsent(USER)).toBe(true)
  })

  it('marks the wait in storage, under a key of its own', async () => {
    client = account()
    await mountSignedIn()
    await settled()

    await act(async () => {
      api.addCards(DECK, [{ front: 'Mid-beat', back: 'x' }])
    })

    // The mark is what outlives the page. A timer does not.
    expect(localStorage.getItem(`gunit.sync.unsent.${USER}`)).toBe('yes')
    // And it sits beside the library rather than inside it, so a library
    // written by any other path cannot quietly clear it.
    expect(localStorage.getItem(userKey(USER))).not.toContain('unsent')
  })

  it('forgets the mark once the account has confirmed the change', async () => {
    client = account()
    await mountSignedIn()
    await settled()

    await act(async () => {
      api.addCards(DECK, [{ front: 'Waited it out', back: 'x' }])
    })

    // The beat is 1200ms, so this outwaits the default.
    await waitFor(() => expect(pushedCards()).toContain('Waited it out'), { timeout: 5000 })
    await waitFor(() => expect(hasUnsent(USER)).toBe(false))
  })
})

describe('leaving the page', () => {
  const DECK = '95c84be2-9060-42c7-a072-9b7e7c7b5591'

  const account = () =>
    fakeClient({
      decks: [
        {
          id: DECK,
          user_id: USER,
          title: 'From the account',
          subject: 'Rome',
          description: '',
          studied_at: null,
        },
      ],
      profile: null,
    })

  const hide = async (state = 'hidden') => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: state })
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
  }

  afterEach(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  })

  const ready = async () => {
    client = account()
    await mountSignedIn()
    await waitFor(() => expect(api.decks.map((d) => d.title)).toEqual(['From the account']))
  }

  const pushedCards = () =>
    client.rpcPayloads.flatMap((p) => p.cards_upsert ?? []).map((c) => c.front)

  it('sends what the beat was still sitting on, without waiting it out', async () => {
    // On a phone this is how the app is normally left: the tab is not closed,
    // it is switched away from and discarded some time later.
    await ready()
    await act(async () => {
      api.addCards(DECK, [{ front: 'Added then switched away', back: 'x' }])
    })
    expect(client.rpcPayloads).toHaveLength(0)

    await hide()

    await waitFor(() => expect(pushedCards()).toContain('Added then switched away'))
  })

  it('sends on a closed tab too, which reports itself differently', async () => {
    await ready()
    await act(async () => {
      api.addCards(DECK, [{ front: 'Added then closed', back: 'x' }])
    })

    await act(async () => {
      window.dispatchEvent(new Event('pagehide'))
    })

    await waitFor(() => expect(pushedCards()).toContain('Added then closed'))
  })

  it('sends nothing when the page comes back into view', async () => {
    // visibilitychange fires both ways. Coming back is not leaving, and a
    // request per tab switch would be a request per tab switch.
    await ready()
    await hide('visible')
    expect(client.rpcPayloads).toHaveLength(0)
  })

  it('sends nothing when there is nothing to send', async () => {
    await ready()
    await hide()
    expect(client.rpcPayloads).toHaveLength(0)
  })
})

/**
 * Ids minted in this browser, and what a second push does with them.
 *
 * Local ids used to be eight random characters. The sync turned each into a
 * uuid on the way out — a new one on every push, because nothing kept the
 * mapping — so a deck made while signed in was deleted and re-created on every
 * sync, and every session logged here was inserted again each time. Nothing
 * failed and nothing was reported: the account simply collected copies.
 */
describe('what a second push sends', () => {
  const DECK = '95c84be2-9060-42c7-a072-9b7e7c7b5591'

  const account = () =>
    fakeClient({
      decks: [
        { id: DECK, user_id: USER, title: 'From the account', subject: 'Rome', description: '', studied_at: null },
      ],
      profile: null,
    })

  const ready = async () => {
    client = account()
    await mountSignedIn()
    await waitFor(() => expect(api.decks.map((d) => d.title)).toEqual(['From the account']))
  }

  /** Waits for the push that carries `title`, and returns every payload since `from`. */
  const pushesSince = (from) => client.rpcPayloads.slice(from)

  it('sends a deck made here once, not again with every later change', async () => {
    await ready()

    await act(async () => {
      api.addDeck({ title: 'Made while signed in', subject: 'Rome', desc: '' })
    })
    await waitFor(
      () =>
        expect(client.rpcPayloads.flatMap((p) => p.decks_upsert ?? []).map((d) => d.title)).toContain(
          'Made while signed in',
        ),
      { timeout: 5000 },
    )
    const after = client.rpcPayloads.length

    // An unrelated change, and the push it causes.
    await act(async () => {
      api.updateDeck(DECK, { title: 'Renamed' })
    })
    await waitFor(
      () => expect(pushesSince(after).flatMap((p) => p.decks_upsert ?? []).map((d) => d.title)).toContain('Renamed'),
      { timeout: 5000 },
    )

    const later = pushesSince(after)
    expect(later.flatMap((p) => p.decks_upsert ?? []).map((d) => d.title)).not.toContain('Made while signed in')
    expect(later.flatMap((p) => p.decks_remove ?? [])).toEqual([])
  })

  it('logs a session once, not again with every later change', async () => {
    await ready()

    await act(async () => {
      api.recordSession({ deckId: DECK, reviewed: 4, seconds: 40 })
    })
    await waitFor(
      () => expect(client.rpcPayloads.flatMap((p) => p.sessions_insert ?? [])).toHaveLength(1),
      { timeout: 5000 },
    )
    const after = client.rpcPayloads.length

    await act(async () => {
      api.updateDeck(DECK, { title: 'Renamed' })
    })
    await waitFor(() => expect(pushesSince(after).length).toBeGreaterThan(0), { timeout: 5000 })

    expect(pushesSince(after).flatMap((p) => p.sessions_insert ?? [])).toEqual([])
    // And it kept its deck: the id it was logged against is the one the
    // account holds, so the link survives the trip.
    const [logged] = client.rpcPayloads.flatMap((p) => p.sessions_insert ?? [])
    expect(logged.deck_id).toBe(DECK)
  })
})

/**
 * Folders through the account: pulled in, pushed out, and left alone by the
 * things that must not touch them — a token refresh, a sign-out.
 */
describe('folders and the account', () => {
  const DECK = '95c84be2-9060-42c7-a072-9b7e7c7b5591'
  const FOLDER = 'f0f0f0f0-1111-4111-8111-111111111111'

  const account = ({ filed = true } = {}) =>
    fakeClient({
      folders: [{ id: FOLDER, user_id: USER, name: 'Biology' }],
      decks: [
        {
          id: DECK,
          user_id: USER,
          title: 'Cells',
          subject: 'Biology',
          description: '',
          studied_at: null,
          folder_id: filed ? FOLDER : null,
        },
      ],
      profile: null,
    })

  const ready = async (options) => {
    client = account(options)
    await mountSignedIn()
    await waitFor(() => expect(api.decks.map((d) => d.title)).toEqual(['Cells']))
  }

  const lastPayloads = (from) => client.rpcPayloads.slice(from)

  it('pulls the folders and where each deck is filed', async () => {
    await ready()
    expect(api.folders).toEqual([{ id: FOLDER, name: 'Biology' }])
    expect(api.decks[0].folderId).toBe(FOLDER)
  })

  it('pushes a new folder, and a deck moved into it', async () => {
    await ready({ filed: false })
    let made
    await act(async () => {
      made = api.createFolder('Chemistry')
    })
    await act(async () => {
      api.moveDeckToFolder(DECK, made.id)
    })

    await waitFor(
      () => {
        const folders = client.rpcPayloads.flatMap((p) => p.folders_upsert ?? [])
        const decks = client.rpcPayloads.flatMap((p) => p.decks_upsert ?? [])
        expect(folders.map((f) => f.name)).toContain('Chemistry')
        expect(decks.at(-1).folder_id).toBe(made.id)
      },
      { timeout: 5000 },
    )
  })

  it('pushes a rename as one folder row', async () => {
    await ready()
    const from = client.rpcPayloads.length
    await act(async () => {
      api.renameFolder(FOLDER, 'Biology 101')
    })
    await waitFor(() => expect(lastPayloads(from).length).toBeGreaterThan(0), { timeout: 5000 })
    const sent = lastPayloads(from)
    expect(sent.flatMap((p) => p.folders_upsert)).toEqual([{ id: FOLDER, user_id: USER, name: 'Biology 101' }])
    expect(sent.flatMap((p) => p.decks_upsert)).toEqual([])
  })

  it('deletes a folder in the account without deleting its deck', async () => {
    await ready()
    await act(async () => {
      api.deleteFolder(FOLDER)
    })
    await waitFor(
      () => expect(client.rpcPayloads.flatMap((p) => p.folders_remove ?? [])).toEqual([FOLDER]),
      { timeout: 5000 },
    )
    expect(client.rpcPayloads.flatMap((p) => p.decks_remove ?? [])).toEqual([])

    // Read back as a fresh sign-in would: the deck is there, ungrouped.
    cleanup()
    await mountSignedIn()
    await waitFor(() => expect(api.decks.map((d) => d.title)).toEqual(['Cells']))
    expect(api.folders).toEqual([])
    expect(api.decks[0].folderId).toBe(null)
  })

  it('is left alone by a token refresh', async () => {
    // Supabase hands out a fresh user object every hour. Keyed on that object,
    // the sync would read the whole account again and install it — over any
    // folder change of this browser's that had not gone up yet.
    await ready()
    const reads = []
    const from = client.from.bind(client)
    client.from = (table) => {
      reads.push(table)
      return from(table)
    }

    await act(async () => {
      api.renameFolder(FOLDER, 'Renamed here')
    })
    await act(async () => {
      signInAs({ id: USER, refreshed: true })
    })
    // Long enough for a pull to have started and finished, had one been asked for.
    await new Promise((r) => setTimeout(r, 50))

    expect(reads.filter((t) => t === 'folders' || t === 'decks')).toEqual([])
    expect(api.folders[0].name).toBe('Renamed here')
  })

  it('keeps an unsent folder change even if the account is read again', async () => {
    // The second line of defence, for a sign-in that really is a new one: a
    // change made here and not yet sent goes up before anything is installed.
    await ready()
    await act(async () => {
      api.renameFolder(FOLDER, 'Renamed here')
    })
    cleanup()

    client = account()
    await mountSignedIn()
    await waitFor(() => expect(api.folders[0]?.name).toBe('Renamed here'))
  })

  it('keeps the account’s folders apart from the guest library across a sign-out', async () => {
    await ready()
    await act(async () => {
      await flushPendingSync()
      signInAs(null)
    })
    // Signed out: the guest library, which has no folders of the account's.
    await waitFor(() => expect(api.folders.some((f) => f.id === FOLDER)).toBe(false))

    // And back in: the account's folders, filed as they were.
    client = account()
    await act(async () => {
      signInAs({ id: USER })
    })
    await waitFor(() => expect(api.folders).toEqual([{ id: FOLDER, name: 'Biology' }]))
    expect(api.decks.find((d) => d.id === DECK).folderId).toBe(FOLDER)
  })

  it('brings a guest’s folders into a new account, still holding their decks', async () => {
    localStorage.setItem(
      GUEST_KEY,
      JSON.stringify({
        folders: [{ id: 'guest-folder', name: 'Revision' }],
        decks: [
          {
            id: 'guest-deck',
            title: 'Mine',
            subject: 'S',
            desc: '',
            folderId: 'guest-folder',
            cards: [{ id: 'g1', front: 'Q', back: 'A' }],
            schedule: {},
          },
        ],
        sessions: [],
      }),
    )
    client = fakeClient({ profile: null })
    mount()
    await waitFor(() => expect(api.decks.length).toBeGreaterThan(0))
    await act(async () => {
      signInAs({ id: USER })
    })
    await act(async () => {
      await userEvent.click(await screen.findByRole('button', { name: 'Bring them in' }))
    })

    const [folder] = client.rpcPayloads.flatMap((p) => p.folders_upsert ?? [])
    const [deck] = client.rpcPayloads.flatMap((p) => p.decks_upsert ?? [])
    expect(folder.name).toBe('Revision')
    // New ids for the account, and the deck follows its folder to the new one.
    expect(folder.id).not.toBe('guest-folder')
    expect(deck.folder_id).toBe(folder.id)
    await waitFor(() => expect(api.decks[0].folderId).toBe(folder.id))
  })
})

/**
 * Starting without a connection.
 *
 * An installed app is opened on a train as often as at a desk. The pull fails,
 * the reader studies anyway — every grade and edit lands in local storage — and
 * the connection comes back later, either while the app is still open or the
 * next time it is.
 *
 * Neither return may cost what was done in between. And the account must not be
 * pretended into: nothing is sent while there is nothing to send it to.
 */
describe('a signed-in reader who starts offline', () => {
  const A = '95c84be2-9060-42c7-a072-9b7e7c7b5591'
  const B = 'b6c2d7e8-1111-4222-8333-944455556666'

  const deckRow = (id, title) => ({ id, user_id: USER, title, subject: 'S', description: '', studied_at: null })

  const online = () =>
    fakeClient({ decks: [deckRow(A, 'Alpha'), deckRow(B, 'Beta')], profile: null })

  /** No network: every read and every write fails the way fetch does. */
  const offline = () => {
    const failure = { data: null, error: new TypeError('Failed to fetch') }
    const reads = []
    return {
      reads,
      rpcPayloads: [],
      from(table) {
        reads.push(table)
        const answer = Promise.resolve(failure)
        answer.eq = () => answer
        answer.order = () => answer
        answer.gt = () => answer
        answer.limit = () => answer
        answer.maybeSingle = () => Promise.resolve(failure)
        return {
          select: () => answer,
          update: () => ({ eq: () => Promise.resolve(failure) }),
        }
      },
      async rpc() {
        return { error: new TypeError('Failed to fetch') }
      },
    }
  }

  /** The account's library as this device last synced it: clean, nothing unsent. */
  const lastSynced = () =>
    localStorage.setItem(
      userKey(USER),
      JSON.stringify({
        decks: [
          { id: A, title: 'Alpha', subject: 'S', desc: '', cards: [], schedule: {}, folderId: null },
          { id: B, title: 'Beta', subject: 'S', desc: '', cards: [], schedule: {}, folderId: null },
        ],
        folders: [],
        sessions: [],
      }),
    )

  const goOnline = async (next) => {
    client = next
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })
  }

  afterEach(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
  })

  it('keeps what was done offline when the app is opened again online', async () => {
    lastSynced()
    client = offline()
    await mountSignedIn()
    await waitFor(() => expect(api.decks.map((d) => d.title)).toEqual(['Alpha', 'Beta']))

    await act(async () => {
      api.addCards(A, [{ front: 'Written on the train', back: 'Kept' }])
    })
    cleanup()

    // Back online, a fresh launch.
    client = online()
    await mountSignedIn()
    await waitFor(() =>
      expect(client.rpcPayloads.flatMap((p) => p.cards_upsert ?? []).map((c) => c.front)).toContain(
        'Written on the train',
      ),
    )
    await waitFor(() =>
      expect(api.decks.find((d) => d.id === A).cards.map((c) => c.front)).toContain('Written on the train'),
    )
  })

  it('sends what was done offline when the connection returns with the app still open', async () => {
    lastSynced()
    client = offline()
    await mountSignedIn()
    await waitFor(() => expect(api.decks).toHaveLength(2))

    await act(async () => {
      api.addCards(A, [{ front: 'Added offline', back: 'x' }])
    })

    const back = online()
    await goOnline(back)

    await waitFor(() =>
      expect(back.rpcPayloads.flatMap((p) => p.cards_upsert ?? []).map((c) => c.front)).toContain('Added offline'),
    )
  })

  it('sends a deletion made offline, rather than bringing the deck back', async () => {
    // A deck deleted on the train is meant to stay deleted. Carried up as
    // upserts alone, it would be read back from the account and reappear.
    lastSynced()
    client = offline()
    await mountSignedIn()
    await waitFor(() => expect(api.decks).toHaveLength(2))

    await act(async () => {
      api.removeDeck(B)
    })

    const back = online()
    await goOnline(back)

    await waitFor(() => expect(back.rpcPayloads.flatMap((p) => p.decks_remove ?? [])).toEqual([B]))
    await waitFor(() => expect(api.decks.map((d) => d.title)).toEqual(['Alpha']))
  })

  it('does not pull when nothing failed, so coming back online is not a reload', async () => {
    client = online()
    await mountSignedIn()
    await waitFor(() => expect(api.decks).toHaveLength(2))
    const reads = []
    const from = client.from.bind(client)
    client.from = (table) => {
      reads.push(table)
      return from(table)
    }
    await goOnline(client)
    await new Promise((r) => setTimeout(r, 50))
    expect(reads).toEqual([])
  })

  it('says it is offline rather than that the account failed', async () => {
    lastSynced()
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    client = offline()
    mount()
    await act(async () => {
      signInAs({ id: USER })
    })
    await waitFor(() => expect(api.toast).toMatch(/offline/i))
    expect(api.toast).not.toMatch(/could not be refreshed/)
  })
})

describe('a deletion made offline, with the app closed before the connection returns', () => {
  const A = '95c84be2-9060-42c7-a072-9b7e7c7b5591'
  const B = 'b6c2d7e8-1111-4222-8333-944455556666'
  const PHONE = 'c7d3e8f9-2222-4333-8444-a55566667777'
  const FOLDER = 'd8e4f9a0-3333-4444-8555-b66677778888'
  const CARD_1 = 'aaaaaaaa-0000-4000-8000-000000000001'
  const CARD_2 = 'aaaaaaaa-0000-4000-8000-000000000002'

  const deckRow = (id, title, folder_id = null) => ({
    id,
    user_id: USER,
    title,
    subject: 'S',
    description: '',
    studied_at: null,
    folder_id,
  })
  const cardRow = (id, deck_id, front, position) => ({
    id,
    deck_id,
    user_id: USER,
    front,
    back: 'x',
    position,
    due: null,
    interval: 0,
    ease: 2.5,
    reps: 0,
    lapses: 0,
    last_grade: null,
    suspended: false,
  })

  /** One account, shared by every launch and every device below. */
  const account = () =>
    fakeClient({
      folders: [{ id: FOLDER, user_id: USER, name: 'Term 1' }],
      decks: [deckRow(A, 'Alpha', FOLDER), deckRow(B, 'Beta')],
      cards: [cardRow(CARD_1, A, 'Keep me', 0), cardRow(CARD_2, A, 'Delete me', 1)],
      profile: null,
    })

  /** Every read and write fails the way fetch does with no network. */
  const noNetwork = () => {
    const failure = { data: null, error: new TypeError('Failed to fetch') }
    return {
      rpcPayloads: [],
      from() {
        const answer = Promise.resolve(failure)
        answer.eq = () => answer
        answer.order = () => answer
        answer.gt = () => answer
        answer.limit = () => answer
        answer.maybeSingle = () => Promise.resolve(failure)
        return { select: () => answer, update: () => ({ eq: () => Promise.resolve(failure) }) }
      },
      async rpc() {
        return { error: new TypeError('Failed to fetch') }
      },
    }
  }

  const removed = (c, key) => c.rpcPayloads.flatMap((p) => p[key] ?? [])
  const titles = () => api.decks.map((d) => d.title).sort()

  /** A launch while online, which leaves this browser a confirmed picture of the account. */
  const launchOnline = async (server) => {
    client = server
    await mountSignedIn()
    await waitFor(() => expect(api.decks.length).toBeGreaterThan(0))
  }

  /** A launch with no network: the library comes from this device alone. */
  const launchOffline = async () => {
    client = noNetwork()
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    await mountSignedIn()
    await waitFor(() => expect(titles()).toEqual(['Alpha', 'Beta']))
  }

  /** The app closed completely: nothing in memory survives, only storage. */
  const close = () => {
    cleanup()
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
  }

  afterEach(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
  })

  it('removes the deck from the account on the next launch, and does not bring it back', async () => {
    const server = account()
    await launchOnline(server)
    close()

    await launchOffline()
    await act(async () => {
      api.removeDeck(B)
    })
    expect(titles()).toEqual(['Alpha'])
    close()

    server.rpcPayloads.length = 0
    await launchOnline(server)

    await waitFor(() => expect(removed(server, 'decks_remove')).toEqual([B]))
    // Read back from the account after the carry, and still gone.
    await waitFor(() => expect(titles()).toEqual(['Alpha']))
    expect(JSON.parse(localStorage.getItem(userKey(USER))).decks.map((d) => d.id)).toEqual([A])
  })

  it('shows the deletion on another signed-in device once that one syncs', async () => {
    const server = account()
    await launchOnline(server)
    close()
    await launchOffline()
    await act(async () => {
      api.removeDeck(B)
    })
    close()
    await launchOnline(server)
    await waitFor(() => expect(removed(server, 'decks_remove')).toEqual([B]))
    close()

    // A second machine: the same account, none of this browser's storage.
    localStorage.clear()
    await launchOnline(server)
    await waitFor(() => expect(titles()).toEqual(['Alpha']))
  })

  it('keeps what was created and edited offline beside the deletion', async () => {
    const server = account()
    await launchOnline(server)
    close()

    await launchOffline()
    await act(async () => {
      api.addDeck({ title: 'Made on the train', subject: 'S', desc: '' })
    })
    await act(async () => {
      api.addCards(A, [{ front: 'Added on the train', back: 'x' }])
    })
    await act(async () => {
      api.removeDeck(B)
    })
    close()

    await launchOnline(server)
    await waitFor(() => expect(removed(server, 'decks_remove')).toEqual([B]))
    await waitFor(() => expect(titles()).toEqual(['Alpha', 'Made on the train']))
    expect(api.decks.find((d) => d.id === A).cards.map((c) => c.front)).toContain('Added on the train')
  })

  it('removes a card deleted offline, and only that card', async () => {
    const server = account()
    await launchOnline(server)
    close()

    await launchOffline()
    await act(async () => {
      api.removeCard(A, 1)
    })
    close()

    await launchOnline(server)
    await waitFor(() => expect(removed(server, 'cards_remove')).toEqual([CARD_2]))
    expect(removed(server, 'decks_remove')).toEqual([])
    await waitFor(() =>
      expect(api.decks.find((d) => d.id === A).cards.map((c) => c.front)).toEqual(['Keep me']),
    )
  })

  it('removes a folder deleted offline, and keeps its decks', async () => {
    const server = account()
    await launchOnline(server)
    close()

    await launchOffline()
    await act(async () => {
      api.deleteFolder(FOLDER)
    })
    close()

    await launchOnline(server)
    await waitFor(() => expect(removed(server, 'folders_remove')).toEqual([FOLDER]))
    expect(removed(server, 'decks_remove')).toEqual([])
    await waitFor(() => expect(api.folders).toEqual([]))
    expect(titles()).toEqual(['Alpha', 'Beta'])
  })

  it('still leaves alone a deck another machine added while this one was offline', async () => {
    const server = account()
    await launchOnline(server)
    close()

    await launchOffline()
    await act(async () => {
      api.removeDeck(B)
    })
    close()

    // Meanwhile, the phone.
    await server.rpc('sync_library', { payload: { decks_upsert: [deckRow(PHONE, 'Added on the phone')] } })
    server.rpcPayloads.length = 0

    await launchOnline(server)
    await waitFor(() => expect(removed(server, 'decks_remove')).toEqual([B]))
    await waitFor(() => expect(titles()).toEqual(['Added on the phone', 'Alpha']))
  })

  it('removes nothing when this browser no longer holds the library it recorded', async () => {
    // An empty library compared with the record would read as every deck
    // deleted. With no library here, there is nothing to have deleted.
    const server = account()
    await launchOnline(server)
    close()

    localStorage.removeItem(userKey(USER))
    localStorage.setItem(`gunit.sync.unsent.${USER}`, 'yes')

    server.rpcPayloads.length = 0
    await launchOnline(server)
    await waitFor(() => expect(titles()).toEqual(['Alpha', 'Beta']))
    expect(removed(server, 'decks_remove')).toEqual([])
    expect(removed(server, 'cards_remove')).toEqual([])
    expect(removed(server, 'folders_remove')).toEqual([])
  })

  it('removes nothing when the library here could not be read', async () => {
    // The store sets an unreadable library aside and starts from an empty
    // one. That empty one is not the reader deleting everything.
    const server = account()
    await launchOnline(server)
    close()

    localStorage.setItem(userKey(USER), '{ not json')
    localStorage.setItem(`gunit.sync.unsent.${USER}`, 'yes')

    server.rpcPayloads.length = 0
    await launchOnline(server)
    await waitFor(() => expect(titles()).toEqual(['Alpha', 'Beta']))
    expect(removed(server, 'decks_remove')).toEqual([])
    expect(removed(server, 'folders_remove')).toEqual([])
  })

  it('forgets the record with the library on sign-out, so a later sign-in has nothing to compare', async () => {
    const server = account()
    await launchOnline(server)
    expect(localStorage.getItem(`gunit.sync.confirmed.${USER}`)).toContain(B)
    close()

    const { forgetAccountLibrary } = await import('./storageKeys.js')
    forgetAccountLibrary(USER)
    expect(localStorage.getItem(`gunit.sync.confirmed.${USER}`)).toBe(null)
  })

  describe('while another device deletes', () => {
    const upserted = (c, key) => c.rpcPayloads.flatMap((p) => p[key] ?? [])

    /** The phone, doing its own deleting while this browser is away. */
    const elsewhere = async (server, payload) => {
      await server.rpc('sync_library', { payload })
      server.rpcPayloads.length = 0
    }

    it('does not bring back a deck deleted on the phone, even with changes here to send', async () => {
      const server = account()
      await launchOnline(server)
      close()

      await launchOffline()
      await act(async () => {
        api.addCards(A, [{ front: 'Added on the train', back: 'x' }])
      })
      await act(async () => {
        // An edit to the very deck the phone deletes: deletion wins.
        api.addCards(B, [{ front: 'Edited on the train', back: 'x' }])
      })
      await act(async () => {
        api.addDeck({ title: 'Made on the train', subject: 'S', desc: '' })
      })
      close()

      await elsewhere(server, { decks_remove: [B] })

      await launchOnline(server)
      await waitFor(() => expect(server.rpcPayloads.length).toBeGreaterThan(0))
      const sent = upserted(server, 'decks_upsert').map((d) => d.id)
      expect(sent).not.toContain(B)
      expect(upserted(server, 'cards_upsert').map((c) => c.front)).not.toContain('Edited on the train')

      await waitFor(() => expect(titles()).toEqual(['Alpha', 'Made on the train']))
      expect(api.decks.find((d) => d.id === A).cards.map((c) => c.front)).toContain('Added on the train')

      // And from the account itself, on a machine with none of this storage.
      close()
      localStorage.clear()
      await launchOnline(server)
      await waitFor(() => expect(titles()).toEqual(['Alpha', 'Made on the train']))
    })

    it('does not bring back a card deleted on the phone', async () => {
      const server = account()
      await launchOnline(server)
      close()

      await launchOffline()
      await act(async () => {
        api.addCards(A, [{ front: 'Added on the train', back: 'x' }])
      })
      close()

      await elsewhere(server, { cards_remove: [CARD_2] })

      await launchOnline(server)
      await waitFor(() => expect(server.rpcPayloads.length).toBeGreaterThan(0))
      expect(upserted(server, 'cards_upsert').map((c) => c.id)).not.toContain(CARD_2)
      await waitFor(() =>
        expect(api.decks.find((d) => d.id === A).cards.map((c) => c.front)).toEqual([
          'Keep me',
          'Added on the train',
        ]),
      )
    })

    it('does not bring back a folder deleted on the phone, and keeps its deck ungrouped', async () => {
      const server = account()
      await launchOnline(server)
      close()

      await launchOffline()
      await act(async () => {
        api.addCards(A, [{ front: 'Added on the train', back: 'x' }])
      })
      close()

      await elsewhere(server, { folders_remove: [FOLDER] })

      await launchOnline(server)
      await waitFor(() => expect(server.rpcPayloads.length).toBeGreaterThan(0))
      expect(upserted(server, 'folders_upsert').map((f) => f.id)).not.toContain(FOLDER)
      const alpha = upserted(server, 'decks_upsert').find((d) => d.id === A)
      expect(alpha.folder_id).toBe(null)
      await waitFor(() => expect(api.folders).toEqual([]))
      expect(api.decks.find((d) => d.id === A).folderId).toBe(null)
    })

    it('keeps a session studied here in the streak when its deck was deleted on the phone', async () => {
      // Sent pointing at the deleted deck, the session would fail the whole
      // change set, and every sign-in after it would fail the same way.
      const server = account()
      await launchOnline(server)
      close()

      await launchOffline()
      await act(async () => {
        api.recordSession({ deckId: B, reviewed: 3, seconds: 30 })
      })
      close()

      await elsewhere(server, { decks_remove: [B] })

      await launchOnline(server)
      await waitFor(() => expect(upserted(server, 'sessions_insert')).toHaveLength(1))
      expect(upserted(server, 'sessions_insert')[0]).toMatchObject({ deck_id: null, reviewed: 3 })
      await waitFor(() => expect(titles()).toEqual(['Alpha']))
    })
  })

  /*
   * Past the thousand rows one response carries. Read with a bare select, the
   * rest stayed in Postgres and never reached the app — and to the carry, which
   * compares the record with what the account handed back, every card past the
   * first page looked deleted on another device.
   */
  describe('an account holding more than one page of rows', () => {
    // Two full pages and a short one.
    const MANY = 2500
    const SESSIONS = 1200
    const bulkId = (prefix, i) => `${prefix}-0000-4000-8000-${String(i).padStart(12, '0')}`
    const bulkCards = Array.from({ length: MANY }, (_, i) => cardRow(bulkId('cccccccc', i), A, `Card ${i}`, i))
    const bulkSessions = Array.from({ length: SESSIONS }, (_, i) => ({
      id: bulkId('eeeeeeee', i),
      user_id: USER,
      deck_id: A,
      at: new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString(),
      reviewed: 1,
      seconds: 10,
    }))

    // Stored out of id order, the way a table written to for a while is.
    const bigAccount = (extra = {}) =>
      fakeClient({
        decks: [deckRow(A, 'Alpha'), deckRow(B, 'Beta')],
        cards: [...bulkCards].reverse(),
        sessions: [...bulkSessions].reverse(),
        profile: null,
        ...extra,
      })

    const sent = (c, key) => c.rpcPayloads.flatMap((p) => p[key] ?? [])
    const alphaCards = () => api.decks.find((d) => d.id === A)?.cards ?? []

    it('installs every card and every session, not the first thousand', async () => {
      const server = bigAccount()
      await launchOnline(server)

      await waitFor(() => expect(alphaCards()).toHaveLength(MANY))
      expect(new Set(alphaCards().map((c) => c.id)).size).toBe(MANY)
      expect(api.sessions).toHaveLength(SESSIONS)
    })

    it('reads every row from a project whose max-rows is below the page size', async () => {
      // Every page comes back shorter than asked for. Taken as the end, the
      // first one was all there was.
      const server = bigAccount({ maxRows: 400 })
      await launchOnline(server)

      await waitFor(() => expect(alphaCards()).toHaveLength(MANY))
      expect(new Set(alphaCards().map((c) => c.id)).size).toBe(MANY)
      expect(api.sessions).toHaveLength(SESSIONS)
    })

    it('asks each table once when the library fits in a page', async () => {
      // The count is what makes one request enough: without it, the only
      // proof a table has ended is a second request that comes back empty.
      const reads = []
      client = fakeClient({
        decks: [deckRow(A, 'Alpha'), deckRow(B, 'Beta')],
        cards: [cardRow(CARD_1, A, 'Keep me', 0)],
        profile: null,
        onRead: (table) => reads.push(table),
      })
      await launchOnline(client)
      await waitFor(() => expect(alphaCards()).toHaveLength(1))

      expect(reads.sort()).toEqual(['cards', 'decks', 'folders', 'sessions'])
    })

    it('reads on past a card deleted elsewhere between two pages, skipping nothing', async () => {
      // By offset, the second page would start one row late once a row before
      // it was gone, and the card at 1,000 would never be read.
      let deleted = false
      const server = bigAccount({
        onRead: (table, page) => {
          if (table !== 'cards' || deleted || page.length === 0) return
          deleted = true
          server.rpc('sync_library', { payload: { cards_remove: [page[0].id] } })
        },
      })
      await launchOnline(server)

      await waitFor(() => expect(alphaCards().length).toBeGreaterThan(0))
      const got = new Set(alphaCards().map((c) => c.id))
      // The deleted card was read before it went; the next pull drops it.
      expect(bulkCards.filter((c) => !got.has(c.id)).map((c) => c.front)).toEqual([])
      expect(got.size).toBe(MANY)
    })

    it('carries a change up without reading the later pages as deleted elsewhere', async () => {
      const server = bigAccount()
      await launchOnline(server)
      await waitFor(() => expect(alphaCards()).toHaveLength(MANY))
      close()

      await launchOffline()
      await act(async () => {
        api.addCards(A, [{ front: 'Added on the train', back: 'x' }])
      })
      close()

      server.rpcPayloads.length = 0
      await launchOnline(server)
      await waitFor(() => expect(server.rpcPayloads.length).toBeGreaterThan(0))

      const carried = new Set(sent(server, 'cards_upsert').map((c) => c.id))
      expect(carried.has(bulkCards.at(-1).id)).toBe(true)
      expect(bulkCards.filter((c) => !carried.has(c.id)).length).toBe(0)
      expect(sent(server, 'cards_remove')).toEqual([])

      await waitFor(() => expect(alphaCards()).toHaveLength(MANY + 1))
      expect(alphaCards().at(-1).front).toBe('Added on the train')
    })
  })
})
