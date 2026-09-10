// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from '@testing-library/react'
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
    async rpc(_name, { payload }) {
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

vi.mock('./useAuth.js', () => ({
  useAuth: () => ({ user: { id: USER }, available: true }),
}))

vi.mock('./supabase.js', () => ({
  isConfigured: true,
  getSupabase: async () => client,
}))

const { AppProvider } = await import('./AppContext.jsx')
const { useApp } = await import('./useApp.js')
const { default: LibrarySync } = await import('./LibrarySync.jsx')

/** Hands the store out so a test can change settings the way a reader would. */
function Harness() {
  api = useApp()
  return null
}

const mount = () =>
  render(
    <AppProvider>
      <LibrarySync />
      <Harness />
    </AppProvider>,
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
    mount()

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
    mount()
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
})

describe('the library it puts aside on the way in', () => {
  const PRESYNC = 'gunit.state.presync'

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
      profile: null,
    })

  it('puts the browser own library aside when signing in', async () => {
    client = account()
    mount()

    await waitFor(() => expect(api.decks.map((d) => d.title)).toEqual(['From the account']))
    const kept = JSON.parse(localStorage.getItem(PRESYNC)).decks.map((d) => d.title)
    expect(kept.length).toBeGreaterThan(1)
    expect(kept).not.toEqual(['From the account'])
  })

  it('leaves the slot alone on a reload while signed in', async () => {
    // A reload arrives here exactly as a sign-in does: an account library to
    // install. Stashing again puts the account's decks into the slot signing
    // out reads from, and hands them back to the machine afterwards — the one
    // thing releaseSyncedLibrary exists to prevent. A ref cannot see across a
    // reload, so the stored library says which account it belongs to.
    client = account()
    const first = mount()
    await waitFor(() => expect(api.decks.map((d) => d.title)).toEqual(['From the account']))
    const mine = JSON.parse(localStorage.getItem(PRESYNC)).decks.map((d) => d.title)

    // Everything mounts afresh, reading the library back from storage.
    first.unmount()
    cleanup()
    client = account()
    mount()
    await waitFor(() => expect(api.decks.map((d) => d.title)).toEqual(['From the account']))

    expect(JSON.parse(localStorage.getItem(PRESYNC)).decks.map((d) => d.title)).toEqual(mine)
  })

  it('records which account the stored library belongs to', async () => {
    client = account()
    mount()
    await waitFor(() => expect(api.syncedFor).toBe(USER))
    expect(JSON.parse(localStorage.getItem('gunit.state.v2')).syncedFor).toBe(USER)
  })
})

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
    mount()

    await waitFor(() => expect(api.decks).toHaveLength(1))
    const [deck] = api.decks
    expect(typeof deck.progress).toBe('number')
    expect(Number.isNaN(deck.progress)).toBe(false)
    // One of two cards has been graded something other than "again".
    expect(deck.progress).toBe(0.5)
    expect(Math.round(deck.progress * 100)).toBe(50)
  })
})
