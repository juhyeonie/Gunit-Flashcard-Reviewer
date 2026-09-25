// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The notification center, from the reader's side. Who may see which
 * notification is enforced by Postgres and tested there (supabase/test); here
 * the network is stood in for, and the question is what the reader sees, what
 * is kept on the device, and what is sent when.
 */

const net = vi.hoisted(() => ({
  fetchNotifications: vi.fn(),
  markNotificationsRead: vi.fn(),
  listenForNotifications: vi.fn(),
  leaveShare: vi.fn(),
  isConfigured: true,
}))
vi.mock('../data/notifications.js', () => ({
  fetchNotifications: net.fetchNotifications,
  markNotificationsRead: net.markNotificationsRead,
  listenForNotifications: net.listenForNotifications,
}))
vi.mock('../data/sharing.js', async (importOriginal) => ({ ...(await importOriginal()), leaveShare: net.leaveShare }))
vi.mock('../data/supabase.js', () => ({ isConfigured: true, getSupabase: async () => null }))

const { AppProvider } = await import('../data/AppContext.jsx')
const { AuthContext } = await import('../data/authContext.js')
const { default: NotificationsProvider } = await import('../data/NotificationsProvider.jsx')
const { useNotifications } = await import('../data/notificationsContext.js')
const { default: NotificationList } = await import('./NotificationList.jsx')
const { BottomNav } = await import('./Navbar.jsx')
const { GUEST_KEY, noticesKey, userKey } = await import('../data/storageKeys.js')
const { addNotice, readNotices } = await import('../data/notices.js')
const { offerUpdate, resetPwaState } = await import('../pwa/pwaState.js')
const { launchWhatsNew, resetLaunch, SEEN_KEY } = await import('../data/whatsNew.js')
const { DEFAULT_SETTINGS } = await import('../data/normalize.js')
const { useApp } = await import('../data/useApp.js')

const USER = { id: '22222222-2222-4222-8222-222222222222', email: 'justine@example.com' }
const TOKEN = 'abcdefabcdefabcdefabcdefabcdef12'
const DAY = 86_400_000

const deckShared = (over = {}) => ({
  id: 'n1',
  kind: 'share_received',
  share_id: 's1',
  actor_name: 'Maria',
  resource_kind: 'deck',
  resource_name: 'CC 116 Algorithms',
  role: 'viewer',
  created_at: new Date(Date.now() - 2 * 60_000).toISOString(),
  read_at: null,
  token: TOKEN,
  ...over,
})
const folderShared = (over = {}) =>
  deckShared({ id: 'n2', share_id: 's2', resource_kind: 'folder', resource_name: 'Midterm Reviewers', token: 'f'.repeat(32), ...over })

let api
function Store() {
  api = useApp()
  return null
}
function Where() {
  return <span data-testid="pathname">{useLocation().pathname}</span>
}
function Unread() {
  return <span data-testid="unread">{useNotifications().unread}</span>
}

function show({ user = USER, path = '/inbox', nav = false } = {}) {
  return render(
    <AuthContext.Provider value={{ user, available: true, status: 'ready' }}>
      <AppProvider>
        <NotificationsProvider>
          <MemoryRouter initialEntries={[path]}>
            <Store />
            <Unread />
            <Routes>
              <Route path="/inbox" element={<NotificationList />} />
              <Route path="*" element={<Where />} />
            </Routes>
            {nav && <BottomNav />}
          </MemoryRouter>
        </NotificationsProvider>
      </AppProvider>
    </AuthContext.Provider>,
  )
}

const unread = () => Number(screen.getByTestId('unread').textContent)
const seedLibrary = (key, library) =>
  localStorage.setItem(key, JSON.stringify({ decks: [], sessions: [], theme: 'light', settings: DEFAULT_SETTINGS, ...library }))

/*
 * The account, as far as these tests need one: it hands back the reader's
 * notifications and remembers which were marked read, as the database does.
 */
let server
let realtime = null
beforeEach(() => {
  server = { rows: [], down: false, marksFail: false }
  localStorage.clear()
  // A reader who has run Gunit before and seen this version's notes.
  localStorage.setItem(SEEN_KEY, '99.0.0')
  resetLaunch()
  resetPwaState()
  for (const fn of [net.fetchNotifications, net.markNotificationsRead, net.listenForNotifications, net.leaveShare]) fn.mockReset()
  net.fetchNotifications.mockImplementation(async () =>
    server.down ? { data: null, error: 'Failed to fetch' } : { data: structuredClone(server.rows), error: null },
  )
  net.markNotificationsRead.mockImplementation(async (ids) => {
    if (server.down || server.marksFail) return { data: null, error: 'Failed to fetch' }
    const stamp = new Date().toISOString()
    server.rows = server.rows.map((n) => (ids === null || ids.includes(n.id) ? { ...n, read_at: n.read_at ?? stamp } : n))
    return { data: null, error: null }
  })
  net.leaveShare.mockResolvedValue({ data: null, error: null })
  net.listenForNotifications.mockImplementation((_userId, onChange) => {
    realtime = onChange
    return () => {
      realtime = null
    }
  })
  seedLibrary(userKey(USER.id), {})
  seedLibrary(GUEST_KEY, {})
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
})

