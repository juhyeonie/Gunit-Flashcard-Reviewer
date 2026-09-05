import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Button from '../components/Button.jsx'
import { useApp } from '../data/AppContext.jsx'

const KEY_HINTS = [
  { key: 'Space', label: 'flip', w: 'auto' },
  { key: '←', label: 'back', w: 22 },
  { key: '→', label: 'next', w: 22 },
  { key: 'Esc', label: 'exit', w: 'auto' },
]

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

export default function Review() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { decks, settings, say, recordSession } = useApp()
  const deck = decks.find((d) => d.id === id)

  const [order, setOrder] = useState(() => {
    const base = deck ? deck.cards.map((_, i) => i) : []
    return settings.shuffleFirst ? shuffleOrder(base) : base
  })
  const [idx, setIdx] = useState(0)
  const [flipped, setFlipped] = useState(false)

  const exit = useCallback(() => navigate(`/decks/${id}`), [navigate, id])

  const finish = useCallback(() => {
    recordSession(id, { known: order.length, total: order.length })
    navigate(`/decks/${id}/summary`, { state: { reviewed: order.length } })
  }, [recordSession, id, order.length, navigate])

  const next = useCallback(() => {
    if (idx >= order.length - 1) {
      finish()
      return
    }
    setIdx((i) => i + 1)
    setFlipped(false)
  }, [idx, order.length, finish])

  const prev = useCallback(() => {
    setIdx((i) => Math.max(0, i - 1))
    setFlipped(false)
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'Space') {
        e.preventDefault()
        setFlipped((f) => !f)
      } else if (e.key === 'ArrowRight') next()
      else if (e.key === 'ArrowLeft') prev()
      else if (e.key === 'Escape') exit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, prev, exit])

  if (!deck || !order.length) {
    return (
      <div className="mx-auto max-w-xl py-20 text-center">
        <div className="font-serif text-2xl">
          {deck ? 'This deck has no cards to review yet.' : 'That deck no longer exists.'}
        </div>
        <Button as={Link} to="/decks" className="mt-5">
          All decks
        </Button>
      </div>
    )
  }

  const card = deck.cards[order[idx]]
  const scale = ((idx + (flipped ? 1 : 0)) / order.length).toFixed(3)

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
              const next = shuffleOrder(order)
              setOrder(next)
              setIdx(0)
              setFlipped(false)
              say(`Shuffled ${next.length} cards`)
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
          <div
            onClick={() => setFlipped((f) => !f)}
            className="relative min-h-[320px] w-full cursor-pointer transition-transform duration-[340ms] ease-[cubic-bezier(0.77,0,0.175,1)] [transform-style:preserve-3d] sm:min-h-[380px]"
            style={{ transform: flipped ? 'rotateY(180deg)' : 'none' }}
          >
            <div className={`${face} border border-line`}>
              <div className="kicker">Question</div>
              <div className="grid flex-1 place-items-center py-[22px]">
                <p className="m-0 text-center font-serif text-[24px] leading-[1.28] tracking-[-0.01em] text-pretty sm:text-[34px]">
                  {card.front}
                </p>
              </div>
              <div className="kicker text-center !tracking-[0.1em]">Click card or press space</div>
            </div>

            <div className={`${face} border border-accent-line [transform:rotateY(180deg)]`}>
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

        {!flipped && (
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
          {KEY_HINTS.map((k) => (
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
