import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/Button.jsx'
import DeckCard from '../components/DeckCard.jsx'
import FolderModal from '../components/FolderModal.jsx'
import AddDecksModal from '../components/AddDecksModal.jsx'
import ConfirmModal from '../components/ConfirmModal.jsx'
import Menu, { MenuItem } from '../components/Menu.jsx'
import { useOwnShares } from '../data/ownShares.js'
import { ChevronIcon, FolderIcon } from '../components/Icons.jsx'
import { useApp } from '../data/useApp.js'
import { FILTERS, SORTS, filterAndSortDecks } from '../data/library.js'
import { fromTransfer } from '../data/transfer.js'
import { dueCount } from '../data/scheduler.js'
import useDocumentTitle from '../hooks/useDocumentTitle.js'

/** "1 deck", "3 decks". */
const deckCount = (n) => `${n} ${n === 1 ? 'deck' : 'decks'}`

/*
 * Which folders this reader has folded away, kept in this browser.
 *
 * Folding is how a long library gets tidied, and a fold that springs open
 * again on every visit tidies nothing. It is a view preference rather than
 * part of the library, so it lives beside it rather than in it: it is not
 * synced, not backed up, and a different device keeps its own.
 */
const FOLDED_KEY = 'gunit.ui.foldedFolders'

const readFolded = () => {
  try {
    const ids = JSON.parse(localStorage.getItem(FOLDED_KEY) ?? '[]')
    return new Set(Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : [])
  } catch {
    return new Set()
  }
}

