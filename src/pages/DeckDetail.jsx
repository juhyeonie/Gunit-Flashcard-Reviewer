import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Button from '../components/Button.jsx'
import Menu, { MenuItem } from '../components/Menu.jsx'
import { PencilIcon } from '../components/Icons.jsx'
import { useApp } from '../data/useApp.js'
import { dueCount, entryFor, isSuspended, suspendedCount } from '../data/scheduler.js'
import { MIN_QUIZ_CARDS, canQuiz } from '../data/quiz.js'
import useDocumentTitle from '../hooks/useDocumentTitle.js'
import { formatRelative } from '../data/activity.js'
import { fileNameFor, toTransfer } from '../data/transfer.js'

export default function DeckDetail({
  onEditDeck,
  onNewCard,
  onEditCard,
  onDeleteCard,
  onResetDeck,
  onImport,
}) {
  const { id } = useParams()
  const navigate = useNavigate()
  const { decks, say, setCardSuspended } = useApp()
  const deck = decks.find((d) => d.id === id)
  useDocumentTitle(deck?.title)

  const [studyMenu, setStudyMenu] = useState(false)
  const [addMenu, setAddMenu] = useState(false)
  const [deckMenu, setDeckMenu] = useState(false)
  const [cardMenu, setCardMenu] = useState(null)

  if (!deck) {
    return (
      <div className="mx-auto max-w-xl py-20 text-center">
        <div className="font-serif text-2xl">That deck no longer exists.</div>
        <Button as={Link} to="/decks" className="mt-5">
          All decks
        </Button>
      </div>
    )
  }

  const hasCards = deck.cards.length > 0
  const due = dueCount(deck)
  const suspended = suspendedCount(deck)
  const stats = [
    { label: 'Cards', value: String(deck.cards.length) },
    { label: 'Due now', value: String(due), accent: due > 0 },
    { label: 'Known', value: `${Math.round(deck.progress * 100)}%` },
    { label: 'Last studied', value: formatRelative(deck.studiedAt) },
    // Shown only when it applies. A deck whose cards are all suspended reads
    // "0 due" otherwise, which looks like the scheduler has stopped working.
    ...(suspended ? [{ label: 'Suspended', value: String(suspended) }] : []),
  ]

  const toggleSuspend = (card, index) => {
    setCardMenu(null)
    const off = isSuspended(entryFor(deck, card))
    setCardSuspended(deck.id, card.id, !off)
    say(off ? `Card ${index + 1} is back in the rotation` : `Card ${index + 1} suspended`)
  }

  const guard = (go) => () => {
    setStudyMenu(false)
    if (!hasCards) {
      say('Add a card to this deck before studying')
      return
    }
    go()
  }

  /**
   * Writes the deck out as a file. A library otherwise lives in one browser's
   * localStorage and nowhere else: clearing site data takes it, a second
   * machine cannot see it, and there is no way to hand a deck to anyone.
   */
  const exportDeck = () => {
    const name = fileNameFor(deck)
    const blob = new Blob([JSON.stringify(toTransfer(deck), null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = name
    link.click()
    // Revoking in the same tick can cancel the save before it starts.
    setTimeout(() => URL.revokeObjectURL(url), 0)
    say(`Saved ${name}`)
  }

  // Quiz has a higher bar than flashcards: without other cards to draw wrong
  // answers from, every question would show only the right one.
  const quizGuard = () => {
    setStudyMenu(false)
    if (!canQuiz(deck)) {
      say(`A quiz needs ${MIN_QUIZ_CARDS} cards — this deck has ${deck.cards.length}`)
      return
    }
    navigate(`/decks/${deck.id}/quiz`)
  }

  return (
    <div className="rise-in mx-auto flex max-w-[1000px] flex-col gap-[30px]">
      <Link
        to="/decks"
        className="self-start border-0 bg-transparent p-0 text-xs font-medium whitespace-nowrap text-ink-3 transition-colors hover:text-ink"
      >
        ← All decks
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-[22px] border-b border-line pb-[26px]">
        <div className="min-w-0 max-w-[520px]">
          <div className="kicker mb-3.5">{deck.subject}</div>
          <div className="m-0 mb-3 flex min-w-0 items-start gap-3">
            <h1 className="m-0 min-w-0 font-serif text-[32px] leading-[1.05] tracking-[-0.02em] text-pretty sm:text-[42px]">
              {deck.title}
            </h1>
            <button
              type="button"
              onClick={() => onEditDeck(deck)}
              title="Edit deck"
              aria-label="Edit deck"
              className="mt-2 grid h-[30px] w-[30px] shrink-0 cursor-pointer place-items-center rounded-lg border border-line bg-transparent p-0 text-ink-3 transition-colors hover:border-ink-3 hover:bg-raised hover:text-ink"
            >
              <PencilIcon />
            </button>
            <button
              type="button"
              onClick={exportDeck}
              title="Export deck"
              aria-label="Export deck"
              className="mt-2 grid h-[30px] w-[30px] shrink-0 cursor-pointer place-items-center rounded-lg border border-line bg-transparent p-0 text-[15px] text-ink-3 transition-colors hover:border-ink-3 hover:bg-raised hover:text-ink"
            >
              ↓
            </button>
            <div className="relative mt-2 shrink-0">
              <button
                type="button"
                onClick={() => setDeckMenu((v) => !v)}
                title="Deck options"
                aria-label="Deck options"
                aria-expanded={deckMenu}
                aria-haspopup="true"
                className={`grid h-[30px] w-[30px] cursor-pointer place-items-center rounded-lg border bg-transparent p-0 text-[15px] leading-none text-ink-3 transition-colors hover:border-ink-3 hover:bg-raised hover:text-ink ${
                  deckMenu ? 'border-ink-3 bg-raised' : 'border-line'
                }`}
              >
                ⋮
              </button>
              {/*
                Right-anchored on wide screens so the panel opens back under the
                title rather than across the study and add buttons, and
                left-anchored on narrow ones where anchoring right would run it
                off the left edge — the same reasoning as the two menus opposite.
              */}
              <Menu open={deckMenu} onClose={() => setDeckMenu(false)} align="responsive" width={250}>
                <MenuItem
                  title="Reset progress"
                  hint="Every card new again. The cards themselves stay."
                  danger
                  onClick={() => {
                    setDeckMenu(false)
                    onResetDeck(deck)
                  }}
                />
              </Menu>
            </div>
          </div>
          <p className="m-0 text-[15px] text-ink-2 text-pretty">{deck.desc}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Button
              variant={hasCards ? 'primary' : 'outline'}
              onClick={() => setStudyMenu((v) => !v)}
              aria-expanded={studyMenu}
              aria-haspopup="true"
            >
              <span>Study this deck</span>
              <span
                className="text-[10px] opacity-70 transition-transform duration-150"
                style={{ transform: studyMenu ? 'rotate(180deg)' : 'none' }}
              >
                ▾
              </span>
            </Button>
            <Menu open={studyMenu} onClose={() => setStudyMenu(false)} align="responsive">
              <MenuItem
                title="Flashcards"
                hint="Flip through the deck at your own pace."
                onClick={guard(() => navigate(`/decks/${deck.id}/review`))}
              />
              <MenuItem
                title="Quiz"
                hint="Answer multiple choice and get scored."
                onClick={quizGuard}
              />
            </Menu>
          </div>

          <div className="relative">
            <Button
              variant="quiet"
              onClick={() => setAddMenu((v) => !v)}
              aria-expanded={addMenu}
              aria-haspopup="true"
            >
              <span>Add cards</span>
              <span
                className="text-[10px] opacity-70 transition-transform duration-150"
                style={{ transform: addMenu ? 'rotate(180deg)' : 'none' }}
              >
                ▾
              </span>
            </Button>
            <Menu open={addMenu} onClose={() => setAddMenu(false)} width={240} align="responsive">
              <MenuItem
                title="Write your own"
                hint="Type a question and answer by hand."
                onClick={() => {
                  setAddMenu(false)
                  onNewCard(deck)
                }}
              />
              <MenuItem
                title="Import a file"
                hint="Read a document and split it into cards."
                onClick={() => {
                  setAddMenu(false)
                  onImport(deck)
                }}
              />
            </Menu>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-0.5">
        {stats.map((s) => (
          <div key={s.label} className="py-0.5 pr-5">
            <div
              className="mb-[7px] font-serif text-[26px] leading-none"
              style={s.accent ? { color: 'var(--color-accent)' } : undefined}
            >
              {s.value}
            </div>
            <div className="kicker !tracking-[0.12em]">{s.label}</div>
          </div>
        ))}
      </div>

      {hasCards ? (
        <ul className="flex flex-col gap-2.5">
          {deck.cards.map((card, i) => {
            const off = isSuspended(entryFor(deck, card))
            return (
            <li
              key={i}
              className={`relative flex flex-col gap-3.5 rounded-xl border bg-surface px-[22px] py-5 shadow-sh1 transition-[border-color,box-shadow] duration-200 hover:border-ink-3 hover:shadow-sh2 ${
                off ? 'border-dashed border-line-soft' : 'border-line'
              }`}
            >
              <div className="flex items-start gap-[18px]">
                <span className="w-[26px] shrink-0 pt-1 font-mono text-[11px] leading-[1.5] font-medium tracking-[0.06em] text-ink-3">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div
                  className={`min-w-0 flex-1 font-serif text-[19px] leading-[1.32] text-pretty ${
                    off ? 'text-ink-3' : ''
                  }`}
                >
                  {card.front}
                  {off && (
                    <span className="ml-2.5 rounded-[5px] border border-line px-1.5 py-[3px] align-middle font-mono text-[10px] leading-none font-medium tracking-[0.06em] whitespace-nowrap text-ink-3 uppercase">
                      Suspended
                    </span>
                  )}
                </div>
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setCardMenu(cardMenu === i ? null : i)}
                    title="Card options"
                    aria-label="Card options"
                    className={`grid h-7 w-7 cursor-pointer place-items-center rounded-[5px] border bg-transparent text-sm leading-none font-medium text-ink-3 transition-colors hover:border-ink-3 hover:text-ink ${
                      cardMenu === i ? 'border-ink-3 bg-raised' : 'border-line'
                    }`}
                  >
                    ⋮
                  </button>
                  <Menu open={cardMenu === i} onClose={() => setCardMenu(null)} width={210}>
                    <MenuItem
                      title="Edit card"
                      onClick={() => {
                        setCardMenu(null)
                        onEditCard(deck, i, card)
                      }}
                    />
                    <MenuItem
                      title={off ? 'Unsuspend card' : 'Suspend card'}
                      hint={
                        off
                          ? 'Study it again from where it left off.'
                          : 'Keep it and its history, but stop being asked.'
                      }
                      onClick={() => toggleSuspend(card, i)}
                    />
                    <MenuItem
                      title="Delete card"
                      danger
                      onClick={() => {
                        setCardMenu(null)
                        onDeleteCard(deck, i)
                      }}
                    />
                  </Menu>
                </div>
              </div>
              <div
                className={`border-t border-line-soft pt-3.5 text-sm leading-[1.55] text-pretty sm:pl-11 ${
                  off ? 'text-ink-3' : 'text-ink-2'
                }`}
              >
                {card.back}
              </div>
            </li>
            )
          })}
        </ul>
      ) : (
        <div className="flex flex-col items-center gap-3.5 rounded-[14px] border border-dashed border-line px-5 py-[70px] text-center">
          <div className="font-serif text-[24px] leading-[1.2]">No cards yet</div>
          <p className="m-0 max-w-[360px] text-sm text-ink-3 text-pretty">
            Write the first card by hand, or upload a reading and let the deck fill itself.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button size="sm" onClick={() => onNewCard(deck)}>
              Add a card
            </Button>
            <Button size="sm" variant="outline" onClick={() => onImport(deck)}>
              Upload material
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
