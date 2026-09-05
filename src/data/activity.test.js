import { describe, expect, it } from 'vitest'
import {
  DAY_MS,
  MAX_SESSIONS,
  appendSession,
  dayKey,
  lastSevenDays,
  minutesThisWeek,
  minutesToday,
  parseLegacyStudied,
  startOfDay,
  streak,
  formatRelative,
} from './activity.js'

// Local noon on a fixed date, so day bucketing can't be pushed across a
// boundary by the machine's timezone offset.
const NOW = new Date(2026, 8, 5, 12, 0, 0).getTime()

const daysAgo = (n, hour = 12) => {
  const d = new Date(NOW)
  d.setDate(d.getDate() - n)
  d.setHours(hour, 0, 0, 0)
  return d.getTime()
}

const session = (at, minutes = 10) => ({ at, deckId: 'd', reviewed: 5, seconds: minutes * 60 })

describe('day bucketing', () => {
  it('keys by local calendar day', () => {
    expect(dayKey(new Date(2026, 8, 5, 23, 59).getTime())).toBe('2026-09-05')
    expect(dayKey(new Date(2026, 8, 6, 0, 1).getTime())).toBe('2026-09-06')
  })

  it('pads single-digit months and days', () => {
    expect(dayKey(new Date(2026, 0, 2, 12).getTime())).toBe('2026-01-02')
  })

  it('startOfDay lands on local midnight', () => {
    const d = new Date(startOfDay(NOW))
    expect([d.getHours(), d.getMinutes(), d.getSeconds()]).toEqual([0, 0, 0])
    expect(dayKey(startOfDay(NOW))).toBe(dayKey(NOW))
  })
})

describe('minutesToday', () => {
  it('is zero with no sessions', () => {
    expect(minutesToday([], NOW)).toBe(0)
  })

  it('sums every session from today and ignores other days', () => {
    const sessions = [session(daysAgo(0), 12), session(daysAgo(0), 8), session(daysAgo(1), 30)]
    expect(minutesToday(sessions, NOW)).toBe(20)
  })

  it('rounds part-minutes', () => {
    expect(minutesToday([{ at: daysAgo(0), seconds: 100 }], NOW)).toBe(2)
  })

  it('copes with a session missing its duration', () => {
    expect(minutesToday([{ at: daysAgo(0) }], NOW)).toBe(0)
  })
})

describe('streak', () => {
  it('is zero with no sessions', () => {
    expect(streak([], NOW)).toBe(0)
  })

  it('counts consecutive days ending today', () => {
    const sessions = [0, 1, 2, 3].map((n) => session(daysAgo(n)))
    expect(streak(sessions, NOW)).toBe(4)
  })

  it('survives a day with nothing done yet', () => {
    // Studied yesterday and the day before, nothing today: still a live streak.
    const sessions = [1, 2, 3].map((n) => session(daysAgo(n)))
    expect(streak(sessions, NOW)).toBe(3)
  })

  it('breaks on a missed day', () => {
    const sessions = [1, 2, 4, 5].map((n) => session(daysAgo(n)))
    expect(streak(sessions, NOW)).toBe(2)
  })

  it('is zero once two whole days have been missed', () => {
    expect(streak([session(daysAgo(2))], NOW)).toBe(0)
  })

  it('counts a day once however many sessions it holds', () => {
    const sessions = [session(daysAgo(0), 5), session(daysAgo(0), 5), session(daysAgo(1), 5)]
    expect(streak(sessions, NOW)).toBe(2)
  })
})

describe('lastSevenDays', () => {
  it('returns seven days, oldest first, ending today', () => {
    const week = lastSevenDays([], NOW)
    expect(week).toHaveLength(7)
    expect(week[6].isToday).toBe(true)
    expect(week[6].key).toBe(dayKey(NOW))
    expect(week.filter((d) => d.isToday)).toHaveLength(1)
  })

  it('labels each day with its weekday initial', () => {
    const week = lastSevenDays([], NOW)
    expect(week[6].day).toBe('SMTWTFS'[new Date(NOW).getDay()])
  })

  it('marks only days with study as active', () => {
    const week = lastSevenDays([session(daysAgo(0)), session(daysAgo(3))], NOW)
    expect(week.filter((d) => d.active).map((d) => d.minutes)).toEqual([10, 10])
    expect(week.filter((d) => !d.active).every((d) => d.minutes === 0)).toBe(true)
  })

  it('marks a day studied even when it rounds to under a minute', () => {
    // Agrees with streak(), which counts days rather than minutes.
    const brief = [{ at: daysAgo(0), seconds: 20 }]
    const today = lastSevenDays(brief, NOW)[6]
    expect(today.active).toBe(true)
    expect(today.minutes).toBe(0)
    expect(streak(brief, NOW)).toBe(1)
  })

  it('ignores sessions older than the window', () => {
    expect(lastSevenDays([session(daysAgo(30))], NOW).every((d) => !d.active)).toBe(true)
  })

  it('totals the week', () => {
    const sessions = [session(daysAgo(0), 15), session(daysAgo(2), 25), session(daysAgo(30), 99)]
    expect(minutesThisWeek(sessions, NOW)).toBe(40)
  })
})

