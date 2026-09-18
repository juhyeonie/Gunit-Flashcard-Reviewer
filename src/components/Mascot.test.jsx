// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Mascot from './Mascot.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'
import { BottomNav, TopNav } from './Navbar.jsx'
import poses from '../assets/mascot/poses.json'
import Dashboard from '../pages/Dashboard.jsx'
import DeckDetail from '../pages/DeckDetail.jsx'
import Landing from '../pages/Landing.jsx'
import Quiz from '../pages/Quiz.jsx'
import Review from '../pages/Review.jsx'
import SignIn from '../pages/SignIn.jsx'
import Summary from '../pages/Summary.jsx'
import { deck, entry, renderRoute, seed } from '../../test/render-app.jsx'

/**
 * The red panda: what it is, and — as much to the point — where it is not.
 *
 * The risk with a mascot is the same as the risk with a credit line: not that
 * it goes missing, but that it spreads. A panda on an empty page is company; a
 * panda beside every flashcard is a distraction in the one place a reader is
 * trying to concentrate. So these pin both halves: the pose each moment gets,
 * and the moments that get none.
 */

const POSE_NAMES = ['studying', 'thinking', 'correct', 'resting', 'celebrate']

/** Which pose is on screen, or null. */
const shown = () => {
  const all = [...document.querySelectorAll('[data-mascot]')]
  expect(all.length).toBeLessThanOrEqual(1) // never two at once
  return all[0]?.dataset.mascot ?? null
}

const png = (name) => readFileSync(resolve(process.cwd(), `src/assets/mascot/${name}.png`))

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('the assets', () => {
  it('has all five poses, each described in the manifest', () => {
    expect(Object.keys(poses).sort()).toEqual([...POSE_NAMES].sort())
  })

  it('matches the manifest to the images, so the page reserves the right space', () => {
    // Width and height go on the <img> to stop the page jumping as it loads.
    // A manifest that disagreed with the file would reserve the wrong box.
    for (const name of POSE_NAMES) {
      const file = png(name)
      expect(file.subarray(1, 4).toString('ascii')).toBe('PNG')
      expect(file.readUInt32BE(16)).toBe(poses[name].width)
      expect(file.readUInt32BE(20)).toBe(poses[name].height)
    }
  })

  it('has a transparent background in every pose', () => {
    // Colour type 6 is RGBA. Without the alpha channel the white page it was
    // cut from would come with it, a white box on the dark theme.
    for (const name of POSE_NAMES) expect(png(name)[25]).toBe(6)
  })

  it('keeps each ground shadow inside its own image', () => {
    for (const name of POSE_NAMES) {
      const { left, top, width, height } = poses[name].ground
      expect(left).toBeGreaterThanOrEqual(0)
      expect(top).toBeGreaterThan(0.7) // at the feet, not somewhere up the body
      expect(left + width).toBeLessThanOrEqual(1.001)
      expect(top + height).toBeLessThanOrEqual(1.001)
    }
  })
})

