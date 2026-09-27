import { Link, useNavigate } from 'react-router-dom'
import Button from '../components/Button.jsx'
import DeckCard from '../components/DeckCard.jsx'
import Mascot from '../components/Mascot.jsx'
import ProgressBar from '../components/ProgressBar.jsx'
import { useApp } from '../data/useApp.js'
import { accentOf } from '../data/seed.js'
import { dueCount } from '../data/scheduler.js'
import { canQuiz } from '../data/quiz.js'
import useDocumentTitle from '../hooks/useDocumentTitle.js'
import {
  estimateFor,
  formatRelative,
  lastSevenDays,
  minutesToday,
  streak,
} from '../data/activity.js'
import useT from '../i18n/useT.js'

/** Copy for the streak panel, which has to read sensibly at 0, 1 and many. */
const streakNote = (t, days, minutesDone, goal) => {
  if (!days) return t('dashboard.streak.none')
  const left = Math.max(0, goal - minutesDone)
  const run = t('dashboard.streak.run', { count: days })
  return left > 0
    ? t('dashboard.streak.left', { run, count: left })
    : t('dashboard.streak.met', { run })
}

const greeting = (t) => {
  const h = new Date().getHours()
  if (h < 12) return t('dashboard.greeting.morning')
  if (h < 18) return t('dashboard.greeting.afternoon')
  return t('dashboard.greeting.evening')
}

