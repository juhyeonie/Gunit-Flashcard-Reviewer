import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/Button.jsx'
import DeckCard from '../components/DeckCard.jsx'
import { useApp } from '../data/AppContext.jsx'
import { FILTERS, SORTS, filterAndSortDecks } from '../data/library.js'
import { fromTransfer } from '../data/transfer.js'
import useDocumentTitle from '../hooks/useDocumentTitle.js'

export default function Decks({ onNewDeck, onEditDeck }) {
  const { decks, importDeck, say } = useApp()
  const navigate = useNavigate()
  const fileRef = useRef(null)
  useDocumentTitle('My decks')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('All decks')
  const [sort, setSort] = useState('Recently studied')

  /**
   * Reads a deck back out of a file. A bad file says why rather than doing
   * nothing, and a file that is almost right imports what it can and says how
   * much it left behind.
   */
  const restore = async (file) => {
    if (!file) return
    const { deck, error, skipped } = fromTransfer(await file.text())
    if (error) {
      say(error)
      return
    }
    const added = importDeck(deck)
    say(
      skipped
        ? `Imported “${deck.title}” — ${skipped} unusable ${skipped === 1 ? 'card' : 'cards'} left out`
        : `Imported “${deck.title}”`,
    )
    navigate(`/decks/${added.id}`)
  }

  const rows = useMemo(
    () => filterAndSortDecks(decks, { search, filter, sort }),
    [decks, search, filter, sort],
  )

  return (
    <div className="rise-in mx-auto flex max-w-[1080px] flex-col gap-[26px]">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <div className="kicker mb-3.5">Library</div>
          <h1 className="m-0 font-serif text-[32px] leading-[1.06] tracking-[-0.015em] sm:text-[40px]">
            My decks
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            Import deck
          </Button>
          <Button onClick={onNewDeck}>New deck</Button>
        </div>
      </header>

      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        onChange={(e) => {
          restore(e.target.files?.[0])
          e.target.value = ''
        }}
        className="absolute -left-[9999px] h-px w-px opacity-0"
      />

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
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(310px,1fr))]">
          {rows.map((deck) => (
            <li key={deck.id} className="contents">
              {/* Directly under the page h1 here, so h2 — no level is skipped. */}
              <DeckCard deck={deck} headingLevel={2} onEdit={onEditDeck} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-center gap-3.5 rounded-[14px] border border-dashed border-line px-5 py-[70px] text-center">
          <div className="font-serif text-[24px] leading-[1.2]">
            Nothing matches {search ? `“${search}”` : 'that filter'}
          </div>
          {/* Advice for what was actually done: telling someone to shorten a
              search term they never typed is worse than saying nothing. */}
          <p className="m-0 max-w-[340px] text-sm text-ink-3 text-pretty">
            {search
              ? `Try a shorter search term, or clear the filter to see all ${decks.length} decks.`
              : `Clear the filter to see all ${decks.length} decks.`}
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setSearch('')
              setFilter('All decks')
            }}
          >
            {search ? 'Clear search' : 'Clear filter'}
          </Button>
        </div>
      )}
    </div>
  )
}
