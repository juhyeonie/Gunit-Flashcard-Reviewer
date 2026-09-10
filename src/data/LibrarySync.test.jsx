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
  /*
   * Not covered, and worth saying so rather than leaving it to be discovered.
   *
   * Reloading the page while signed in mounts everything afresh: local storage
   * already holds the account's library, the pull takes the account-wins
   * branch, and `stashed` starts false again — so the slot is overwritten with
   * the account's decks and signing out afterwards hands them back to the
   * machine.
   *
   * Fixing that needs the stored state to say which account it belongs to, so
   * a pull can tell a handover from a reload. That is a change to the shape
   * that gets persisted and migrated, and it is left for its own commit rather
   * than smuggled in beside a one-line await.
   */
  it.todo('survives a reload while signed in')
})
