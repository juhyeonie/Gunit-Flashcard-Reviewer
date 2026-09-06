// @vitest-environment jsdom
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Decks from './Decks.jsx'
import { deck, renderRoute, seed, stored } from '../../test/render-app.jsx'
import { toTransfer } from '../data/transfer.js'

/**
 * The library page. `library.js` covers the filtering and sorting themselves;
 * what is here is the empty state, which has to describe what the reader
 * actually did rather than what it assumes they did.
 */

const open = () =>
  renderRoute('/decks', '/decks', <Decks onNewDeck={vi.fn()} onEditDeck={vi.fn()} />)

const search = () => screen.getByLabelText('Search decks and cards')

const filePicker = () => document.querySelector('input[type="file"]')

const asFile = (payload) =>
  new File([JSON.stringify(payload)], 'saved.gunit.json', { type: 'application/json' })

/** A deck as it would come out of another library's export. */
const exported = (over = {}) => ({
  ...toTransfer({
    title: 'Late Antiquity',
    subject: 'Rome',
    desc: 'After Diocletian.',
    cards: [
      { id: 'x0', front: 'Diocletian?', back: 'Split the empire in two.' },
      { id: 'x1', front: 'Constantine?', back: 'Founded Constantinople.' },
    ],
    schedule: { x0: { due: 1, last: 0, interval: 1440, ease: 2.5, lapses: 0, step: 0 } },
  }),
  ...over,
})

beforeEach(() => {
  localStorage.clear()
  seed({
    decks: [
      deck({ id: 'republic', title: 'Roman Republic', count: 4 }),
      deck({ id: 'punic', title: 'The Punic Wars', count: 2 }),
    ],
  })
})
afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('finding a deck', () => {
  it('lists them all to begin with', () => {
    open()
    expect(screen.getByRole('heading', { name: 'Roman Republic' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'The Punic Wars' })).toBeTruthy()
  })

  it('narrows to what was typed', async () => {
    open()
    await userEvent.type(search(), 'punic')

    expect(screen.getByRole('heading', { name: 'The Punic Wars' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Roman Republic' })).toBe(null)
  })
})

describe('when nothing matches', () => {
  it('quotes the search back, and offers to clear it', async () => {
    open()
    await userEvent.type(search(), 'photosynthesis')

    expect(screen.getByText(/Nothing matches/)).toBeTruthy()
    expect(screen.getByText(/Try a shorter search term/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Clear search' })).toBeTruthy()
  })

  it('does not tell someone to shorten a search they never typed', async () => {
    // Reached by a filter alone. "Try a shorter search term" is advice about
    // something that did not happen, and "Clear search" names the wrong thing.
    open()
    await userEvent.click(screen.getByRole('button', { name: 'Mastered' }))

    expect(screen.getByText('Nothing matches that filter')).toBeTruthy()
    expect(screen.queryByText(/shorter search term/)).toBe(null)
    expect(screen.getByRole('button', { name: 'Clear filter' })).toBeTruthy()
  })

  it('puts every deck back', async () => {
    open()
    await userEvent.click(screen.getByRole('button', { name: 'Mastered' }))
    await userEvent.click(screen.getByRole('button', { name: 'Clear filter' }))

    expect(screen.getByRole('heading', { name: 'Roman Republic' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'The Punic Wars' })).toBeTruthy()
  })
})

describe('importing a deck from a file', () => {
  it('adds it to the library and opens it', async () => {
    open()
    await userEvent.upload(filePicker(), asFile(exported()))

    await waitFor(() => expect(stored().decks[0].title).toBe('Late Antiquity'))
    expect(stored().decks[0].cards).toHaveLength(2)
    expect(screen.getByTestId('pathname').textContent).toMatch(/^\/decks\/.+/)
  })

  it('gives the arriving cards ids of this library, and keeps their scheduling', async () => {
    // Ids only mean something inside the library that issued them, but the
    // review history is the reader's own and should survive the trip.
    open()
    await userEvent.upload(filePicker(), asFile(exported()))

    await waitFor(() => expect(stored().decks[0].cards).toHaveLength(2))
    const added = stored().decks[0]
    expect(added.cards.every((c) => c.id && c.id !== 'x0' && c.id !== 'x1')).toBe(true)
    expect(added.schedule[added.cards[0].id]).toMatchObject({ interval: 1440 })
    expect(added.schedule[added.cards[1].id]).toBeUndefined()
  })

  it('says why it refused a file that is not one of ours', async () => {
    open()
    await userEvent.upload(filePicker(), asFile({ notes: [] }))

    expect(await screen.findByText(/not exported from Gunit/)).toBeTruthy()
    expect(stored().decks).toHaveLength(2)
  })

  it('imports what it can and says what it left behind', async () => {
    open()
    await userEvent.upload(
      filePicker(),
      asFile(exported({ cards: [{ front: 'Diocletian?', back: 'Split it.' }, { front: 'x' }] })),
    )

    expect(await screen.findByText(/1 unusable card left out/)).toBeTruthy()
    await waitFor(() => expect(stored().decks[0].cards).toHaveLength(1))
  })
})
