// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ErrorBoundary from './ErrorBoundary.jsx'

/**
 * The last thing standing between a crash and a lost library.
 *
 * Everything else in the app is reachable by using it. This is only reachable
 * by breaking it, which is exactly why it goes untried: nobody clicks "reset
 * saved data" to see what happens, and the one time a reader does, it is
 * because their decks are already at stake.
 *
 * The assertion that matters is the ordering inside `resetData` — the copy has
 * to be written before the original is removed. Swap those two lines and
 * everything still looks right on screen while the library is gone for good.
 */

const STORAGE_KEY = 'gunit.state.v2'
const SALVAGE_KEY = 'gunit.state.recovered'

const LIBRARY = JSON.stringify({ decks: [{ id: 'republic', title: 'Roman Republic' }] })

/** Throws on demand, so one render can fail and the next succeed. */
let failing = true
function Fragile() {
  if (failing) throw new Error('deck.cards is not iterable')
  return <p>Everything is fine</p>
}

const show = () =>
  render(
    <ErrorBoundary>
      <Fragile />
    </ErrorBoundary>,
  )

/** Where the fallback tried to send the browser. */
let navigatedTo
let realLocation

beforeEach(() => {
  failing = true
  navigatedTo = []
  localStorage.clear()

  // React reports every caught error to the console. That is wanted in a
  // browser and only noise here, where the throw is deliberate.
  vi.spyOn(console, 'error').mockImplementation(() => {})

  // jsdom has no navigation, and assigning `location.href` logs a "Not
  // implemented" error rather than doing anything. What is worth checking is
  // that the boundary asked, so the ask is recorded instead.
  realLocation = window.location
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      ...realLocation,
      get href() {
        return realLocation.href
      },
      set href(url) {
        navigatedTo.push(url)
      },
    },
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  Object.defineProperty(window, 'location', { configurable: true, value: realLocation })
  localStorage.clear()
})

describe('when nothing is wrong', () => {
  it('renders its children and stays out of the way', () => {
    failing = false
    show()
    expect(screen.getByText('Everything is fine')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBe(null)
  })
})

describe('when a child throws', () => {
  it('shows the fallback instead of an empty page', () => {
    show()
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'This page stopped working' })).toBeTruthy()
    expect(screen.queryByText('Everything is fine')).toBe(null)
  })

  it('says the decks are safe, because at that point they still are', () => {
    show()
    expect(screen.getByText(/were not affected/i)).toBeTruthy()
  })

  it('quotes the error, which is the only clue anyone will get', () => {
    show()
    expect(screen.getByText('deck.cards is not iterable')).toBeTruthy()
  })

  it('logs it as well, so a report can be more than a screenshot', () => {
    show()
    expect(console.error).toHaveBeenCalled()
  })

  it('touches no storage merely by appearing', () => {
    localStorage.setItem(STORAGE_KEY, LIBRARY)
    show()
    expect(localStorage.getItem(STORAGE_KEY)).toBe(LIBRARY)
    expect(localStorage.getItem(SALVAGE_KEY)).toBe(null)
  })
})

describe('trying again', () => {
  it('re-renders the children rather than reloading the page', async () => {
    const user = userEvent.setup()
    show()

    failing = false
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(screen.getByText('Everything is fine')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBe(null)
    expect(navigatedTo).toEqual([])
  })

  it('shows the fallback again if it is still broken', async () => {
    const user = userEvent.setup()
    show()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(screen.getByRole('alert')).toBeTruthy()
  })
})

describe('resetting the saved data', () => {
  const ask = /Still broken\? Reset saved data/i

  const reset = async (user) => {
    await user.click(screen.getByRole('button', { name: ask }))
    await user.click(screen.getByRole('button', { name: 'Yes, reset saved data' }))
  }

  it('does not offer the destructive button until it is asked for', () => {
    show()
    expect(screen.queryByRole('button', { name: 'Yes, reset saved data' })).toBe(null)
    expect(screen.getByRole('button', { name: ask })).toBeTruthy()
  })

  it('explains where the copy goes before anyone agrees to it', async () => {
    const user = userEvent.setup()
    show()
    await user.click(screen.getByRole('button', { name: ask }))
    expect(screen.getByText(SALVAGE_KEY)).toBeTruthy()
  })

  it('leaves everything alone if the confirmation is cancelled', async () => {
    const user = userEvent.setup()
    localStorage.setItem(STORAGE_KEY, LIBRARY)
    show()

    await user.click(screen.getByRole('button', { name: ask }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(localStorage.getItem(STORAGE_KEY)).toBe(LIBRARY)
    expect(localStorage.getItem(SALVAGE_KEY)).toBe(null)
    expect(navigatedTo).toEqual([])
    expect(screen.queryByRole('button', { name: 'Yes, reset saved data' })).toBe(null)
  })

  it('keeps a copy of the library before clearing it', async () => {
    const user = userEvent.setup()
    localStorage.setItem(STORAGE_KEY, LIBRARY)
    show()
    await reset(user)

    expect(localStorage.getItem(STORAGE_KEY)).toBe(null)
    expect(localStorage.getItem(SALVAGE_KEY)).toBe(LIBRARY)
  })

  it('writes the copy first, so a failure part way keeps the decks', async () => {
    // The check above passes whichever order the two lines are in. This is the
    // ordering itself: salvage, then remove. Reversed, the copy is of nothing.
    const user = userEvent.setup()
    localStorage.setItem(STORAGE_KEY, LIBRARY)

    const order = []
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation((key) => order.push(`set ${key}`))
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation((key) =>
      order.push(`remove ${key}`),
    )

    show()
    await reset(user)

    expect(order).toEqual([`set ${SALVAGE_KEY}`, `remove ${STORAGE_KEY}`])
    expect(setItem).toHaveBeenCalledWith(SALVAGE_KEY, LIBRARY)
  })

  it('does not write an empty salvage when there was nothing stored', async () => {
    // A reader who has never saved a deck should not find a key claiming
    // otherwise, and `null` written through would come back as the string.
    const user = userEvent.setup()
    show()
    await reset(user)
    expect(localStorage.getItem(SALVAGE_KEY)).toBe(null)
  })

  it('sends the browser back to the dashboard', async () => {
    const user = userEvent.setup()
    localStorage.setItem(STORAGE_KEY, LIBRARY)
    show()
    await reset(user)
    expect(navigatedTo).toEqual(['/'])
  })

  it('still reloads when storage refuses to answer', async () => {
    // Private windows and blocked site data throw on access. Reloading is the
    // only thing left worth trying, and it must not be skipped by the throw.
    const user = userEvent.setup()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError')
    })

    show()
    await reset(user)

    expect(navigatedTo).toEqual(['/'])
  })
})
