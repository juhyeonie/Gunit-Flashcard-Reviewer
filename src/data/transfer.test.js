import { describe, expect, it } from 'vitest'
import { FORMAT, VERSION, fileNameFor, fromTransfer, toTransfer } from './transfer.js'

const NOW = 1_700_000_000_000

/** The shape `grade` produces: `last` holds the grade itself, not a time. */
const entry = () => ({
  due: NOW + 86_400_000,
  last: 'good',
  interval: 1440,
  ease: 2.5,
  reps: 3,
  lapses: 0,
})

const deck = (over = {}) => ({
  id: 'republic',
  title: 'Roman Republic',
  subject: 'Ancient Rome',
  desc: 'Magistracies and assemblies.',
  progress: 0.5,
  studiedAt: NOW,
  cards: [
    { id: 'c0', front: 'Consul?', back: 'Senior magistrate.' },
    { id: 'c1', front: 'Praetor?', back: 'Judicial magistrate.' },
  ],
  schedule: { c0: entry() },
  ...over,
})

describe('toTransfer', () => {
  it('stamps the file so a stray .json is not mistaken for one', () => {
    const out = toTransfer(deck(), { now: NOW })
    expect(out.format).toBe(FORMAT)
    expect(out.version).toBe(VERSION)
    expect(out.exportedAt).toBe(new Date(NOW).toISOString())
  })

  it('carries the deck and its cards', () => {
    const out = toTransfer(deck(), { now: NOW })
    expect(out).toMatchObject({ title: 'Roman Republic', subject: 'Ancient Rome' })
    expect(out.cards.map((c) => c.front)).toEqual(['Consul?', 'Praetor?'])
  })

  it('puts each card’s scheduling on the card itself', () => {
    // Ids only mean something inside the library that issued them, so a
    // schedule keyed by id would have to be re-keyed on the way back in.
    const out = toTransfer(deck(), { now: NOW })
    expect(out.cards[0].scheduling).toEqual({
      due: NOW + 86_400_000,
      last: 'good',
      interval: 1440,
      ease: 2.5,
      reps: 3,
      lapses: 0,
    })
    expect(out.cards[1].scheduling).toBe(null)
  })

  it('carries the repetition count, which the next grade depends on', () => {
    // Without `reps`, `grade` treats a long-established card as new and drops
    // it back to a one-day interval on the next review.
    expect(toTransfer(deck(), { now: NOW }).cards[0].scheduling.reps).toBe(3)
  })

  it('leaves out ids, which mean nothing anywhere else', () => {
    const out = toTransfer(deck(), { now: NOW })
    expect(out.cards[0].id).toBeUndefined()
    expect(out.id).toBeUndefined()
  })

  it('leaves out progress, which is derived rather than stored', () => {
    // Writing it down only gives it a chance to disagree with the schedule.
    expect(toTransfer(deck(), { now: NOW }).progress).toBeUndefined()
  })

  it('exports a deck with no cards at all', () => {
    expect(toTransfer(deck({ cards: [], schedule: {} }), { now: NOW }).cards).toEqual([])
  })
})

describe('fileNameFor', () => {
  it('makes a name that will save anywhere', () => {
    expect(fileNameFor({ title: 'Roman Republic: Institutions' })).toBe(
      'roman-republic-institutions.gunit.json',
    )
  })

  it('copes with a title that survives none of that', () => {
    expect(fileNameFor({ title: '???' })).toBe('deck.gunit.json')
  })

  it('keeps the name to a sensible length', () => {
    const long = fileNameFor({ title: 'a'.repeat(200) })
    expect(long.length).toBeLessThan(80)
  })
})

describe('fromTransfer', () => {
  const exported = (over = {}) => JSON.stringify({ ...toTransfer(deck(), { now: NOW }), ...over })

  it('reads back what it wrote', () => {
    const { deck: back, error, skipped } = fromTransfer(exported())
    expect(error).toBe(null)
    expect(skipped).toBe(0)
    expect(back).toMatchObject({ title: 'Roman Republic', subject: 'Ancient Rome' })
    expect(back.cards).toHaveLength(2)
  })

  it('brings the scheduling back with the card', () => {
    const { deck: back } = fromTransfer(exported())
    expect(back.cards[0].scheduling).toMatchObject({ interval: 1440, ease: 2.5, reps: 3 })
    expect(back.cards[1].scheduling).toBe(null)
  })

  it('takes an object as readily as a string', () => {
    expect(fromTransfer(toTransfer(deck(), { now: NOW })).error).toBe(null)
  })

  it('refuses something that is not JSON', () => {
    expect(fromTransfer('not json at all').error).toMatch(/not readable JSON/)
  })

  it('refuses JSON that is not a deck', () => {
    expect(fromTransfer('[1, 2, 3]').error).toMatch(/does not hold a deck/)
    expect(fromTransfer('null').error).toMatch(/does not hold a deck/)
  })

  it('refuses a file from somewhere else', () => {
    // Anki and Quizlet both export .json, and neither is this.
    expect(fromTransfer('{"notes": []}').error).toMatch(/not exported from Gunit/)
  })

  it('refuses a file from a newer version rather than guessing', () => {
    const out = fromTransfer(exported({ version: VERSION + 1 }))
    expect(out.error).toMatch(/newer version/)
    expect(out.deck).toBe(null)
  })

  it('accepts a file from an older version', () => {
    expect(fromTransfer(exported({ version: 0 })).error).toBe(null)
  })

  it('refuses ours-but-cardless', () => {
    expect(fromTransfer(exported({ cards: undefined })).error).toMatch(/no cards/)
  })

  it('drops the cards it cannot use, and counts them', () => {
    // Losing two of forty beats importing two blanks, or refusing the forty.
    const out = fromTransfer(
      exported({
        cards: [
          { front: 'Consul?', back: 'Senior magistrate.' },
          { front: 'Praetor?', back: '   ' },
          { front: '', back: 'Orphaned.' },
          null,
        ],
      }),
    )
    expect(out.deck.cards).toHaveLength(1)
    expect(out.skipped).toBe(3)
  })

  it('gives a nameless deck a name rather than an empty heading', () => {
    const out = fromTransfer(exported({ title: '  ' }))
    expect(out.deck.title).toBe('Imported deck')
    expect(out.deck.subject).toBe('Ancient Rome')
  })

  it('falls back to a subject too', () => {
    expect(fromTransfer(exported({ subject: '' })).deck.subject).toBe('General')
  })

  it('takes only the scheduling fields the scheduler reads', () => {
    // A hand-edited file must not be able to put anything else in the store.
    const out = fromTransfer(
      exported({
        cards: [{ front: 'Consul?', back: 'Senior.', scheduling: { ease: 2.5, evil: true } }],
      }),
    )
    expect(out.deck.cards[0].scheduling.evil).toBeUndefined()
    expect(out.deck.cards[0].scheduling.ease).toBe(2.5)
  })

  it('survives a round trip with nothing in it', () => {
    const out = fromTransfer(JSON.stringify(toTransfer(deck({ cards: [], schedule: {} }))))
    expect(out.error).toBe(null)
    expect(out.deck.cards).toEqual([])
  })
})
