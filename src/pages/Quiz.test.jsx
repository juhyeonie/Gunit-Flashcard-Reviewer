// @vitest-environment jsdom
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Quiz from './Quiz.jsx'
import { MIN_QUIZ_CARDS } from '../data/quiz.js'
import { deck, renderRoute, seed, stored } from '../../test/render-app.jsx'

/**
 * The quiz, driven the way a reader drives it.
 *
 * Questions are built with shuffled options, so nothing here assumes which
 * button is right — it is found by reading the card's own back off the screen.
 * That is also the honest test: if the correct option were not among them, or
 * were marked wrong, this would fail.
 */

const open = (path = '/decks/republic/quiz') => renderRoute(path, '/decks/:id/quiz', <Quiz />)

/**
 * The options, as buttons. Each carries a letter badge and, once answered, a
 * mark, so they are found by the answer text sitting inside rather than by the
 * button's whole name.
 */
const options = () =>
  screen.queryAllByRole('button').filter((b) => /Answer \d+\./.test(b.textContent))

/** Which card the question on screen is about. */
const asking = () => screen.getByRole('heading', { level: 1 }).textContent.match(/Question (\d+)\?/)[1]

/** Answers the question on screen, correctly or otherwise. */
const answer = async (correctly) => {
  const right = new RegExp(`Answer ${asking()}\\.`)
  const target = options().find((b) => right.test(b.textContent) === correctly)
  await userEvent.click(target)
}

const next = async () => {
  const button = screen.getByRole('button', { name: /Next question|See results/ })
  await userEvent.click(button)
}

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('a deck too small to quiz', () => {
  it('refuses rather than showing the answer among two options', () => {
    // Picking the only option would still grade the card and push out its
    // interval, as though something had been recalled.
    seed({ decks: [deck({ count: MIN_QUIZ_CARDS - 1 })] })
    open()

    expect(screen.getByText(`A quiz needs ${MIN_QUIZ_CARDS} cards`)).toBeTruthy()
    expect(options()).toHaveLength(0)
  })

  it('sends an empty deck to add cards, not to flashcards', () => {
    seed({ decks: [deck({ count: 0 })] })
    open()

    expect(screen.getByRole('link', { name: 'Add cards' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: /flashcards/i })).toBe(null)
  })

  it('offers flashcards to a deck that has some cards, just not enough', () => {
    seed({ decks: [deck({ count: 2 })] })
    open()
    expect(screen.getByRole('link', { name: /flashcards/i })).toBeTruthy()
  })
})

describe('answering', () => {
  beforeEach(() => seed({ decks: [deck({ count: 4 })] }))

  it('asks one question per card, counted', () => {
    open()
    expect(screen.getByText('Question 1 of 4')).toBeTruthy()
  })

  it('offers the right answer among the options', () => {
    open()
    const right = new RegExp(`Answer ${asking()}\\.`)
    expect(options().some((b) => right.test(b.textContent))).toBe(true)
  })

  it('will not let an answer be changed once given', async () => {
    open()
    await answer(true)
    const before = options().map((b) => b.className)

    await userEvent.click(options().find((b) => !b.disabled) ?? options()[0])
    expect(options().map((b) => b.className)).toEqual(before)
  })

  it('moves on when asked', async () => {
    open()
    await answer(true)
    await next()
    expect(await screen.findByText('Question 2 of 4')).toBeTruthy()
  })
})

describe('a card made of one long word', () => {
  it('lets the question and its options break rather than widening the page', () => {
    // Measured at 375px: an option holding a single 60-character term pushed
    // the page 47px sideways.
    seed({ decks: [deck({ count: 4 })] })
    open()
    expect(screen.getByRole('heading', { level: 1 }).className).toMatch(/overflow-wrap:anywhere/)
    for (const option of options()) {
      const text = [...option.querySelectorAll('span')].at(-2)
      expect(text.className).toMatch(/overflow-wrap:anywhere/)
      // A flex item will not shrink below its content without this.
      expect(text.className).toMatch(/min-w-0/)
    }
  })
})

describe('finishing', () => {
  beforeEach(() => seed({ decks: [deck({ count: 4 })] }))

  const play = async (correct) => {
    open()
    for (let i = 0; i < 4; i += 1) {
      await answer(correct)
      await next()
    }
  }

  it('scores every right answer', async () => {
    await play(true)
    await screen.findByText('Quiz complete')
    expect(screen.getByText('4')).toBeTruthy()
    expect(screen.getByText('/ 4')).toBeTruthy()
  })

  it('scores nothing for a clean sweep of wrong ones', async () => {
    await play(false)
    await screen.findByText('Quiz complete')
    expect(screen.getByText('0')).toBeTruthy()
  })

  it('grades the cards it asked about, so quiz and flashcards share a schedule', async () => {
    await play(true)
    await screen.findByText('Quiz complete')

    await waitFor(() => expect(Object.keys(stored().decks[0].schedule)).toHaveLength(4))
  })

  it('sends a wrong answer back to the start of the schedule', async () => {
    await play(false)
    await screen.findByText('Quiz complete')

    await waitFor(() => expect(stored().decks[0].schedule.c0.lapses).toBe(1))
  })

  it('logs the session', async () => {
    await play(true)
    await screen.findByText('Quiz complete')

    await waitFor(() => expect(stored().sessions).toHaveLength(1))
    expect(stored().sessions[0].reviewed).toBe(4)
  })

  it('starts over on a retake', async () => {
    await play(true)
    await userEvent.click(await screen.findByRole('button', { name: 'Retake quiz' }))

    expect(await screen.findByText('Question 1 of 4')).toBeTruthy()
    expect(screen.queryByText('Quiz complete')).toBe(null)
  })
})

describe('when the deck is gone', () => {
  it('says so instead of quizzing on nothing', () => {
    seed({ decks: [deck()] })
    open('/decks/deleted/quiz')
    expect(screen.getByText('That deck no longer exists.')).toBeTruthy()
  })
})
