import { useMemo, useState } from 'react'
import Modal from './Modal.jsx'

/**
 * Filing several decks into one folder at once.
 *
 * Moving decks one at a time — open it, edit it, pick the folder, save — is
 * fine for one deck and a chore for twelve, and twelve is what a reader has
 * the day they make their first folder. This is that job in one dialog: every
 * deck not already here, a box beside each, one button.
 *
 * Each row says where the deck is now, because ticking one that lives in
 * another folder moves it out of there. Nothing is copied: a deck is in one
 * folder or none.
 */

/** Past this many, a filter earns its place above the list. */
const FILTER_FROM = 8

export default function AddDecksModal({ folder, decks = [], folders = [], fresh = false, onClose, onAdd }) {
  const [picked, setPicked] = useState(() => new Set())
  const [query, setQuery] = useState('')

  const names = useMemo(() => new Map(folders.map((f) => [f.id, f.name])), [folders])

  const candidates = useMemo(
    () =>
      decks
        .filter((d) => d.folderId !== folder.id)
        .sort((a, b) => a.title.localeCompare(b.title)),
    [decks, folder.id],
  )

  const q = query.trim().toLowerCase()
  const shown = q
    ? candidates.filter((d) => `${d.title} ${d.subject}`.toLowerCase().includes(q))
    : candidates

  const toggle = (id) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const count = picked.size

  return (
    <Modal
      open
      onClose={onClose}
      kicker={fresh ? 'Folder created' : 'Add decks'}
      title={`Add decks to “${folder.name}”`}
      body={
        candidates.length
          ? fresh
            ? 'Pick what belongs here now, or skip it and add decks later from the folder’s menu.'
            : 'Ticking a deck from another folder moves it here. Its cards and history come with it.'
          : 'Every deck is already in this folder.'
      }
      confirmLabel={count ? `Add ${count} ${count === 1 ? 'deck' : 'decks'}` : 'Add decks'}
      confirmDisabled={!count}
      cancelLabel={fresh ? 'Skip for now' : 'Cancel'}
      maxWidth={460}
      onConfirm={() => {
        if (!count) return
        // In the order shown, so the toast and the library agree.
        onAdd(candidates.filter((d) => picked.has(d.id)).map((d) => d.id))
        onClose()
      }}
    >
      {candidates.length > FILTER_FROM && (
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a deck"
          aria-label="Find a deck"
          className="mb-3 w-full rounded-lg border border-line bg-paper px-3 py-[10px] text-sm text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-accent"
        />
      )}

      {candidates.length > 0 && (
        <fieldset className="m-0 mb-6 border-0 p-0">
          <legend className="sr-only">Decks to add</legend>
          <div className="-mx-1 flex max-h-[min(46vh,360px)] flex-col gap-1 overflow-y-auto px-1 py-0.5">
            {shown.map((deck) => {
              const checked = picked.has(deck.id)
              const where = deck.folderId ? names.get(deck.folderId) : null
              return (
                <label
                  key={deck.id}
                  className={`grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 rounded-[7px] border px-3.5 py-2.5 transition-colors hover:border-ink-3 ${
                    checked ? 'border-accent bg-accent-soft' : 'border-line bg-transparent'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(deck.id)}
                    className="row-span-2 h-4 w-4 cursor-pointer accent-[var(--color-accent)]"
                  />
                  <span className="truncate text-sm font-medium text-ink">{deck.title}</span>
                  <span className="truncate text-xs text-ink-3">
                    {deck.cards.length} {deck.cards.length === 1 ? 'card' : 'cards'} ·{' '}
                    {where ? `in ${where}` : 'ungrouped'}
                  </span>
                </label>
              )
            })}
            {shown.length === 0 && (
              <p className="m-0 px-1 py-3 text-sm text-ink-3">Nothing matches “{query.trim()}”.</p>
            )}
          </div>
        </fieldset>
      )}
    </Modal>
  )
}