describe('the component', () => {
  it('is decorative: hidden from screen readers, with an empty alt', () => {
    // Every place it appears already says what is happening in words.
    const { container } = render(<Mascot pose="studying" />)
    expect(container.firstChild.getAttribute('aria-hidden')).toBe('true')
    expect(container.querySelector('img').getAttribute('alt')).toBe('')
  })

  it('never carries the word Gunit, which belongs to the logo', () => {
    const { container } = render(<Mascot pose="celebrate" />)
    expect(container.innerHTML).not.toMatch(/gunit/i)
  })

  it('draws the panda at the same scale in every pose', () => {
    // Given the same width, a long, low sleeping pose would be drawn larger
    // than a sitting one. One scale for all keeps the panda one size.
    const ratios = POSE_NAMES.map((name) => {
      const { container } = render(<Mascot pose={name} size={150} />)
      const width = Number(container.querySelector('img').getAttribute('width'))
      cleanup()
      return width / poses[name].width
    })
    for (const r of ratios) expect(r).toBeCloseTo(ratios[0], 2)
  })

  it('reserves its space before the image arrives', () => {
    const { container } = render(<Mascot pose="resting" size={120} />)
    const img = container.querySelector('img')
    expect(Number(img.getAttribute('width'))).toBe(Math.round((poses.resting.width * 120) / 300))
    expect(Number(img.getAttribute('height'))).toBe(Math.round((poses.resting.height * 120) / 300))
  })

  it('puts the ground shadow where the reference had it', () => {
    const { container } = render(<Mascot pose="correct" />)
    const ground = container.querySelector('.mascot-ground')
    expect(ground.style.left).toBe(`${poses.correct.ground.left * 100}%`)
    expect(ground.style.top).toBe(`${poses.correct.ground.top * 100}%`)
  })

  it('takes a smaller size on a phone only where one is asked for', () => {
    const vars = (el) => [
      el.style.getPropertyValue('--mascot-width'),
      el.style.getPropertyValue('--mascot-width-narrow'),
    ]
    const { container } = render(<Mascot pose="studying" size={108} narrowSize={76} />)
    const [wide, narrow] = vars(container.firstChild)
    expect(parseInt(narrow)).toBeLessThan(parseInt(wide))
    cleanup()

    const plain = render(<Mascot pose="studying" size={108} />)
    const [same, alsoSame] = vars(plain.container.firstChild)
    expect(alsoSame).toBe(same)
  })

  it('switches to it below Tailwind’s sm breakpoint, in the stylesheet', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')
    const at = css.indexOf('@media (max-width: 39.999rem)')
    expect(at).toBeGreaterThan(-1)
    const block = css.slice(at, css.indexOf('\n}', at))
    expect(block).toMatch(/\.mascot\s*\{\s*width:\s*var\(--mascot-width-narrow\)/)
  })

  it('draws nothing for a pose it does not have, rather than a broken image', () => {
    const { container } = render(<Mascot pose="dancing" />)
    expect(container.firstChild).toBe(null)
  })
})

describe('where it appears', () => {
  it('introduces Gunit on the landing page, under the logo rather than instead of it', () => {
    renderRoute('/', '/', <Landing />)
    expect(shown()).toBe('studying')
    expect(screen.getByRole('img', { name: 'Gunit' })).toBeTruthy()
  })

  it('is smaller on a phone there, so it never pushes "Sign in" under the tab bar', () => {
    // Measured at 375 x 812: at full size the button's bottom edge sat 23px
    // beneath the tab bar. At the phone size it clears it.
    renderRoute('/', '/', <Landing />)
    const panda = document.querySelector('[data-mascot]')
    const wide = parseInt(panda.style.getPropertyValue('--mascot-width'))
    const narrow = parseInt(panda.style.getPropertyValue('--mascot-width-narrow'))
    expect(narrow).toBeLessThanOrEqual(80)
    expect(narrow).toBeLessThan(wide)
  })

  it('keeps an empty dashboard company', () => {
    seed({ decks: [] })
    renderRoute('/', '/', <Dashboard onNewDeck={vi.fn()} onEditDeck={vi.fn()} onImport={vi.fn()} />)
    expect(screen.getByText('Nothing to study yet')).toBeTruthy()
    expect(shown()).toBe('studying')
  })

  it('wonders about a deck with no cards in it', () => {
    seed({ decks: [deck({ count: 0 })] })
    renderRoute('/decks/republic', '/decks/:id', <DeckDetail {...noops()} />)
    expect(screen.getByText('No cards yet')).toBeTruthy()
    expect(shown()).toBe('thinking')
  })

  it('sleeps when nothing is due, which is what "review later" means', () => {
    const later = Object.fromEntries([0, 1, 2].map((n) => [`c${n}`, entry(60 * 24)]))
    seed({ decks: [deck({ count: 3, schedule: later })] })
    renderRoute('/decks/republic/review', '/decks/:id/review', <Review />)
    expect(screen.getByText('Nothing is due right now')).toBeTruthy()
    expect(shown()).toBe('resting')
  })

  it('celebrates a finished session', () => {
    seed({ decks: [deck()] })
    renderRoute(
      { pathname: '/decks/republic/summary', state: { reviewed: 4, known: 3, again: 1, seconds: 60 } },
      '/decks/:id/summary',
      <Summary />,
    )
    expect(shown()).toBe('celebrate')
  })

  it('cheers a quiz passed, and goes back to the book after one failed', async () => {
    for (const [correctly, pose] of [
      [true, 'correct'],
      [false, 'studying'],
    ]) {
      seed({ decks: [deck({ count: 4 })] })
      renderRoute('/decks/republic/quiz', '/decks/:id/quiz', <Quiz />)
      for (let q = 0; q < 4; q++) {
        expect(shown()).toBe(null) // not while a question is being answered
        await answerQuiz(correctly)
      }
      expect(screen.getByText('Quiz complete')).toBeTruthy()
      expect(shown()).toBe(pose)
      cleanup()
    }
  })

  it('is puzzled on every page of a deck that is not there', () => {
    for (const [path, pattern, page] of [
      ['/decks/gone', '/decks/:id', <DeckDetail key="d" {...noops()} />],
      ['/decks/gone/review', '/decks/:id/review', <Review key="r" />],
      ['/decks/gone/quiz', '/decks/:id/quiz', <Quiz key="q" />],
      ['/decks/gone/summary', '/decks/:id/summary', <Summary key="s" />],
    ]) {
      renderRoute(path, pattern, page)
      expect(screen.getByText('That deck no longer exists.')).toBeTruthy()
      expect(shown()).toBe('thinking')
      cleanup()
    }
  })

  it('is puzzled, not alarmed, when a page breaks', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    const Broken = () => {
      throw new Error('deck.cards is not iterable')
    }
    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(shown()).toBe('thinking')
    quiet.mockRestore()
  })
})

