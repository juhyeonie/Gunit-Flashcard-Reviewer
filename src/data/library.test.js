import { describe, expect, it } from 'vitest'
import { filterAndSortDecks, matchesFilter, matchesSearch } from './library.js'

const deck = (over = {}) => ({
  id: 'd',
  title: 'Roman Republic',
  subject: 'Ancient Rome',
  desc: 'Magistracies and assemblies.',
  cards: [{ id: 'c1', front: 'What was the cursus honorum?', back: 'The ladder of public office.' }],
  progress: 0.4,
  studiedAt: null,
  ...over,
})

describe('matchesSearch', () => {
  const d = deck()

  it('matches the title and the subject', () => {
    expect(matchesSearch(d, 'republic')).toBe(true)
    expect(matchesSearch(d, 'ancient')).toBe(true)
  })

  it('matches a card front', () => {
    expect(matchesSearch(d, 'cursus honorum')).toBe(true)
  })

  it('matches a card back', () => {
    // The gap this module exists to close: an answer is half a card, and the
    // field is labelled "Search decks and cards".
    expect(matchesSearch(d, 'ladder of public office')).toBe(true)
  })

  it('matches the deck description', () => {
    expect(matchesSearch(d, 'assemblies')).toBe(true)
  })

  it('ignores case', () => {
    expect(matchesSearch(d, 'LADDER')).toBe(true)
    expect(matchesSearch(deck({ title: 'lower case' }), 'LOWER')).toBe(true)
  })

  it('ignores surrounding whitespace in the query', () => {
    expect(matchesSearch(d, '  cursus  ')).toBe(true)
  })

  it('treats an empty or whitespace query as no filter', () => {
    expect(matchesSearch(d, '')).toBe(true)
    expect(matchesSearch(d, '   ')).toBe(true)
    expect(matchesSearch(d, undefined)).toBe(true)
  })

  it('does not match text that is nowhere in the deck', () => {
    expect(matchesSearch(d, 'photosynthesis')).toBe(false)
  })

  it('copes with a deck missing its optional text', () => {
    const bare = deck({ desc: undefined, cards: [{ id: 'x', front: 'Q', back: undefined }] })
    expect(() => matchesSearch(bare, 'q')).not.toThrow()
    expect(matchesSearch(bare, 'Q')).toBe(true)
  })
})

describe('matchesFilter', () => {
  it('lets everything through by default', () => {
    expect(matchesFilter(deck(), 'All decks')).toBe(true)
    expect(matchesFilter(deck({ cards: [] }), 'All decks')).toBe(true)
  })

  it('counts a deck as in progress between nothing and mastered', () => {
    expect(matchesFilter(deck({ progress: 0.4 }), 'In progress')).toBe(true)
    expect(matchesFilter(deck({ progress: 0 }), 'In progress')).toBe(false)
    expect(matchesFilter(deck({ progress: 0.85 }), 'In progress')).toBe(false)
  })

  it('counts a deck as mastered from 85% up, matching its badge', () => {
    expect(matchesFilter(deck({ progress: 0.85 }), 'Mastered')).toBe(true)
    expect(matchesFilter(deck({ progress: 0.84 }), 'Mastered')).toBe(false)
  })

  it('counts a deck with no cards as a draft', () => {
    expect(matchesFilter(deck({ cards: [] }), 'Drafts')).toBe(true)
    expect(matchesFilter(deck(), 'Drafts')).toBe(false)
  })
})

describe('filterAndSortDecks', () => {
  const decks = [
    deck({ id: 'a', title: 'Beta', studiedAt: 100, cards: [{ id: '1', front: 'x', back: 'y' }] }),
    deck({ id: 'b', title: 'Alpha', studiedAt: 300, cards: [] }),
    deck({ id: 'c', title: 'Gamma', studiedAt: null, cards: [
      { id: '2', front: 'p', back: 'q' },
      { id: '3', front: 'r', back: 's' },
    ] }),
  ]

  it('orders by recency, with never-studied decks last', () => {
    const out = filterAndSortDecks(decks, { sort: 'Recently studied' })
    expect(out.map((d) => d.title)).toEqual(['Alpha', 'Beta', 'Gamma'])
  })

  it('orders alphabetically', () => {
    expect(filterAndSortDecks(decks, { sort: 'Alphabetical' }).map((d) => d.title)).toEqual([
      'Alpha',
      'Beta',
      'Gamma',
    ])
  })

  it('orders by card count', () => {
    expect(filterAndSortDecks(decks, { sort: 'Most cards' }).map((d) => d.title)).toEqual([
      'Gamma',
      'Beta',
      'Alpha',
    ])
  })

  it('applies the search and the filter together', () => {
    const out = filterAndSortDecks(decks, { search: 'alpha', filter: 'Drafts' })
    expect(out.map((d) => d.title)).toEqual(['Alpha'])
  })

  it('returns nothing when the two exclude each other', () => {
    expect(filterAndSortDecks(decks, { search: 'alpha', filter: 'Mastered' })).toEqual([])
  })

  it('does not mutate the array it was given', () => {
    const order = decks.map((d) => d.id)
    filterAndSortDecks(decks, { sort: 'Alphabetical' })
    expect(decks.map((d) => d.id)).toEqual(order)
  })

  it('falls back to the given order for an unknown sort', () => {
    expect(filterAndSortDecks(decks, { sort: 'Nonsense' }).map((d) => d.id)).toEqual(['a', 'b', 'c'])
  })
})
