import { describe, expect, it } from 'vitest'
import {
  DAY,
  MAX_INTERVAL,
  buildQueue,
  dueCount,
  formatDue,
  formatInterval,
  grade,
  isDue,
  isNew,
  newEntry,
  preview,
} from './scheduler.js'

// Fixed clock so nothing here depends on when the suite runs.
const NOW = Date.UTC(2026, 0, 1)

/** Applies `g` `times` over, threading the entry through. */
const repeat = (g, times, entry = undefined) => {
  let current = entry
  for (let i = 0; i < times; i += 1) current = grade(current, g, NOW)
  return current
}

describe('first intervals', () => {
  it('matches the intervals the prototype advertised', () => {
    expect(preview(undefined, 'again', NOW)).toBe(10)
    expect(preview(undefined, 'good', NOW)).toBe(3 * DAY)
    expect(preview(undefined, 'easy', NOW)).toBe(10 * DAY)
  })

  it('starts a new card at the default ease with no history', () => {
    const fresh = newEntry()
    expect(fresh.reps).toBe(0)
    expect(fresh.lapses).toBe(0)
    expect(fresh.last).toBeNull()
    expect(fresh.due).toBeNull()
  })

  it('rejects an unknown grade', () => {
    expect(() => grade(undefined, 'brilliant', NOW)).toThrow(/unknown grade/)
  })
})

describe('interval growth', () => {
  it('lengthens the interval on each successive Good', () => {
    const ladder = []
    let entry
    for (let i = 0; i < 5; i += 1) {
      entry = grade(entry, 'good', NOW)
      ladder.push(entry.interval)
    }
    expect(ladder).toEqual([...ladder].sort((a, b) => a - b))
    expect(new Set(ladder).size).toBe(ladder.length)
    // 3 days, then compounding by the 2.5 ease.
    expect(ladder[0]).toBe(3 * DAY)
    expect(ladder[1]).toBe(Math.round(3 * DAY * 2.5))
  })

  it('rewards Easy with a longer interval than Good', () => {
    const once = grade(undefined, 'good', NOW)
    expect(grade(once, 'easy', NOW).interval).toBeGreaterThan(
      grade(once, 'good', NOW).interval,
    )
  })

  it('applies the 1.3x easy bonus on top of the raised ease', () => {
    // A card sitting at the 3-day step: ease rises 2.5 -> 2.65, then the bonus.
    const once = grade(undefined, 'good', NOW)
    expect(once.interval).toBe(3 * DAY)
    expect(grade(once, 'easy', NOW).interval).toBe(Math.round(3 * DAY * 2.65 * 1.3))
  })

  it('never schedules further out than a year', () => {
    expect(repeat('easy', 30).interval).toBeLessThanOrEqual(MAX_INTERVAL)
  })

  it('counts a repetition for every non-lapse grade', () => {
    expect(repeat('good', 3).reps).toBe(3)
    expect(repeat('easy', 3).reps).toBe(3)
  })
})

describe('lapses', () => {
  const mature = repeat('good', 5)
  const lapsed = grade(mature, 'again', NOW)

  it('drops the card back to the ten-minute relearning step', () => {
    expect(mature.interval).toBeGreaterThan(DAY)
    expect(lapsed.interval).toBe(10)
  })

  it('clears the repetition count and records the lapse', () => {
    expect(lapsed.reps).toBe(0)
    expect(lapsed.lapses).toBe(1)
  })

  it('lowers the ease', () => {
    expect(lapsed.ease).toBeLessThan(mature.ease)
    expect(lapsed.ease).toBeCloseTo(mature.ease - 0.2, 10)
  })

  it('restarts the ladder rather than resuming the long interval', () => {
    expect(grade(lapsed, 'good', NOW).interval).toBe(3 * DAY)
  })
})

describe('ease bounds', () => {
  it('floors ease at 1.3 however many times a card lapses', () => {
    expect(repeat('again', 20).ease).toBeCloseTo(1.3, 10)
  })

  it('caps ease at 3.0 however many times a card is easy', () => {
    expect(repeat('easy', 20).ease).toBeLessThanOrEqual(3)
  })
})

describe('due state', () => {
  it('treats a card with no entry as new and due', () => {
    expect(isNew(undefined)).toBe(true)
    expect(isDue(undefined, NOW)).toBe(true)
  })

  it('is not due immediately after grading', () => {
    expect(isDue(grade(undefined, 'good', NOW), NOW)).toBe(false)
  })

  it('comes due once the interval has elapsed', () => {
    const entry = grade(undefined, 'good', NOW)
    expect(isDue(entry, NOW + 3 * DAY * 60_000 - 1)).toBe(false)
    expect(isDue(entry, NOW + 3 * DAY * 60_000)).toBe(true)
  })
})

describe('formatting', () => {
  it.each([
    [1, '1 minute'],
    [10, '10 minutes'],
    [120, '2 hours'],
    [3 * DAY, '3 days'],
    [90 * DAY, '3 months'],
    [400 * DAY, '1 year'],
  ])('formats %i minutes as "%s"', (minutes, expected) => {
    expect(formatInterval(minutes)).toBe(expected)
  })

  it('describes when a card is next due', () => {
    expect(formatDue(undefined, NOW)).toBe('New')
    const entry = grade(undefined, 'good', NOW)
    expect(formatDue(entry, NOW)).toBe('Due in 3 days')
    expect(formatDue(entry, NOW + 5 * DAY * 60_000)).toBe('Due now')
  })
})

describe('buildQueue', () => {
  // a: overdue review, b: new, c: scheduled ahead, d: new
  const deck = {
    cards: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
    schedule: {
      a: grade(undefined, 'good', NOW - 10 * DAY * 60_000),
      c: grade(undefined, 'good', NOW),
    },
  }

  it('leaves out cards that are not due yet', () => {
    expect(buildQueue(deck, { now: NOW })).not.toContain(2)
  })

  it('puts due reviews ahead of new cards', () => {
    expect(buildQueue(deck, { now: NOW })[0]).toBe(0)
  })

  it('includes cards that have never been seen', () => {
    const queue = buildQueue(deck, { now: NOW })
    expect(queue).toContain(1)
    expect(queue).toContain(3)
  })

  it('caps the queue at the session limit', () => {
    expect(buildQueue(deck, { now: NOW, limit: 2 })).toHaveLength(2)
  })

  it('ignores due dates when reviewing ahead', () => {
    expect(buildQueue(deck, { now: NOW, all: true })).toHaveLength(4)
  })

  it('returns nothing when every card is scheduled ahead', () => {
    const settled = {
      cards: [{ id: 'a' }],
      schedule: { a: grade(undefined, 'good', NOW) },
    }
    expect(buildQueue(settled, { now: NOW })).toEqual([])
  })

  it('copes with a deck that has no cards', () => {
    expect(buildQueue({ cards: [], schedule: {} }, { now: NOW })).toEqual([])
    expect(dueCount({ cards: [], schedule: {} }, NOW)).toBe(0)
  })

  it('counts every card that is ready to study', () => {
    expect(dueCount(deck, NOW)).toBe(3)
  })

  it('treats a deck with no schedule at all as entirely new', () => {
    const untouched = { cards: [{ id: 'a' }, { id: 'b' }] }
    expect(dueCount(untouched, NOW)).toBe(2)
    expect(buildQueue(untouched, { now: NOW })).toEqual([0, 1])
  })
})
