// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Opening a shared link, from the reader's side.
 *
 * The network is the one thing stood in for here: what the database allows is
 * tested against the database itself, in supabase/test. These are about what
 * the reader sees and what lands on their device — and above all what does
 * not: somebody else's deck in their library, somebody else's progress in
 * theirs.
 */

const api = vi.hoisted(() => ({
  openShare: vi.fn(),
  joinShare: vi.fn(),
  leaveShare: vi.fn(),
  editSharedCards: vi.fn(),
  fetchProgress: vi.fn(),
  saveProgress: vi.fn(),
}))

vi.mock('../data/sharing.js', async (importOriginal) => ({ ...(await importOriginal()), ...api }))

const { AppProvider } = await import('../data/AppContext.jsx')
const { AuthContext } = await import('../data/authContext.js')
const { useApp } = await import('../data/useApp.js')
const { GUEST_KEY, userKey } = await import('../data/storageKeys.js')
const { default: SharedArea } = await import('./SharedArea.jsx')
const { default: Toast } = await import('../components/Toast.jsx')

const TOKEN = '0123456789abcdef0123456789abcdef'
const DECK = 'd0000000-0000-4000-8000-000000000001'
const DECK2 = 'd0000000-0000-4000-8000-000000000002'
const [C1, C2, C3, C4] = [1, 2, 3, 4].map((n) => `c0000000-0000-4000-8000-00000000000${n}`)
const READER = { id: '22222222-2222-4222-8222-222222222222', email: 'amy@example.com' }

const sharedDeck = (over = {}) => ({
  status: 'ok',
  kind: 'deck',
  token: TOKEN,
  share_id: 's1',
  role: 'viewer',
  access: 'link',
  owner_name: 'Olive',
  joined: false,
  name: 'CC 116 — Module 6',
  decks: [
    {
      id: DECK,
      title: 'CC 116 — Module 6',
      subject: 'Operating systems',
      description: 'Memory management',
      updated_at: '2026-09-20T10:00:00Z',
      cards: [
        { id: C1, front: 'What is paging?', back: 'Fixed-size blocks.', position: 0 },
        { id: C2, front: 'What is a TLB?', back: 'A translation cache.', position: 1 },
        { id: C3, front: 'What is thrashing?', back: 'Paging more than working.', position: 2 },
        { id: C4, front: 'What is a page fault?', back: 'A miss in memory.', position: 3 },
      ],
    },
  ],
  ...over,
})

const sharedFolder = (over = {}) => ({
  ...sharedDeck(),
  kind: 'folder',
  name: 'CC 116',
  decks: [
    { ...sharedDeck().decks[0], id: DECK, title: 'Module 6' },
    { id: DECK2, title: 'Module 5', subject: 'Operating systems', description: '', updated_at: null, cards: [] },
  ],
  ...over,
})

function Where() {
  return <span data-testid="pathname">{useLocation().pathname}</span>
}

function Feedback() {
  return <Toast message={useApp().toast} />
}

