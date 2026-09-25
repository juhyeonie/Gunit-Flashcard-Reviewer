// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The "Shared" marker on the reader's own decks and folders: read once from
 * the account, kept in step by the Share dialog, and absent whenever there is
 * nothing to go on.
 */

const reads = []
let answer = { data: [], error: null }
const client = {
  from(table) {
    const query = {
      select: () => query,
      eq: (column, value) => {
        reads.push({ table, [column]: value })
        return query
      },
      is: () => Promise.resolve(answer),
    }
    return query
  },
}
vi.mock('./supabase.js', () => ({ isConfigured: true, getSupabase: async () => client }))

const { AuthContext } = await import('./authContext.js')
const { noteShared, resetOwnShares } = await import('./ownShares.js')
const { default: DeckCard } = await import('../components/DeckCard.jsx')

const OWNER = { id: '11111111-1111-4111-8111-111111111111' }
const deck = (id, title) => ({
  id, title, subject: 'CC 116', desc: '', cards: [], schedule: {}, studiedAt: null, progress: 0, folderId: null,
})
const SHARED = deck('d0000000-0000-4000-8000-000000000001', 'Module 6')
const PRIVATE = deck('d0000000-0000-4000-8000-000000000002', 'Module 5')

function show({ user = OWNER, available = true } = {}) {
  return render(
    <AuthContext.Provider value={{ user, available, status: 'ready' }}>
      <MemoryRouter>
        <DeckCard deck={SHARED} />
        <DeckCard deck={PRIVATE} />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

const markers = () => screen.queryAllByText('· Shared')

beforeEach(() => {
  reads.length = 0
  answer = { data: [{ deck_id: SHARED.id, folder_id: null }], error: null }
  resetOwnShares()
})

afterEach(cleanup)

describe('the Shared marker', () => {
  it('shows on the reader’s decks that are shared, and only those', async () => {
    show()
    await waitFor(() => expect(markers()).toHaveLength(1))
    expect(markers()[0].closest('article').textContent).toContain('Module 6')
  })

  it('asks the account once, for the reader’s own shares, however many cards ask', async () => {
    show()
    await waitFor(() => expect(markers()).toHaveLength(1))
    expect(reads).toEqual([{ table: 'shares', owner_id: OWNER.id }])
  })

  it('follows the Share dialog without asking again', async () => {
    show()
    await waitFor(() => expect(markers()).toHaveLength(1))
    act(() => noteShared('deck', PRIVATE.id, true))
    expect(markers()).toHaveLength(2)
    act(() => noteShared('deck', SHARED.id, false))
    expect(markers()).toHaveLength(1)
    expect(reads).toHaveLength(1)
  })

  it('is not shown, and nothing is asked, for a guest or a copy without accounts', async () => {
    show({ user: null })
    show({ user: null, available: false })
    await new Promise((r) => setTimeout(r, 20))
    expect(markers()).toEqual([])
    expect(reads).toEqual([])
  })

  it('is simply absent when the account cannot say — offline, or sharing not set up', async () => {
    answer = { data: null, error: { code: '42P01', message: 'relation "shares" does not exist' } }
    show()
    await new Promise((r) => setTimeout(r, 20))
    expect(markers()).toEqual([])
  })
})