describe('where it stays out of the way', () => {
  it('is not beside the card while a reader is studying', () => {
    seed({ decks: [deck({ count: 3 })] })
    renderRoute('/decks/republic/review', '/decks/:id/review', <Review />)
    expect(screen.getByRole('button', { name: 'Reveal answer' })).toBeTruthy()
    expect(shown()).toBe(null)
  })

  it('does not react to each grade, which happens dozens of times a session', async () => {
    seed({ decks: [deck({ count: 3 })] })
    renderRoute('/decks/republic/review', '/decks/:id/review', <Review />)
    await userEvent.click(screen.getByRole('button', { name: 'Reveal answer' }))
    await userEvent.click(screen.getByRole('button', { name: /^Good/ }))
    expect(shown()).toBe(null)
  })

  it('is not on a dashboard that has decks on it', () => {
    seed({ decks: [deck()] })
    renderRoute('/', '/', <Dashboard onNewDeck={vi.fn()} onEditDeck={vi.fn()} onImport={vi.fn()} />)
    expect(shown()).toBe(null)
  })

  it('is not on a deck that has cards', () => {
    seed({ decks: [deck()] })
    renderRoute('/decks/republic', '/decks/:id', <DeckDetail {...noops()} />)
    expect(shown()).toBe(null)
  })

  it('is not on a summary with no session behind it', () => {
    seed({ decks: [deck()] })
    renderRoute('/decks/republic/summary', '/decks/:id/summary', <Summary />)
    expect(screen.getByText('Nothing to report')).toBeTruthy()
    expect(shown()).toBe(null)
  })

  it('is not on the sign-in page, which has one thing to do', () => {
    renderRoute('/sign-in', '/sign-in', <SignIn />)
    expect(shown()).toBe(null)
  })

  it('is not in the navigation, which is on every screen', () => {
    renderRoute('/', '/', (
      <>
        <TopNav />
        <BottomNav />
      </>
    ))
    expect(shown()).toBe(null)
  })
})

function noops() {
  return {
    onEditDeck: vi.fn(),
    onNewCard: vi.fn(),
    onEditCard: vi.fn(),
    onDeleteCard: vi.fn(),
    onResetDeck: vi.fn(),
    onImport: vi.fn(),
  }
}

/** Answers the question on screen, then moves on. Same approach as Quiz.test. */
async function answerQuiz(correctly) {
  const asking = screen.getByRole('heading', { level: 1 }).textContent.match(/Question (\d+)\?/)[1]
  const right = new RegExp(`Answer ${asking}\\.`)
  const options = screen
    .queryAllByRole('button')
    .filter((b) => /Answer \d+\./.test(b.textContent))
  await userEvent.click(options.find((b) => right.test(b.textContent) === correctly))
  await userEvent.click(screen.getByRole('button', { name: /Next question|See results/ }))
}
