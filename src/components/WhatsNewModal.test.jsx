// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import pkg from '../../package.json'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * What's New: shown once per version, on the version actually running, to
 * whoever opens Gunit — and from local storage alone.
 */

const getSupabase = vi.hoisted(() => vi.fn(async () => null))
vi.mock('../data/supabase.js', () => ({ isConfigured: true, getSupabase }))

const { AuthContext } = await import('../data/authContext.js')
const { RELEASE_NOTES } = await import('../data/releaseNotes.js')
const { SEEN_KEY, compareVersions, decide, launchWhatsNew, resetLaunch } = await import('../data/whatsNew.js')
const { default: WhatsNewModal, WhatsNewDialog } = await import('./WhatsNewModal.jsx')
const { offerUpdate, resetPwaState } = await import('../pwa/pwaState.js')

const RUNNING = pkg.version
const READER = { id: '22222222-2222-4222-8222-222222222222', email: 'amy@example.com' }

/** A browser that has run Gunit before: it has a library. */
const returningReader = () => localStorage.setItem('gunit.state.guest', '{"decks":[],"sessions":[]}')

/** A page load: the launch decision is taken afresh, as main.jsx takes it. */
function launch({ user = null } = {}) {
  resetLaunch()
  return render(
    <AuthContext.Provider value={{ user, available: true, status: 'ready' }}>
      <WhatsNewModal />
    </AuthContext.Provider>,
  )
}

const NOTES = [
  { version: '2.1.0', new: ['Something from the future'] },
  { version: '2.0.0', new: [{ title: 'Big thing', detail: 'It does a lot.' }], removed: ['An old screen'] },
  { version: '1.5.0', fixed: ['A small fix'] },
  { version: '1.4.0' },
]

beforeEach(() => {
  localStorage.clear()
  resetPwaState()
  getSupabase.mockClear()
})

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('deciding, from what is in storage', () => {
  it('shows a returning reader the notes for the version they are now running', () => {
    returningReader()
    const { entries } = decide({ version: '2.0.0', notes: NOTES })
    expect(entries.map((e) => e.version)).toEqual(['2.0.0'])
  })

  it('shows nothing for a version already seen', () => {
    localStorage.setItem(SEEN_KEY, '2.0.0')
    expect(decide({ version: '2.0.0', notes: NOTES }).entries).toEqual([])
  })

  it('shows a new version again, with every version missed in between', () => {
    localStorage.setItem(SEEN_KEY, '1.4.0')
    expect(decide({ version: '2.0.0', notes: NOTES }).entries.map((e) => e.version)).toEqual(['2.0.0', '1.5.0'])
  })

  it('never shows notes for a version newer than the one running', () => {
    // An update downloaded and waiting is not running yet.
    localStorage.setItem(SEEN_KEY, '1.5.0')
    expect(decide({ version: '2.0.0', notes: NOTES }).entries.map((e) => e.version)).toEqual(['2.0.0'])
  })

  it('tells a first-time visitor nothing, and remembers the version so they are not told later', () => {
    expect(decide({ version: '2.0.0', notes: NOTES }).entries).toEqual([])
    expect(localStorage.getItem(SEEN_KEY)).toBe('2.0.0')
  })

  it('says nothing for a release with no notes, and does not bring older ones back for it', () => {
    localStorage.setItem(SEEN_KEY, '1.5.0')
    expect(decide({ version: '1.6.0', notes: NOTES }).entries).toEqual([])
    expect(localStorage.getItem(SEEN_KEY)).toBe('1.6.0')
  })

  it('orders versions as numbers, not as text', () => {
    expect(compareVersions('1.10.0', '1.9.2')).toBe(1)
    expect(compareVersions('1.1.0', '1.1.0')).toBe(0)
    expect(compareVersions(null, '0.0.1')).toBe(-1)
  })

  it('uses the version this build is, from package.json, and nothing kept separately', () => {
    returningReader()
    expect(launchWhatsNew().version).toBe(RUNNING)
    expect(RELEASE_NOTES.some((entry) => entry.version === RUNNING)).toBe(true)
  })
})

describe('the dialog on launch', () => {
  it('shows a guest the running version’s notes, and Got it puts them away for good', async () => {
    returningReader()
    launch()
    const dialog = screen.getByRole('dialog', { name: 'What’s new' })
    expect(within(dialog).getByText(`Gunit v${RUNNING}`)).toBeTruthy()
    expect(within(dialog).getByRole('heading', { name: 'New' })).toBeTruthy()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Got it' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(localStorage.getItem(SEEN_KEY)).toBe(RUNNING)

    // The next page load, and the one after: not again.
    cleanup()
    launch()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows a signed-in reader the same, without asking the network anything', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch')
    returningReader()
    localStorage.setItem(`gunit.state.user.${READER.id}`, '{"decks":[],"sessions":[]}')
    launch({ user: READER })
    const dialog = screen.getByRole('dialog', { name: 'What’s new' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Got it' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
    expect(getSupabase).not.toHaveBeenCalled()
    fetch.mockRestore()
  })

  it('counts Escape as read, the way every other Gunit dialog closes', async () => {
    returningReader()
    launch()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(localStorage.getItem(SEEN_KEY)).toBe(RUNNING)
  })

  it('has one button to answer with, and nothing else to decline', () => {
    returningReader()
    launch()
    const buttons = within(screen.getByRole('dialog')).getAllByRole('button').map((b) => b.textContent)
    expect(buttons).toEqual(['×', 'Got it'])
  })

  it('is not brought on by an update waiting for a reload, only by running it', () => {
    localStorage.setItem(SEEN_KEY, RUNNING)
    act(() => offerUpdate(() => {}))
    launch()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('what it shows', () => {
  it('leaves out every category with nothing in it', () => {
    render(<WhatsNewDialog version="3.0.0" entries={[{ version: '3.0.0', fixed: ['Only a fix'], new: [], removed: undefined }]} onClose={() => {}} />)
    const headings = within(screen.getByRole('dialog')).getAllByRole('heading').map((h) => h.textContent)
    expect(headings).toEqual(['What’s new', 'Fixed'])
    expect(screen.getByText('Only a fix')).toBeTruthy()
  })

  it('shows whatever the notes say, with no change to the dialog: a heading and its detail, or a sentence', () => {
    render(<WhatsNewDialog version="2.0.0" entries={[NOTES[1]]} onClose={() => {}} />)
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Gunit v2.0.0')).toBeTruthy()
    expect(within(dialog).getByText('Big thing')).toBeTruthy()
    expect(within(dialog).getByText('It does a lot.')).toBeTruthy()
    expect(within(dialog).getByRole('heading', { name: 'Removed' })).toBeTruthy()
    expect(within(dialog).getByText('An old screen')).toBeTruthy()
    expect(within(dialog).queryByRole('heading', { name: 'Improved' })).toBeNull()
  })

  it('labels each version when several were missed', () => {
    render(<WhatsNewDialog version="2.0.0" entries={[NOTES[1], NOTES[2]]} onClose={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Version 2.0.0' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Version 1.5.0' })).toBeTruthy()
  })

  it('renders nothing at all when there is nothing to say', () => {
    const { container } = render(<WhatsNewDialog version="2.0.0" entries={[]} onClose={() => {}} />)
    expect(container.innerHTML).toBe('')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
