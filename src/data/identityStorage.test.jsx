// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { useEffect, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AppProvider } from './AppContext.jsx'
import { AuthContext } from './authContext.js'
import { useApp } from './useApp.js'
import {
  GUEST_KEY,
  LEGACY_KEY,
  LEGACY_PRESYNC_KEY,
  migrateLegacyStorage,
  userKey,
} from './storageKeys.js'

/**
 * One library per identity, and what signing in and out actually does now.
 *
 * The old arrangement kept every library in one key and swapped the contents,
 * with a second key holding whichever was not in use. Three bugs came out of
 * that and each fix added another moving part. This is the replacement, so
 * these are the tests that say it works: the guest library and each account's
 * sit in their own keys and are never copied, swapped, or overwritten by one
 * another. Signing in and out changes which key is read and nothing else.
 */

const USER = '686963f7-42a5-4f94-9225-52a8a0a4859a'
const OTHER = '11111111-2222-4333-8444-555555555555'

const library = (title) => ({
  theme: 'light',
  settings: {},
  sessions: [],
  decks: [{ id: title.toLowerCase(), title, subject: 'S', desc: '', cards: [], schedule: {} }],
})

/** Signing in and out, as the app sees it: the user on the auth context changes. */
let signInAs
function Identity({ children }) {
  const [user, setUser] = useState(null)
  // Handed out after the render rather than during one, which is a side effect
  // React is entitled to run twice.
  useEffect(() => {
    signInAs = setUser
  }, [])
  return (
    <AuthContext.Provider value={{ user, available: true, status: 'ready' }}>
      {children}
    </AuthContext.Provider>
  )
}

function Shows() {
  const { decks } = useApp()
  return <div data-testid="titles">{decks.map((d) => d.title).join(', ')}</div>
}

const titles = () => screen.getByTestId('titles').textContent

const mount = () =>
  render(
    <Identity>
      <AppProvider>
        <Shows />
      </AppProvider>
    </Identity>,
  )

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('switching identity', () => {
  it('reads the guest library when nobody is signed in', () => {
    localStorage.setItem(GUEST_KEY, JSON.stringify(library('Guest deck')))
    mount()
    expect(titles()).toBe('Guest deck')
  })

  it('reads that account’s library on signing in', () => {
    localStorage.setItem(GUEST_KEY, JSON.stringify(library('Guest deck')))
    localStorage.setItem(userKey(USER), JSON.stringify(library('Account deck')))
    mount()

    act(() => signInAs({ id: USER }))
    expect(titles()).toBe('Account deck')
  })

  it('leaves the guest library exactly where it was', () => {
    // The bug this architecture removes: signing in used to overwrite the one
    // key and keep a copy elsewhere, and every way that copy could be lost was
    // a way to lose the reader's own decks.
    localStorage.setItem(GUEST_KEY, JSON.stringify(library('Guest deck')))
    localStorage.setItem(userKey(USER), JSON.stringify(library('Account deck')))
    mount()
    // What the store wrote back on mount, normalised — the comparison is about
    // the decks surviving, not about the bytes being untouched.
    const guest = localStorage.getItem(GUEST_KEY)

    act(() => signInAs({ id: USER }))
    expect(localStorage.getItem(GUEST_KEY)).toBe(guest)
    expect(JSON.parse(guest).decks.map((d) => d.title)).toEqual(['Guest deck'])
  })

  it('gives the guest library back on signing out', () => {
    localStorage.setItem(GUEST_KEY, JSON.stringify(library('Guest deck')))
    localStorage.setItem(userKey(USER), JSON.stringify(library('Account deck')))
    mount()

    act(() => signInAs({ id: USER }))
    act(() => signInAs(null))
    expect(titles()).toBe('Guest deck')
  })

  it('survives the round trip with edits on both sides', () => {
    // Signing in, working, signing out and working again must not let either
    // library reach the other. There is no shared slot for them to meet in.
    localStorage.setItem(GUEST_KEY, JSON.stringify(library('Guest deck')))
    localStorage.setItem(userKey(USER), JSON.stringify(library('Account deck')))
    mount()

    act(() => signInAs({ id: USER }))
    expect(titles()).toBe('Account deck')
    act(() => signInAs(null))
    expect(titles()).toBe('Guest deck')
    act(() => signInAs({ id: USER }))
    expect(titles()).toBe('Account deck')
  })

  it('keeps two accounts apart on the same machine', () => {
    localStorage.setItem(userKey(USER), JSON.stringify(library('Mine')))
    localStorage.setItem(userKey(OTHER), JSON.stringify(library('Theirs')))
    mount()

    act(() => signInAs({ id: USER }))
    expect(titles()).toBe('Mine')
    act(() => signInAs({ id: OTHER }))
    expect(titles()).toBe('Theirs')
  })

  it('starts an account with nothing rather than the sample decks', () => {
    // A guest with no library gets the seed decks, because a first visit
    // should have something to study. An account with none is either new or
    // not yet pulled, and inventing six decks of Roman history inside
    // somebody's account would be worse than a blank page.
    mount()
    expect(titles()).not.toBe('')

    act(() => signInAs({ id: USER }))
    expect(titles()).toBe('')
  })
})