describe('appendSession', () => {
  it('adds to the end', () => {
    expect(appendSession([session(daysAgo(1))], session(daysAgo(0))).length).toBe(2)
  })

  it('caps the log so storage cannot grow without bound', () => {
    const many = Array.from({ length: MAX_SESSIONS + 50 }, (_, i) => session(NOW - i * DAY_MS))
    const capped = appendSession(many, session(NOW))
    expect(capped).toHaveLength(MAX_SESSIONS)
    // The newest entry survives; the oldest are dropped.
    expect(capped[capped.length - 1].at).toBe(NOW)
  })
})

describe('formatRelative', () => {
  const ago = (ms) => NOW - ms
  const MIN = 60_000
  const HOUR = 3_600_000

  it('reads Never with no timestamp', () => {
    expect(formatRelative(null, NOW)).toBe('Never')
    expect(formatRelative(undefined, NOW)).toBe('Never')
  })

  it('reads Just now for something that only just happened', () => {
    expect(formatRelative(NOW, NOW)).toBe('Just now')
    expect(formatRelative(ago(30_000), NOW)).toBe('Just now')
  })

  it('counts minutes, then hours', () => {
    expect(formatRelative(ago(5 * MIN), NOW)).toBe('5 minutes ago')
    expect(formatRelative(ago(1 * HOUR), NOW)).toBe('1 hour ago')
    expect(formatRelative(ago(3 * HOUR), NOW)).toBe('3 hours ago')
  })

  it('says Yesterday for the previous calendar day', () => {
    // NOW is local noon, so 18 hours back lands yesterday evening.
    expect(formatRelative(ago(18 * HOUR), NOW)).toBe('Yesterday')
  })

  it('uses calendar days, not rolling 24-hour windows', () => {
    // 23:00 last night is "Yesterday" even though it is only ~13 hours ago.
    const lateYesterday = new Date(NOW)
    lateYesterday.setDate(lateYesterday.getDate() - 1)
    lateYesterday.setHours(23, 0, 0, 0)
    expect(formatRelative(lateYesterday.getTime(), NOW)).toBe('Yesterday')
  })

  it('counts days, then weeks, then months', () => {
    expect(formatRelative(ago(3 * DAY_MS), NOW)).toBe('3 days ago')
    expect(formatRelative(ago(9 * DAY_MS), NOW)).toBe('A week ago')
    expect(formatRelative(ago(21 * DAY_MS), NOW)).toBe('3 weeks ago')
    expect(formatRelative(ago(60 * DAY_MS), NOW)).toBe('2 months ago')
  })

  it('does not read a clock skew into the future as a negative age', () => {
    expect(formatRelative(NOW + 5 * MIN, NOW)).toBe('Just now')
  })

  it('ages, unlike the stored string it replaced', () => {
    const studied = ago(2 * HOUR)
    expect(formatRelative(studied, NOW)).toBe('2 hours ago')
    expect(formatRelative(studied, NOW + 5 * DAY_MS)).toBe('5 days ago')
  })
})

describe('parseLegacyStudied', () => {
  it('maps the phrases the seed decks and old saves used', () => {
    expect(parseLegacyStudied('Never', NOW)).toBeNull()
    expect(parseLegacyStudied('Just now', NOW)).toBe(NOW)
    expect(parseLegacyStudied('Yesterday', NOW)).toBe(NOW - DAY_MS)
    expect(parseLegacyStudied('2 hours ago', NOW)).toBe(NOW - 2 * 3_600_000)
    expect(parseLegacyStudied('3 days ago', NOW)).toBe(NOW - 3 * DAY_MS)
    expect(parseLegacyStudied('A week ago', NOW)).toBe(NOW - 7 * DAY_MS)
  })

  it('round-trips back to the same phrase it came from', () => {
    for (const phrase of ['Yesterday', '2 hours ago', '3 days ago']) {
      expect(formatRelative(parseLegacyStudied(phrase, NOW), NOW)).toBe(phrase)
    }
  })

  it('orders the seed phrases correctly, which is what the sort needs', () => {
    const order = ['2 hours ago', 'Yesterday', '3 days ago', '5 days ago', 'A week ago']
      .map((p) => parseLegacyStudied(p, NOW))
    expect(order).toEqual([...order].sort((a, b) => b - a))
  })

  it('returns null for anything it does not recognise', () => {
    expect(parseLegacyStudied('sometime last term', NOW)).toBeNull()
    expect(parseLegacyStudied('', NOW)).toBeNull()
    expect(parseLegacyStudied(undefined, NOW)).toBeNull()
    expect(parseLegacyStudied(12345, NOW)).toBeNull()
  })
})
