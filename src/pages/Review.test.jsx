// @vitest-environment jsdom
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Review from './Review.jsx'
import { deck, entry, renderRoute, seed, stored } from '../../test/render-app.jsx'

/**
 * A review session, driven the way a reader drives it.
 *
 * `session.js` covers what the queue and the summary are made of; this covers
 * what happens on the page: what is on screen before the card is flipped,
 * where a grade goes, and where the session ends up.
 *
 * Shuffling is off in every test here. It has its own coverage, and a random
 * order would make "the first card" mean nothing.
 */

const open = (path = '/decks/republic/review') =>
  renderRoute(path, '/decks/:id/review', <Review />)

/** The rating buttons carry their next interval, so match on the label alone. */
const rate = (level) => screen.getByRole('button', { name: new RegExp(`^${level}`, 'i') })

const at = () => screen.getByTestId('pathname').textContent

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('the card', () => {
  beforeEach(() => seed({ decks: [deck({ count: 3 })] }))

  it('shows the question and hides the answer', () => {
    open()
    // Both faces are in the DOM for the flip; only one is exposed. This broke
    // once and the answer was read out alongside the question.
    expect(screen.getByText('Question 0?').closest('[aria-hidden]').ariaHidden).toBe('false')
    expect(screen.getByText('Answer 0.').closest('[aria-hidden]').ariaHidden).toBe('true')
  })

  it('swaps which face is exposed when revealed', async () => {
    open()
    await userEvent.click(screen.getByRole('button', { name: 'Reveal answer' }))

    expect(screen.getByText('Answer 0.').closest('[aria-hidden]').ariaHidden).toBe('false')
    expect(screen.getByText('Question 0?').closest('[aria-hidden]').ariaHidden).toBe('true')
  })

  it('reveals on the space bar', async () => {
    open()
    await userEvent.keyboard(' ')
    expect(await screen.findByText('How well did you know it?')).toBeTruthy()
  })

  it('counts through the queue', () => {
    open()
    expect(screen.getByText('1 / 3')).toBeTruthy()
  })
})

describe('a card whose text does not fit', () => {
  const wordy =
    'Explain in full how the tribunician power, the imperium proconsulare maius, and control ' +
    'of the aerarium militare combined to give the princeps an authority that was ' +
    'constitutionally deniable yet practically absolute, and why the Senate kept ratifying it.'

  /*
   * jsdom computes no layout, so these assert the structure that decides it
   * rather than the geometry itself. The geometry was measured in a browser:
   * at 375px the question used to run 42px past the bottom border of its own
   * card, carrying the "Click card or press space" hint out with it.
   */
  const faceOf = (side) =>
    [...document.querySelectorAll('div')].find(
      (d) => d.className.includes('backface-visibility') && d.getAttribute('aria-hidden') === side,
    )

  beforeEach(() =>
    seed({ decks: [deck({ count: 1, cards: [{ id: 'c0', front: wordy, back: 'Because.' }] })] }),
  )

  it('keeps both faces in the flow, so the card grows to fit them', () => {
    // Absolutely positioned, they contributed no height and the card stayed
    // exactly its min-height however long the question was.
    open()
    for (const side of ['false', 'true']) {
      expect(faceOf(side).className).toMatch(/grid-area:1\/1/)
      expect(faceOf(side).className).not.toMatch(/absolute/)
    }
  })

  it('caps the card and lets the text scroll rather than growing off-screen', () => {
    open()
    const scroller = faceOf('false').querySelector('p').parentElement
    expect(scroller.className).toMatch(/overflow-y-auto/)
    // Without min-h-0 a flex child refuses to shrink below its content, and
    // the overflow has nowhere to go.
    expect(scroller.className).toMatch(/min-h-0/)
  })

  it('lets a word with no spaces in it break', () => {
    // A pasted URL has no break opportunity of its own. `break-word` alone is
    // not enough where the box shrinks to fit its content: it wraps the word
    // without reducing the width the box asks for. Measured at 375px, the
    // question ran 113px past the side of the card.
    open()
    expect(faceOf('false').querySelector('p').className).toMatch(/overflow-wrap:anywhere/)
    expect(faceOf('true').querySelector('p').className).toMatch(/overflow-wrap:anywhere/)
  })

  it('pins the text column, so centring cannot widen it', () => {
    open()
    const scroller = faceOf('false').querySelector('p').parentElement
    expect(scroller.className).toMatch(/grid-cols-\[minmax\(0,1fr\)\]/)
  })

  it('sizes the row from the card rather than from the text', () => {
    // An auto track grows to its content and takes the card past its own
    // max-height, which is the same overflow one level down.
    open()
    const flip = [...document.querySelectorAll('div')].find((d) =>
      d.className.includes('preserve-3d'),
    )
    expect(flip.className).toMatch(/grid-rows-\[minmax\(0,1fr\)\]/)
    expect(flip.className).toMatch(/max-h-/)
  })
})

