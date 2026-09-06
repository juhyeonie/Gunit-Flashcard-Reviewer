// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ImportFileModal from './ImportFileModal.jsx'

/**
 * The import modal end to end, through the DOM rather than through its parts.
 *
 * Everything here uses .txt files. The other readers are dynamic imports of
 * PDF.js, Mammoth and Tesseract — megabytes of parser, covered by their own
 * tests — and the point of these is the modal: what it stages, what it lets
 * you do next, and what it hands back when you confirm.
 */

const props = () => ({
  onClose: vi.fn(),
  onCreateDeck: vi.fn(() => ({ id: 'new-deck' })),
  onAddCards: vi.fn(),
  onOpenDeck: vi.fn(),
  say: vi.fn(),
})

const txt = (name, contents) => new File([contents], name, { type: 'text/plain' })

/** The picker is off-screen by design, so it is reached by role-free query. */
const filePicker = () => document.querySelector('input[type="file"]')

const glossary = ['Consul: the senior magistrate', 'Praetor: the judicial magistrate'].join('\n')

/** Waits for the reading a dropped file kicks off to settle. */
const readsAs = (text) =>
  waitFor(() => expect(screen.getByLabelText(/Extracted text/).value).toBe(text))

beforeEach(() => {
  // Modal marks the app inert while open and puts focus back afterwards.
  const root = document.createElement('div')
  root.id = 'root'
  document.body.append(root)
})

afterEach(() => {
  cleanup()
  document.getElementById('root')?.remove()
})

describe('choosing files', () => {
  it('shows nothing but the dropzone until a file is chosen', () => {
    render(<ImportFileModal {...props()} />)
    expect(screen.getByText('Drop your material here')).toBeTruthy()
    expect(screen.queryByLabelText(/Extracted text/)).toBe(null)
  })

  it('lists a file with its word count once it has been read', async () => {
    render(<ImportFileModal {...props()} />)
    await userEvent.upload(filePicker(), txt('notes.txt', 'Hannibal crossed the Alps.'))

    expect(await screen.findByText('notes.txt')).toBeTruthy()
    // Anchored on the size, because the review panel's own label also counts
    // the words and would match a bare /4 words/.
    await waitFor(() => expect(screen.getByText(/B · 4 words/)).toBeTruthy())
  })

  it('reports a file it cannot read without discarding the ones it can', async () => {
    // The whole reason extractText resolves rather than throws.
    render(<ImportFileModal {...props()} />)
    await userEvent.upload(filePicker(), [
      txt('notes.txt', 'Hannibal crossed the Alps.'),
      txt('lecture.mp4', 'not really a video'),
    ])

    await waitFor(() => expect(screen.getByText(/Cannot read .mp4 files/)).toBeTruthy())
    expect(screen.getByText(/B · 4 words/)).toBeTruthy()
  })

  it('drops a file from the list when it is removed', async () => {
    render(<ImportFileModal {...props()} />)
    await userEvent.upload(filePicker(), txt('notes.txt', 'Hannibal crossed the Alps.'))
    await screen.findByText('notes.txt')

    await userEvent.click(screen.getByRole('button', { name: 'Remove notes.txt' }))
    expect(screen.queryByText('notes.txt')).toBe(null)
  })
})

describe('building cards', () => {
  it('previews the cards the text splits into', async () => {
    render(<ImportFileModal {...props()} />)
    await userEvent.upload(filePicker(), txt('glossary.txt', glossary))

    const preview = await screen.findByRole('list')
    const cards = within(preview).getAllByRole('listitem')
    expect(cards.map((li) => li.textContent)).toEqual([
      'Consul → the senior magistrate',
      'Praetor → the judicial magistrate',
    ])
  })

  it('says which format it worked out, so a wrong guess is visible', async () => {
    render(<ImportFileModal {...props()} />)
    await userEvent.upload(filePicker(), txt('glossary.txt', glossary))
    expect(await screen.findByText(/2 cards · split on Colon/)).toBeTruthy()
  })

  it('follows the separator when one is chosen by hand', async () => {
    render(<ImportFileModal {...props()} />)
    await userEvent.upload(filePicker(), txt('glossary.txt', glossary))
    await screen.findByRole('list')

    await userEvent.selectOptions(screen.getByLabelText(/Split on/), 'tab')

    expect(screen.queryByRole('list')).toBe(null)
    expect(screen.getByText(/Nothing here splits into cards/)).toBeTruthy()
  })

  it('re-splits as the text is edited', async () => {
    render(<ImportFileModal {...props()} />)
    await userEvent.upload(filePicker(), txt('glossary.txt', glossary))
    await screen.findByRole('list')

    await userEvent.type(screen.getByLabelText(/Extracted text/), '\nCensor: kept the roll')

    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(3))
  })

  it('offers a way back from an edit, and only once there is one', async () => {
    render(<ImportFileModal {...props()} />)
    await userEvent.upload(filePicker(), txt('glossary.txt', glossary))
    await screen.findByRole('list')
    expect(screen.queryByRole('button', { name: 'Reset text' })).toBe(null)

    await userEvent.clear(screen.getByLabelText(/Extracted text/))
    await userEvent.type(screen.getByLabelText(/Extracted text/), 'Censor: kept the roll')
    await userEvent.click(await screen.findByRole('button', { name: 'Reset text' }))

    await readsAs(`# glossary.txt\n\n${glossary}`)
  })

  it('says nothing splits rather than showing an empty preview', async () => {
    render(<ImportFileModal {...props()} />)
    await userEvent.upload(filePicker(), txt('prose.txt', 'The Republic lasted five centuries.'))

    expect(await screen.findByText(/Nothing here splits into cards/)).toBeTruthy()
    expect(screen.queryByRole('list')).toBe(null)
  })
})

