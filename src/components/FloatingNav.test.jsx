// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppProvider } from '../data/AppContext.jsx'
import { BottomNav } from './Navbar.jsx'
import Quiz from '../pages/Quiz.jsx'
import { deck, seed } from '../../test/render-app.jsx'

/**
 * The phone's floating tab bar: out of the way while the page scrolls down,
 * back as soon as it scrolls up, and never in the way of the quiz asking
 * before it is left.
 */

function show(path = '/decks', element = <BottomNav />) {
  const router = createMemoryRouter(
    [
      { path: '/decks/:id/quiz', element: (<><Quiz /><BottomNav /></>) },
      { path: '*', element },
    ],
    { initialEntries: [path] },
  )
  render(
    <AppProvider>
      <RouterProvider router={router} />
    </AppProvider>,
  )
  return router
}

const nav = () => screen.getByRole('navigation')
const hidden = () => nav().dataset.hidden === 'true'

/** Scrolls the window to `y` and lets a frame pass, as the browser would. */
async function scrollTo(y) {
  Object.defineProperty(window, 'scrollY', { configurable: true, value: y })
  await act(async () => {
    window.dispatchEvent(new Event('scroll'))
    await new Promise((resolve) => setTimeout(resolve, 40))
  })
}

beforeEach(async () => {
  localStorage.clear()
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 })
})

afterEach(() => {
  cleanup()
  delete window.matchMedia
  vi.restoreAllMocks()
})

describe('the floating tab bar', () => {
  it('floats as a pill above the page, with the same tabs as ever', () => {
    show()
    expect(nav().className).toMatch(/\bfixed\b/)
    expect(nav().className).toContain('rounded-full')
    expect(screen.getAllByRole('link').map((a) => a.textContent.trim())).toEqual(['Home', 'Decks', 'Settings'])
  })

  it('steps aside while the page scrolls down', async () => {
    show()
    await scrollTo(200)
    expect(hidden()).toBe(true)
  })

  it('comes back as soon as the page scrolls up', async () => {
    show()
    await scrollTo(400)
    expect(hidden()).toBe(true)
    await scrollTo(380)
    expect(hidden()).toBe(false)
  })

  it('stays put near the top, whatever the direction', async () => {
    show()
    await scrollTo(20)
    expect(hidden()).toBe(false)
    await scrollTo(400)
    await scrollTo(10)
    expect(hidden()).toBe(false)
  })

  it('ignores small, jittery movements', async () => {
    show()
    await scrollTo(300)
    await scrollTo(250)
    expect(hidden()).toBe(false)
    // A thumb resting on the glass: a few pixels either way, over and over.
    for (const y of [256, 251, 257, 252, 258, 253]) {
      await scrollTo(y)
      expect(hidden()).toBe(false)
    }
  })

  it('keeps its space at the bottom of the page whether it is showing or not', async () => {
    show()
    const spacer = nav().previousElementSibling
    const before = spacer.className
    await scrollTo(400)
    expect(hidden()).toBe(true)
    expect(spacer.className).toBe(before)
    expect(spacer.getAttribute('aria-hidden')).toBe('true')
  })

  it('cannot be tapped while out of sight, and comes back when a key moves focus into it', async () => {
    show()
    await scrollTo(400)
    expect(nav().className).toContain('data-[hidden=true]:pointer-events-none')
    screen.getAllByRole('link')[0].focus()
    expect(hidden()).toBe(false)
  })

  it('shows on every new page', async () => {
    const router = show()
    await scrollTo(400)
    expect(hidden()).toBe(true)
    await act(async () => router.navigate('/settings'))
    expect(hidden()).toBe(false)
  })

  it('fades rather than slides when reduced motion is asked for', () => {
    show()
    expect(nav().className).toContain('motion-reduce:data-[hidden=true]:translate-y-0')
    expect(nav().className).toContain('motion-reduce:transition-opacity')
  })

  it('does not listen to scrolling at all on a wider screen', async () => {
    window.matchMedia = vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    const listen = vi.spyOn(window, 'addEventListener')
    show()
    expect(listen.mock.calls.some(([type]) => type === 'scroll')).toBe(false)
    await scrollTo(400)
    expect(hidden()).toBe(false)
  })

  it('stops listening when it goes', async () => {
    const stop = vi.spyOn(window, 'removeEventListener')
    show()
    cleanup()
    expect(stop.mock.calls.some(([type]) => type === 'scroll')).toBe(true)
  })

  it('still asks before a tab leaves a quiz with answers in it', async () => {
    seed({ decks: [deck({ count: 5 })] })
    const router = show('/decks/republic/quiz')
    const right = new RegExp(`Answer ${screen.getByRole('heading', { level: 1 }).textContent.match(/Question (\d+)\?/)[1]}\\.`)
    await userEvent.click(screen.getAllByRole('button').find((b) => right.test(b.textContent)))
    await userEvent.click(screen.getByRole('link', { name: /Decks/ }))
    expect(screen.getByRole('dialog', { name: 'Leave quiz?' })).toBeTruthy()
    expect(router.state.location.pathname).toBe('/decks/republic/quiz')
  })
})
