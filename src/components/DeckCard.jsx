import { Link } from 'react-router-dom'
import { accentOf, badgeFor } from '../data/seed.js'
import { dueCount } from '../data/scheduler.js'
import { EditButton } from './Icons.jsx'
import ProgressBar from './ProgressBar.jsx'

/**
 * The prototype draws this card twice — on the dashboard (accent strip as the
 * card's first row, stats stacked) and in the library (absolute strip, stats on
 * one line). Everything else matches, so the two share a component.
 *
 * The whole card is clickable, but only the title is a real link: its ::after
 * is stretched across the card. That leaves one unambiguous target for keyboard
 * and screen-reader users, rather than a clickable container with a second
 * button nested inside it. The edit button is lifted above the stretched layer
 * so it stays independently clickable.
 */
export default function DeckCard({ deck, variant = 'library', onEdit }) {
  const accent = accentOf(deck)
  const badge = badgeFor(deck)
  const pct = Math.round(deck.progress * 100)
  const isDashboard = variant === 'dashboard'
  const due = dueCount(deck)

  // When cards are waiting, the card says so instead of when it was last
  // opened — that is the more useful of the two.
  const status = due
    ? { text: `${due} due`, color: 'var(--color-accent)' }
    : { text: deck.studied, color: undefined }

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
        {/* Sits above the title's stretched hit area so it stays clickable. */}
        <EditButton
          className="relative z-10"
          aria-label={`Edit ${deck.title}`}
          onClick={() => onEdit?.(deck)}
        />
      </span>
    </div>
  )

  const meter = <ProgressBar value={pct} accent={accent} />

  const title = (
    <h3
      className={`m-0 font-serif font-normal text-pretty ${
        isDashboard ? 'text-[21px] leading-[1.22]' : 'text-[23px] leading-[1.2]'
      }`}
    >
      <Link
        to={`/decks/${deck.id}`}
        className="cursor-pointer text-inherit no-underline after:absolute after:inset-0 after:content-['']"
      >
        {deck.title}
      </Link>
    </h3>
  )

  const cardCount = deck.cards.length ? `${deck.cards.length} cards` : 'No cards'

  return (
    <article
      className={`relative flex flex-col overflow-hidden rounded-[14px] border border-line bg-surface text-left text-ink transition-[border-color,box-shadow,background-color] duration-200 hover:border-ink-3 hover:bg-raised hover:shadow-sh2 has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-accent ${
        isDashboard ? 'min-h-[196px]' : 'gap-4 p-[22px] shadow-sh1'
      }`}
    >
      {isDashboard ? (
        <>
          <div className="h-[3px] w-full shrink-0" style={{ background: accent }} />
          <div className="flex flex-1 flex-col gap-3.5 p-5">
            {header}
            {title}
            <div className="mt-auto flex flex-col gap-3">
              <div className="font-mono text-[11px] leading-none font-medium tracking-[0.04em] text-ink-3">
                {cardCount}
              </div>
              {meter}
              <div className="flex items-center justify-between gap-2.5 font-mono text-[11px] leading-none font-medium tracking-[0.04em] text-ink-3">
                <span style={{ color: status.color }}>{status.text}</span>
                <span style={{ color: accent }}>{pct}% known</span>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="absolute top-0 right-0 left-0 h-[3px]" style={{ background: accent }} />
          <div className="pt-0.5">{header}</div>
          {title}
          <div className="flex flex-col gap-[9px]">
            <div className="flex justify-between font-mono text-[10px] leading-none font-medium tracking-[0.06em] text-ink-3">
              <span>{cardCount}</span>
              <span style={{ color: status.color }}>{status.text}</span>
            </div>
            {meter}
          </div>
        </>
      )}
    </article>
  )
}
