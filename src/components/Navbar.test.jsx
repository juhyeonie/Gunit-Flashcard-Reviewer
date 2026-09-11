// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BottomNav, TopNav } from './Navbar.jsx'
import { AppProvider } from '../data/AppContext.jsx'

/**
 * The top bar, and the one thing about it that is easy to break silently.
 *
 * The nav pill is meant to sit on the middle of the bar. `justify-between`
 * alone does not do that — it spaces the three children apart, so the middle
 * one is centred only when the outer two are the same width, and they never
 * are: a logo on one side, a streak reading anything from "No streak yet" to
 * "365 day streak" on the other. It sat 55px left of centre, which is half the
 * difference between them, and it moved whenever the streak's wording changed.
 *
 * jsdom has no layout engine, so none of that can be measured here. What is
 * asserted instead is the mechanism that produces it: both flanking children
 * take an equal share of the leftover space. Anyone removing `flex-1` from
 * either side to tidy the markup breaks the centring, and this is what says so.
 */

const show = (path = '/decks') =>
  render(
    <AppProvider>
      <MemoryRouter initialEntries={[path]}>
        <TopNav />
      </MemoryRouter>
    </AppProvider>,
  )

const nav = () => screen.getByRole('navigation')

/** The three children the bar is built from, in order. */
const sides = () => {
  const [left, middle, right] = [...nav().children]
  return { left, middle, right }
}

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('what the bar holds', () => {
  it('offers the three places to go', () => {
    show()
    for (const label of ['Home', 'My decks', 'Settings']) {
      expect(screen.getByRole('link', { name: label })).toBeTruthy()
    }
  })

  it('marks the one you are on', () => {
    show('/settings')
    expect(screen.getByRole('link', { name: 'Settings' }).className).toMatch(/font-semibold/)
    expect(screen.getByRole('link', { name: 'My decks' }).className).not.toMatch(/font-semibold/)
  })

  it('does not mark "Home" while you are somewhere else', () => {
    // Its route is "/", which matches everything without an end marker.
    show('/decks')
    expect(screen.getByRole('link', { name: 'Home' }).className).not.toMatch(/font-semibold/)
  })

  it('takes the logo home', () => {
    show()
    expect(screen.getByRole('img', { name: 'Gunit' }).closest('a').getAttribute('href')).toBe('/')
  })

  it('says how the streak stands', () => {
    show()
    expect(screen.getByText(/No streak yet|day streak/i)).toBeTruthy()
  })
})

describe('keeping the pill on the middle of the bar', () => {
  it('gives both sides an equal share of what is left over', () => {
    show()
    const { left, right } = sides()
    expect(left.className).toMatch(/\bflex-1\b/)
    expect(right.className).toMatch(/\bflex-1\b/)
  })

  it('pushes the right-hand side to the end of its share', () => {
    // Without this it would sit at the start of its half, leaving a gap
    // between the streak and the edge of the bar.
    show()
    expect(sides().right.className).toMatch(/justify-end/)
  })

  it('keeps the pill at its own width rather than stretching it', () => {
    // A pill that grew to fill the middle would be centred and wrong.
    show()
    expect(sides().middle.className).toMatch(/shrink-0/)
    expect(sides().middle.className).not.toMatch(/\bflex-1\b/)
  })

  it('still spaces the three apart', () => {
    show()
    expect(nav().className).toMatch(/justify-between/)
  })
})

describe('the tab bar on a phone', () => {
  const showBottom = (path = '/decks') =>
    render(
      <AppProvider>
        <MemoryRouter initialEntries={[path]}>
          <BottomNav />
        </MemoryRouter>
      </AppProvider>,
    )

  const tabs = () => screen.getAllByRole('link')

  it('offers the same three places', () => {
    showBottom()
    expect(tabs().map((a) => a.textContent.trim())).toEqual(['Home', 'Decks', 'Settings'])
  })

  it('gives each tab a target a thumb can hit', () => {
    // They were 38px. Apple and Google both publish 44 as the smallest a
    // target should be, and the difference is felt one-handed on a bus.
    showBottom()
    for (const tab of tabs()) expect(tab.className).toContain('min-h-[56px]')
  })

  it('keeps clear of the home indicator', () => {
    // Flush against the bottom, the labels sit under the gesture bar on any
    // phone that has one. The inset is zero elsewhere, so it costs nothing.
    showBottom()
    // A class rather than an inline style, and not only for tidiness: jsdom
    // drops an env() declaration on parse, so inline it could not be checked
    // here at all.
    const nav = screen.getByRole('navigation')
    expect(nav.className).toContain('pb-[env(safe-area-inset-bottom)]')
  })

  it('draws an icon beside each label, not instead of it', () => {
    // A bar of words is slow to scan; a bar of unlabelled shapes is a guess.
    showBottom()
    expect(screen.getByRole('navigation').querySelectorAll('svg')).toHaveLength(3)
  })

  it('hides those icons from a screen reader, which has the label already', () => {
    showBottom()
    const icons = [...screen.getByRole('navigation').querySelectorAll('svg')]
    for (const icon of icons) expect(icon.getAttribute('aria-hidden')).toBe('true')
  })

  it('marks the current tab by more than its colour', () => {
    // Colour alone is not a state in greyscale, and aria-current speaks only
    // to a screen reader.
    showBottom('/settings')
    const current = tabs().find((a) => a.getAttribute('aria-current') === 'page')
    expect(current.textContent.trim()).toBe('Settings')
    expect(current.className).toContain('text-accent')
    expect(current.querySelector('span[aria-hidden]').className).toContain('bg-accent')
  })

  it('does not leave the other tabs in the grey that fails contrast', () => {
    // text-ink-3 measures 3.99:1 here, under the 4.5:1 AA asks of ten-pixel
    // text. A tab bar is the wrong place to be subtle at that price.
    showBottom('/settings')
    const others = tabs().filter((a) => a.getAttribute('aria-current') !== 'page')
    for (const tab of others) {
      expect(tab.className).toContain('text-ink-2')
      expect(tab.className).not.toContain('text-ink-3')
    }
  })
})