describe('the list', () => {
  it('says there is nothing when there is nothing', async () => {
    show()
    expect(await screen.findByText('You’re all caught up')).toBeTruthy()
    expect(unread()).toBe(0)
    expect(screen.getByRole('button', { name: 'Mark all as read' }).disabled).toBe(true)
  })

  it('tells the reader who shared a deck with them, and offers to open or decline it', async () => {
    server.rows = [deckShared()]
    show()
    expect(await screen.findByText('Maria shared “CC 116 Algorithms” with you.')).toBeTruthy()
    expect(screen.getByText('New shared deck')).toBeTruthy()
    expect(screen.getByText('2 minutes ago')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open deck' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Decline' })).toBeTruthy()
    expect(unread()).toBe(1)
  })

  it('says the same for a folder', async () => {
    server.rows = [folderShared()]
    show()
    expect(await screen.findByText('Maria shared “Midterm Reviewers” with you.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open folder' })).toBeTruthy()
  })

  it('says when access was removed, with nothing left to open', async () => {
    net.fetchNotifications.mockResolvedValue({
      data: [deckShared({ id: 'n3', kind: 'share_removed', token: null })],
      error: null,
    })
    show()
    expect(await screen.findByText('Maria removed your access to “CC 116 Algorithms”.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Open/ })).toBeNull()
  })
})

describe('read and unread', () => {
  it('marks one read, on the device at once and in the account', async () => {
    server.rows = [deckShared(), folderShared()]
    show()
    const n1 = (await screen.findByText('Maria shared “CC 116 Algorithms” with you.')).closest('li')
    await userEvent.click(within(n1).getByRole('button', { name: 'Mark as read' }))
    expect(unread()).toBe(1)
    await waitFor(() => expect(net.markNotificationsRead).toHaveBeenCalledWith(['n1']))
    expect(readNotices(USER.id).remote.find((n) => n.id === 'n1').read_at).toBeTruthy()
  })

  it('marks all read, and they stay in the list, only quieter', async () => {
    server.rows = [deckShared(), folderShared()]
    show()
    await screen.findByText('Maria shared “CC 116 Algorithms” with you.')
    await userEvent.click(screen.getByRole('button', { name: 'Mark all as read' }))
    expect(unread()).toBe(0)
    await waitFor(() => expect(net.markNotificationsRead).toHaveBeenCalledWith(null))
    expect(screen.getByText('Maria shared “CC 116 Algorithms” with you.')).toBeTruthy()
    expect(screen.queryAllByRole('button', { name: 'Mark as read' })).toEqual([])
  })

  it('opens the shared deck, and counts that as read', async () => {
    server.rows = [deckShared()]
    show()
    await userEvent.click(await screen.findByRole('button', { name: 'Open deck' }))
    expect(screen.getByTestId('pathname').textContent).toBe(`/shared/deck/${TOKEN}`)
    expect(unread()).toBe(0)
  })

  it('declines by leaving the share, through the existing sharing call', async () => {
    server.rows = [folderShared()]
    show()
    await userEvent.click(await screen.findByRole('button', { name: 'Decline' }))
    await waitFor(() => expect(net.leaveShare).toHaveBeenCalledWith('s2'))
    expect(unread()).toBe(0)
  })
})

describe('whose they are', () => {
  it('keeps an account’s notifications to that account, and asks nothing when signed out', async () => {
    server.rows = [deckShared()]
    show()
    await screen.findByText('Maria shared “CC 116 Algorithms” with you.')
    expect(readNotices(USER.id).remote).toHaveLength(1)
    cleanup()
    net.fetchNotifications.mockClear()

    show({ user: null })
    expect(await screen.findByText('You’re all caught up')).toBeTruthy()
    expect(net.fetchNotifications).not.toHaveBeenCalled()
    expect(readNotices(null).remote).toEqual([])
  })
})

describe('offline, and coming back', () => {
  it('shows what was here last, and says it is offline', async () => {
    server.rows = [deckShared()]
    show()
    await screen.findByText('Maria shared “CC 116 Algorithms” with you.')
    cleanup()

    server.down = true
    show()
    expect(await screen.findByText(/You’re offline — showing what was here last/)).toBeTruthy()
    expect(screen.getByText('Maria shared “CC 116 Algorithms” with you.')).toBeTruthy()
  })

  it('holds a read made offline, and tells the account when the connection returns', async () => {
    server.rows = [deckShared()]
    show()
    await screen.findByText('Maria shared “CC 116 Algorithms” with you.')

    server.down = true
    await userEvent.click(screen.getByRole('button', { name: 'Mark as read' }))
    await waitFor(() => expect(readNotices(USER.id).pendingRead).toEqual(['n1']))
    expect(unread()).toBe(0)

    server.down = false
    await act(async () => window.dispatchEvent(new Event('online')))
    await waitFor(() => expect(readNotices(USER.id).pendingRead).toEqual([]))
    expect(net.markNotificationsRead).toHaveBeenLastCalledWith(['n1'])
    expect(server.rows[0].read_at).toBeTruthy()
    expect(unread()).toBe(0)
  })
})

