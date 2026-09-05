/**
 * Study activity — the record of when work actually happened, and the figures
 * the dashboard draws from it.
 *
 * A session is logged whenever a review or quiz run ends:
 *   { at: <epoch ms>, deckId, reviewed: <cards>, seconds: <elapsed> }
 *
 * Everything here is pure. Days are bucketed in the viewer's local timezone,
 * because "did I study today" is a local-calendar question, not a UTC one.
 */

export const DAY_MS = 86_400_000

/** Local calendar day as YYYY-MM-DD, so buckets survive timezone offsets. */
export const dayKey = (ts) => {
  const d = new Date(ts)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

/** Midnight at the start of the day containing `ts`. */
export const startOfDay = (ts) => {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

const addDays = (ts, n) => {
  const d = new Date(ts)
  d.setDate(d.getDate() + n)
  return d.getTime()
}

/** Minutes studied per local day, keyed by dayKey. */
export function minutesByDay(sessions = []) {
  const totals = new Map()
  for (const s of sessions) {
    const key = dayKey(s.at)
    totals.set(key, (totals.get(key) ?? 0) + (s.seconds ?? 0) / 60)
  }
  return totals
}

export const minutesOn = (sessions, ts) => minutesByDay(sessions).get(dayKey(ts)) ?? 0

/** Whole minutes studied today — what the daily goal is measured against. */
export const minutesToday = (sessions, now = Date.now()) =>
  Math.round(minutesOn(sessions, now))

/**
 * Consecutive days of study, counting back from today.
 *
 * A day with no study yet does not break the streak until it is over, so the
 * count starts at yesterday when nothing has been done today. That matches how
 * every study app treats a streak — you have until midnight, not until you
 * happen to open the dashboard.
 */
export function streak(sessions = [], now = Date.now()) {
  if (!sessions.length) return 0
  const totals = minutesByDay(sessions)
  const today = startOfDay(now)
  let cursor = totals.has(dayKey(today)) ? today : addDays(today, -1)
  let count = 0
  while (totals.has(dayKey(cursor))) {
    count += 1
    cursor = addDays(cursor, -1)
  }
  return count
}

const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

/**
 * The trailing seven local days, oldest first, for the streak strip and the
 * minutes chart. `minutes` is rounded for display; `active` drives the strip.
 */
export function lastSevenDays(sessions = [], now = Date.now()) {
  const totals = minutesByDay(sessions)
  const today = startOfDay(now)
  const days = []
  for (let i = 6; i >= 0; i -= 1) {
    const ts = addDays(today, -i)
    const raw = totals.get(dayKey(ts))
    days.push({
      key: dayKey(ts),
      day: WEEKDAY_INITIALS[new Date(ts).getDay()],
      minutes: Math.round(raw ?? 0),
      // Any studied day counts, even one too short to round up to a minute —
      // otherwise the strip would contradict the streak, which counts days.
      active: raw !== undefined,
      isToday: i === 0,
    })
  }
  return days
}

/** Total whole minutes across the trailing seven days. */
export const minutesThisWeek = (sessions = [], now = Date.now()) =>
  lastSevenDays(sessions, now).reduce((n, d) => n + d.minutes, 0)

/** Caps the log so localStorage cannot grow without bound. */
export const MAX_SESSIONS = 500

export const appendSession = (sessions = [], session) =>
  [...sessions, session].slice(-MAX_SESSIONS)

const MINUTE_MS = 60_000
const HOUR_MS = 3_600_000

/**
 * "Never", "Just now", "2 hours ago", "Yesterday", "3 days ago".
 *
 * Deck recency used to be a stored string, which meant it never aged: a deck
 * saved as "Just now" still said so weeks later. It is derived from a timestamp
 * instead, so it is right whenever it is read.
 */
export function formatRelative(ts, now = Date.now()) {
  if (!ts) return 'Never'

  const diff = now - ts
  if (diff < 0) return 'Just now'
  if (diff < 2 * MINUTE_MS) return 'Just now'
  if (diff < HOUR_MS) {
    const mins = Math.round(diff / MINUTE_MS)
    return `${mins} ${mins === 1 ? 'minute' : 'minutes'} ago`
  }

  // Calendar-aware from here: "yesterday" means the previous calendar day, not
  // a rolling 24 hours, which is how people actually read it.
  const days = Math.round((startOfDay(now) - startOfDay(ts)) / DAY_MS)
  if (days === 0) {
    const hours = Math.round(diff / HOUR_MS)
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
  }
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 14) return 'A week ago'
  if (days < 31) return `${Math.floor(days / 7)} weeks ago`
  const months = Math.floor(days / 30)
  return `${months} ${months === 1 ? 'month' : 'months'} ago`
}

/**
 * Converts the old stored strings into approximate timestamps so decks saved
 * before recency was a timestamp — and the seed decks, which still ship these
 * phrases — keep a sensible position in the sort.
 */
export function parseLegacyStudied(value, now = Date.now()) {
  if (typeof value !== 'string') return null
  const text = value.trim().toLowerCase()
  if (!text || text === 'never') return null
  if (text === 'just now') return now
  if (text === 'yesterday') return now - DAY_MS

  const match = text.match(/^(a|an|\d+)\s+(minute|hour|day|week|month)s?\s+ago$/)
  if (!match) return null
  const count = match[1] === 'a' || match[1] === 'an' ? 1 : Number(match[1])
  const unit = { minute: MINUTE_MS, hour: HOUR_MS, day: DAY_MS, week: 7 * DAY_MS, month: 30 * DAY_MS }[
    match[2]
  ]
  return now - count * unit
}
