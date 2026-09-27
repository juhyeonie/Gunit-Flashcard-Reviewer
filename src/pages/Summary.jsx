import { useLocation, useNavigate, useParams } from 'react-router-dom'
import Button from '../components/Button.jsx'
import ProgressBar from '../components/ProgressBar.jsx'
import { useApp } from '../data/useApp.js'
import { streak } from '../data/activity.js'
import useDocumentTitle from '../hooks/useDocumentTitle.js'
import MissingDeck from '../components/MissingDeck.jsx'
import Mascot from '../components/Mascot.jsx'
import useT from '../i18n/useT.js'

export default function Summary() {
  const { id } = useParams()
  const { state } = useLocation()
  const navigate = useNavigate()
  const { decks, sessions, deckPath } = useApp()
  const deck = decks.find((d) => d.id === id)
  const { t } = useT()
  // The route announcer reads this out on arrival, so it has to be true of the
  // page that actually rendered.
  useDocumentTitle(typeof state?.reviewed === 'number' ? t('summary.complete') : t('summary.nothing'))

  if (!deck) return <MissingDeck />

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
        { label: t('summary.reviewed'), value: String(session.reviewed), color: 'var(--color-ink)' },
        { label: t('summary.known'), value: String(session.known), color: 'var(--color-ok)' },
        { label: t('summary.again'), value: String(session.again), color: 'var(--color-err)' },
        { label: t('summary.streak'), value: String(days), color: 'var(--color-ink)' },
      ]
    : // Both of these are the deck's standing, and true either way.
      [
        { label: t('summary.cards'), value: String(deck.cards.length), color: 'var(--color-ink)' },
        { label: t('summary.streak'), value: String(days), color: 'var(--color-ink)' },
      ]

  return (
    <div className="rise-in mx-auto flex max-w-[660px] flex-col gap-8">
      <div className="flex flex-col items-center text-center">
        {session && <Mascot pose="celebrate" size={112} className="mb-5" />}
        <div className="kicker mb-4 text-accent">
          {session ? t('summary.complete') : t('summary.nothing')}
        </div>
        <h1 className="m-0 mb-3 font-serif fs-34 leading-[1.06] tracking-[-0.02em] sm:fs-46">
          {session
            ? t('summary.cardsReviewed', { count: session.reviewed })
            : deck.title}
        </h1>
        <p className="m-0 fs-16 text-ink-2 text-pretty">
          {session
            ? t('summary.sessionOn', { title: deck.title, minutes: t('activity.minutes', { count: minutes }) })
            : t('summary.noSession')}
        </p>
      </div>

      <div className="grid grid-cols-2 border-t border-ink border-b-line sm:grid-cols-[repeat(auto-fit,minmax(130px,1fr))]">
        {stats.map((s) => (
          <div key={s.label} className="border-r border-line-soft p-[18px] text-center">
            <div className="mb-2 font-serif fs-32 leading-none" style={{ color: s.color }}>
              {s.value}
            </div>
            <div className="kicker !tracking-[0.12em]">{s.label}</div>
          </div>
        ))}
      </div>

      <div>
        <div className="mb-2.5 flex justify-between font-mono fs-11 leading-none font-medium tracking-[0.08em] text-ink-3 uppercase">
          <span>{t('summary.progress')}</span>
          <span>{pct}%</span>
        </div>
        <ProgressBar
          value={pct}
          height={5}
          track="var(--color-line-soft)"
          label={t('summary.progress')}
        />
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={() => navigate(deckPath(deck.id, '/review'))}>{t('summary.reviewAgain')}</Button>
        <Button variant="outline" onClick={() => navigate(deckPath(deck.id, '/quiz'))}>
          {t('summary.takeQuiz')}
        </Button>
        <Button variant="ghost" onClick={() => navigate('/')}>
          {t('errorBoundary.home')}
        </Button>
      </div>
    </div>
  )
}
