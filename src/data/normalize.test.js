import { describe, expect, it } from 'vitest'
import {
  DEFAULT_STATE,
  normalizeDeck,
  normalizeState,
  parseStoredState,
  progressOf,
  reviveDeck,
} from './normalize.js'

const NOW = new Date(2026, 8, 5, 12, 0, 0).getTime()

const deck = (over = {}) => ({
  id: 'd1',
  title: 'A deck',
  subject: 'Subject',
  desc: '',
  cards: [{ front: 'Q', back: 'A' }],
  ...over,
})

describe('normalizeDeck migrations', () => {
  it('gives every card an id', () => {
    const out = normalizeDeck(deck(), NOW)
    expect(out.cards.every((c) => typeof c.id === 'string' && c.id)).toBe(true)
  })

  it('keeps ids that already exist', () => {
    const out = normalizeDeck(deck({ cards: [{ id: 'keep', front: 'Q', back: 'A' }] }), NOW)
    expect(out.cards[0].id).toBe('keep')
  })

  it('turns a bare progress number into real grades', () => {
    const cards = Array.from({ length: 4 }, (_, i) => ({ front: `Q${i}`, back: `A${i}` }))
    const out = normalizeDeck(deck({ cards, progress: 0.5 }), NOW)
    expect(Object.keys(out.schedule)).toHaveLength(2)
    expect(out.progress).toBe(0.5)
  })

  it('turns a legacy outcomes map into schedule entries with due dates', () => {
    const out = normalizeDeck(
      deck({ cards: [{ id: 'c1', front: 'Q', back: 'A' }], outcomes: { c1: 'good' } }),
      NOW,
    )
    expect(out.schedule.c1.due).toBeGreaterThan(NOW)
    expect(out.outcomes).toBeUndefined()
  })

  it('turns a studied phrase into a timestamp and drops the phrase', () => {
    const out = normalizeDeck(deck({ studied: 'Yesterday' }), NOW)
    expect(out.studiedAt).toBe(NOW - 86_400_000)
    expect(out.studied).toBeUndefined()
  })

  it('always derives progress rather than trusting a stored value', () => {
    const out = normalizeDeck(deck({ progress: 0.99, cards: [{ front: 'Q', back: 'A' }] }), NOW)
    expect(out.progress).toBe(progressOf(out))
  })
})

describe('reviveDeck', () => {
  it('repairs a deck with no cards array instead of discarding it', () => {
    const out = reviveDeck({ id: 'x', title: 'Kept', subject: 'S', desc: '' }, NOW)
    expect(out).not.toBeNull()
    expect(out.title).toBe('Kept')
    expect(out.cards).toEqual([])
  })

  it('drops only the unusable cards inside a deck', () => {
    const out = reviveDeck(
      deck({ cards: [{ front: 'good', back: 'A' }, null, 42, { back: 'no front' }] }),
      NOW,
    )
    expect(out.cards).toHaveLength(1)
    expect(out.cards[0].front).toBe('good')
  })

  it('fills in missing text fields rather than rendering undefined', () => {
    const out = reviveDeck({ id: 'x' }, NOW)
    expect(out.title).toBe('Untitled deck')
    expect(out.subject).toBe('General')
    expect(out.desc).toBe('')
  })

  it('rejects anything with no usable identity', () => {
    expect(reviveDeck(null, NOW)).toBeNull()
    expect(reviveDeck('a deck', NOW)).toBeNull()
    expect(reviveDeck([], NOW)).toBeNull()
    expect(reviveDeck({ title: 'no id' }, NOW)).toBeNull()
  })
})

describe('normalizeState resilience', () => {
  it('keeps every good deck when one is unusable', () => {
    // The regression this exists for: one bad deck used to wipe the library.
    const state = {
      decks: [deck({ id: 'a', title: 'Alpha' }), null, deck({ id: 'b', title: 'Beta' })],
    }
    const out = normalizeState(state, NOW)
    expect(out.decks.map((d) => d.title)).toEqual(['Alpha', 'Beta'])
  })

  it('does not fall back to the seed decks when one entry is bad', () => {
    const out = normalizeState({ decks: [deck({ id: 'a', title: 'Mine' }), 'junk'] }, NOW)
    expect(out.decks).toHaveLength(1)
    expect(out.decks[0].title).toBe('Mine')
  })

  it('falls back to the seed decks only when there is no deck list at all', () => {
    expect(normalizeState({}, NOW).decks).toHaveLength(DEFAULT_STATE.decks.length)
    expect(normalizeState({ decks: 'nope' }, NOW).decks).toHaveLength(DEFAULT_STATE.decks.length)
  })

  it('accepts an empty library as a real choice, not corruption', () => {
    expect(normalizeState({ decks: [] }, NOW).decks).toEqual([])
  })

  it('fills in missing settings without discarding the ones present', () => {
    const out = normalizeState({ decks: [], settings: { cardsPer: 5 } }, NOW)
    expect(out.settings.cardsPer).toBe(5)
    expect(out.settings.goalMinutes).toBe(20)
  })

  it('drops malformed sessions but keeps the sound ones', () => {
    const out = normalizeState(
      { decks: [], sessions: [{ at: NOW, seconds: 60 }, null, { noTimestamp: true }] },
      NOW,
    )
    expect(out.sessions).toHaveLength(1)
  })

  it('only accepts a theme it can actually render', () => {
    expect(normalizeState({ decks: [], theme: 'dark' }, NOW).theme).toBe('dark')
    expect(normalizeState({ decks: [], theme: 'neon' }, NOW).theme).toBe('light')
  })

  it('survives being handed nothing at all', () => {
    expect(() => normalizeState(undefined, NOW)).not.toThrow()
    expect(() => normalizeState(null, NOW)).not.toThrow()
  })
})

describe('parseStoredState', () => {
  it('reads a sound payload', () => {
    const raw = JSON.stringify({ decks: [deck({ id: 'a', title: 'Kept' })] })
    const { state, ok } = parseStoredState(raw, NOW)
    expect(ok).toBe(true)
    expect(state.decks[0].title).toBe('Kept')
  })

  it('reports unreadable JSON so the caller can keep the original bytes', () => {
    const { ok, state } = parseStoredState('{not json', NOW)
    expect(ok).toBe(false)
    expect(state.decks).toHaveLength(DEFAULT_STATE.decks.length)
  })

  it('treats an absent payload as a first run, not as damage', () => {
    expect(parseStoredState(null, NOW).ok).toBe(true)
  })

  it('recovers a readable payload that merely contains bad decks', () => {
    const raw = JSON.stringify({ decks: [deck({ id: 'a', title: 'Kept' }), null] })
    const { state, ok } = parseStoredState(raw, NOW)
    expect(ok).toBe(true)
    expect(state.decks.map((d) => d.title)).toEqual(['Kept'])
  })
})
