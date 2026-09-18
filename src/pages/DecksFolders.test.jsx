// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Decks from './Decks.jsx'
import { KEY, deck, renderRoute, stored } from '../../test/render-app.jsx'
import { DEFAULT_SETTINGS } from '../data/normalize.js'

/**
 * Folders in the library: shown as sections, each holding its own decks, with
 * everything else under Ungrouped. A library with no folders looks exactly as
 * it always has.
 */

const BIO = 'folder-bio'
const CHEM = 'folder-chem'

/** Writes a library with folders, the way the store keeps one. */
const library = ({ folders, decks }) =>
  localStorage.setItem(
    KEY,
    JSON.stringify({ folders, decks, sessions: [], theme: 'light', settings: DEFAULT_SETTINGS }),
  )

const withFolders = () =>
  library({
    folders: [
      { id: BIO, name: 'Biology' },
      { id: CHEM, name: 'Chemistry' },
    ],
    decks: [
      { ...deck({ id: 'cells', title: 'Cells' }), folderId: BIO },
      { ...deck({ id: 'genes', title: 'Genes' }), folderId: BIO },
      { ...deck({ id: 'loose', title: 'Loose ends' }), folderId: null },
    ],
  })

const open = () => renderRoute('/decks', '/decks', <Decks onNewDeck={vi.fn()} onEditDeck={vi.fn()} />)

/** The section a folder heading belongs to. */
const section = (name) => screen.getByRole('heading', { level: 2, name }).closest('section')
const titlesIn = (el) => within(el).queryAllByRole('heading', { level: 3 }).map((h) => h.textContent)

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('a library with no folders', () => {
  it('looks exactly as it did before folders existed', () => {
    library({ folders: [], decks: [deck({ id: 'a', title: 'Alpha' }), deck({ id: 'b', title: 'Beta' })] })
    open()
    // Deck titles straight under the page heading, no sections, no Ungrouped.
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent).sort()).toEqual([
      'Alpha',
      'Beta',
    ])
    expect(screen.queryByText('Ungrouped')).toBe(null)
    expect(screen.queryByRole('group', { name: 'Folders' })).toBe(null)
  })

  it('still offers a way to make the first folder', () => {
    library({ folders: [], decks: [deck()] })
    open()
    expect(screen.getByRole('button', { name: 'New folder' })).toBeTruthy()
  })
})

describe('a library with folders', () => {
  it('shows each folder with the decks inside it', () => {
    withFolders()
    open()
    expect(titlesIn(section('Biology')).sort()).toEqual(['Cells', 'Genes'])
  })

  it('keeps ungrouped decks under Ungrouped', () => {
    withFolders()
    open()
    expect(titlesIn(section('Ungrouped'))).toEqual(['Loose ends'])
  })

  it('shows every deck exactly once', () => {
    withFolders()
    open()
    const all = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent).sort()
    expect(all).toEqual(['Cells', 'Genes', 'Loose ends'])
  })

  it('says how many decks each folder holds', () => {
    withFolders()
    open()
    expect(within(section('Biology')).getByText('2 decks')).toBeTruthy()
    expect(within(section('Chemistry')).getByText('0 decks')).toBeTruthy()
  })

  it('shows an empty folder rather than hiding it', () => {
    withFolders()
    open()
    expect(within(section('Chemistry')).getByText(/No decks in this folder yet/)).toBeTruthy()
  })

  it('shows a deck whose folder is gone under Ungrouped', () => {
    library({
      folders: [{ id: BIO, name: 'Biology' }],
      decks: [{ ...deck({ id: 'stray', title: 'Stray' }), folderId: 'deleted-elsewhere' }],
    })
    open()
    expect(titlesIn(section('Ungrouped'))).toEqual(['Stray'])
  })

  it('folds a folder away, and back', async () => {
    withFolders()
    open()
    const toggle = within(section('Biology')).getByRole('button', { expanded: true })
    await userEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(document.getElementById(toggle.getAttribute('aria-controls')).hidden).toBe(true)
    await userEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
  })

  it('hides folders with nothing matching a search, and keeps those that match', async () => {
    withFolders()
    open()
    await userEvent.type(screen.getByLabelText('Search decks and cards'), 'Cells')
    expect(screen.queryByRole('heading', { level: 2, name: 'Chemistry' })).toBe(null)
    expect(titlesIn(section('Biology'))).toEqual(['Cells'])
    expect(screen.queryByRole('heading', { level: 2, name: 'Ungrouped' })).toBe(null)
  })

  it('says so when a search matches nothing anywhere', async () => {
    withFolders()
    open()
    await userEvent.type(screen.getByLabelText('Search decks and cards'), 'zzz')
    expect(screen.getByText(/Nothing matches/)).toBeTruthy()
  })
})

