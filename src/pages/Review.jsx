import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Button from '../components/Button.jsx'
import { useApp } from '../data/AppContext.jsx'
import { buildQueue, entryFor, formatInterval, preview } from '../data/scheduler.js'

const NAV_HINTS = [
  { key: 'Space', label: 'flip', w: 'auto' },
  { key: '←', label: 'back', w: 22 },
  { key: '→', label: 'next', w: 22 },
  { key: 'Esc', label: 'exit', w: 'auto' },
]

const RATE_HINTS = [
  { key: '1', label: 'again', w: 22 },
  { key: '2', label: 'good', w: 22 },
  { key: '3', label: 'easy', w: 22 },
  { key: 'Esc', label: 'exit', w: 'auto' },
]

// Tones lifted from the prototype's `ratings` table.
const RATINGS = [
  { key: 'again', label: 'Again', className: 'border-err text-err hover:bg-err-soft' },
  { key: 'good', label: 'Good', className: 'border-line text-ink hover:bg-raised' },
  { key: 'easy', label: 'Easy', className: 'border-ok-line bg-ok-soft text-ok hover:bg-ok-soft' },
]

const AUTO_REVEAL_MS = 4000

const shuffleOrder = (order) => {
  const next = [...order]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const swap = next[i]
    next[i] = next[j]
    next[j] = swap
  }
  return next
}

const nextDueLabel = (deck, now) => {
  const upcoming = deck.cards
    .map((c) => entryFor(deck, c)?.due)
    .filter((due) => typeof due === 'number' && due > now)
  if (!upcoming.length) return null
  return formatInterval((Math.min(...upcoming) - now) / 60_000)
}