function open(path, { user = null } = {}) {
  return render(
    <AuthContext.Provider value={{ user, available: true, status: 'ready' }}>
      <AppProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/shared/:kind/:token/*" element={<SharedArea />} />
            <Route path="*" element={<Where />} />
          </Routes>
          <Feedback />
        </MemoryRouter>
      </AppProvider>
    </AuthContext.Provider>,
  )
}

const library = (user = null) => JSON.parse(localStorage.getItem(user ? userKey(user.id) : GUEST_KEY) ?? 'null')
const sharedStore = (user = null) => JSON.parse(localStorage.getItem(`gunit.shared.${user?.id ?? 'guest'}`) ?? 'null')

beforeEach(() => {
  localStorage.clear()
  for (const fn of Object.values(api)) fn.mockReset()
  api.openShare.mockResolvedValue({ data: sharedDeck(), error: null })
  api.joinShare.mockResolvedValue({ data: { status: 'ok', role: 'viewer' }, error: null })
  api.fetchProgress.mockResolvedValue({ data: [], error: null })
  api.saveProgress.mockResolvedValue({ error: null })
  api.editSharedCards.mockResolvedValue({ data: { refused: [] }, error: null })
})

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('opening a link', () => {
  it('works with no account, and says whose it is and what the reader may do', async () => {
    open(`/shared/deck/${TOKEN}`)
    expect(await screen.findByRole('heading', { level: 1, name: 'CC 116 — Module 6' })).toBeTruthy()
    expect(screen.getByText('Shared by Olive')).toBeTruthy()
    expect(screen.getByText('Can study')).toBeTruthy()
    expect(screen.getByText('What is paging?')).toBeTruthy()
    expect(api.openShare).toHaveBeenCalledWith(TOKEN)
  })

  it('says a revoked or unknown link is no longer available, rather than showing an empty deck', async () => {
    api.openShare.mockResolvedValueOnce({ data: { status: 'revoked', kind: 'deck' }, error: null })
    open(`/shared/deck/${TOKEN}`)
    expect(await screen.findByText('This shared deck is no longer available')).toBeTruthy()
    cleanup()
    api.openShare.mockResolvedValueOnce({ data: { status: 'not_found' }, error: null })
    open(`/shared/folder/nope`)
    expect(await screen.findByText('This shared folder is no longer available')).toBeTruthy()
  })

  it('asks for a sign-in on an invited-only link, and sends the reader back here after', async () => {
    api.openShare.mockResolvedValueOnce({ data: { status: 'sign_in', kind: 'deck' }, error: null })
    open(`/shared/deck/${TOKEN}`)
    const link = await screen.findByRole('link', { name: 'Sign in' })
    expect(link.getAttribute('href')).toBe(`/sign-in?next=${encodeURIComponent(`/shared/deck/${TOKEN}`)}`)
  })

  it('studies from the copy on this device when there is no connection', async () => {
    open(`/shared/deck/${TOKEN}`)
    await screen.findByText('What is paging?')
    cleanup()

    api.openShare.mockResolvedValue({ data: null, error: 'You’re offline. Sharing needs a connection.' })
    open(`/shared/deck/${TOKEN}`)
    expect(await screen.findByText(/You’re offline — this is the copy saved on this device/)).toBeTruthy()
    expect(screen.getByText('What is paging?')).toBeTruthy()
  })

  it('forgets the offline copy of a link that has since been turned off', async () => {
    open(`/shared/deck/${TOKEN}`)
    await screen.findByText('What is paging?')
    expect(sharedStore().cache[TOKEN]).toBeDefined()
    cleanup()
    api.openShare.mockResolvedValue({ data: { status: 'revoked', kind: 'deck' }, error: null })
    open(`/shared/deck/${TOKEN}`)
    await screen.findByText('This shared deck is no longer available')
    expect(sharedStore().cache[TOKEN]).toBeUndefined()
  })
})

describe('studying the shared version', () => {
  it('grades on the reader’s own schedule, and never puts the deck in their library', async () => {
    open(`/shared/deck/${TOKEN}/d/${DECK}/review`)
    await userEvent.click(await screen.findByRole('button', { name: 'Reveal answer' }))
    await userEvent.click(screen.getByRole('button', { name: /^good/i }))

    await waitFor(() => expect(Object.keys(sharedStore().progress)).toHaveLength(1))
    const [graded] = Object.keys(sharedStore().progress)
    expect([C1, C2, C3, C4]).toContain(graded)
    // Not a card of theirs, and not a deck of theirs.
    expect(library().decks.some((d) => d.id === DECK)).toBe(false)
  })

  it('keeps a guest’s progress and a signed-in reader’s apart', async () => {
    open(`/shared/deck/${TOKEN}/d/${DECK}/review`)
    await userEvent.click(await screen.findByRole('button', { name: 'Reveal answer' }))
    await userEvent.click(screen.getByRole('button', { name: /^easy/i }))
    await waitFor(() => expect(Object.keys(sharedStore().progress)).toHaveLength(1))
    cleanup()

    open(`/shared/deck/${TOKEN}`, { user: READER })
    await screen.findByText('What is paging?')
    expect(screen.getByText('0%')).toBeTruthy()
    expect(sharedStore(READER)?.progress ?? {}).toEqual({})
  })

  it('joins when a signed-in reader starts studying, so their progress can be kept', async () => {
    open(`/shared/deck/${TOKEN}`, { user: READER })
    await userEvent.click(await screen.findByRole('button', { name: /Study shared version/ }))
    await userEvent.click(screen.getByRole('button', { name: /Flashcards/ }))
    await waitFor(() => expect(api.joinShare).toHaveBeenCalledWith(TOKEN))
    expect(await screen.findByRole('button', { name: 'Reveal answer' })).toBeTruthy()
  })

  it('sends a signed-in member’s grades as their own progress rows', async () => {
    api.openShare.mockResolvedValue({ data: sharedDeck({ joined: true }), error: null })
    open(`/shared/deck/${TOKEN}/d/${DECK}/review`, { user: READER })
    await userEvent.click(await screen.findByRole('button', { name: 'Reveal answer' }))
    await userEvent.click(screen.getByRole('button', { name: /^good/i }))
    await waitFor(() => expect(api.saveProgress).toHaveBeenCalled(), { timeout: 4000 })
    const [rows] = api.saveProgress.mock.calls.at(-1)
    expect(rows).toEqual([expect.objectContaining({ user_id: READER.id, last_grade: 'good' })])
    await waitFor(() => expect(sharedStore(READER).pending).toEqual([]))
  })
})

describe('Add to My Gunit', () => {
  it('makes an independent copy: new ids, the same content, and the reader’s own progress only', async () => {
    const store = { progress: { [C1]: { last: 'good', due: 1, interval: 10, ease: 2.5, reps: 1, lapses: 0 } }, studied: {}, pending: [], cache: {}, copies: {} }
    localStorage.setItem(`gunit.shared.${READER.id}`, JSON.stringify(store))
    open(`/shared/deck/${TOKEN}`, { user: READER })
    await userEvent.click(await screen.findByRole('button', { name: 'Add to My Gunit' }))

    await waitFor(() => expect(screen.getByTestId('pathname').textContent).toMatch(/^\/decks\//))
    const [copy] = library(READER).decks
    expect(copy.id).not.toBe(DECK)
    expect(copy.cards.map((c) => c.front)).toEqual(['What is paging?', 'What is a TLB?', 'What is thrashing?', 'What is a page fault?'])
    expect(copy.cards.map((c) => c.id)).not.toContain(C1)
    // The reader's progress on the first card came with it, under the copy's own id.
    expect(Object.keys(copy.schedule)).toEqual([copy.cards[0].id])
    expect(sharedStore(READER).copies[DECK]).toBe(copy.id)
  })

  it('offers the copy that is already there instead of making a second without asking', async () => {
    open(`/shared/deck/${TOKEN}`, { user: READER })
    await userEvent.click(await screen.findByRole('button', { name: 'Add to My Gunit' }))
    await waitFor(() => expect(library(READER).decks).toHaveLength(1))
    cleanup()
    open(`/shared/deck/${TOKEN}`, { user: READER })
    expect((await screen.findByRole('link', { name: 'Open your copy' })).getAttribute('href')).toBe(`/decks/${library(READER).decks[0].id}`)
    expect(screen.queryByRole('button', { name: 'Add to My Gunit' })).toBeNull()
  })

  it('asks a guest where the copy should go, and puts it in this browser if they say so', async () => {
    open(`/shared/deck/${TOKEN}`)
    await userEvent.click(await screen.findByRole('button', { name: 'Add to My Gunit' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('link', { name: 'Sign in' })).toBeTruthy()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add to this browser' }))
    await waitFor(() => expect(library().decks.some((d) => d.title === 'CC 116 — Module 6')).toBe(true))
  })

  it('copies a whole folder into a folder of the same name', async () => {
    api.openShare.mockResolvedValue({ data: sharedFolder(), error: null })
    open(`/shared/folder/${TOKEN}`, { user: READER })
    expect(await screen.findByRole('heading', { level: 1, name: 'CC 116' })).toBeTruthy()
    expect(screen.getByText('Module 5')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Add all to My Gunit' }))
    await waitFor(() => expect(library(READER).decks).toHaveLength(2))
    const { decks, folders } = library(READER)
    expect(folders.map((f) => f.name)).toEqual(['CC 116'])
    expect(decks.every((d) => d.folderId === folders[0].id)).toBe(true)
  })
})

describe('what each role is offered', () => {
  it('gives a viewer nothing that edits the shared deck', async () => {
    open(`/shared/deck/${TOKEN}`, { user: READER })
    await screen.findByText('What is paging?')
    await userEvent.click(screen.getAllByRole('button', { name: 'Card options' })[0])
    expect(screen.queryByRole('button', { name: /Edit card/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Delete card/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Suspend for me/ })).toBeTruthy()
  })

  it('lets an editor change a card, sending the content and nothing else', async () => {
    api.openShare.mockResolvedValue({ data: sharedDeck({ role: 'editor', joined: true }), error: null })
    open(`/shared/deck/${TOKEN}`, { user: READER })
    await screen.findByText('What is paging?')
    await userEvent.click(screen.getAllByRole('button', { name: 'Card options' })[1])
    await userEvent.click(screen.getByRole('button', { name: /Edit card/ }))
    const front = screen.getByDisplayValue('What is a TLB?')
    await userEvent.clear(front)
    await userEvent.type(front, 'What does a TLB cache?')
    await userEvent.click(screen.getByRole('button', { name: 'Save card' }))

    await waitFor(() => expect(api.editSharedCards).toHaveBeenCalled())
    expect(api.editSharedCards).toHaveBeenCalledWith(
      TOKEN,
      DECK,
      [{ id: C2, front: 'What does a TLB cache?', back: 'A translation cache.', position: 1 }],
      [],
    )
    // Read back from the account rather than trusted.
    await waitFor(() => expect(api.openShare).toHaveBeenCalledTimes(2))
  })

  it('does not offer editing to someone not signed in, even on an editor link', async () => {
    api.openShare.mockResolvedValue({ data: sharedDeck({ role: 'editor' }), error: null })
    open(`/shared/deck/${TOKEN}`)
    await screen.findByText('What is paging?')
    await userEvent.click(screen.getAllByRole('button', { name: 'Card options' })[0])
    expect(screen.queryByRole('button', { name: /Edit card/ })).toBeNull()
  })

  it('points the owner at their own deck instead of offering them a copy of it', async () => {
    api.openShare.mockResolvedValue({ data: sharedDeck({ role: 'owner' }), error: null })
    open(`/shared/deck/${TOKEN}`, { user: READER })
    expect((await screen.findByRole('link', { name: 'Open in My decks' })).getAttribute('href')).toBe(`/decks/${DECK}`)
    expect(screen.queryByRole('button', { name: 'Add to My Gunit' })).toBeNull()
    expect(screen.getByText('Shared by you')).toBeTruthy()
  })
})