export default function Decks({ onNewDeck, onEditDeck, onShareFolder }) {
  const shares = useOwnShares()
  const { decks, folders, importDeck, createFolder, renameFolder, deleteFolder, moveDeckToFolder, say } =
    useApp()
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

  /*
   * The same filtered, sorted rows, split by folder. Nothing is copied into a
   * folder: each deck names its folder, and is shown once, under it.
   *
   * A deck naming a folder that is not there counts as ungrouped here too.
   * The store already clears those on load, but a page should not depend on
   * that to show every deck somewhere.
   */
  const sortedFolders = useMemo(
    () => [...folders].sort((a, b) => a.name.localeCompare(b.name)),
    [folders],
  )
  const groups = useMemo(() => {
    const known = new Set(folders.map((f) => f.id))
    const inFolder = new Map(folders.map((f) => [f.id, []]))
    const ungrouped = []
    for (const deck of rows) {
      if (deck.folderId && known.has(deck.folderId)) inFolder.get(deck.folderId).push(deck)
      else ungrouped.push(deck)
    }
    return { inFolder, ungrouped }
  }, [rows, folders])

  /*
   * Every deck in each folder, ignoring the search: how many, and how many
   * cards are waiting. The second is what decides which folder to open next,
   * so it sits on the folder rather than only on the cards inside it.
   */
  const totals = useMemo(() => {
    const byFolder = new Map()
    for (const deck of decks) {
      if (!deck.folderId) continue
      const t = byFolder.get(deck.folderId) ?? { count: 0, due: 0 }
      byFolder.set(deck.folderId, { count: t.count + 1, due: t.due + dueCount(deck) })
    }
    return byFolder
  }, [decks])

  const narrowing = Boolean(search.trim()) || filter !== 'All decks'

  // Which folder dialog is open, if any. One at a time, like the app's own.
  const [folderDialog, setFolderDialog] = useState(null)
  const [folderMenu, setFolderMenu] = useState(null)
  const [folded, setFolded] = useState(readFolded)
  const toggle = (id) =>
    setFolded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  // Written back without the ids of folders that have since gone.
  useEffect(() => {
    const live = new Set(folders.map((f) => f.id))
    try {
      localStorage.setItem(FOLDED_KEY, JSON.stringify([...folded].filter((id) => live.has(id))))
    } catch {
      // A preference; the page works the same without it.
    }
  }, [folded, folders])

  /** Files every picked deck here, and opens the folder so they can be seen arriving. */
  const addToFolder = (folder, deckIds) => {
    for (const id of deckIds) moveDeckToFolder(id, folder.id)
    setFolded((prev) => {
      if (!prev.has(folder.id)) return prev
      const next = new Set(prev)
      next.delete(folder.id)
      return next
    })
    say(`Added ${deckCount(deckIds.length)} to “${folder.name}”`)
  }

  const hasDecksElsewhere = (folder) => decks.some((d) => d.folderId !== folder.id)

  /*
   * An empty folder is a place to start, not a dead end: the two ways to fill
   * it, right where the reader is looking. Adding existing decks leads when
   * there are any, because that is what someone making their first folder has.
   */
  const emptyFolder = (folder) => (
    <div className="flex flex-col items-center gap-3.5 rounded-[12px] border border-dashed border-line px-5 py-7 text-center">
      <p className="m-0 text-sm text-ink-2">Nothing filed here yet.</p>
      <div className="flex flex-wrap justify-center gap-2">
        {hasDecksElsewhere(folder) && (
          <Button size="sm" onClick={() => setFolderDialog({ kind: 'add', folder })}>
            Add decks
          </Button>
        )}
        <Button
          size="sm"
          variant={hasDecksElsewhere(folder) ? 'outline' : 'primary'}
          onClick={() => onNewDeck?.(folder.id)}
        >
          New deck here
        </Button>
      </div>
    </div>
  )

  const grid = (list) => (
    <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-[repeat(auto-fill,minmax(310px,1fr))]">
      {list.map((deck) => (
        <li key={deck.id} className="contents">
          {/* Under a folder or "Ungrouped" h2 here, so h3 — no level is skipped. */}
          <DeckCard deck={deck} headingLevel={3} onEdit={onEditDeck} />
        </li>
      ))}
    </ul>
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
          {/*
            Icon-only on a phone, where three labelled buttons wrapped onto a
            second row. The label stays in the accessible name either way.
          */}
          <Button
            variant="outline"
            onClick={() => setFolderDialog({ kind: 'create' })}
            className="max-sm:px-3.5"
          >
            <FolderIcon />
            <span className="max-sm:sr-only">New folder</span>
          </Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            Import deck
          </Button>
          <Button onClick={() => onNewDeck?.()}>New deck</Button>
        </div>
      </header>

      {/*
        Driven by the visible button above, so it is taken out of the tab order
        and hidden from the reader. Left in, focus lands on an invisible
        control off the side of the page with nothing to announce.
      */}
      <input
        ref={fileRef}
        type="file"
        tabIndex={-1}
        aria-hidden="true"
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

      {rows.length && !folders.length ? (
        // No folders: the library exactly as it has always been.
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(310px,1fr))]">
          {rows.map((deck) => (
            <li key={deck.id} className="contents">
              {/* Directly under the page h1 here, so h2 — no level is skipped. */}
              <DeckCard deck={deck} headingLevel={2} onEdit={onEditDeck} />
            </li>
          ))}
        </ul>
      ) : folders.length && (rows.length || !narrowing) ? (
        <div className="flex flex-col gap-9">
          <div className="flex flex-col gap-8" role="group" aria-label="Folders">
            {sortedFolders.map((folder) => {
              const inside = groups.inFolder.get(folder.id) ?? []
              // While searching, a folder with nothing matching says nothing.
              if (narrowing && !inside.length) return null
              // And one with a match is open: a result inside a folded folder
              // is a result nobody sees.
              const open = narrowing || !folded.has(folder.id)
              const headingId = `folder-${folder.id}`
              const { count = 0, due = 0 } = totals.get(folder.id) ?? {}
              return (
                <section key={folder.id} aria-labelledby={headingId} className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-center gap-x-2 border-b border-line-soft pb-2 max-sm:gap-y-0.5">
                    {/*
                      The button inside the heading, not the other way round:
                      a heading inside a button stops being a heading to a
                      screen reader, and headings are how it moves through a
                      page like this one.
                    */}
                    <h2 id={headingId} className="m-0 flex min-w-0 flex-1 font-normal">
                      <button
                        type="button"
                        onClick={() => toggle(folder.id)}
                        disabled={narrowing}
                        aria-expanded={open}
                        aria-controls={`${headingId}-decks`}
                        title={folder.name}
                        className="-ml-2 flex min-w-0 max-w-full cursor-pointer items-center gap-2 rounded-lg border-0 bg-transparent py-1.5 pr-2.5 pl-1.5 text-left text-ink transition-colors hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-default disabled:hover:bg-transparent"
                      >
                        <span
                          aria-hidden="true"
                          className={`grid h-5 w-5 shrink-0 place-items-center text-ink-3 transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] ${
                            open ? '' : '-rotate-90'
                          }`}
                        >
                          <ChevronIcon />
                        </span>
                        <span className="shrink-0 text-ink-2">
                          <FolderIcon size={18} />
                        </span>
                        <span className="truncate font-serif text-[22px] leading-[1.2]">
                          {folder.name}
                        </span>
                      </button>
                    </h2>
                    {/*
                      Beside the name on a wide screen; under it on a phone,
                      where sharing the row cut "Organic Chemistry" down to
                      "Organic C…". Indented to start where the name does.
                    */}
                    <span className="shrink-0 font-mono text-[11px] leading-none font-medium tracking-[0.04em] whitespace-nowrap text-ink-3 max-sm:order-last max-sm:basis-full max-sm:pb-1 max-sm:pl-[50px]">
                      {deckCount(count)}
                      {due > 0 && <span className="text-accent"> · {due} due</span>}
                      {shares.folder(folder.id) && <span className="text-accent"> · Shared</span>}
                    </span>
                    <div className="relative shrink-0">
                      <button
                        type="button"
                        onClick={() => setFolderMenu(folderMenu === folder.id ? null : folder.id)}
                        aria-label={`Folder options for ${folder.name}`}
                        aria-expanded={folderMenu === folder.id}
                        aria-haspopup="true"
                        className={`grid h-8 w-8 cursor-pointer place-items-center rounded-[6px] border bg-transparent text-sm leading-none font-medium text-ink-3 transition-colors hover:border-ink-3 hover:text-ink ${
                          folderMenu === folder.id ? 'border-ink-3 bg-raised' : 'border-line'
                        }`}
                      >
                        ⋮
                      </button>
                      <Menu
                        open={folderMenu === folder.id}
                        onClose={() => setFolderMenu(null)}
                        align="right"
                        width={236}
                      >
                        <MenuItem
                          title="Add decks"
                          hint={
                            hasDecksElsewhere(folder)
                              ? 'Pick several at once.'
                              : 'Every deck is already here.'
                          }
                          disabled={!hasDecksElsewhere(folder)}
                          onClick={() => {
                            setFolderMenu(null)
                            setFolderDialog({ kind: 'add', folder })
                          }}
                        />
                        <MenuItem
                          title="New deck here"
                          onClick={() => {
                            setFolderMenu(null)
                            onNewDeck?.(folder.id)
                          }}
                        />
                        <MenuItem
                          title="Rename folder"
                          onClick={() => {
                            setFolderMenu(null)
                            setFolderDialog({ kind: 'rename', folder })
                          }}
                        />
                        <MenuItem
                          title="Share folder"
                          hint="Every deck in it, by link or invitation."
                          onClick={() => {
                            setFolderMenu(null)
                            onShareFolder?.(folder)
                          }}
                        />
                        <MenuItem
                          title="Delete folder"
                          hint="Its decks move to Ungrouped."
                          danger
                          onClick={() => {
                            setFolderMenu(null)
                            setFolderDialog({ kind: 'delete', folder })
                          }}
                        />
                      </Menu>
                    </div>
                  </div>
                  <div id={`${headingId}-decks`} hidden={!open}>
                    {inside.length ? grid(inside) : emptyFolder(folder)}
                  </div>
                </section>
              )
            })}
          </div>

          {groups.ungrouped.length > 0 && (
            <section aria-labelledby="folder-ungrouped" className="flex flex-col gap-4">
              <div className="flex items-center gap-2.5 border-b border-line-soft pb-2">
                {/* Level with the folder names above, which sit after a chevron and an icon. */}
                <h2
                  id="folder-ungrouped"
                  className="m-0 py-1.5 font-serif text-[22px] leading-[1.2] font-normal text-ink-2"
                >
                  Ungrouped
                </h2>
                <span className="font-mono text-[11px] leading-none font-medium tracking-[0.04em] text-ink-3">
                  {deckCount(groups.ungrouped.length)}
                </span>
              </div>
              {grid(groups.ungrouped)}
            </section>
          )}
        </div>
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

      {(folderDialog?.kind === 'create' || folderDialog?.kind === 'rename') && (
        <FolderModal
          key={folderDialog.folder ? `rename-${folderDialog.folder.id}` : 'create'}
          mode={folderDialog.kind}
          folder={folderDialog.folder}
          folders={folders}
          onClose={() => setFolderDialog(null)}
          onSave={(name) => {
            if (folderDialog.kind === 'rename') {
              renameFolder(folderDialog.folder.id, name)
              say(`Renamed to “${name}”`)
              return
            }
            const folder = createFolder(name)
            say(`Created “${name}”`)
            // Straight on to filling it, when there is anything to fill it
            // with. The dialog closing clears this, so it is set a beat later.
            if (folder && decks.length) {
              setTimeout(() => setFolderDialog({ kind: 'add', folder, fresh: true }), 0)
            }
          }}
        />
      )}

      {folderDialog?.kind === 'add' && (
        <AddDecksModal
          key={`add-${folderDialog.folder.id}`}
          folder={folderDialog.folder}
          fresh={folderDialog.fresh}
          decks={decks}
          folders={folders}
          onClose={() => setFolderDialog(null)}
          onAdd={(ids) => addToFolder(folderDialog.folder, ids)}
        />
      )}

      <ConfirmModal
        open={folderDialog?.kind === 'delete'}
        kicker="Delete folder"
        title={`Delete “${folderDialog?.folder?.name ?? ''}”?`}
        body={(() => {
          const n = totals.get(folderDialog?.folder?.id)?.count ?? 0
          return n
            ? `Its ${deckCount(n)} ${n === 1 ? 'moves' : 'move'} to Ungrouped. No decks or cards are deleted.`
            : 'It is empty. No decks or cards are deleted.'
        })()}
        confirmLabel="Delete folder"
        onClose={() => setFolderDialog(null)}
        onConfirm={() => {
          const { id, name } = folderDialog.folder
          deleteFolder(id)
          say(`Deleted “${name}” — its decks are in Ungrouped`)
        }}
      />
    </div>
  )
}
