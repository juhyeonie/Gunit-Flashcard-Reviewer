import { describe, expect, it } from 'vitest'
import { DAY, MINUTE } from './scheduler.js'
import { nextDueLabel, openingQueue, shuffle, summarise } from './session.js'

const NOW = 1_700_000_000_000

/** A deck whose cards can be scheduled independently. */
const deck = (schedule = {}, count = 4) => ({
  id: 'republic',
  title: 'Roman Republic',
  cards: Array.from({ length: count }, (_, i) => ({ id: `c${i}`, front: `Q${i}`, back: `A${i}` })),
  schedule,
})

/** A reviewed card, due at `dueIn` minutes from NOW. */
const seen = (dueIn) => ({ last: NOW - DAY * 60_000, due: NOW + dueIn * 60_000, interval: DAY, ease: 2.5 })

describe('shuffle', () => {
  it('keeps every card, and only those cards', () => {
    const out = shuffle([0, 1, 2, 3, 4], () => 0.5)
    expect([...out].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4])
  })

  it('leaves the array it was given alone', () => {
    const order = [0, 1, 2, 3]
    shuffle(order, () => 0.5)
    expect(order).toEqual([0, 1, 2, 3])
  })

  it('rotates the order when the source always picks the first slot', () => {
    // random() === 0 makes j === 0 on every pass, so each element in turn is
    // swapped through slot 0. A fixed source pins the whole algorithm.
    expect(shuffle([0, 1, 2, 3], () => 0)).toEqual([1, 2, 3, 0])
  })

  it('leaves the order alone when the source always picks the last slot', () => {
    // Just short of 1 makes j === i, so every element swaps with itself.
    expect(shuffle([0, 1, 2, 3], () => 0.999999)).toEqual([0, 1, 2, 3])
  })

  it('actually moves things, given real randomness', () => {
    // Not a distribution test — just that a hundred shuffles of ten cards are
    // not all the identity, which a broken swap would be.
    const start = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    const moved = Array.from({ length: 100 }, () => shuffle(start)).some(
      (out) => out.join() !== start.join(),
    )
    expect(moved).toBe(true)
  })

  it('copes with nothing, or with one card', () => {
    expect(shuffle()).toEqual([])
    expect(shuffle([7])).toEqual([7])
  })
})

describe('openingQueue', () => {
  it('takes only the cards that are due', () => {
    const d = deck({ c0: seen(-10), c1: seen(60), c2: seen(-5) })
    // Most overdue first, then the less overdue, then c3 — which has no entry
    // at all, so it is new and comes after every card that has been seen.
    expect(openingQueue(d, { now: NOW })).toEqual([0, 2, 3])
  })

  it('takes the whole deck when reviewing ahead', () => {
    const d = deck({ c0: seen(-10), c1: seen(60), c2: seen(-5) })
    expect(openingQueue(d, { ahead: true, now: NOW })).toHaveLength(4)
  })

  it('caps the session at the cards-per preference', () => {
    expect(openingQueue(deck({}, 10), { limit: 3, now: NOW })).toHaveLength(3)
  })

  it('shuffles only when asked, and keeps the same cards', () => {
    const d = deck({}, 5)
    const ordered = openingQueue(d, { now: NOW })
    const shuffled = openingQueue(d, { now: NOW, shuffleFirst: true, random: () => 0 })

    expect(shuffled).not.toEqual(ordered)
    expect([...shuffled].sort((a, b) => a - b)).toEqual([...ordered].sort((a, b) => a - b))
  })

  it('caps before it shuffles, so the cap is not a slice of a random order', () => {
    const out = openingQueue(deck({}, 10), {
      limit: 3,
      now: NOW,
      shuffleFirst: true,
      random: () => 0,
    })
    expect(out).toHaveLength(3)
    // The first three cards of the deck, reordered — not three of the ten.
    expect([...out].sort((a, b) => a - b)).toEqual([0, 1, 2])
  })

  it('has nothing to offer for a deck that is not there', () => {
    expect(openingQueue(null, { now: NOW })).toEqual([])
  })

  it('has nothing to offer for an empty deck', () => {
    expect(openingQueue(deck({}, 0), { now: NOW })).toEqual([])
  })
})

describe('nextDueLabel', () => {
  it('reports the soonest card still ahead', () => {
    const d = deck({ c0: seen(3 * 60), c1: seen(30), c2: seen(24 * 60) })
    expect(nextDueLabel(d, NOW)).toBe('30 minutes')
  })

  it('ignores cards that are already due', () => {
    // This answers "come back when?", and "now" is not a length of time.
    const d = deck({ c0: seen(-60), c1: seen(45) })
    expect(nextDueLabel(d, NOW)).toBe('45 minutes')
  })

  it('says nothing when every card is due or unscheduled', () => {
    expect(nextDueLabel(deck({ c0: seen(-60) }), NOW)).toBe(null)
    expect(nextDueLabel(deck({}), NOW)).toBe(null)
  })

  it('says nothing about a deck that is not there', () => {
    expect(nextDueLabel(null, NOW)).toBe(null)
  })

  it('words a long wait in the units the scheduler uses', () => {
    expect(nextDueLabel(deck({ c0: seen(2 * DAY) }), NOW)).toBe('2 days')
    expect(nextDueLabel(deck({ c0: seen(90 * MINUTE) }), NOW)).toBe('2 hours')
  })
})

describe('summarise', () => {
  it('counts what was reviewed, and what stuck', () => {
    const out = summarise({ c0: 'good', c1: 'again', c2: 'easy' }, { startedAt: NOW, now: NOW })
    expect(out).toMatchObject({ reviewed: 3, known: 2, again: 1 })
  })

  it('counts good and easy alike', () => {
    // They differ in how long the card goes away for, not in whether it was
    // recalled.
    expect(summarise({ a: 'good', b: 'easy' }).known).toBe(2)
  })

  it('counts a card graded twice only once', () => {
    // Rated, gone back to, rated again — one card, at whatever it was left on.
    const out = summarise({ c0: 'good' })
    expect(out.reviewed).toBe(1)
    expect(out.again).toBe(0)
  })

  it('measures the session in seconds', () => {
    const out = summarise({ c0: 'good' }, { startedAt: NOW, now: NOW + 91_400 })
    expect(out.seconds).toBeCloseTo(91.4)
  })

  it('never reports a negative length', () => {
    // A clock that steps backwards mid-session must not produce -4 seconds
    // studied on the summary screen.
    expect(summarise({ c0: 'good' }, { startedAt: NOW, now: NOW - 4000 }).seconds).toBe(0)
  })

  it('summarises an untouched session as nothing at all', () => {
    expect(summarise()).toEqual({ reviewed: 0, known: 0, again: 0, seconds: 0 })
  })
})
