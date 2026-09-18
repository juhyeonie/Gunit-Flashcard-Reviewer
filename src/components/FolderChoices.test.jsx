// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DeckModal from './DeckModal.jsx'
import MoveDeckModal from './MoveDeckModal.jsx'
import DeckDetail from '../pages/DeckDetail.jsx'
import { KEY, deck, renderRoute } from '../../test/render-app.jsx'
import { DEFAULT_SETTINGS } from '../data/normalize.js'

/**
 * The places a deck's folder is chosen: creating it, editing it, and moving it
 * from its own page.
 */

const FOLDERS = [
  { id: 'f-chem', name: 'Chemistry' },
  { id: 'f-bio', name: 'Biology' },
]

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>'
  localStorage.clear()
})
afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('the folder field in Create a deck', () => {
  const create = (over = {}) => {
    const props = { mode: 'create', onClose: vi.fn(), onSave: vi.fn(), folders: FOLDERS, ...over }
    render(<DeckModal {...props} />)
    return props
  }

  it('is not there until a folder exists, so the dialog is unchanged', () => {
    create({ folders: [] })
    expect(screen.queryByLabelText(/Folder/)).toBe(null)
  })

  it('is optional, and starts on No folder', () => {
    create()
    const field = screen.getByLabelText(/Folder/)
    expect(field.value).toBe('')
    expect(field.closest('label').textContent).toMatch(/optional/)
  })

  it('lists the folders alphabetically', () => {
    create()
    const options = within(screen.getByLabelText(/Folder/)).getAllByRole('option').map((o) => o.textContent)
    expect(options).toEqual(['No folder', 'Biology', 'Chemistry'])
  })

  it('creates the deck in the folder chosen', async () => {
    const p = create()
    await userEvent.type(screen.getByLabelText(/Deck name/), 'Cells')
    await userEvent.type(screen.getByLabelText(/Subject/), 'Biology')
    await userEvent.selectOptions(screen.getByLabelText(/Folder/), 'f-bio')
    await userEvent.click(screen.getByRole('button', { name: 'Create deck' }))
    expect(p.onSave).toHaveBeenCalledWith(expect.objectContaining({ title: 'Cells', folderId: 'f-bio' }))
  })

  it('arrives with the folder chosen when started from inside one', async () => {
    const p = create({ initialFolderId: 'f-chem' })
    expect(screen.getByLabelText(/Folder/).value).toBe('f-chem')
    await userEvent.type(screen.getByLabelText(/Deck name/), 'Bonds')
    await userEvent.type(screen.getByLabelText(/Subject/), 'Chemistry')
    await userEvent.click(screen.getByRole('button', { name: 'Create deck' }))
    expect(p.onSave).toHaveBeenCalledWith(expect.objectContaining({ folderId: 'f-chem' }))
  })

  it('creates it ungrouped when no folder is chosen', async () => {
    const p = create()
    await userEvent.type(screen.getByLabelText(/Deck name/), 'Cells')
    await userEvent.type(screen.getByLabelText(/Subject/), 'Biology')
    await userEvent.click(screen.getByRole('button', { name: 'Create deck' }))
    expect(p.onSave).toHaveBeenCalledWith(expect.objectContaining({ folderId: null }))
  })
})

describe('the folder field in Deck details', () => {
  const editing = (folderId) => {
    const props = {
      mode: 'edit',
      deck: { ...deck(), folderId },
      folders: FOLDERS,
      onClose: vi.fn(),
      onSave: vi.fn(),
    }
    render(<DeckModal {...props} />)
    return props
  }

  it('starts on the deck’s current folder', () => {
    editing('f-chem')
    expect(screen.getByLabelText(/Folder/).value).toBe('f-chem')
  })

  it('moves the deck, keeping every other field as it was', async () => {
    const p = editing('f-chem')
    await userEvent.selectOptions(screen.getByLabelText(/Folder/), 'f-bio')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(p.onSave).toHaveBeenCalledWith({
      title: 'Roman Republic',
      subject: 'Ancient Rome',
      desc: 'Magistracies and assemblies.',
      folderId: 'f-bio',
    })
  })

  it('takes it out of its folder with No folder', async () => {
    const p = editing('f-chem')
    await userEvent.selectOptions(screen.getByLabelText(/Folder/), '')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(p.onSave).toHaveBeenCalledWith(expect.objectContaining({ folderId: null }))
  })
})