export default function Review() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { decks, settings, say, recordGrades, recordSession } = useApp()
  const deck = decks.find((d) => d.id === id)

  // Reviewing ahead pulls in cards that aren't due yet.
  const [ahead, setAhead] = useState(false)

  /**
   * The queue is built once per session (or when the user opts to review
   * ahead): due cards soonest-first, then new ones, capped at the
   * "cards per session" preference.
   */
  const [order, setOrder] = useState([])
  const [idx, setIdx] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [grades, setGrades] = useState({})
  // Read once per mount rather than on every render: calling Date.now() during
  // render makes output depend on when React happens to re-run the component.
  const [mountedAt] = useState(() => Date.now())
  const revealTimer = useRef(null)
  const built = useRef(false)
  // Mirrors `grades` for the unmount handler, which cannot read state set after
  // its own effect was created.
  const gradesRef = useRef({})

  useEffect(() => {
    if (!deck || built.current) return
    built.current = true
    const queue = buildQueue(deck, { limit: settings.cardsPer, all: ahead })
    setOrder(settings.shuffleFirst ? shuffleOrder(queue) : queue)
  }, [deck, settings.cardsPer, settings.shuffleFirst, ahead])

  const startAhead = () => {
    if (!deck) return
    const queue = buildQueue(deck, { limit: settings.cardsPer, all: true })
    setAhead(true)
    setOrder(settings.shuffleFirst ? shuffleOrder(queue) : queue)
    setIdx(0)
    setFlipped(false)
  }

  const exit = useCallback(() => navigate(`/decks/${id}`), [navigate, id])

  /**
   * Log the session on the way out, whichever way that happens — finishing the
   * queue or leaving part-way. Recording here rather than at "finish" means
   * time spent on an abandoned session still counts toward the streak.
   */
  useEffect(() => {
    return () => {
      const reviewed = Object.keys(gradesRef.current).length
      if (!reviewed) return
      recordSession({ deckId: id, reviewed, seconds: (Date.now() - mountedAt) / 1000 })
    }
  }, [id, mountedAt, recordSession])

  /** Grades are already saved by the time we get here; this only reports. */
  const finish = useCallback(
    (tally) => {
      const values = Object.values(tally)
      navigate(`/decks/${id}/summary`, {
        state: {
          reviewed: values.length,
          known: values.filter((v) => v !== 'again').length,
          again: values.filter((v) => v === 'again').length,
          seconds: (Date.now() - mountedAt) / 1000,
        },
        replace: true,
      })
    },
    [id, navigate, mountedAt],
  )

  const next = useCallback(() => {
    if (idx >= order.length - 1) {
      finish(grades)
      return
    }
    setIdx((i) => i + 1)
    setFlipped(false)
  }, [idx, order.length, finish, grades])

  const prev = useCallback(() => {
    setIdx((i) => Math.max(0, i - 1))
    setFlipped(false)
  }, [])

  const card = deck?.cards[order[idx]]

  /** Intervals each grade would produce for the card on screen. */
  const previews = useMemo(() => {
    if (!deck || !card) return {}
    const entry = entryFor(deck, card)
    return Object.fromEntries(RATINGS.map((r) => [r.key, preview(entry, r.key)]))
  }, [deck, card])

  /**
   * Grades the current card, then moves on. The rating drives both the deck's
   * progress and when the card comes back.
   *
   * Each grade is committed as it is given rather than batched to the end of
   * the session, so leaving part-way through keeps the work already done.
   */
  const rate = useCallback(
    (level) => {
      if (!card) return
      recordGrades(id, { [card.id]: level })
      const merged = { ...grades, [card.id]: level }
      gradesRef.current = merged
      setGrades(merged)
      say(`Scheduled — due in ${formatInterval(previews[level])}`)
      if (idx >= order.length - 1) {
        finish(merged)
        return
      }
      setIdx((i) => i + 1)
      setFlipped(false)
    },
    [card, recordGrades, id, grades, say, previews, idx, order.length, finish],
  )

  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'Space') {
        e.preventDefault()
        setFlipped((f) => !f)
      } else if (e.key === 'ArrowRight') next()
      else if (e.key === 'ArrowLeft') prev()
      else if (e.key === 'Escape') exit()
      else if (flipped && ['1', '2', '3'].includes(e.key)) {
        rate(RATINGS[Number(e.key) - 1].key)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, prev, exit, rate, flipped])

  // "Reveal answer automatically": flip the face-up card after four seconds.
  useEffect(() => {
    clearTimeout(revealTimer.current)
    if (!settings.autoReveal || flipped) return undefined
    revealTimer.current = setTimeout(() => setFlipped(true), AUTO_REVEAL_MS)
    return () => clearTimeout(revealTimer.current)
  }, [settings.autoReveal, flipped, idx])

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

  if (!order.length) {
    const waiting = nextDueLabel(deck, mountedAt)
    return (
      <div className="rise-in mx-auto flex max-w-[520px] flex-col items-center gap-4 py-24 text-center">
        <div className="kicker text-accent">{deck.cards.length ? 'All caught up' : 'Empty deck'}</div>
        <h1 className="m-0 font-serif text-[34px] leading-[1.1] tracking-[-0.02em]">
          {deck.cards.length ? 'Nothing is due right now' : 'No cards yet'}
        </h1>
        <p className="m-0 max-w-[380px] text-[15px] text-ink-2 text-pretty">
          {deck.cards.length
            ? waiting
              ? `The next card in ${deck.title} comes due in ${waiting}. You can review ahead, but spacing works better if you wait.`
              : `Every card in ${deck.title} has been scheduled.`
            : 'Add a card or import a file before studying this deck.'}
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          {deck.cards.length > 0 && (
            <Button onClick={startAhead}>Review ahead</Button>
          )}
          <Button as={Link} to={`/decks/${deck.id}`} variant="outline">
            Back to deck
          </Button>
        </div>
      </div>
    )
  }

  const scale = ((idx + (flipped ? 1 : 0)) / order.length).toFixed(3)
  const hints = flipped ? RATE_HINTS : NAV_HINTS

  const face =
    'absolute inset-0 flex flex-col rounded-[14px] bg-surface p-[22px] shadow-sh2 sm:p-[34px] [backface-visibility:hidden]'

  return (
    <div className="rise-in flex min-h-[calc(100vh-160px)] flex-col gap-[18px] sm:gap-[26px]">
      <header className="flex items-center justify-between gap-4">
        <Button variant="quiet" size="sm" onClick={exit}>
          ← Exit
        </Button>
        <div className="min-w-0 text-center">
          <div className="truncate font-serif text-[18px] leading-[1.2]">{deck.title}</div>
          {ahead && <div className="kicker mt-1">Reviewing ahead</div>}
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-medium tracking-[0.08em] text-ink-3">
            {idx + 1} / {order.length}
          </span>
          <Button
            variant="quiet"
            size="sm"
            title="Shuffle"
            aria-label="Shuffle"
            onClick={() => {
              const shuffledOrder = shuffleOrder(order)
              setOrder(shuffledOrder)
              setIdx(0)
              setFlipped(false)
              say(`Shuffled ${shuffledOrder.length} cards`)
            }}
          >
            ⇄
          </Button>
        </div>
      </header>

      <div className="h-0.5 overflow-hidden rounded-sm bg-line-soft">
        <div
          className="h-full w-full origin-left bg-accent transition-transform duration-[240ms] ease-[cubic-bezier(0.23,1,0.32,1)]"
          style={{ transform: `scaleX(${scale})` }}
        />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-[26px] py-2.5 sm:py-5">
        <div className="w-full max-w-[720px] [perspective:2000px]">
          {/*
            Flipping by clicking the card is a pointer convenience. The
            keyboard path is the global Space handler above plus the visible
            "Reveal answer" button, and the card face says so, so this element
            stays out of the tab order rather than becoming a second control.

            aria-live carries the flip and the move to the next card, both of
            which are otherwise a silent change of text.
          */}
          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
          <div
            onClick={() => setFlipped((f) => !f)}
            aria-live="polite"
            className="relative min-h-[320px] w-full cursor-pointer transition-transform duration-[340ms] ease-[cubic-bezier(0.77,0,0.175,1)] [transform-style:preserve-3d] sm:min-h-[380px]"
            style={{ transform: flipped ? 'rotateY(180deg)' : 'none' }}
          >
            {/*
              backface-visibility hides pixels, not semantics: without this the
              answer sat in the accessibility tree beside the question and was
              read out with it, which defeats the point of a flashcard.
            */}
            <div className={`${face} border border-line`} aria-hidden={flipped}>
              <div className="kicker">Question</div>
              <div className="grid flex-1 place-items-center py-[22px]">
                <p className="m-0 text-center font-serif text-[24px] leading-[1.28] tracking-[-0.01em] text-pretty sm:text-[34px]">
                  {card.front}
                </p>
              </div>
              <div className="kicker text-center !tracking-[0.1em]">Click card or press space</div>
            </div>

            <div
              className={`${face} border border-accent-line [transform:rotateY(180deg)]`}
              aria-hidden={!flipped}
            >
              <div className="kicker text-accent">Answer</div>
              <div className="grid flex-1 place-items-center py-[22px]">
                <p className="m-0 text-center font-serif text-[18px] leading-[1.42] text-pretty sm:text-[22px]">
                  {card.back}
                </p>
              </div>
              <div className="kicker text-center !tracking-[0.1em]">
                Card {idx + 1} of {order.length}
              </div>
            </div>
          </div>
        </div>

        {flipped ? (
          <div className="flex flex-col items-center gap-2.5">
            <span className="kicker">How well did you know it?</span>
            <div className="flex flex-wrap justify-center gap-2">
              {RATINGS.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => rate(r.key)}
                  className={`flex min-w-[104px] cursor-pointer flex-col items-center gap-1.5 rounded-lg border bg-transparent px-[22px] py-2.5 transition-colors active:scale-[0.975] ${r.className}`}
                >
                  <span className="text-sm leading-none font-semibold">{r.label}</span>
                  {/* The real next interval for this card, not a fixed label. */}
                  <span className="font-mono text-[10px] leading-none tracking-[0.06em] opacity-70">
                    {formatInterval(previews[r.key])}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <Button className="px-[26px] py-[13px]" onClick={() => setFlipped(true)}>
            Reveal answer
          </Button>
        )}
      </div>

      <footer className="flex items-center justify-between gap-3 border-t border-line-soft pt-4">
        <Button variant="outline" size="sm" onClick={prev} disabled={idx === 0}>
          ← Previous
        </Button>
        <div className="hidden flex-wrap items-center justify-center gap-3.5 sm:flex">
          {hints.map((k) => (
            <div key={k.key} className="flex items-center gap-[7px]">
              <kbd
                style={{ minWidth: k.w }}
                className="inline-grid h-[22px] place-items-center rounded border border-b-2 border-line bg-surface px-[7px] font-mono text-[11px] leading-none font-medium text-ink-2 shadow-sh1"
              >
                {k.key}
              </kbd>
              <span className="kicker !tracking-[0.1em]">{k.label}</span>
            </div>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={next}>
          {idx >= order.length - 1 ? 'Finish →' : 'Next →'}
        </Button>
      </footer>
    </div>
  )
}
