// @vitest-environment jsdom
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Dashboard from './Dashboard.jsx'
import { MIN_QUIZ_CARDS } from '../data/quiz.js'
import { deck, entry, renderRoute, seed } from '../../test/render-app.jsx'

/**
 * The dashboard, and the claims it makes about a library.
 *
 * Almost everything on it is derived — the streak, the weekly chart, what is
 * due — so what is worth pinning is that it derives rather than asserts. It
 * used to open with "You last left off in X. Twelve minutes should finish the
 * deck", on a library where nothing had ever been opened.
 */

const open = (props = {}) =>
  renderRoute(
    '/',
    '/',
    <Dashboard onNewDeck={vi.fn()} onEditDeck={vi.fn()} onImport={vi.fn()} {...props} />,
  )

const lead = () => document.querySelector('main p, .rise-in p')?.textContent.replace(/\s+/g, ' ').trim()

const at = () => screen.getByTestId('pathname').textContent

/** A session logged at a known pace, so an estimate is checkable. */
const session = (reviewed, seconds, at = Date.now() - 3_600_000) => ({
  at,
  deckId: 'republic',
  reviewed,
  seconds,
})

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('the opening line', () => {
  it('does not claim you left off in a deck you never opened', () => {
    seed({ decks: [deck({ count: 4 })], sessions: [] })
    open()

    expect(lead()).toMatch(/^Ready when you are/)
    expect(lead()).not.toMatch(/left off/)
  })

  it('says you left off somewhere once you actually have', () => {
    seed({ decks: [deck({ count: 4, studiedAt: Date.now() })], sessions: [session(4, 120)] })
    open()
    expect(lead()).toMatch(/^You last left off in/)
  })

  it('counts what is due rather than describing it', () => {
    seed({ decks: [deck({ count: 4 })], sessions: [] })
    open()
    expect(lead()).toMatch(/4 cards are due/)
  })

  it('says card, singular, for one', () => {
    seed({
      decks: [deck({ count: 3, schedule: { c0: entry(-10), c1: entry(600), c2: entry(600) } })],
      sessions: [],
    })
    open()
    expect(lead()).toMatch(/1 card is due/)
  })

  it('estimates from the reader’s own pace, once there is one', () => {
    // 30s a card over a logged session; four due is two minutes.
    seed({ decks: [deck({ count: 4, studiedAt: Date.now() })], sessions: [session(10, 300)] })
    open()
    expect(lead()).toMatch(/about 2 minutes/)
  })

  it('offers no estimate before there is anything to estimate from', () => {
    // "Twelve minutes should finish the deck" was the old answer, whatever the
    // deck held and whether or not anyone had opened it.
    seed({ decks: [deck({ count: 4 })], sessions: [] })
    expect(lead === undefined).toBe(false)
    open()
    expect(lead()).not.toMatch(/minute/)
  })

  it('says so when nothing is due at all', () => {
    seed({
      decks: [deck({ count: 2, schedule: { c0: entry(600), c1: entry(600) } })],
      sessions: [],
    })
    open()
    expect(lead()).toMatch(/Nothing is due/)
  })
})

describe('picking up where you were', () => {
  it('opens the deck with cards waiting', async () => {
    seed({
      decks: [
        deck({ id: 'done', title: 'Finished', count: 2, schedule: { c0: entry(600), c1: entry(600) } }),
        deck({ id: 'republic', title: 'Roman Republic', count: 4 }),
      ],
      sessions: [],
    })
    open()

    // Both decks are listed further down, so this asks the panel itself.
    const panel = screen.getByText('Continue reviewing').closest('section')
    expect(panel.textContent).toMatch(/Roman Republic/)
    expect(panel.textContent).not.toMatch(/Finished/)

    await userEvent.click(screen.getByRole('button', { name: 'Resume review' }))
    await waitFor(() => expect(at()).toBe('/decks/republic/review'))
  })

  it('takes the quiz to the same deck', async () => {
    seed({ decks: [deck({ count: 4 })], sessions: [] })
    open()

    await userEvent.click(screen.getByRole('button', { name: 'Quiz me' }))
    await waitFor(() => expect(at()).toBe('/decks/republic/quiz'))
  })

  it('will not offer a quiz on a deck too small for one', () => {
    seed({ decks: [deck({ count: MIN_QUIZ_CARDS - 1 })], sessions: [] })
    open()

    const quiz = screen.getByRole('button', { name: 'Quiz me' })
    expect(quiz.disabled).toBe(true)
    expect(quiz.title).toMatch(/too small to quiz/)
  })
})

describe('an empty library', () => {
  beforeEach(() => seed({ decks: [], sessions: [] }))

  it('offers a way to start rather than a panel about nothing', () => {
    open()
    expect(screen.getByText('Nothing to study yet')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Resume review' })).toBe(null)
  })

  it('does not promise to write the cards', () => {
    // It used to offer to "let the cards be drafted for you".
    open()
    expect(screen.queryByText(/drafted for you/)).toBe(null)
  })

  it('hands both ways in to the shell', async () => {
    const onNewDeck = vi.fn()
    const onImport = vi.fn()
    open({ onNewDeck, onImport })

    await userEvent.click(screen.getByRole('button', { name: 'New deck' }))
    await userEvent.click(screen.getByRole('button', { name: 'Import material' }))
    expect(onNewDeck).toHaveBeenCalled()
    expect(onImport).toHaveBeenCalled()
  })
})

describe('the streak', () => {
  it('reads sensibly with none', () => {
    seed({ decks: [deck()], sessions: [] })
    open()
    expect(screen.getByText('No streak yet. One session today starts it.')).toBeTruthy()
  })

  it('counts the library rather than describing it', () => {
    seed({
      decks: [deck({ count: 4 }), deck({ id: 'b', title: 'Punic Wars', count: 2 })],
      sessions: [],
    })
    open()
    const tile = (label) => screen.getByText(label).parentElement.textContent
    expect(tile('Decks')).toMatch(/2in library/)
    expect(tile('Cards')).toMatch(/6total/)
  })
})
