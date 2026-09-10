// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DeckModal from './DeckModal.jsx'

/**
 * One modal doing two jobs, and the seams between them.
 *
 * Create and Edit share every field and differ in four strings, a delete
 * button and a source picker. That sharing is the reason to test it: the
 * differences are easy to get backwards, and one of them — the hand-off to the
 * Import modal, which closes this one carrying whatever has been typed — is
 * invisible from the outside until it drops somebody's half-filled form.
 *
 * The guard on the confirm button matters as much. A deck with no name is a
 * row in the library nobody can identify again.
 */

const props = (over = {}) => ({
  onClose: vi.fn(),
  onSave: vi.fn(),
  onDelete: vi.fn(),
  onRequestImport: vi.fn(),
  ...over,
})

const deck = {
  id: 'republic',
  title: 'Roman Republic',
  subject: 'Ancient Rome',
  desc: 'Magistracies and assemblies.',
}

beforeEach(() => {
  const root = document.createElement('div')
  root.id = 'root'
  document.body.append(root)
})

afterEach(() => {
  cleanup()
  document.getElementById('root')?.remove()
})

const confirmButton = () => screen.getByRole('button', { name: /Create deck|Save changes/ })

describe('creating a deck', () => {
  it('opens empty, with the create wording', () => {
    render(<DeckModal {...props()} />)

    expect(screen.getByLabelText(/Deck name/).value).toBe('')
    expect(screen.getByLabelText(/Subject/).value).toBe('')
    expect(screen.getByRole('button', { name: 'Create deck' })).toBeTruthy()
  })

  it('refuses to create one with no name', async () => {
    // A nameless deck is a row in the library nobody can identify again.
    const p = props()
    const user = userEvent.setup()
    render(<DeckModal {...p} />)

    expect(confirmButton().disabled).toBe(true)
    await user.type(screen.getByLabelText(/Subject/), 'Ancient Rome')
    expect(confirmButton().disabled).toBe(true)

    expect(p.onSave).not.toHaveBeenCalled()
  })

  it('refuses a name that is only spaces', async () => {
    const user = userEvent.setup()
    render(<DeckModal {...props()} />)

    await user.type(screen.getByLabelText(/Deck name/), '   ')
    await user.type(screen.getByLabelText(/Subject/), 'Ancient Rome')

    expect(confirmButton().disabled).toBe(true)
  })

  it('saves what was typed, and closes', async () => {
    const p = props()
    const user = userEvent.setup()
    render(<DeckModal {...p} />)

    await user.type(screen.getByLabelText(/Deck name/), 'Roman Provinces')
    await user.type(screen.getByLabelText(/Subject/), 'Ancient Rome')
    await user.type(screen.getByLabelText(/Description/), 'The imperial provinces.')
    await user.click(confirmButton())

    expect(p.onSave).toHaveBeenCalledWith({
      title: 'Roman Provinces',
      subject: 'Ancient Rome',
      desc: 'The imperial provinces.',
    })
    expect(p.onClose).toHaveBeenCalled()
  })

  it('allows an empty description, which is marked optional', async () => {
    const p = props()
    const user = userEvent.setup()
    render(<DeckModal {...p} />)

    await user.type(screen.getByLabelText(/Deck name/), 'Roman Provinces')
    await user.type(screen.getByLabelText(/Subject/), 'Ancient Rome')
    await user.click(confirmButton())

    expect(p.onSave).toHaveBeenCalledWith(expect.objectContaining({ desc: '' }))
  })

  it('offers no way to delete a deck that does not exist yet', () => {
    render(<DeckModal {...props()} />)
    expect(screen.queryByRole('button', { name: 'Delete deck' })).toBe(null)
  })
})

