import { useLocation, useNavigate, useParams, Link } from 'react-router-dom'
import Button from '../components/Button.jsx'
import ProgressBar from '../components/ProgressBar.jsx'
import { useApp } from '../data/AppContext.jsx'
import { streak } from '../data/activity.js'
import useDocumentTitle from '../hooks/useDocumentTitle.js'

export default function Summary() {
  const { id } = useParams()
  const { state } = useLocation()
  const navigate = useNavigate()
  const { decks, sessions } = useApp()
  const deck = decks.find((d) => d.id === id)
  // The route announcer reads this out on arrival, so it has to be true of the
  // page that actually rendered.
  useDocumentTitle(typeof state?.reviewed === 'number' ? 'Session complete' : 'Nothing to report')

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

  /*
   * The counts arrive with the navigation, not from the deck, because they
   * describe one session rather than the deck's standing. A reload keeps them,
   * since router state rides in the history entry — but arriving here any
   * other way does not: a typed URL, a bookmark, a link, a new tab.
   *
   * When that happens it says so. Reporting zeroes would read as a session in
   * which nothing was recalled, and the minute floor below would invent a
   * minute spent on a session that never took place.
   */
  const session = typeof state?.reviewed === 'number' ? state : null

  const pct = Math.round(deck.progress * 100)
  const days = streak(sessions)
  // Real elapsed time from the session that just ended, not a guess scaled off
  // the card count. Floored at a minute so a quick session is not "0 minutes".
  const minutes = session ? Math.max(1, Math.round(session.seconds / 60)) : 0

  const stats = session
    ? [
        { label: 'Reviewed', value: String(session.reviewed), color: 'var(--color-ink)' },
        { label: 'Known', value: String(session.known), color: 'var(--color-ok)' },
        { label: 'Again', value: String(session.again), color: 'var(--color-err)' },
        { label: 'Streak', value: String(days), color: 'var(--color-ink)' },
      ]
    : // Both of these are the deck's standing, and true either way.
      [
        { label: 'Cards', value: String(deck.cards.length), color: 'var(--color-ink)' },
        { label: 'Streak', value: String(days), color: 'var(--color-ink)' },
      ]

  return (
    <div className="rise-in mx-auto flex max-w-[660px] flex-col gap-8">
      <div className="text-center">
        <div className="kicker mb-4 text-accent">
          {session ? 'Session complete' : 'Nothing to report'}
        </div>
        <h1 className="m-0 mb-3 font-serif text-[34px] leading-[1.06] tracking-[-0.02em] sm:text-[46px]">
          {session
            ? `${session.reviewed} ${session.reviewed === 1 ? 'card' : 'cards'} reviewed`
            : deck.title}
        </h1>
        <p className="m-0 text-[16px] text-ink-2 text-pretty">
          {session
            ? `Session on ${deck.title} · ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`
            : 'This page reports a session as it ends. Opened on its own — from a link, or a new tab — there is no session behind it. Whatever you have studied is already in the deck.'}
        </p>
      </div>

      <div className="grid grid-cols-2 border-t border-ink border-b-line sm:grid-cols-[repeat(auto-fit,minmax(130px,1fr))]">
        {stats.map((s) => (
          <div key={s.label} className="border-r border-line-soft p-[18px] text-center">
            <div className="mb-2 font-serif text-[32px] leading-none" style={{ color: s.color }}>
              {s.value}
            </div>
            <div className="kicker !tracking-[0.12em]">{s.label}</div>
          </div>
        ))}
      </div>

      <div>
        <div className="mb-2.5 flex justify-between font-mono text-[11px] leading-none font-medium tracking-[0.08em] text-ink-3 uppercase">
          <span>Deck progress</span>
          <span>{pct}%</span>
        </div>
        <ProgressBar
          value={pct}
          height={5}
          track="var(--color-line-soft)"
          label="Deck progress"
        />
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={() => navigate(`/decks/${deck.id}/review`)}>Review again</Button>
        <Button variant="outline" onClick={() => navigate(`/decks/${deck.id}/quiz`)}>
          Take the quiz
        </Button>
        <Button variant="ghost" onClick={() => navigate('/')}>
          Back to dashboard
        </Button>
      </div>
    </div>
  )
}