describe('moving a browser off the old single-key arrangement', () => {
  it('treats a signed-out library as the guest one', () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(library('What was here')))
    expect(migrateLegacyStorage()).toMatchObject({ migrated: true, account: null })
    expect(JSON.parse(localStorage.getItem(GUEST_KEY)).decks[0].title).toBe('What was here')
  })

  it('uses syncedFor to tell whose library the old key held', () => {
    // The hard part: the old key held either library depending on whether the
    // reader was signed in when they last closed the tab, and the two are not
    // distinguishable by content. `syncedFor` was added to answer exactly this.
    localStorage.setItem(
      LEGACY_KEY,
      JSON.stringify({ ...library('Account deck'), syncedFor: USER }),
    )
    localStorage.setItem(LEGACY_PRESYNC_KEY, JSON.stringify(library('Guest deck')))

    expect(migrateLegacyStorage()).toMatchObject({ migrated: true, account: USER })
    expect(JSON.parse(localStorage.getItem(userKey(USER))).decks[0].title).toBe('Account deck')
    expect(JSON.parse(localStorage.getItem(GUEST_KEY)).decks[0].title).toBe('Guest deck')
  })

  it('leaves the old keys where they are', () => {
    // Not removed, and not in the same release that stops reading them. They
    // are the only way back if this migration is wrong about someone.
    const legacy = JSON.stringify(library('What was here'))
    localStorage.setItem(LEGACY_KEY, legacy)
    migrateLegacyStorage()
    expect(localStorage.getItem(LEGACY_KEY)).toBe(legacy)
  })

  it('does not guess when a stash cannot be attributed to an account', () => {
    // Signed out, the stash holds an account's library but nothing says whose.
    // Its contents are in Postgres; a wrong guess would put one reader's decks
    // under another reader's key.
    localStorage.setItem(LEGACY_KEY, JSON.stringify(library('Guest deck')))
    localStorage.setItem(LEGACY_PRESYNC_KEY, JSON.stringify(library('Somebody’s account')))

    migrateLegacyStorage()

    expect(JSON.parse(localStorage.getItem(GUEST_KEY)).decks[0].title).toBe('Guest deck')
    expect(Object.keys(localStorage).some((k) => k.startsWith('gunit.state.user.'))).toBe(false)
    expect(localStorage.getItem(LEGACY_PRESYNC_KEY)).toBeTruthy()
  })

  it('runs once and then leaves well alone', () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(library('Old')))
    migrateLegacyStorage()
    localStorage.setItem(GUEST_KEY, JSON.stringify(library('Since edited')))

    expect(migrateLegacyStorage()).toMatchObject({ migrated: false, reason: 'already' })
    expect(JSON.parse(localStorage.getItem(GUEST_KEY)).decks[0].title).toBe('Since edited')
  })

  it('does nothing on a browser that never ran the old version', () => {
    expect(migrateLegacyStorage()).toMatchObject({ migrated: false })
    expect(localStorage.getItem(GUEST_KEY)).toBe(null)
  })
})