const today = (dateLocale) =>
  new Date().toLocaleDateString(dateLocale, { weekday: 'long', day: 'numeric', month: 'long' })

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
  const { t, parts, dateLocale } = useT()
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
  // Blank until somebody says otherwise, so the greeting has to work without
  // it rather than address an empty space.
  const firstName = settings.name.trim().split(' ')[0]
  // Null until this reader has finished a session to estimate from.
  const estimate = estimateFor(resumeDue, sessions)

  const stats = [
    { label: t('dashboard.stats.decks'), value: String(decks.length), unit: t('dashboard.stats.decksUnit') },
    { label: t('dashboard.stats.cards'), value: String(totalCards), unit: t('dashboard.stats.cardsUnit') },
    { label: t('dashboard.stats.due'), value: String(totalDue), unit: t('dashboard.stats.dueUnit') },
  ]

  return (
    <div className="rise-in mx-auto flex max-w-[1140px] flex-col gap-7">
      <header className="flex flex-wrap items-end justify-between gap-6 pb-1">
        <div className="max-w-[600px]">
          <div className="kicker mb-4">{today(dateLocale)}</div>
          <h1 className="m-0 mb-3 font-serif fs-34 leading-[1.04] tracking-[-0.02em] sm:fs-46">
            {firstName
              ? t('dashboard.greeting.named', { greeting: greeting(t), name: firstName })
              : t('dashboard.greeting.plain', { greeting: greeting(t) })}
          </h1>
          {resume && (
            <p className="m-0 fs-16 leading-[1.6] text-ink-2 text-pretty">
              {/*
                Both halves of this used to be untrue on a fresh library: it
                claimed you had left off in a deck you had never opened, and
                that twelve minutes would finish it — a fixed number, whatever
                the deck held. The panel directly below it was reporting the
                real figures the whole time.
              */}
              {parts(resume.studiedAt ? 'dashboard.resume.leftOff' : 'dashboard.resume.ready', {
                title: (
                  <em key="title" className="font-serif fs-17">
                    {resume.title}
                  </em>
                ),
              })}{' '}
              {resumeDue > 0
                ? estimate
                  ? t('dashboard.resume.dueAbout', { count: resumeDue, estimate })
                  : t('dashboard.resume.due', { count: resumeDue })
                : t('dashboard.resume.nothingDue')}
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
            <div className="kicker">{t('dashboard.continue')}</div>
            <div>
              <div className="mb-2 font-serif fs-28 leading-[1.12] tracking-[-0.015em] text-pretty sm:fs-32">
                {resume.title}
              </div>
              <div className="fs-13.5 text-ink-3">
                {t('dashboard.knownOf', {
                  known: Math.round(resume.progress * resume.cards.length),
                  count: resume.cards.length,
                })}{' '}
                ·{' '}
                {resumeDue
                  ? t('dashboard.dueNow', { count: resumeDue })
                  : t('dashboard.lastStudied', { when: formatRelative(resume.studiedAt).toLowerCase() })}
              </div>
            </div>
            <div className="mt-auto flex flex-col gap-[18px]">
              <div className="flex flex-col gap-[9px]">
                <div className="flex justify-between font-mono fs-10 leading-none font-medium tracking-[0.08em] text-ink-3 uppercase">
                  <span>{t('summary.progress')}</span>
                  <span>{Math.round(resume.progress * 100)}%</span>
                </div>
                <ProgressBar
                  value={Math.round(resume.progress * 100)}
                  height={4}
                  accent={accentOf(resume)}
                  label={t('dashboard.deckProgress', { title: resume.title })}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => navigate(`/decks/${resume.id}/review`)}>{t('dashboard.resumeReview')}</Button>
                <Button
                  variant="outline"
                  onClick={() => navigate(`/decks/${resume.id}/quiz`)}
                  disabled={!canQuiz(resume)}
                  title={canQuiz(resume) ? undefined : t('dashboard.tooSmall')}
                >
                  {t('dashboard.quizMe')}
                </Button>
              </div>
            </div>
          </Panel>
        )}

        <Panel className="min-h-[230px] gap-[22px] p-7 lg:col-span-5">
          <div className="flex items-center justify-between gap-3">
            <span className="kicker">{t('dashboard.streakTitle')}</span>
            <span className="kicker !tracking-[0.08em]">{t('dashboard.daily', { count: settings.goalMinutes })}</span>
          </div>
          <div>
            <div className="mb-2 flex items-baseline gap-[9px]">
              <span className="font-serif fs-48 leading-none tracking-[-0.02em]">{days}</span>
              <span className="text-sm text-ink-3">
                {t('dashboard.daysRunning', { count: days })}
              </span>
            </div>
            <div className="fs-13.5 leading-[1.5] text-ink-2 text-pretty">
              {streakNote(t, days, doneToday, goal)}
            </div>
          </div>
          <div className="mt-auto flex flex-col gap-[18px]">
            <div className="flex flex-col gap-[9px]">
              <div className="flex justify-between font-mono fs-10 leading-none font-medium tracking-[0.08em] text-ink-3 uppercase">
                <span>{t('dashboard.todaysGoal')}</span>
                <span>{t('dashboard.goalProgress', { done: doneToday, goal })}</span>
              </div>
              <ProgressBar value={goalPct} height={4} label={t('dashboard.goalLabel')} />
            </div>
            <div className="flex gap-1.5">
              {week.map((d) => (
                <div key={d.key} className="flex flex-1 flex-col items-center gap-2">
                  <div
                    title={t('dashboard.min', { count: d.minutes })}
                    className={`h-[26px] w-full rounded-[5px] border ${
                      d.active ? 'border-accent-line bg-accent-soft' : 'border-line bg-transparent'
                    }`}
                  />
                  <span
                    className={`font-mono fs-10 leading-none font-medium tracking-[0.06em] ${
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
            <span className="kicker">{t('dashboard.minutesStudied')}</span>
            <span className="kicker !tracking-[0.08em] normal-case">{t('dashboard.thisWeek')}</span>
          </div>
          <div className="flex h-[108px] items-end gap-[7px]">
            {week.map((d) => (
              <div key={d.key} className="flex h-full flex-1 flex-col items-center justify-end gap-[9px]">
                <span className="font-mono fs-10 leading-none font-medium text-ink-3">
                  {d.minutes || '–'}
                </span>
                <div
                  className={`w-full rounded-sm ${d.minutes ? 'bg-accent' : 'bg-line-soft'}`}
                  style={{ height: Math.max(3, (d.minutes / peak) * 68) }}
                />
                <span className="font-mono fs-10 leading-none font-medium tracking-[0.08em] text-ink-3">
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
                <span className="font-serif fs-32 leading-none tracking-[-0.015em]">
                  {s.value}
                </span>
                <span className="fs-12.5 text-ink-3">{s.unit}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      <section className="flex flex-col gap-4 pt-3.5">
        <div className="flex items-center justify-between gap-4">
          <h2 className="kicker m-0">{t('dashboard.studyDecks')}</h2>
          <Link
            to="/decks"
            className="cursor-pointer border-0 bg-transparent p-0 fs-13 font-medium text-ink-2 transition-colors hover:text-accent"
          >
            {t('dashboard.allDecks')}
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
              <span className="font-serif fs-18 leading-[1.2]">{t('deckModal.newKicker')}</span>
              <span className="text-center fs-12.5 text-pretty">
                {t('dashboard.newDeckHint')}
              </span>
            </button>
          </ul>
        ) : (
          <div className="flex flex-col items-center gap-3.5 rounded-[14px] border border-dashed border-line px-6 py-[76px] text-center">
            <Mascot pose="studying" size={100} className="mb-1" />
            <div className="font-serif fs-26 leading-[1.2]">{t('dashboard.emptyTitle')}</div>
            <p className="m-0 max-w-[360px] text-sm text-ink-3 text-pretty">
              {t('dashboard.emptyBody')}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button size="sm" onClick={onNewDeck}>
                {t('deckModal.newKicker')}
              </Button>
              <Button size="sm" variant="outline" onClick={onImport}>
                {t('importFile.kicker')}
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
