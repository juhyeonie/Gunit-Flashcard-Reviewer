import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { AppProvider, useApp } from '../src/data/AppContext.jsx'
import Toast from '../src/components/Toast.jsx'
import { DEFAULT_SETTINGS } from '../src/data/normalize.js'

/**
 * Rendering a page the way the app does: inside the store and inside a router,
 * at a real URL, with somewhere for it to navigate to.
 *
 * Pages are seeded from `localStorage` rather than through props, because that
 * is where `AppProvider` looks. It also means a test can assert on what was
 * written back — grading a card is only real if it survives.
 */

export const KEY = 'gunit.state.v2'

/** A card, with an id a schedule can be keyed by. */
export const card = (n) => ({
  id: `c${n}`,
  front: `Question ${n}?`,
  back: `Answer ${n}.`,
})

/** A deck of `count` cards, with whatever schedule the test needs. */
export const deck = ({
  id = 'republic',
  title = 'Roman Republic',
  count = 4,
  schedule = {},
  cards,
} = {}) => ({
  id,
  title,
  subject: 'Ancient Rome',
  desc: 'Magistracies and assemblies.',
  cards: cards ?? Array.from({ length: count }, (_, i) => card(i)),
  schedule,
  studiedAt: null,
})

/**
 * A scheduled card, due `dueIn` minutes from `now`. Negative is overdue, which
 * is what puts a card in the queue.
 */
export const entry = (dueIn, now = Date.now()) => ({
  // `last` holds the grade itself, not a timestamp — that is what the
  // scheduler writes, and what progress is derived from.
  last: 'good',
  due: now + dueIn * 60_000,
  interval: 1440,
  ease: 2.5,
  reps: 1,
  lapses: 0,
})

/** Writes the library the page will find. Call before rendering. */
export function seed({ decks, settings, sessions = [] } = {}) {
  localStorage.setItem(
    KEY,
    JSON.stringify({
      decks: decks ?? [deck()],
      sessions,
      theme: 'light',
      settings: { ...DEFAULT_SETTINGS, ...settings },
    }),
  )
}

/** Reads back what the store persisted, for asserting on side effects. */
export const stored = () => JSON.parse(localStorage.getItem(KEY))

/**
 * The toast lives in the app shell, not in any page, so a page's `say(...)`
 * would otherwise go nowhere a test could see. Several guards report their
 * refusals only this way.
 */
function Feedback() {
  return <Toast message={useApp().toast} />
}

/**
 * Shows where the router ended up, and with what. Only rendered once the page
 * has navigated somewhere its own route does not cover, so its absence is how
 * a test says "we are still here".
 */
function Elsewhere() {
  const { pathname, state } = useLocation()
  return (
    <div>
      <span data-testid="pathname">{pathname}</span>
      <span data-testid="nav-state">{JSON.stringify(state ?? null)}</span>
    </div>
  )
}

/**
 * @param {string} path the URL to open, e.g. "/decks/republic/review"
 * @param {string} pattern the route it should match, e.g. "/decks/:id/review"
 * @param {JSX.Element} element the page under test
 */
export function renderRoute(path, pattern, element) {
  return render(
    <AppProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={pattern} element={element} />
          {/* Anywhere the page navigates to lands here and says so. */}
          <Route path="*" element={<Elsewhere />} />
        </Routes>
        <Feedback />
      </MemoryRouter>
    </AppProvider>,
  )
}
