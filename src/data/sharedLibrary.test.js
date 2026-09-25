// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  EMPTY_SHARED,
  applyGrades,
  clearPending,
  mergeProgress,
  readShared,
  setSuspended,
  studyDecks,
} from './sharedLibrary.js'

const NOW = 1_760_000_000_000
const answer = {
  status: 'ok',
  decks: [
    {
      id: 'd1',
      title: 'Module 6',
      subject: 'CC 116',
      description: 'Paging',
      updated_at: '2026-09-20T00:00:00Z',
      cards: [
        { id: 'c2', front: 'Second', back: 'b', position: 1 },
        { id: 'c1', front: 'First', back: 'a', position: 0 },
      ],
    },
  ],
}
const fresh = () => ({ ...EMPTY_SHARED, progress: {}, studied: {}, pending: [], cache: {}, copies: {} })

describe('a shared deck, as this reader studies it', () => {
  it('is the owner’s content in the owner’s order, with nobody’s schedule until the reader has one', () => {
    const [deck] = studyDecks(answer, fresh())
    expect(deck.cards.map((c) => c.front)).toEqual(['First', 'Second'])
    expect(deck.schedule).toEqual({})
    expect(deck.progress).toBe(0)
    expect(deck).toMatchObject({ title: 'Module 6', desc: 'Paging', studiedAt: null })
  })

  it('carries the reader’s own grades, and marks them to go up', () => {
    const graded = applyGrades(fresh(), 'd1', { c1: 'good' }, NOW)
    const [deck] = studyDecks(answer, graded)
    expect(Object.keys(deck.schedule)).toEqual(['c1'])
    expect(deck.studiedAt).toBe(NOW)
    expect(graded.pending).toEqual(['c1'])
  })

  it('keeps two readers apart: one reader’s grades are not in another’s store', () => {
    const amy = applyGrades(fresh(), 'd1', { c1: 'easy' }, NOW)
    const ben = fresh()
    expect(studyDecks(answer, ben)[0].schedule).toEqual({})
    expect(studyDecks(answer, amy)[0].schedule.c1.last).toBe('easy')
  })

  it('suspends a card for this reader only, and unsuspending a never-graded card leaves no entry', () => {
    const off = setSuspended(fresh(), 'c1', true)
    expect(off.progress.c1).toMatchObject({ suspended: true })
    expect(setSuspended(off, 'c1', false).progress).toEqual({})
  })
})

describe('the account’s copy of the reader’s progress', () => {
  it('fills in what is not here, and never overwrites a grade still waiting to go up', () => {
    const local = applyGrades(fresh(), 'd1', { c1: 'again' }, NOW)
    const merged = mergeProgress(local, [
      { card_id: 'c1', last_grade: 'easy', due: '2026-10-01T00:00:00Z', interval: 10, ease: 2.6, reps: 4, lapses: 0 },
      { card_id: 'c2', last_grade: 'good', due: '2026-10-02T00:00:00Z', interval: 20, ease: 2.5, reps: 2, lapses: 0 },
    ])
    expect(merged.progress.c1.last).toBe('again')
    expect(merged.progress.c2).toMatchObject({ last: 'good', reps: 2, due: Date.parse('2026-10-02T00:00:00Z') })
    // Once sent, the account's answer is taken.
    const sent = mergeProgress(clearPending(merged, ['c1']), [{ card_id: 'c1', last_grade: 'easy', reps: 4 }])
    expect(sent.progress.c1.last).toBe('easy')
  })
})

describe('what is in storage', () => {
  it('reads anything unreadable as empty rather than failing', () => {
    for (const raw of [null, 'not json', '[]', '"x"', JSON.stringify({ progress: [], pending: 'x' })]) {
      if (raw === null) localStorage.removeItem('k')
      else localStorage.setItem('k', raw)
      expect(readShared('k')).toEqual({ progress: {}, studied: {}, pending: [], cache: {}, copies: {} })
    }
  })
})
