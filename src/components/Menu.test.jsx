// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Menu, { MenuItem } from './Menu.jsx'

/**
 * The dropdown behind "Study this deck", "Add cards", the deck kebab and the
 * card kebab - four menus, one component, and all of its real behaviour wired
 * to `document` rather than to anything it renders.
 *
 * That is what makes it worth pinning. A menu that fails to close is not a
 * crash and not a visual change; it is a panel left over the page while the
 * reader taps something underneath. Nothing in the app would notice.
 */

const outside = () => screen.getByRole('button', { name: 'outside' })

/**
 * The shape every caller builds: a `relative` wrapper holding the trigger and
 * the panel it anchors, with the rest of the page beyond it. The wrapper is
 * not decoration - it is what the panel's `absolute` is measured against, and
 * what the component reads to tell inside from outside.
 */
const Anchored = ({ children, ...props }) => (
  <div>
    <button type="button">outside</button>
    <div className="relative">
      <button type="button">Deck options</button>
      <Menu {...props}>{children}</Menu>
    </div>
  </div>
)

const open = (props = {}) =>
  render(
    <Anchored open onClose={props.onClose ?? vi.fn()} {...props}>
      <MenuItem title="Reset progress" hint="Every card new again." />
    </Anchored>,
  )

/** The panel itself: the element the items sit in. */
const panel = () => screen.queryByText('Reset progress')?.closest('div[class*="absolute"]') ?? null

afterEach(cleanup)