describe('confirming', () => {
  it('adds the cards to the deck it was opened from', async () => {
    const p = props()
    render(<ImportFileModal {...p} deckId="republic" />)
    await userEvent.upload(filePicker(), txt('glossary.txt', glossary))

    await userEvent.click(await screen.findByRole('button', { name: 'Add 2 cards' }))

    expect(p.onAddCards).toHaveBeenCalledWith('republic', [
      { front: 'Consul', back: 'the senior magistrate' },
      { front: 'Praetor', back: 'the judicial magistrate' },
    ])
    expect(p.onOpenDeck).toHaveBeenCalledWith('republic')
    expect(p.onClose).toHaveBeenCalled()
  })

  it('creates the deck first when the flow started without one', async () => {
    const p = props()
    render(<ImportFileModal {...p} pendingDeck />)
    await userEvent.type(screen.getByLabelText('Deck name'), 'Magistracies')
    await userEvent.upload(filePicker(), txt('glossary.txt', glossary))

    await userEvent.click(await screen.findByRole('button', { name: 'Add 2 cards' }))

    expect(p.onCreateDeck).toHaveBeenCalledWith({
      title: 'Magistracies',
      subject: 'General',
      desc: '',
    })
    // The cards go to the deck that was just made, not to nothing.
    expect(p.onAddCards.mock.calls[0][0]).toBe('new-deck')
  })

  it('refuses to create a deck with no name, and says why', async () => {
    const p = props()
    render(<ImportFileModal {...p} pendingDeck />)
    await userEvent.upload(filePicker(), txt('glossary.txt', glossary))

    await userEvent.click(await screen.findByRole('button', { name: 'Add 2 cards' }))

    expect(p.onCreateDeck).not.toHaveBeenCalled()
    expect(p.onAddCards).not.toHaveBeenCalled()
    expect(p.say).toHaveBeenCalledWith('Name the deck first')
    expect(p.onClose).not.toHaveBeenCalled()
  })

  it('still creates an empty deck when nothing split', async () => {
    // A deck worth starting is worth starting without cards.
    const p = props()
    render(<ImportFileModal {...p} pendingDeck />)
    await userEvent.type(screen.getByLabelText('Deck name'), 'Reading list')

    await userEvent.click(screen.getByRole('button', { name: 'Create empty deck' }))

    expect(p.onCreateDeck).toHaveBeenCalled()
    expect(p.onAddCards).not.toHaveBeenCalled()
    expect(p.say).toHaveBeenCalledWith('Deck created — add your first card')
  })

  it('carries a draft through from the Create a Deck handoff', async () => {
    const p = props()
    render(
      <ImportFileModal
        {...p}
        pendingDeck
        initialDraft={{ title: 'Magistracies', subject: 'Ancient Rome', desc: 'Offices' }}
      />,
    )
    expect(screen.getByLabelText('Deck name').value).toBe('Magistracies')
    expect(screen.getByLabelText('Subject').value).toBe('Ancient Rome')
    expect(screen.getByLabelText('Description').value).toBe('Offices')
  })
})

describe('what it promises', () => {
  it('does not claim to write cards', async () => {
    render(<ImportFileModal {...props()} />)
    await userEvent.upload(filePicker(), txt('glossary.txt', glossary))

    expect(await screen.findByText('Cards are split, not written')).toBeTruthy()
    expect(screen.getByText(/would need an AI model this version does not include/)).toBeTruthy()
  })
})
