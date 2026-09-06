import { Link, useNavigate } from 'react-router-dom'
import Button from '../components/Button.jsx'
import DeckCard from '../components/DeckCard.jsx'
import ProgressBar from '../components/ProgressBar.jsx'
import { useApp } from '../data/AppContext.jsx'
import { accentOf } from '../data/seed.js'
import { dueCount } from '../data/scheduler.js'
import { canQuiz } from '../data/quiz.js'
import useDocumentTitle from '../hooks/useDocumentTitle.js'
import { formatRelative, lastSevenDays, minutesToday, streak } from '../data/activity.js'

/** Copy for the streak panel, which has to read sensibly at 0, 1 and many. */
const streakNote = (days, minutesDone, goal) => {
  if (!days) return 'No streak yet. One session today starts it.'
  const left = Math.max(0, goal - minutesDone)
  const run = days === 1 ? 'One day down' : `${days} days without a gap`
  return left > 0
    ? `${run}. ${left} more ${left === 1 ? 'minute' : 'minutes'} today keeps it alive.`
    : `${run}, and today's goal is already met.`
}

const greeting = () => {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

const today = () =>
  new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

function Panel({ className = '', children }) {
  return (
    <section
      className={`relative flex flex-col overflow-hidden rounded-[14px] border border-line bg-surface ${className}`}
    >
      {children}
    </section>
  )
}

export default function Dashboard({ onNewDeck, onEditDeck, onImport }) {
  const { decks, settings, sessions } = useApp()
  useDocumentTitle(null)
  const navigate = useNavigate()

  // Prefer a deck with cards waiting; fall back to any deck with content.
  const resume =
    decks.find((d) => d.cards.length && dueCount(d) > 0) ??
    decks.find((d) => d.cards.length) ??
    decks[0]
  const totalCards = decks.reduce((n, d) => n + d.cards.length, 0)
  const totalDue = decks.reduce((n, d) => n + dueCount(d), 0)
  const resumeDue = resume ? dueCount(resume) : 0

  // Everything below comes from the session log rather than fixed arrays.
  const week = lastSevenDays(sessions)
  const days = streak(sessions)
  const doneToday = minutesToday(sessions)
  const goal = settings.goalMinutes
  const goalPct = goal ? Math.min(100, Math.round((doneToday / goal) * 100)) : 0
  const peak = Math.max(1, ...week.map((d) => d.minutes))
  const firstName = settings.name.split(' ')[0]

  const stats = [
    { label: 'Decks', value: String(decks.length), unit: 'in library' },
    { label: 'Cards', value: String(totalCards), unit: 'total' },
    { label: 'Due now', value: String(totalDue), unit: 'to review' },
  ]

  return (
    <div className="rise-in mx-auto flex max-w-[1140px] flex-col gap-7">
      <header className="flex flex-wrap items-end justify-between gap-6 pb-1">
        <div className="max-w-[600px]">
          <div className="kicker mb-4">{today()}</div>
          <h1 className="m-0 mb-3 font-serif text-[34px] leading-[1.04] tracking-[-0.02em] sm:text-[46px]">
            {greeting()}, {firstName}.
          </h1>
          {resume && (
            <p className="m-0 text-[16px] leading-[1.6] text-ink-2 text-pretty">
              You last left off in <em className="font-serif text-[17px]">{resume.title}</em>.
              Twelve minutes should finish the deck.
            </p>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-12">
        {resume && (
          <Panel className="min-h-[230px] gap-[22px] p-7 lg:col-span-7">
            <span
              className="absolute top-0 right-0 left-0 h-0.5 opacity-90"
              style={{ background: accentOf(resume) }}
            />
            <div className="kicker">Continue reviewing</div>
            <div>
              <div className="mb-2 font-serif text-[28px] leading-[1.12] tracking-[-0.015em] text-pretty sm:text-[32px]">
                {resume.title}
              </div>
              <div className="text-[13.5px] text-ink-3">
                {Math.round(resume.progress * resume.cards.length)} of {resume.cards.length} cards
                known ·{' '}
                {resumeDue
                  ? `${resumeDue} due now`
                  : `last studied ${formatRelative(resume.studiedAt).toLowerCase()}`}
              </div>
            </div>
            <div className="mt-auto flex flex-col gap-[18px]">
              <div className="flex flex-col gap-[9px]">
                <div className="flex justify-between font-mono text-[10px] leading-none font-medium tracking-[0.08em] text-ink-3 uppercase">
                  <span>Deck progress</span>
                  <span>{Math.round(resume.progress * 100)}%</span>
                </div>
                <ProgressBar
                  value={Math.round(resume.progress * 100)}
                  height={4}
                  accent={accentOf(resume)}
                  label={`${resume.title} deck progress`}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => navigate(`/decks/${resume.id}/review`)}>Resume review</Button>
                <Button
                  variant="outline"
                  onClick={() => navigate(`/decks/${resume.id}/quiz`)}
                  disabled={!canQuiz(resume)}
                  title={canQuiz(resume) ? undefined : 'This deck is too small to quiz'}
                >
                  Quiz me
                </Button>
              </div>
            </div>
          </Panel>
        )}

        <Panel className="min-h-[230px] gap-[22px] p-7 lg:col-span-5">
          <div className="flex items-center justify-between gap-3">
            <span className="kicker">Study streak</span>
            <span className="kicker !tracking-[0.08em]">{settings.goalMinutes} min daily</span>
          </div>
          <div>
            <div className="mb-2 flex items-baseline gap-[9px]">
              <span className="font-serif text-[48px] leading-none tracking-[-0.02em]">{days}</span>
              <span className="text-sm text-ink-3">
                {days === 1 ? 'day running' : 'days running'}
              </span>
            </div>
            <div className="text-[13.5px] leading-[1.5] text-ink-2 text-pretty">
              {streakNote(days, doneToday, goal)}
            </div>
          </div>
          <div className="mt-auto flex flex-col gap-[18px]">
            <div className="flex flex-col gap-[9px]">
              <div className="flex justify-between font-mono text-[10px] leading-none font-medium tracking-[0.08em] text-ink-3 uppercase">
                <span>Today&rsquo;s goal</span>
                <span>
                  {doneToday} / {goal} min
                </span>
              </div>
              <ProgressBar value={goalPct} height={4} label="Today's study goal" />
            </div>
            <div className="flex gap-1.5">
              {week.map((d) => (
                <div key={d.key} className="flex flex-1 flex-col items-center gap-2">
                  <div
                    title={`${d.minutes} min`}
                    className={`h-[26px] w-full rounded-[5px] border ${
                      d.active ? 'border-accent-line bg-accent-soft' : 'border-line bg-transparent'
                    }`}
                  />
                  <span
                    className={`font-mono text-[10px] leading-none font-medium tracking-[0.06em] ${
                      d.active ? 'text-accent' : 'text-ink-3'
                    }`}
                  >
                    {d.day}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <Panel className="gap-5 p-6 lg:col-span-12">
          <div className="flex items-baseline justify-between gap-3">
            <span className="kicker">Minutes studied</span>
            <span className="kicker !tracking-[0.08em] normal-case">this week</span>
          </div>
          <div className="flex h-[108px] items-end gap-[7px]">
            {week.map((d) => (
              <div key={d.key} className="flex h-full flex-1 flex-col items-center justify-end gap-[9px]">
                <span className="font-mono text-[10px] leading-none font-medium text-ink-3">
                  {d.minutes || '–'}
                </span>
                <div
                  className={`w-full rounded-sm ${d.minutes ? 'bg-accent' : 'bg-line-soft'}`}
                  style={{ height: Math.max(3, (d.minutes / peak) * 68) }}
                />
                <span className="font-mono text-[10px] leading-none font-medium tracking-[0.08em] text-ink-3">
                  {d.day}
                </span>
              </div>
            ))}
          </div>
        </Panel>

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3 lg:col-span-12">
          {stats.map((s) => (
            <div
              key={s.label}
              className="flex flex-col justify-between gap-4 rounded-[14px] border border-line bg-surface p-5"
            >
              <span className="kicker">{s.label}</span>
              <span className="flex items-baseline gap-1.5">
                <span className="font-serif text-[32px] leading-none tracking-[-0.015em]">
                  {s.value}
                </span>
                <span className="text-[12.5px] text-ink-3">{s.unit}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      <section className="flex flex-col gap-4 pt-3.5">
        <div className="flex items-center justify-between gap-4">
          <h2 className="kicker m-0">Study decks</h2>
          <Link
            to="/decks"
            className="cursor-pointer border-0 bg-transparent p-0 text-[13px] font-medium text-ink-2 transition-colors hover:text-accent"
          >
            All decks →
          </Link>
        </div>

        {decks.length ? (
          <ul className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fill,minmax(268px,1fr))]">
            {decks.slice(0, 6).map((deck) => (
              <li key={deck.id} className="contents">
                {/* Under the "Study decks" h2, so these are h3. */}
                <DeckCard deck={deck} variant="dashboard" headingLevel={3} onEdit={onEditDeck} />
              </li>
            ))}
            <button
              type="button"
              onClick={onNewDeck}
              className="flex min-h-[196px] cursor-pointer flex-col items-center justify-center gap-2.5 rounded-[14px] border border-dashed border-line bg-transparent p-5 text-ink-3 transition-colors hover:border-accent-line hover:bg-surface hover:text-ink"
            >
              <span className="grid h-[34px] w-[34px] place-items-center rounded-full border border-line text-base">
                +
              </span>
              <span className="font-serif text-[18px] leading-[1.2]">New deck</span>
              <span className="text-center text-[12.5px] text-pretty">
                Write your own cards, or import a file.
              </span>
            </button>
          </ul>
        ) : (
          <div className="flex flex-col items-center gap-3.5 rounded-[14px] border border-dashed border-line px-6 py-[76px] text-center">
            <div className="font-serif text-[26px] leading-[1.2]">Nothing to study yet</div>
            <p className="m-0 max-w-[360px] text-sm text-ink-3 text-pretty">
              Write your first deck by hand, or import your notes and split them into cards.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button size="sm" onClick={onNewDeck}>
                New deck
              </Button>
              <Button size="sm" variant="outline" onClick={onImport}>
                Import material
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