describe('creating a folder', () => {
  it('adds a section for it', async () => {
    library({ folders: [], decks: [deck({ id: 'a', title: 'Alpha' })] })
    open()
    await userEvent.click(screen.getByRole('button', { name: 'New folder' }))
    await userEvent.type(screen.getByLabelText(/Folder name/), 'Physics')
    await userEvent.click(screen.getByRole('button', { name: 'Create folder' }))

    expect(section('Physics')).toBeTruthy()
    expect(stored().folders.map((f) => f.name)).toEqual(['Physics'])
    // The deck that was already here is now shown as ungrouped.
    expect(titlesIn(section('Ungrouped'))).toEqual(['Alpha'])
  })

  it('refuses a name that is already taken', async () => {
    withFolders()
    open()
    await userEvent.click(screen.getByRole('button', { name: 'New folder' }))
    await userEvent.type(screen.getByLabelText(/Folder name/), 'biology')
    expect(screen.getByRole('button', { name: 'Create folder' }).disabled).toBe(true)
    expect(screen.getByText(/already a folder called/)).toBeTruthy()
  })

  it('refuses a blank name', async () => {
    withFolders()
    open()
    await userEvent.click(screen.getByRole('button', { name: 'New folder' }))
    await userEvent.type(screen.getByLabelText(/Folder name/), '   ')
    expect(screen.getByRole('button', { name: 'Create folder' }).disabled).toBe(true)
  })
})

describe('renaming a folder', () => {
  it('renames it from its menu, and its decks stay in it', async () => {
    withFolders()
    open()
    await userEvent.click(screen.getByRole('button', { name: 'Folder options for Biology' }))
    await userEvent.click(screen.getByRole('button', { name: 'Rename folder' }))
    const field = screen.getByLabelText(/Folder name/)
    await userEvent.clear(field)
    await userEvent.type(field, 'Biology 101')
    await userEvent.click(screen.getByRole('button', { name: 'Save name' }))

    expect(screen.queryByRole('heading', { level: 2, name: 'Biology' })).toBe(null)
    expect(titlesIn(section('Biology 101')).sort()).toEqual(['Cells', 'Genes'])
  })
})

describe('deleting a folder', () => {
  it('says its decks will move, not be deleted', async () => {
    withFolders()
    open()
    await userEvent.click(screen.getByRole('button', { name: 'Folder options for Biology' }))
    await userEvent.click(screen.getByRole('button', { name: /Delete folder/ }))
    const dialog = screen.getByRole('dialog', { name: /Delete “Biology”/ })
    expect(within(dialog).getByText(/2 decks move to Ungrouped. No decks or cards are deleted./)).toBeTruthy()
  })

  it('moves its decks to Ungrouped and keeps every one of them', async () => {
    withFolders()
    open()
    await userEvent.click(screen.getByRole('button', { name: 'Folder options for Biology' }))
    await userEvent.click(screen.getByRole('button', { name: /Delete folder/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Delete folder' }))

    expect(screen.queryByRole('heading', { level: 2, name: 'Biology' })).toBe(null)
    expect(titlesIn(section('Ungrouped')).sort()).toEqual(['Cells', 'Genes', 'Loose ends'])
    expect(stored().decks).toHaveLength(3)
    expect(stored().decks.every((d) => d.folderId === null)).toBe(true)
  })
})