describe('handing off to the import modal', () => {
  it('carries the half-filled draft across', async () => {
    // The whole point of the hand-off. Losing what was typed here would make
    // "Import a file" a punishment for having started.
    const p = props()
    const user = userEvent.setup()
    render(<DeckModal {...p} />)

    await user.type(screen.getByLabelText(/Deck name/), 'Roman Provinces')
    await user.type(screen.getByLabelText(/Subject/), 'Ancient Rome')
    await user.click(screen.getByRole('button', { name: /Import a file/ }))

    expect(p.onRequestImport).toHaveBeenCalledWith({
      title: 'Roman Provinces',
      subject: 'Ancient Rome',
      desc: '',
    })
  })

  it('hands off even from an empty form, which is a valid way to start', async () => {
    const p = props()
    const user = userEvent.setup()
    render(<DeckModal {...p} />)

    await user.click(screen.getByRole('button', { name: /Import a file/ }))

    expect(p.onRequestImport).toHaveBeenCalledWith({ title: '', subject: '', desc: '' })
  })

  it('does not save or close on its own — the parent decides what happens next', async () => {
    const p = props()
    const user = userEvent.setup()
    render(<DeckModal {...p} />)

    await user.click(screen.getByRole('button', { name: /Import a file/ }))

    expect(p.onSave).not.toHaveBeenCalled()
    expect(p.onClose).not.toHaveBeenCalled()
  })

  it('asks nothing of the parent when "Write my own" is chosen', async () => {
    // It is the default, and choosing it again is not a request for anything.
    const p = props()
    const user = userEvent.setup()
    render(<DeckModal {...p} />)

    await user.click(screen.getByRole('button', { name: /Write my own/ }))

    expect(p.onRequestImport).not.toHaveBeenCalled()
  })
})

describe('editing a deck', () => {
  const editing = (over = {}) => props({ mode: 'edit', deck, ...over })

  it('opens holding what the deck already says', () => {
    render(<DeckModal {...editing()} />)

    expect(screen.getByLabelText(/Deck name/).value).toBe('Roman Republic')
    expect(screen.getByLabelText(/Subject/).value).toBe('Ancient Rome')
    expect(screen.getByLabelText(/Description/).value).toBe('Magistracies and assemblies.')
  })

  it('promises the cards survive a rename, because that is the fear', () => {
    render(<DeckModal {...editing()} />)
    expect(screen.getByText(/keeps all of its cards and review history/i)).toBeTruthy()
  })

  it('saves the edited fields', async () => {
    const p = editing()
    const user = userEvent.setup()
    render(<DeckModal {...p} />)

    const title = screen.getByLabelText(/Deck name/)
    await user.clear(title)
    await user.type(title, 'Roman Republic: Institutions')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(p.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Roman Republic: Institutions' }),
    )
  })

  it('will not let an existing deck lose its name', async () => {
    const p = editing()
    const user = userEvent.setup()
    render(<DeckModal {...p} />)

    await user.clear(screen.getByLabelText(/Deck name/))

    expect(screen.getByRole('button', { name: 'Save changes' }).disabled).toBe(true)
    expect(p.onSave).not.toHaveBeenCalled()
  })

  it('offers no source picker — the deck already has its cards', () => {
    render(<DeckModal {...editing()} />)
    expect(screen.queryByRole('button', { name: /Import a file/ })).toBe(null)
    expect(screen.queryByRole('button', { name: /Write my own/ })).toBe(null)
  })

  it('hands the deck to the delete handler rather than deleting it here', async () => {
    // This modal knows nothing about the library. The parent owns the
    // confirmation, which is why nothing here closes on the way out.
    const p = editing()
    const user = userEvent.setup()
    render(<DeckModal {...p} />)

    await user.click(screen.getByRole('button', { name: 'Delete deck' }))

    expect(p.onDelete).toHaveBeenCalledWith(deck)
    expect(p.onSave).not.toHaveBeenCalled()
  })

  it('shows no delete button when the parent offers no handler', () => {
    render(<DeckModal {...editing({ onDelete: undefined })} />)
    expect(screen.queryByRole('button', { name: 'Delete deck' })).toBe(null)
  })
})
