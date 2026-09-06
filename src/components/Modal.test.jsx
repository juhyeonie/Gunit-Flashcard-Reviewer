// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Modal from './Modal.jsx'

/**
 * The dialog shell, and the promises it makes to a keyboard.
 *
 * `aria-modal="true"` tells assistive technology that everything behind is
 * unavailable, which is only true because the app root is marked inert. Focus
 * has to arrive inside and go back where it came from. Both have been broken
 * here before and neither is visible on screen.
 */

const open = (props = {}) =>
  render(
    <Modal open onClose={props.onClose ?? vi.fn()} title="Import a file" confirmLabel="Save" {...props}>
      <input aria-label="Deck name" />
    </Modal>,
  )

beforeEach(() => {
  const root = document.createElement('div')
  root.id = 'root'
  root.innerHTML = '<button id="trigger">Open</button>'
  document.body.append(root)
})

afterEach(() => {
  cleanup()
  document.getElementById('root')?.remove()
})

describe('while it is open', () => {
  it('renders outside the app root, so the root can be made inert', () => {
    open()
    const dialog = screen.getByRole('dialog')
    expect(document.getElementById('root').contains(dialog)).toBe(false)
  })

  it('marks the rest of the app inert, backing up aria-modal', () => {
    open()
    expect(document.getElementById('root').inert).toBe(true)
  })

  it('moves focus to the first field', () => {
    open()
    expect(document.activeElement).toBe(screen.getByLabelText('Deck name'))
  })

  it('focuses the dialog itself when it has no fields', () => {
    render(
      <Modal open onClose={vi.fn()} title="Delete deck?" confirmLabel="Delete">
        <p>This cannot be undone.</p>
      </Modal>,
    )
    // Something inside has to hold focus, or the reader is left on <body>
    // behind an inert root with nothing to read.
    expect(document.activeElement).toBe(screen.getByRole('dialog'))
  })

  it('stops the page behind from scrolling', () => {
    open()
    expect(document.body.style.overflow).toBe('hidden')
  })
})

describe('closing', () => {
  it('closes on Escape', async () => {
    const onClose = vi.fn()
    open({ onClose })
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on the Close button', async () => {
    const onClose = vi.fn()
    open({ onClose })
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on Cancel', async () => {
    const onClose = vi.fn()
    open({ onClose })
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('does not close on a click inside itself', async () => {
    const onClose = vi.fn()
    open({ onClose })
    await userEvent.click(screen.getByLabelText('Deck name'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('lifts inert and gives focus back to whatever opened it', () => {
    const trigger = document.getElementById('trigger')
    trigger.focus()

    const { unmount } = open()
    expect(document.activeElement).not.toBe(trigger)

    unmount()

    // Order matters: focusing anything under an inert root is refused, so
    // lifting inert has to happen first or the reader lands on <body>.
    expect(document.getElementById('root').inert).toBe(false)
    expect(document.activeElement).toBe(trigger)
  })

  it('restores the scroll it took away', () => {
    const { unmount } = open()
    unmount()
    expect(document.body.style.overflow).toBe('')
  })
})

describe('the confirm button', () => {
  it('runs the action it was given', async () => {
    const onConfirm = vi.fn()
    open({ onConfirm })
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onConfirm).toHaveBeenCalled()
  })

  it('does nothing while disabled', async () => {
    const onConfirm = vi.fn()
    open({ onConfirm, confirmDisabled: true })
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onConfirm).not.toHaveBeenCalled()
  })
})

describe('when it is not open', () => {
  it('renders nothing, and leaves the app alone', () => {
    render(
      <Modal open={false} onClose={vi.fn()} title="Import a file" confirmLabel="Save">
        <input aria-label="Deck name" />
      </Modal>,
    )
    expect(screen.queryByRole('dialog')).toBe(null)
    // Falsy rather than false: never having been set reads as undefined, and
    // the point is that nothing touched it.
    expect(document.getElementById('root').inert).toBeFalsy()
  })
})
