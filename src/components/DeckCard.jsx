import { useNavigate } from 'react-router-dom'
import { accentOf, badgeFor } from '../data/seed.js'
import { EditButton } from './Icons.jsx'
import ProgressBar from './ProgressBar.jsx'

/**
 * The prototype draws this card twice — on the dashboard (accent strip as the
 * card's first row, stats stacked) and in the library (absolute strip, stats on
 * one line). Everything else matches, so the two share a component.
 */
export default function DeckCard({ deck, variant = 'library', onEdit }) {
  const navigate = useNavigate()
  const accent = accentOf(deck)
  const badge = badgeFor(deck)
  const pct = Math.round(deck.progress * 100)
  const isDashboard = variant === 'dashboard'

  const header = (
    <div className="flex items-center justify-between gap-2.5">
      <span className="flex min-w-0 items-center gap-2">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: accent }} />
        <span className="kicker !tracking-[0.12em] truncate">{deck.subject}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        <span
          className="rounded-[5px] border px-2 py-[5px] text-[10px] leading-none font-medium tracking-[0.06em] whitespace-nowrap uppercase"
          style={{ background: badge.bg, color: badge.fg, borderColor: badge.line }}
        >
          {badge.label}
        </span>
        <EditButton
          onClick={(e) => {
            e.stopPropagation()
            onEdit?.(deck)
          }}
        />
      </span>
    </div>
  )

  const meter = <ProgressBar value={pct} accent={accent} />

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/decks/${deck.id}`)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          navigate(`/decks/${deck.id}`)
        }
      }}
      className={`relative flex cursor-pointer flex-col overflow-hidden rounded-[14px] border border-line bg-surface text-left text-ink transition-[border-color,box-shadow,background-color] duration-200 hover:border-ink-3 hover:bg-raised hover:shadow-sh2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
        isDashboard ? 'min-h-[196px]' : 'gap-4 p-[22px] shadow-sh1'
      }`}
    >
      {isDashboard ? (
        <>
          <span className="block h-[3px] w-full" style={{ background: accent }} />
          <span className="flex flex-1 flex-col gap-3.5 p-5">
            {header}
            <span className="font-serif text-[21px] leading-[1.22] text-pretty">{deck.title}</span>
            <span className="mt-auto flex flex-col gap-3">
              <span className="font-mono text-[11px] leading-none font-medium tracking-[0.04em] text-ink-3">
                {deck.cards.length ? `${deck.cards.length} cards` : 'No cards'}
              </span>
              {meter}
              <span className="flex items-center justify-between gap-2.5 font-mono text-[11px] leading-none font-medium tracking-[0.04em] text-ink-3">
                <span>{deck.studied}</span>
                <span style={{ color: accent }}>{pct}% known</span>
              </span>
            </span>
          </span>
        </>
      ) : (
        <>
          <span className="absolute top-0 right-0 left-0 h-[3px]" style={{ background: accent }} />
          <div className="pt-0.5">{header}</div>
          <div className="font-serif text-[23px] leading-[1.2] text-pretty">{deck.title}</div>
          <div className="flex flex-col gap-[9px]">
            <div className="flex justify-between font-mono text-[10px] leading-none font-medium tracking-[0.06em] text-ink-3">
              <span>{deck.cards.length ? `${deck.cards.length} cards` : 'No cards'}</span>
              <span>{deck.studied}</span>
            </div>
            {meter}
          </div>
        </>
      )}
    </div>
  )
}
