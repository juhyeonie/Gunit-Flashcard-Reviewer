import { describe, expect, it } from 'vitest'
import { MIN_QUIZ_CARDS, buildQuestions, canQuiz, shuffled, verdictFor } from './quiz.js'

const cards = (n) =>
  Array.from({ length: n }, (_, i) => ({ id: `c${i}`, front: `Q${i}`, back: `A${i}` }))

describe('canQuiz', () => {
  it('needs enough cards to fill the options', () => {
    expect(canQuiz({ cards: cards(MIN_QUIZ_CARDS) })).toBe(true)
    expect(canQuiz({ cards: cards(MIN_QUIZ_CARDS - 1) })).toBe(false)
  })

  it('rejects the degenerate decks that used to be quizzable', () => {
    // A one-card deck rendered a single option — the answer — and picking it
    // still graded the card and pushed its interval out.
    expect(canQuiz({ cards: cards(1) })).toBe(false)
    expect(canQuiz({ cards: [] })).toBe(false)
  })

  it('copes with a missing deck or card list', () => {
    expect(canQuiz(undefined)).toBe(false)
    expect(canQuiz({})).toBe(false)
  })
})

describe('buildQuestions', () => {
  const deck = cards(6)

  it('asks about every card exactly once', () => {
    const qs = buildQuestions(deck)
    expect(qs).toHaveLength(deck.length)
    expect(new Set(qs.map((q) => q.card.id)).size).toBe(deck.length)
  })

  it('always includes the right answer among the options', () => {
    for (const q of buildQuestions(deck)) {
      expect(q.options).toContain(q.card)
    }
  })

  it('points the answer index at the right option', () => {
    for (const q of buildQuestions(deck)) {
      expect(q.options[q.answer]).toBe(q.card)
    }
  })

  it('offers four options when the deck can supply them', () => {
    for (const q of buildQuestions(deck)) {
      expect(q.options).toHaveLength(4)
    }
  })

  it('never repeats an option within a question', () => {
    for (const q of buildQuestions(deck)) {
      expect(new Set(q.options.map((o) => o.id)).size).toBe(q.options.length)
    }
  })

  it('never uses the answer card as its own distractor', () => {
    for (const q of buildQuestions(deck)) {
      const others = q.options.filter((o) => o !== q.card)
      expect(others.every((o) => o.id !== q.card.id)).toBe(true)
    }
  })

  it('degrades to fewer options on a small deck, which is why the minimum exists', () => {
    expect(buildQuestions(cards(1))[0].options).toHaveLength(1)
    expect(buildQuestions(cards(2))[0].options).toHaveLength(2)
  })
})

describe('shuffled', () => {
  it('keeps every element', () => {
    const input = cards(8)
    const out = shuffled(input)
    expect(out).toHaveLength(input.length)
    expect(new Set(out)).toEqual(new Set(input))
  })

  it('does not mutate its input', () => {
    const input = cards(5)
    const copy = [...input]
    shuffled(input)
    expect(input).toEqual(copy)
  })
})

describe('verdictFor', () => {
  it('scales with the proportion right, not the raw score', () => {
    expect(verdictFor(9, 10)).toMatch(/Strong recall/)
    expect(verdictFor(6, 10)).toMatch(/solid pass/)
    expect(verdictFor(2, 10)).toMatch(/another pass/)
  })

  it('does not divide by zero', () => {
    expect(() => verdictFor(0, 0)).not.toThrow()
  })
})
