import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Button from '../components/Button.jsx'
import { useApp } from '../data/AppContext.jsx'
import { MIN_QUIZ_CARDS, buildQuestions, verdictFor } from '../data/quiz.js'
import useDocumentTitle from '../hooks/useDocumentTitle.js'

export default function Quiz() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { decks, recordGrades, recordSession } = useApp()
  const deck = decks.find((d) => d.id === id)
  useDocumentTitle(deck ? `Quiz · ${deck.title}` : 'Quiz')

  const questions = useMemo(() => (deck ? buildQuestions(deck.cards) : []), [deck])
  const [qIdx, setQIdx] = useState(0)
  const [selected, setSelected] = useState(null)
  const [score, setScore] = useState(0)
  const [done, setDone] = useState(false)
  // A quiz answer grades the underlying card too, so quiz and flashcard
  // sessions feed the same schedule.
  const [grades, setGrades] = useState({})
  // Real elapsed time for the activity log. A lazy initialiser reads the clock
  // once; useRef(Date.now()) would re-read it on every render.
  const [startedAt, setStartedAt] = useState(() => Date.now())

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

  // Fewer than four cards cannot make a real question: the answer would sit
  // among one or two options, and picking it would still grade the card and
  // push out its interval as though something had been recalled.
  if (deck.cards.length < MIN_QUIZ_CARDS) {
    const has = deck.cards.length
    return (
      <div className="rise-in mx-auto flex max-w-[520px] flex-col items-center gap-4 py-24 text-center">
        <div className="kicker">Not enough cards</div>
        <h1 className="m-0 font-serif text-[34px] leading-[1.1] tracking-[-0.02em]">
          A quiz needs {MIN_QUIZ_CARDS} cards
        </h1>
        <p className="m-0 max-w-[400px] text-[15px] text-ink-2 text-pretty">
          {deck.title} has {has === 0 ? 'none yet' : has === 1 ? 'one' : `only ${has}`}. Multiple
          choice needs other cards to draw the wrong answers from, so until then a quiz would only
          ever show the right one.
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <Button as={Link} to={`/decks/${deck.id}`}>
            Add cards
          </Button>
          {has > 0 && (
            <Button as={Link} to={`/decks/${deck.id}/review`} variant="outline">
              Study with flashcards
            </Button>
          )}
        </div>
      </div>
    )
  }

  const q = questions[qIdx]
  const answered = selected !== null
  const correct = answered && selected === q.answer

  const pick = (i) => {
    if (answered) return
    const right = i === q.answer
    setSelected(i)
    if (right) setScore((s) => s + 1)
    setGrades((g) => ({ ...g, [q.card.id]: right ? 'good' : 'again' }))
  }

  const advance = () => {
    if (qIdx >= questions.length - 1) {
      recordGrades(id, grades)
      recordSession({
        deckId: id,
        reviewed: questions.length,
        seconds: (Date.now() - startedAt) / 1000,
      })
      setDone(true)
      return
    }
    setQIdx((i) => i + 1)
    setSelected(null)
  }

  if (done) {
    return (
      <div className="rise-in mx-auto max-w-[760px]">
        <div className="flex flex-col items-center gap-[26px] py-10 text-center">
          <div className="kicker">Quiz complete</div>
          <div className="flex items-baseline gap-1.5">
            <span className="font-serif text-[64px] leading-none font-light tracking-[-0.02em] sm:text-[84px]">
              {score}
            </span>
            <span className="font-serif text-[30px] leading-none text-ink-3">
              / {questions.length}
            </span>
          </div>
          <p className="m-0 max-w-[440px] text-[16px] text-ink-2 text-pretty">
            {verdictFor(score, questions.length)}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              onClick={() => {
                setQIdx(0)
                setSelected(null)
                setScore(0)
                setGrades({})
                setDone(false)
                setStartedAt(Date.now())
              }}
            >
              Retake quiz
            </Button>
            <Button variant="outline" onClick={() => navigate('/')}>
              Back to dashboard
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="rise-in mx-auto max-w-[760px]">
      <div className="flex flex-col gap-[30px]">
        <header className="flex flex-col gap-3.5">
          <div className="flex items-center justify-between gap-4">
            <span className="kicker truncate">Quiz · {deck.title}</span>
            <span className="font-mono text-xs font-medium tracking-[0.06em] whitespace-nowrap text-ink-3">
              Question {qIdx + 1} of {questions.length}
            </span>
          </div>
          <div className="flex gap-1">
            {questions.map((_, i) => (
              <div
                key={i}
                className={`h-[3px] flex-1 rounded-sm ${
                  i < qIdx ? 'bg-accent' : i === qIdx ? 'bg-ink' : 'bg-line-soft'
                }`}
              />
            ))}
          </div>
        </header>

        <h1 className="m-0 font-serif text-[26px] leading-[1.24] tracking-[-0.01em] text-pretty sm:text-[34px]">
          {q.card.front}
        </h1>

        <div className="flex flex-col gap-[9px]">
          {q.options.map((option, i) => {
            const isAnswer = i === q.answer
            const picked = selected === i

            let tone = 'border-line bg-surface text-ink'
            let badge = 'border-line bg-transparent text-ink-3'
            let mark = ''
            let markTone = 'text-transparent'

            if (!answered && picked) tone = 'border-accent bg-accent-soft text-ink'
            if (answered && isAnswer) {
              tone = 'border-ok bg-ok-soft text-ink'
              badge = 'border-ok bg-ok text-paper'
              mark = '✓ Correct'
              markTone = 'text-ok'
            }
            if (answered && picked && !isAnswer) {
              tone = 'border-err bg-err-soft text-ink'
              badge = 'border-err bg-err text-paper'
              mark = '✕ Your answer'
              markTone = 'text-err'
            }

            return (
              <button
                key={i}
                type="button"
                onClick={() => pick(i)}
                disabled={answered}
                className={`flex items-center gap-3.5 rounded-[7px] border px-[18px] py-4 text-left transition-colors ${tone} ${
                  answered ? 'cursor-default' : 'cursor-pointer hover:border-ink-3'
                }`}
              >
                <span
                  className={`grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full border text-xs leading-none font-semibold ${badge}`}
                >
                  {'ABCD'[i]}
                </span>
                <span className="flex-1 text-[16px] text-pretty">{option.back}</span>
                <span className={`text-[13px] leading-none font-semibold ${markTone}`}>{mark}</span>
              </button>
            )
          })}
        </div>

        {/*
          Always mounted for the same reason as the toast: the verdict is the
          point of a quiz, and a live region that appears along with its text is
          announced unreliably.
        */}
        <div role="status" aria-live="polite">
          {answered && (
            <div
              className={`rise-in flex flex-wrap items-center justify-between gap-4 rounded-lg border p-5 ${
                correct ? 'border-ok-line bg-ok-soft' : 'border-err bg-err-soft'
              }`}
            >
              <div className="min-w-[220px] flex-1">
                <div
                  className={`mb-[7px] text-sm leading-none font-semibold ${
                    correct ? 'text-ok' : 'text-err'
                  }`}
                >
                  {correct ? 'Correct' : 'Not quite'}
                </div>
                <div className="text-sm text-ink-2 text-pretty">{q.card.back}</div>
              </div>
              <Button onClick={advance}>
                {qIdx >= questions.length - 1 ? 'See results' : 'Next question'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