describe('a read the account has not heard about yet', () => {
  it('stays read even when the list comes back before the read could be sent', async () => {
    server.rows = [deckShared()]
    show()
    await screen.findByText('Maria shared “CC 116 Algorithms” with you.')
    server.marksFail = true
    await userEvent.click(screen.getByRole('button', { name: 'Mark as read' }))
    // The list is read again, and still says unread: the account was not told.
    await waitFor(() => expect(net.fetchNotifications).toHaveBeenCalledTimes(2))
    expect(unread()).toBe(0)
    expect(readNotices(USER.id).pendingRead).toEqual(['n1'])
  })
})

describe('Realtime', () => {
  it('listens for the signed-in reader’s own, and shows a new one without a reload', async () => {
    show()
    await screen.findByText('You’re all caught up')
    expect(net.listenForNotifications).toHaveBeenCalledWith(USER.id, expect.any(Function))

    server.rows = [folderShared()]
    await act(async () => realtime())
    expect(await screen.findByText('Maria shared “Midterm Reviewers” with you.')).toBeTruthy()
    expect(unread()).toBe(1)
  })

  it('does not listen for a guest', async () => {
    show({ user: null })
    await screen.findByText('You’re all caught up')
    expect(net.listenForNotifications).not.toHaveBeenCalled()
  })
})

describe('this device’s own notices', () => {
  const dueDeck = () => ({
    id: 'deck-1',
    title: 'Software Engineering',
    subject: 'SE',
    desc: '',
    cards: [
      { id: 'c1', front: 'a', back: 'b' },
      { id: 'c2', front: 'c', back: 'd' },
    ],
    schedule: {
      c1: { last: 'good', due: Date.now() - DAY, interval: 1440, ease: 2.5, reps: 1, lapses: 0 },
      c2: { last: 'good', due: Date.now() - DAY, interval: 1440, ease: 2.5, reps: 1, lapses: 0 },
    },
    studiedAt: null,
  })

  it('reminds about cards due, once a day however often Gunit is opened', async () => {
    seedLibrary(userKey(USER.id), { decks: [dueDeck()] })
    show()
    expect(await screen.findByText('You have 2 cards due for review.')).toBeTruthy()
    cleanup()
    show()
    await screen.findByText('You have 2 cards due for review.')
    expect(screen.getAllByText('You have 2 cards due for review.')).toHaveLength(1)
  })

  it('says when today’s goal is met, once', async () => {
    seedLibrary(userKey(USER.id), {
      sessions: [{ id: 's', at: Date.now() - 60_000, deckId: null, reviewed: 30, seconds: 25 * 60 }],
    })
    show()
    expect(await screen.findByText(/You completed today’s study goal/)).toBeTruthy()
  })

  it('makes nothing of ordinary edits: creating, renaming, adding cards', async () => {
    show()
    await screen.findByText('You’re all caught up')
    await act(async () => {
      const deck = api.addDeck({ title: 'New', subject: 'S', desc: '' })
      api.updateDeck(deck.id, { title: 'Renamed' })
      api.addCards(deck.id, [{ front: 'q', back: 'a' }])
    })
    await new Promise((r) => setTimeout(r, 30))
    // A new card is not due until it has been studied, so still nothing.
    expect(readNotices(USER.id).local).toEqual([])
    expect(screen.getByText('You’re all caught up')).toBeTruthy()
  })

  it('offers a waiting update, with a reload, for as long as it waits', async () => {
    const apply = vi.fn()
    show()
    await screen.findByText('You’re all caught up')
    act(() => offerUpdate(apply))
    expect(await screen.findByText('Update ready')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(apply).toHaveBeenCalled()
  })

  it('points to What’s New for a version the reader has not seen, and opens it again', async () => {
    localStorage.setItem(SEEN_KEY, '0.0.1')
    resetLaunch()
    show()
    const link = await screen.findByRole('button', { name: 'See what’s new' })
    expect(screen.getByText('New features are available. Check out What’s New.')).toBeTruthy()
    // Dismissed meanwhile, as the dialog would be:
    const { dismissWhatsNew } = await import('../data/whatsNew.js')
    dismissWhatsNew(launchWhatsNew().version)
    expect(launchWhatsNew().entries).toEqual([])
    await userEvent.click(link)
    expect(launchWhatsNew().entries.length).toBeGreaterThan(0)
  })

  it('keeps a guest’s notices under the guest', async () => {
    addNotice(null, { kind: 'study-due', title: 'Cards to review', message: 'Guest reminder.' })
    show({ user: null })
    expect(await screen.findByText('Guest reminder.')).toBeTruthy()
    expect(localStorage.getItem(noticesKey(USER.id))).toBe(null)
  })
})

describe('the phone’s tab', () => {
  it('marks the Alerts tab while something is unread', async () => {
    server.rows = [deckShared()]
    show({ nav: true })
    await screen.findByText('Maria shared “CC 116 Algorithms” with you.')
    const tab = screen.getByRole('link', { name: /Alerts/ })
    expect(within(tab).getByText('1 unread')).toBeTruthy()
  })
})