describe('moving a deck', () => {
  const move = (folderId, folders = FOLDERS) => {
    const props = { deck: { ...deck(), folderId }, folders, onClose: vi.fn(), onMove: vi.fn() }
    render(<MoveDeckModal {...props} />)
    return props
  }

  it('offers Ungrouped first, then every folder', () => {
    move(null)
    const names = screen.getAllByRole('radio').map((r) => r.closest('label').textContent)
    expect(names[0]).toMatch(/^Ungrouped/)
    expect(names.slice(1).map((n) => n.replace('Now', ''))).toEqual(['Biology', 'Chemistry'])
  })

  it('marks where the deck is now', () => {
    move('f-chem')
    const now = screen.getByText('Now').closest('label')
    expect(now.textContent).toMatch(/Chemistry/)
    expect(within(now).getByRole('radio').checked).toBe(true)
  })

  it('will not move a deck to where it already is', () => {
    move('f-chem')
    expect(screen.getByRole('button', { name: 'Move deck' }).disabled).toBe(true)
  })

  it('moves it into a folder', async () => {
    const p = move(null)
    await userEvent.click(screen.getByRole('radio', { name: /Biology/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Move deck' }))
    expect(p.onMove).toHaveBeenCalledWith('f-bio')
  })

  it('moves it out to Ungrouped', async () => {
    const p = move('f-bio')
    await userEvent.click(screen.getByRole('radio', { name: /Ungrouped/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Move deck' }))
    expect(p.onMove).toHaveBeenCalledWith(null)
  })

  it('says how to get a folder when there is none', () => {
    move(null, [])
    expect(screen.getByText(/There are no folders yet/)).toBeTruthy()
  })
})

describe('Move to folder, on the deck’s own page', () => {
  const page = (folderId) => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        folders: [{ id: 'f-bio', name: 'Biology' }],
        decks: [{ ...deck(), folderId }],
        sessions: [],
        theme: 'light',
        settings: DEFAULT_SETTINGS,
      }),
    )
    const onMoveDeck = vi.fn()
    renderRoute(
      '/decks/republic',
      '/decks/:id',
      <DeckDetail
        onEditDeck={vi.fn()}
        onNewCard={vi.fn()}
        onEditCard={vi.fn()}
        onDeleteCard={vi.fn()}
        onResetDeck={vi.fn()}
        onMoveDeck={onMoveDeck}
        onImport={vi.fn()}
      />,
    )
    return onMoveDeck
  }

  it('is in the deck menu, and says where the deck is', async () => {
    page('f-bio')
    await userEvent.click(screen.getByRole('button', { name: 'Deck options' }))
    expect(screen.getByRole('button', { name: /Move to folder/ }).textContent).toMatch(/In “Biology”/)
  })

  it('says so when the deck is in no folder', async () => {
    page(null)
    await userEvent.click(screen.getByRole('button', { name: 'Deck options' }))
    expect(screen.getByRole('button', { name: /Move to folder/ }).textContent).toMatch(/Not in a folder/)
  })

  it('opens the move, with the deck', async () => {
    const onMoveDeck = page(null)
    await userEvent.click(screen.getByRole('button', { name: 'Deck options' }))
    await userEvent.click(screen.getByRole('button', { name: /Move to folder/ }))
    expect(onMoveDeck).toHaveBeenCalledWith(expect.objectContaining({ id: 'republic' }))
  })
})