describe('while it is closed', () => {
  it('renders nothing at all', () => {
    render(
      <Menu open={false} onClose={vi.fn()}>
        <MenuItem title="Reset progress" />
      </Menu>,
    )
    expect(screen.queryByText('Reset progress')).toBe(null)
  })

  it('is not listening, so it cannot swallow an Escape meant for something else', async () => {
    // Four of these are mounted on the deck page at once. If a closed menu
    // kept its handlers, every Escape would run four of them.
    const onClose = vi.fn()
    render(
      <Menu open={false} onClose={onClose}>
        <MenuItem title="Reset progress" />
      </Menu>,
    )
    await userEvent.keyboard('{Escape}')
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('the ways it closes', () => {
  it('closes when something outside is pressed', async () => {
    const onClose = vi.fn()
    open({ onClose })
    await userEvent.click(outside())
    expect(onClose).toHaveBeenCalled()
  })

  it('stays open when something inside is pressed', async () => {
    // An item that toggles in place, or opens a picker of its own, would
    // otherwise take the panel down with it.
    const onClose = vi.fn()
    open({ onClose })
    await userEvent.click(screen.getByText('Reset progress'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes on Escape', async () => {
    const onClose = vi.fn()
    open({ onClose })
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('ignores other keys', async () => {
    const onClose = vi.fn()
    open({ onClose })
    await userEvent.keyboard('{Enter}{ArrowDown}a')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes even when the thing outside stops the event travelling', async () => {
    // The handler is registered in the capture phase for this reason: a menu
    // that only closes when the rest of the page cooperates is a menu that
    // stays open over one that does not.
    const onClose = vi.fn()
    render(
      <div>
        <button type="button" onPointerDown={(e) => e.stopPropagation()}>
          outside
        </button>
        <div className="relative">
          <Menu open onClose={onClose}>
            <MenuItem title="Reset progress" />
          </Menu>
        </div>
      </div>,
    )
    await userEvent.click(outside())
    expect(onClose).toHaveBeenCalled()
  })

  it('stays open when the button that opened it is pressed', async () => {
    // Not because nothing should happen, but because the trigger closes it
    // itself. Closing here as well would close and reopen in one press.
    const onClose = vi.fn()
    open({ onClose })
    await userEvent.click(screen.getByRole('button', { name: 'Deck options' }))
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('what it leaves behind', () => {
  it('stops listening once it closes', async () => {
    const onClose = vi.fn()
    const { rerender } = render(
      <Anchored open onClose={onClose}>
        <MenuItem title="Reset progress" />
      </Anchored>,
    )
    rerender(
      <Anchored open={false} onClose={onClose}>
        <MenuItem title="Reset progress" />
      </Anchored>,
    )
    await userEvent.click(outside())
    await userEvent.keyboard('{Escape}')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('stops listening once it unmounts', async () => {
    // The card menus unmount with their row when a card is deleted, which is
    // exactly the moment a stale handler would fire at a gone component.
    const onClose = vi.fn()
    const { unmount } = open({ onClose })
    unmount()
    await userEvent.keyboard('{Escape}')
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('where it opens', () => {
  it('anchors right by default, which is where three of the four sit', () => {
    open()
    expect(panel().className).toMatch(/(^|\s)right-0(\s|$)/)
  })

  it('anchors left when asked', () => {
    open({ align: 'left' })
    expect(panel().className).toMatch(/(^|\s)left-0(\s|$)/)
  })

  it('opens leftwards on a phone and rightwards from sm up, when responsive', () => {
    // "Study this deck" sits at the left of its row and wraps to the left edge
    // on a narrow screen, where right-0 would hang the panel off the side.
    open({ align: 'responsive' })
    const cls = panel().className
    expect(cls).toMatch(/(^|\s)left-0(\s|$)/)
    expect(cls).toMatch(/sm:right-0/)
    expect(cls).toMatch(/sm:left-auto/)
  })

  it('never grows wider than the screen it is on', () => {
    // A 250px panel on a 375px phone is fine; the same panel anchored past the
    // edge is the bug that came back from a real phone.
    open({ width: 250 })
    expect(panel().style.minWidth).toBe('250px')
    expect(panel().className).toMatch(/max-w-\[calc\(100vw-2rem\)\]/)
  })
})

describe('an item in it', () => {
  it('shows its title and its hint', () => {
    open()
    expect(screen.getByText('Reset progress')).toBeTruthy()
    expect(screen.getByText('Every card new again.')).toBeTruthy()
  })

  it('leaves the hint out when there is none', () => {
    render(<MenuItem title="Edit card" />)
    expect(screen.getByRole('button').textContent).toBe('Edit card')
  })

  it('is a button that does not submit, since a menu can sit inside a form', () => {
    render(<MenuItem title="Edit card" />)
    expect(screen.getByRole('button').type).toBe('button')
  })

  it('runs what it was given', async () => {
    const onClick = vi.fn()
    render(<MenuItem title="Edit card" onClick={onClick} />)
    await userEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('marks a destructive item in the error colour, not just a darker grey', () => {
    render(<MenuItem title="Delete card" danger />)
    expect(screen.getByText('Delete card').className).toMatch(/text-err/)
  })

  it('passes the rest through, so a caller can label or disable one', () => {
    render(<MenuItem title="Edit card" disabled aria-label="Edit this card" />)
    const item = screen.getByRole('button')
    expect(item.disabled).toBe(true)
    expect(item.getAttribute('aria-label')).toBe('Edit this card')
  })
})

describe('the trigger beside it', () => {
  // Every caller renders the trigger outside the panel and toggles its own
  // state, so a second press on the trigger is an outside press as far as the
  // menu is concerned. Get that wrong and one gesture closes and reopens it.
  const Toggle = () => {
    const [isOpen, setOpen] = useState(false)
    return (
      <div>
        <button type="button">outside</button>
        <div className="relative">
          <button type="button" aria-expanded={isOpen} onClick={() => setOpen((v) => !v)}>
            Deck options
          </button>
          <Menu open={isOpen} onClose={() => setOpen(false)}>
            <MenuItem title="Reset progress" />
          </Menu>
        </div>
      </div>
    )
  }

  it('closes again when the trigger is pressed a second time', async () => {
    const user = userEvent.setup()
    render(<Toggle />)
    const trigger = screen.getByRole('button', { name: 'Deck options' })

    await user.click(trigger)
    expect(panel()).toBeTruthy()

    await user.click(trigger)
    expect(panel()).toBe(null)
  })

  it('keeps the trigger telling the truth about what it opened', async () => {
    const user = userEvent.setup()
    render(<Toggle />)
    const trigger = screen.getByRole('button', { name: 'Deck options' })

    await user.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')

    await user.click(outside())
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(panel()).toBe(null)
  })
})
