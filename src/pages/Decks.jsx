import { useMemo, useState } from 'react'
import Button from '../components/Button.jsx'
import DeckCard from '../components/DeckCard.jsx'
import { useApp } from '../data/AppContext.jsx'

const FILTERS = ['All decks', 'In progress', 'Mastered', 'Drafts']
const SORTS = ['Recently studied', 'Alphabetical', 'Most cards']

export default function Decks({ onNewDeck, onEditDeck }) {
  const { decks } = useApp()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('All decks')
  const [sort, setSort] = useState('Recently studied')

  const rows = useMemo(() => {
    let out = decks.filter((d) => {
      const haystack = `${d.title} ${d.subject} ${d.cards.map((c) => c.front).join(' ')}`.toLowerCase()
      if (search && !haystack.includes(search.toLowerCase())) return false
      if (filter === 'In progress') return d.progress > 0 && d.progress < 0.85
      if (filter === 'Mastered') return d.progress >= 0.85
      if (filter === 'Drafts') return d.cards.length === 0
      return true
    })
    if (sort === 'Alphabetical') out = [...out].sort((a, b) => a.title.localeCompare(b.title))
    if (sort === 'Most cards') out = [...out].sort((a, b) => b.cards.length - a.cards.length)
    return out
  }, [decks, search, filter, sort])

  return (
    <div className="rise-in mx-auto flex max-w-[1080px] flex-col gap-[26px]">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <div className="kicker mb-3.5">Library</div>
          <h1 className="m-0 font-serif text-[32px] leading-[1.06] tracking-[-0.015em] sm:text-[40px]">
            My decks
          </h1>
        </div>
        <Button onClick={onNewDeck}>New deck</Button>
      </header>

      <div className="flex flex-wrap items-center gap-3 border-y border-line py-3.5">
        <div className="flex min-w-[200px] flex-1 items-center gap-[9px] rounded-[5px] border border-line bg-surface px-3 py-[9px]">
          <span className="text-[13px] text-ink-3">⌕</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search decks and cards"
            aria-label="Search decks and cards"
            className="flex-1 border-0 bg-transparent text-sm text-ink outline-none placeholder:text-ink-3"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => {
            const active = filter === f
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`cursor-pointer rounded-[20px] border px-3.5 py-2 text-xs leading-none font-medium transition-colors hover:border-ink-3 ${
                  active
                    ? 'border-ink bg-ink text-paper'
                    : 'border-line bg-transparent text-ink-2'
                }`}
              >
                {f}
              </button>
            )
          })}
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          aria-label="Sort decks"
          className="cursor-pointer rounded-[5px] border border-line bg-surface px-[11px] py-[9px] text-xs leading-none font-medium text-ink-2"
        >
          {SORTS.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>

      {rows.length ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(310px,1fr))]">
          {rows.map((deck) => (
            <DeckCard key={deck.id} deck={deck} onEdit={onEditDeck} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3.5 rounded-[14px] border border-dashed border-line px-5 py-[70px] text-center">
          <div className="font-serif text-[24px] leading-[1.2]">
            Nothing matches {search ? `“${search}”` : 'that filter'}
          </div>
          <p className="m-0 max-w-[340px] text-sm text-ink-3 text-pretty">
            Try a shorter search term, or clear the filter to see all {decks.length} decks.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setSearch('')
              setFilter('All decks')
            }}
          >
            Clear search
          </Button>
        </div>
      )}
    </div>
  )
}
