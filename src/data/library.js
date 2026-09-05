/**
 * Filtering, searching and ordering the deck library.
 *
 * Pure, so the behaviour can be checked without rendering the page. This is
 * also where a silent bug lived once before: "Recently studied" was the default
 * sort and did nothing at all, which no amount of looking at the page made
 * obvious.
 */

export const FILTERS = ['All decks', 'In progress', 'Mastered', 'Drafts']
export const SORTS = ['Recently studied', 'Alphabetical', 'Most cards']

/** A deck counts as mastered at 85%, matching the badge shown on its card. */
export const MASTERED_AT = 0.85

/**
 * Everything a search should look through.
 *
 * Card backs belong here as much as fronts: the field is labelled "Search decks
 * and cards", and an answer is half of a card. Leaving them out meant searching
 * for a phrase you had definitely read returned nothing.
 */
const haystackFor = (deck) =>
  [
    deck.title,
    deck.subject,
    deck.desc,
    ...deck.cards.flatMap((c) => [c.front, c.back]),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

export const matchesSearch = (deck, query) => {
  const q = (query ?? '').trim().toLowerCase()
  return !q || haystackFor(deck).includes(q)
}

export const matchesFilter = (deck, filter) => {
  if (filter === 'In progress') return deck.progress > 0 && deck.progress < MASTERED_AT
  if (filter === 'Mastered') return deck.progress >= MASTERED_AT
  if (filter === 'Drafts') return deck.cards.length === 0
  return true
}

const comparators = {
  // Never-studied decks sort last rather than first.
  'Recently studied': (a, b) => (b.studiedAt ?? 0) - (a.studiedAt ?? 0),
  Alphabetical: (a, b) => a.title.localeCompare(b.title),
  'Most cards': (a, b) => b.cards.length - a.cards.length,
}

export function filterAndSortDecks(decks, { search = '', filter = 'All decks', sort = 'Recently studied' } = {}) {
  const rows = decks.filter((d) => matchesSearch(d, search) && matchesFilter(d, filter))
  const compare = comparators[sort]
  return compare ? [...rows].sort(compare) : rows
}
