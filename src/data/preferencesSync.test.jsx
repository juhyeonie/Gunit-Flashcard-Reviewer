// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { useEffect, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeProfileClient } from '../../test/fake-profile-client.js'

/**
 * Language, text size and the rest of the profile row, between this device and
 * the account: restored on another device, sent when changed, and never lost
 * to a stale copy of the account while this device's change is still on its
 * way up — offline, after a failed request, or across a reload.
 */

const USER = '686963f7-42a5-4f94-9225-52a8a0a4859a'

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
const { GUEST_KEY, READING_KEY, avatarKey, hasPrefsUnsent, hasUnsent, markPrefsUnsent, userKey } = await import('./storageKeys.js')
const { DEFAULT_SETTINGS } = await import('./normalize.js')

function Harness() {
  api = useApp()
  return null
}

let signInAs
function Identity({ children }) {
  const [user, setUser] = useState(null)
  useEffect(() => {
    signInAs = setUser
  }, [])
  return <AuthContext.Provider value={{ user, available: true, status: 'ready' }}>{children}</AuthContext.Provider>
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

const signIn = async () => {
  mount()
  await act(async () => {
    signInAs({ id: USER })
  })
}

const html = () => document.documentElement
const profileUpdates = () => client.updates.filter((u) => u.table === 'profiles')
/** What this device holds for the account, as the store wrote it. */
const stored = () => JSON.parse(localStorage.getItem(userKey(USER)))

beforeEach(() => {
  localStorage.clear()
  api = null
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('preferences from the account', () => {
  it('reads the language and text size chosen on another device', async () => {
    client = fakeProfileClient({ userId: USER, profile: { language: 'fil', font_size: 'large' } })
    await signIn()

    await waitFor(() => expect(api.settings.language).toBe('fil'))
    expect(api.settings.fontSize).toBe('large')
    expect(html().getAttribute('lang')).toBe('fil-PH')
    expect(html().getAttribute('data-font-size')).toBe('large')
    expect(stored().settings).toMatchObject({ language: 'fil', fontSize: 'large' })
  })

  it('keeps what a new account’s first device already had, and sends it up', async () => {
    // A guest reading in Filipino at a large size signs up here.
    localStorage.setItem(
      GUEST_KEY,
      JSON.stringify({ decks: [], sessions: [], settings: { ...DEFAULT_SETTINGS, language: 'fil', fontSize: 'large' } }),
    )
    client = fakeProfileClient({ userId: USER })
    await signIn()

    // Never reset to English and the default size by a row nobody chose.
    expect(api.settings).toMatchObject({ language: 'fil', fontSize: 'large' })
    await waitFor(() => expect(client.row).toMatchObject({ language: 'fil', font_size: 'large' }))
    expect(api.settings).toMatchObject({ language: 'fil', fontSize: 'large' })
  })
})

describe('the moment after a reload', () => {
  it('keeps the last language and size on screen while the session is restored', async () => {
    // Signed in last time, in Filipino at a large size; the guest's are English.
    localStorage.setItem(READING_KEY, JSON.stringify({ language: 'fil', fontSize: 'large' }))
    localStorage.setItem(GUEST_KEY, JSON.stringify({ decks: [], sessions: [], settings: DEFAULT_SETTINGS }))
    client = fakeProfileClient({ userId: USER, profile: { language: 'fil', font_size: 'large' } })

    const view = (status, user) => (
      <AuthContext.Provider value={{ user, available: true, status }}>
        <AppProvider>
          <Harness />
        </AppProvider>
      </AuthContext.Provider>
    )
    const { rerender } = render(view('loading', null))
    expect(html().getAttribute('lang')).toBe('fil-PH')
    expect(html().getAttribute('data-font-size')).toBe('large')

    // Restored with nobody signed in after all: the guest's own apply.
    await act(async () => {
      rerender(view('ready', null))
    })
    expect(html().getAttribute('lang')).toBe('en')
    expect(html().getAttribute('data-font-size')).toBe('default')
  })
})

describe('preferences to the account', () => {
  it('sends a change of language and size', async () => {
    client = fakeProfileClient({ userId: USER, profile: { language: 'en', font_size: 'default' } })
    await signIn()
    await waitFor(() => expect(client.row.name).toBe('Olive Santos'))
    await waitFor(() => expect(api.settings.name).toBe('Olive Santos'))

    await act(async () => {
      api.updateSettings({ language: 'fil', fontSize: 'small' })
    })

    await waitFor(() => expect(client.row).toMatchObject({ language: 'fil', font_size: 'small' }))
    expect(profileUpdates().at(-1).values).toMatchObject({ language: 'fil', font_size: 'small', name: 'Olive Santos' })
    await waitFor(() => expect(hasPrefsUnsent(USER)).toBe(false))
  })

  it('sends nothing when a read of the account changes nothing', async () => {
    client = fakeProfileClient({ userId: USER, profile: { language: 'en', font_size: 'default', name: 'Olive Santos' } })
    await signIn()
    await waitFor(() => expect(api.settings.name).toBe('Olive Santos'))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(profileUpdates()).toEqual([])
  })

  it('still saves the name and theme on a project that has not run 0009', async () => {
    client = fakeProfileClient({ userId: USER })
    // Before 0009 the row has no such columns at all.
    delete client.row.language
    delete client.row.font_size
    delete client.row.avatar_path
    client.failUpdates = 'legacy'
    await signIn()
    await waitFor(() => expect(api.settings.name).toBe('Olive Santos'))

    await act(async () => {
      api.updateSettings({ name: 'Olive S.', language: 'fil' })
    })

    await waitFor(() => expect(client.row.name).toBe('Olive S.'))
    expect(profileUpdates().at(-1).values).not.toHaveProperty('language')
    // Kept on this device, where the language still applies.
    expect(api.settings.language).toBe('fil')
    await waitFor(() => expect(hasPrefsUnsent(USER)).toBe(false))
  })
})

describe('a read of the account that overlaps a change', () => {
  it('does not put back the preferences a change here has already replaced', async () => {
    client = fakeProfileClient({ userId: USER, profile: { language: 'en', font_size: 'default' } })
    await signIn()
    await waitFor(() => expect(api.settings.name).toBe('Olive Santos'))
    // Nothing of the library's own still on its way, or the refresh stands down.
    await waitFor(() => expect(hasUnsent(USER)).toBe(false), { timeout: 4000 })
    const readsBefore = client.profileReads

    // A couple of minutes on, the reader comes back to the tab, and the
    // account is read again. The read is slow to answer.
    const realNow = Date.now.bind(Date)
    vi.spyOn(Date, 'now').mockImplementation(() => realNow() + 2 * 60_000)
    let answer
    client.gate = new Promise((resolve) => {
      answer = resolve
    })
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await waitFor(() => expect(client.profileReads).toBe(readsBefore + 1))

    // Meanwhile they switch language, and it reaches the account at once.
    await act(async () => {
      api.updateSettings({ language: 'fil' })
    })
    await waitFor(() => expect(client.row.language).toBe('fil'))
    await waitFor(() => expect(hasPrefsUnsent(USER)).toBe(false))

    // Then the read comes back, carrying the English it saw when it began.
    client.gate = null
    await act(async () => {
      answer()
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    expect(api.settings.language).toBe('fil')
    expect(client.row.language).toBe('fil')
  })
})

describe('offline', () => {
  it('keeps a change made with no connection, and sends it when the connection returns', async () => {
    client = fakeProfileClient({ userId: USER, profile: { language: 'en', font_size: 'default' } })
    client.failReads = true
    await signIn()
    await new Promise((resolve) => setTimeout(resolve, 20))

    await act(async () => {
      api.updateSettings({ language: 'fil' })
    })
    // Nothing can go, so nothing is built; the change is owed.
    expect(profileUpdates()).toEqual([])
    expect(hasPrefsUnsent(USER)).toBe(true)
    expect(html().getAttribute('lang')).toBe('fil-PH')

    client.failReads = false
    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })

    await waitFor(() => expect(client.row.language).toBe('fil'))
    // And the account's older English was never installed over it.
    expect(api.settings.language).toBe('fil')
    await waitFor(() => expect(hasPrefsUnsent(USER)).toBe(false))
  })

  it('keeps an owed change across a reload, rather than taking the account’s older copy', async () => {
    localStorage.setItem(
      userKey(USER),
      JSON.stringify({ decks: [], sessions: [], settings: { ...DEFAULT_SETTINGS, language: 'fil', fontSize: 'large' } }),
    )
    markPrefsUnsent(USER)
    client = fakeProfileClient({ userId: USER, profile: { language: 'en', font_size: 'default' } })
    await signIn()

    await waitFor(() => expect(client.row).toMatchObject({ language: 'fil', font_size: 'large' }))
    expect(api.settings).toMatchObject({ language: 'fil', fontSize: 'large' })
    await waitFor(() => expect(hasPrefsUnsent(USER)).toBe(false))
  })

  it('keeps a change whose save failed owed, and sends it on reconnecting', async () => {
    client = fakeProfileClient({ userId: USER, profile: { language: 'en', font_size: 'default' } })
    await signIn()
    await waitFor(() => expect(api.settings.name).toBe('Olive Santos'))

    client.failUpdates = 'offline'
    await act(async () => {
      api.updateSettings({ fontSize: 'large' })
    })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(hasPrefsUnsent(USER)).toBe(true)
    expect(client.row.font_size).toBe('default')

    client.failUpdates = null
    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })
    await waitFor(() => expect(client.row.font_size).toBe('large'))
    await waitFor(() => expect(hasPrefsUnsent(USER)).toBe(false))
    expect(api.settings.fontSize).toBe('large')
  })
})

describe('the profile picture from the account', () => {
  const PICTURE = new Blob(['picture'], { type: 'image/webp' })

  it('fetches the account’s picture once and keeps it on this device', async () => {
    const path = `${USER}/one.webp`
    client = fakeProfileClient({ userId: USER, profile: { avatar_path: path }, avatars: { [path]: PICTURE } })
    await signIn()

    await waitFor(() => expect(JSON.parse(localStorage.getItem(avatarKey(USER)) ?? 'null')?.path).toBe(path))
    expect(JSON.parse(localStorage.getItem(avatarKey(USER))).src).toMatch(/^data:image\/webp/)
    expect(client.downloads).toEqual([path])
  })

  it('drops this device’s copy once the account has none', async () => {
    localStorage.setItem(
      avatarKey(USER),
      JSON.stringify({ path: `${USER}/old.webp`, src: 'data:image/webp;base64,AAAA', at: 1 }),
    )
    client = fakeProfileClient({ userId: USER, profile: { avatar_path: null } })
    await signIn()
    await waitFor(() => expect(localStorage.getItem(avatarKey(USER))).toBeNull())
  })
})