describe('grading', () => {
  beforeEach(() => seed({ decks: [deck({ count: 3 })] }))

  it('writes the grade through to the deck as it is given', async () => {
    // Committed per card rather than at the end, so leaving part-way keeps the
    // work already done.
    open()
    await userEvent.click(screen.getByRole('button', { name: 'Reveal answer' }))
    await userEvent.click(rate('good'))

    await waitFor(() => expect(stored().decks[0].schedule.c0).toBeTruthy())
    expect(stored().decks[0].schedule.c1).toBeUndefined()
  })

  it('moves to the next card, face down', async () => {
    open()
    await userEvent.click(screen.getByRole('button', { name: 'Reveal answer' }))
    await userEvent.click(rate('good'))

    expect(await screen.findByText('2 / 3')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reveal answer' })).toBeTruthy()
  })

  it('offers a real interval on each rating, not a fixed label', async () => {
    open()
    await userEvent.click(screen.getByRole('button', { name: 'Reveal answer' }))
    // "Again" sends a card back to a ten-minute step; "easy" does not.
    expect(rate('again').textContent).toMatch(/10 minutes/)
    expect(rate('easy').textContent).not.toMatch(/10 minutes/)
  })

  it('grades on the number keys once the answer is up', async () => {
    open()
    await userEvent.keyboard(' ')
    await userEvent.keyboard('1')
    await waitFor(() => expect(stored().decks[0].schedule.c0.lapses).toBe(1))
  })

  it('ignores the number keys while the answer is hidden', async () => {
    // Grading a card you have not seen the back of is not a judgement.
    open()
    await userEvent.keyboard('2')
    expect(screen.getByText('1 / 3')).toBeTruthy()
    expect(stored().decks[0].schedule.c0).toBeUndefined()
  })
})

describe('finishing', () => {
  beforeEach(() => seed({ decks: [deck({ count: 2 })] }))

  it('ends at the summary, carrying the tally', async () => {
    open()
    for (const level of ['good', 'again']) {
      await userEvent.click(screen.getByRole('button', { name: 'Reveal answer' }))
      await userEvent.click(rate(level))
    }

    await waitFor(() => expect(at()).toBe('/decks/republic/summary'))
    const state = JSON.parse(screen.getByTestId('nav-state').textContent)
    expect(state).toMatchObject({ reviewed: 2, known: 1, again: 1 })
  })

  it('logs the session on the way out, even part-way through', async () => {
    // Time spent on an abandoned session still counts toward the streak.
    // Left by navigating rather than unmounting the tree: the page goes, the
    // store stays, which is the only way the log survives.
    open()
    await userEvent.click(screen.getByRole('button', { name: 'Reveal answer' }))
    await userEvent.click(rate('good'))
    await userEvent.keyboard('{Escape}')

    await waitFor(() => expect(stored().sessions).toHaveLength(1))
    expect(stored().sessions[0].reviewed).toBe(1)
  })

  it('logs nothing when nothing was graded', async () => {
    open()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(at()).toBe('/decks/republic'))
    expect(stored().sessions).toHaveLength(0)
  })

  it('leaves on Escape', async () => {
    open()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(at()).toBe('/decks/republic'))
  })
})

describe('when there is nothing to review', () => {
  it('says when the next card is due rather than just refusing', async () => {
    seed({
      decks: [deck({ count: 2, schedule: { c0: entry(3 * 60), c1: entry(24 * 60) } })],
    })
    open()

    expect(screen.getByText('Nothing is due right now')).toBeTruthy()
    expect(screen.getByText(/comes due in 3 hours/)).toBeTruthy()
  })

  it('offers the whole deck to anyone who wants it anyway', async () => {
    seed({ decks: [deck({ count: 3, schedule: { c0: entry(60), c1: entry(60), c2: entry(60) } })] })
    open()

    await userEvent.click(screen.getByRole('button', { name: 'Review ahead' }))

    expect(await screen.findByText('1 / 3')).toBeTruthy()
    expect(screen.getByText('Reviewing ahead')).toBeTruthy()
  })

  it('asks for cards rather than offering to review none', () => {
    seed({ decks: [deck({ count: 0 })] })
    open()

    expect(screen.getByText('No cards yet')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Review ahead' })).toBe(null)
  })
})

describe('when the deck is gone', () => {
  it('says so instead of rendering an empty session', () => {
    seed({ decks: [deck()] })
    open('/decks/deleted/review')
    expect(screen.getByText('That deck no longer exists.')).toBeTruthy()
  })
})
