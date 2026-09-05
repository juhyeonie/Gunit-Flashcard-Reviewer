import { useLocation, useNavigate, useParams, Link } from 'react-router-dom'
import Button from '../components/Button.jsx'
import ProgressBar from '../components/ProgressBar.jsx'
import { useApp } from '../data/AppContext.jsx'
import { streak } from '../data/activity.js'

export default function Summary() {
  const { id } = useParams()
  const { state } = useLocation()
  const navigate = useNavigate()
  const { decks, sessions } = useApp()
  const deck = decks.find((d) => d.id === id)

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

  // Real counts from the session that just ended, not a figure back-derived
  // from deck progress. A direct visit with no session state shows zeroes
  // rather than inventing a result.
  const reviewed = state?.reviewed ?? 0
  const known = state?.known ?? 0
  const again = state?.again ?? 0
  const pct = Math.round(deck.progress * 100)
  // Real elapsed time from the session that just ended, not a guess scaled off
  // the card count.
  const minutes = Math.max(1, Math.round((state?.seconds ?? 0) / 60))
  const days = streak(sessions)

  const stats = [
    { label: 'Reviewed', value: String(reviewed), color: 'var(--color-ink)' },
    { label: 'Known', value: String(known), color: 'var(--color-ok)' },
    { label: 'Again', value: String(again), color: 'var(--color-err)' },
    { label: 'Streak', value: String(days), color: 'var(--color-ink)' },
  ]

  return (
    <div className="rise-in mx-auto flex max-w-[660px] flex-col gap-8">
      <div className="text-center">
        <div className="kicker mb-4 text-accent">Session complete</div>
        <h1 className="m-0 mb-3 font-serif text-[34px] leading-[1.06] tracking-[-0.02em] sm:text-[46px]">
          {reviewed} {reviewed === 1 ? 'card' : 'cards'} reviewed
        </h1>
        <p className="m-0 text-[16px] text-ink-2 text-pretty">
          Session on {deck.title} · {minutes} {minutes === 1 ? 'minute' : 'minutes'}
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
        <ProgressBar value={pct} height={5} track="var(--color-line-soft)" />
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
