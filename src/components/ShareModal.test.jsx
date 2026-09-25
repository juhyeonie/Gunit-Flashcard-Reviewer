// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The owner's side: what sharing a deck asks, and what it sends. Whether the
 * database lets them is tested against the database, in supabase/test.
 */

const api = vi.hoisted(() => ({
  shareSettings: vi.fn(),
  setShare: vi.fn(),
  resetShareLink: vi.fn(),
  stopSharing: vi.fn(),
  inviteToShare: vi.fn(),
  setMemberRole: vi.fn(),
  removeMember: vi.fn(),
}))
vi.mock('../data/sharing.js', async (importOriginal) => ({ ...(await importOriginal()), ...api }))

const { AuthContext } = await import('../data/authContext.js')
const { default: ShareModal } = await import('./ShareModal.jsx')

const OWNER = { id: '11111111-1111-4111-8111-111111111111', email: 'olive@example.com' }
const DECK = { id: 'd0000000-0000-4000-8000-000000000001', title: 'CC 116 — Module 6' }
const TOKEN = 'abcdefabcdefabcdefabcdefabcdef12'
const settings = (over = {}) => ({
  id: 's1',
  token: TOKEN,
  kind: 'deck',
  access: 'link',
  role: 'viewer',
  active: true,
  members: [],
  ...over,
})

function show({ user = OWNER, available = true } = {}) {
  const say = vi.fn()
  const onClose = vi.fn()
  render(
    <AuthContext.Provider value={{ user, available, status: 'ready' }}>
      <MemoryRouter>
        <ShareModal kind="deck" resource={DECK} onClose={onClose} say={say} />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
  return { say, onClose }
}

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset()
  api.shareSettings.mockResolvedValue({ data: null, error: null })
  api.setShare.mockImplementation(async (_kind, _id, access, role) => ({ data: settings({ access, role }), error: null }))
})

afterEach(cleanup)

describe('sharing a deck', () => {
  it('shares nothing just by being opened', async () => {
    show()
    expect(await screen.findByText(/Not shared yet/)).toBeTruthy()
    expect(api.shareSettings).toHaveBeenCalledWith('deck', DECK.id)
    expect(api.setShare).not.toHaveBeenCalled()
  })

  it('shares with the chosen access and permission when the link is asked for, and copies it', async () => {
    const user = userEvent.setup()
    const { say } = show()
    await screen.findByText(/Not shared yet/)
    await user.click(screen.getByRole('radio', { name: /Only invited people/ }))
    await user.click(screen.getByRole('radio', { name: /Can edit/ }))
    expect(api.setShare).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Share and copy link' }))
    await waitFor(() => expect(api.setShare).toHaveBeenCalledWith('deck', DECK.id, 'invited', 'editor'))
    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/shared/deck/${TOKEN}`)
    expect(say).toHaveBeenCalledWith('Link copied')
    expect(screen.getByDisplayValue(`${window.location.origin}/shared/deck/${TOKEN}`)).toBeTruthy()
  })

  it('changes an existing share the moment a choice changes', async () => {
    const user = userEvent.setup()
    api.shareSettings.mockResolvedValue({ data: settings(), error: null })
    show()
    await screen.findByDisplayValue(/\/shared\/deck\//)
    await user.click(screen.getByRole('radio', { name: /Can edit/ }))
    await waitFor(() => expect(api.setShare).toHaveBeenCalledWith('deck', DECK.id, 'link', 'editor'))
  })

  it('invites by email, and lists who it is shared with', async () => {
    const user = userEvent.setup()
    api.shareSettings.mockResolvedValue({ data: settings({ access: 'invited' }), error: null })
    api.inviteToShare.mockResolvedValue({
      data: settings({
        access: 'invited',
        members: [{ id: 'm1', email: 'ben@example.com', name: null, role: 'editor', via: 'invite', joined: false }],
      }),
      error: null,
    })
    show()
    await screen.findByDisplayValue(/\/shared\/deck\//)
    await user.type(screen.getByLabelText('Invite by email'), 'ben@example.com')
    await user.selectOptions(screen.getByLabelText('Invited person can'), 'editor')
    await user.click(screen.getByRole('button', { name: 'Invite' }))

    await waitFor(() => expect(api.inviteToShare).toHaveBeenCalledWith('s1', 'ben@example.com', 'editor'))
    const list = await screen.findByText('Shared with')
    expect(within(list.parentElement).getByText('ben@example.com')).toBeTruthy()
    expect(screen.getByText(/invited — not opened yet/)).toBeTruthy()
  })

  it('says why an invitation was refused', async () => {
    const user = userEvent.setup()
    api.shareSettings.mockResolvedValue({ data: settings(), error: null })
    api.inviteToShare.mockResolvedValue({ data: null, error: 'That’s your own address — you already have this.' })
    show()
    await screen.findByDisplayValue(/\/shared\/deck\//)
    await user.type(screen.getByLabelText('Invite by email'), OWNER.email)
    await user.click(screen.getByRole('button', { name: 'Invite' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/your own address/)
  })

  it('stops sharing and resets the link from the link options', async () => {
    const user = userEvent.setup()
    api.shareSettings.mockResolvedValue({ data: settings(), error: null })
    api.resetShareLink.mockResolvedValue({ data: settings({ token: 'f'.repeat(32) }), error: null })
    api.stopSharing.mockResolvedValue({ data: settings({ active: false }), error: null })
    show()
    await screen.findByDisplayValue(/\/shared\/deck\//)
    await user.click(screen.getByRole('button', { name: 'Link options' }))
    await user.click(screen.getByRole('button', { name: 'Reset link' }))
    expect(await screen.findByDisplayValue(new RegExp(`/shared/deck/${'f'.repeat(32)}$`))).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Stop sharing' }))
    expect(await screen.findByText(/Sharing is off/)).toBeTruthy()
    expect(api.stopSharing).toHaveBeenCalledWith('s1')
  })
})

describe('without an account', () => {
  it('asks a guest to sign in rather than offering a link', async () => {
    show({ user: null })
    expect(screen.getByText(/Sharing needs an account/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy()
    expect(api.shareSettings).not.toHaveBeenCalled()
  })

  it('explains that a local-only copy has nothing to share from', async () => {
    show({ user: null, available: false })
    expect(screen.getByText(/keeps everything in this browser/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull()
  })
})
