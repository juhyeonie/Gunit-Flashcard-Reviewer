import { describe, expect, it } from 'vitest'
import {
  FORMAT,
  LIBRARY_FORMAT,
  VERSION,
  fileNameFor,
  fromLibraryTransfer,
  fromTransfer,
  libraryFileName,
  toLibraryTransfer,
  toTransfer,
} from './transfer.js'

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

describe('toLibraryTransfer', () => {
  const state = () => ({ decks: [deck(), deck({ id: 'punic', title: 'Punic Wars' })], sessions: [
    { at: NOW, deckId: 'republic', reviewed: 6, seconds: 91 },
  ] })

  it('stamps itself as a library, not as a deck', () => {
    // The two files look alike and one is easy to reach for by mistake.
    const out = toLibraryTransfer(state(), { now: NOW })
    expect(out.format).toBe(LIBRARY_FORMAT)
    expect(out.format).not.toBe(FORMAT)
  })

  it('carries every deck', () => {
    const out = toLibraryTransfer(state(), { now: NOW })
    expect(out.decks.map((d) => d.title)).toEqual(['Roman Republic', 'Punic Wars'])
    expect(out.decks[0].cards[0].scheduling).toMatchObject({ reps: 3 })
  })

  it('does not stamp each deck as a file of its own', () => {
    const out = toLibraryTransfer(state(), { now: NOW })
    expect(out.decks[0].format).toBeUndefined()
    expect(out.decks[0].version).toBeUndefined()
  })

  it('carries the activity log, which is where the streak comes from', () => {
    expect(toLibraryTransfer(state(), { now: NOW }).sessions).toHaveLength(1)
  })

  it('leaves settings out', () => {
    // Preferences for this device, not anything a reader would be sorry to
    // retype — and restoring them would overwrite whatever is set here.
    const out = toLibraryTransfer({ ...state(), settings: { name: 'Mara' } }, { now: NOW })
    expect(out.settings).toBeUndefined()
  })

  it('backs up an empty library rather than refusing', () => {
    const out = toLibraryTransfer({ decks: [], sessions: [] }, { now: NOW })
    expect(out.decks).toEqual([])
  })
})

describe('libraryFileName', () => {
  it('is dated, so two backups do not overwrite each other', () => {
    expect(libraryFileName(NOW)).toBe('gunit-library-2023-11-14.json')
  })
})

describe('fromLibraryTransfer', () => {
  const backup = (over = {}) =>
    JSON.stringify({
      ...toLibraryTransfer(
        { decks: [deck(), deck({ id: 'punic', title: 'Punic Wars' })], sessions: [
          { at: NOW, deckId: 'republic', reviewed: 6, seconds: 91 },
        ] },
        { now: NOW },
      ),
      ...over,
    })

  it('reads back every deck and the log', () => {
    const { library, error } = fromLibraryTransfer(backup())
    expect(error).toBe(null)
    expect(library.decks.map((d) => d.title)).toEqual(['Roman Republic', 'Punic Wars'])
    expect(library.sessions).toHaveLength(1)
  })

  it('names the mistake when a single deck is offered instead', () => {
    const single = JSON.stringify(toTransfer(deck(), { now: NOW }))
    expect(fromLibraryTransfer(single).error).toMatch(/single deck/)
  })

  it('refuses a file from somewhere else', () => {
    expect(fromLibraryTransfer('{"notes": []}').error).toMatch(/not exported from Gunit/)
  })

  it('refuses a newer version rather than guessing', () => {
    expect(fromLibraryTransfer(backup({ version: VERSION + 1 })).error).toMatch(/newer version/)
  })

  it('loses one damaged deck rather than the other nineteen', () => {
    const out = fromLibraryTransfer(backup({ decks: [{ title: 'Fine', cards: [] }, { title: 'Broken' }] }))
    expect(out.error).toBe(null)
    expect(out.library.decks.map((d) => d.title)).toEqual(['Fine'])
    expect(out.skippedDecks).toBe(1)
  })

  it('counts the cards lost inside the decks it did read', () => {
    const out = fromLibraryTransfer(
      backup({ decks: [{ title: 'Fine', cards: [{ front: 'a', back: 'b' }, { front: 'c' }] }] }),
    )
    expect(out.library.decks[0].cards).toHaveLength(1)
    expect(out.skippedCards).toBe(1)
  })

  it('drops log entries it cannot use', () => {
    // A session with no timestamp cannot be placed on a day, and one with
    // nothing reviewed was never logged in the first place.
    const out = fromLibraryTransfer(
      backup({ sessions: [{ at: NOW, reviewed: 3, seconds: 60 }, { reviewed: 3 }, { at: NOW, reviewed: 0 }] }),
    )
    expect(out.library.sessions).toHaveLength(1)
  })

  it('copes with a backup that has no log at all', () => {
    expect(fromLibraryTransfer(backup({ sessions: undefined })).library.sessions).toEqual([])
  })

  it('refuses ours-but-deckless', () => {
    expect(fromLibraryTransfer(backup({ decks: undefined })).error).toMatch(/no decks/)
  })

  it('restores an empty library without complaint', () => {
    const out = fromLibraryTransfer(backup({ decks: [], sessions: [] }))
    expect(out.error).toBe(null)
    expect(out.library.decks).toEqual([])
  })
})
