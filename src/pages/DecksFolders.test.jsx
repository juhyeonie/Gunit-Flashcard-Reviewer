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

  it('shows an empty folder rather than hiding it, with the ways to fill it', () => {
    withFolders()
    open()
    const chemistry = section('Chemistry')
    expect(within(chemistry).getByText('Nothing filed here yet.')).toBeTruthy()
    expect(within(chemistry).getByRole('button', { name: 'Add decks' })).toBeTruthy()
    expect(within(chemistry).getByRole('button', { name: 'New deck here' })).toBeTruthy()
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

describe('filling a folder several decks at a time', () => {
  /** The menu's item, not the button an empty folder shows under its header. */
  const addItem = () =>
    screen.getAllByRole('button', { name: /^Add decks/ }).find((b) => !b.closest('[id$="-decks"]'))

  const openAdd = async (name = 'Chemistry') => {
    await userEvent.click(screen.getByRole('button', { name: `Folder options for ${name}` }))
    await userEvent.click(addItem())
    return screen.getByRole('dialog', { name: `Add decks to “${name}”` })
  }

  it('lists every deck not already there, and says where each one is now', async () => {
    withFolders()
    open()
    const dialog = await openAdd()
    const rows = within(dialog).getAllByRole('checkbox').map((c) => c.closest('label').textContent)
    expect(rows).toEqual([
      expect.stringMatching(/^Cells.*in Biology$/),
      expect.stringMatching(/^Genes.*in Biology$/),
      expect.stringMatching(/^Loose ends.*ungrouped$/),
    ])
  })

  it('files every deck ticked, in one go', async () => {
    withFolders()
    open()
    const dialog = await openAdd()
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /Genes/ }))
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /Loose ends/ }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add 2 decks' }))

    expect(titlesIn(section('Chemistry')).sort()).toEqual(['Genes', 'Loose ends'])
    // Moved, not copied: Genes has left Biology.
    expect(titlesIn(section('Biology'))).toEqual(['Cells'])
    expect(stored().decks).toHaveLength(3)
  })

  it('adds nothing until a deck is ticked', async () => {
    withFolders()
    open()
    const dialog = await openAdd()
    expect(within(dialog).getByRole('button', { name: 'Add decks' }).disabled).toBe(true)
  })

  it('offers a filter once the list is long', async () => {
    library({
      folders: [{ id: BIO, name: 'Biology' }],
      decks: Array.from({ length: 10 }, (_, i) => ({ ...deck({ id: `d${i}`, title: `Deck ${i}` }), folderId: null })),
    })
    open()
    const dialog = await openAdd('Biology')
    await userEvent.type(within(dialog).getByRole('searchbox', { name: 'Find a deck' }), 'Deck 7')
    expect(within(dialog).getAllByRole('checkbox')).toHaveLength(1)
  })

  it('is greyed out in the menu when every deck is already in the folder', async () => {
    library({ folders: [{ id: BIO, name: 'Biology' }], decks: [{ ...deck(), folderId: BIO }] })
    open()
    await userEvent.click(screen.getByRole('button', { name: 'Folder options for Biology' }))
    expect(addItem().disabled).toBe(true)
  })

  it('opens straight after a folder is made, so it does not start empty', async () => {
    withFolders()
    open()
    await userEvent.click(screen.getByRole('button', { name: 'New folder' }))
    await userEvent.type(screen.getByLabelText(/Folder name/), 'Physics')
    await userEvent.click(screen.getByRole('button', { name: 'Create folder' }))

    const dialog = await screen.findByRole('dialog', { name: 'Add decks to “Physics”' })
    // And it can be skipped: it is an offer, not a step.
    await userEvent.click(within(dialog).getByRole('button', { name: 'Skip for now' }))
    expect(screen.queryByRole('dialog')).toBe(null)
    expect(section('Physics')).toBeTruthy()
  })

  it('does not open after making a folder when there are no decks to put in it', async () => {
    library({ folders: [], decks: [] })
    open()
    await userEvent.click(screen.getByRole('button', { name: 'New folder' }))
    await userEvent.type(screen.getByLabelText(/Folder name/), 'Physics')
    await userEvent.click(screen.getByRole('button', { name: 'Create folder' }))
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.queryByRole('dialog')).toBe(null)
  })

  it('is reachable from an empty folder too', async () => {
    withFolders()
    open()
    await userEvent.click(within(section('Chemistry')).getByRole('button', { name: 'Add decks' }))
    expect(screen.getByRole('dialog', { name: 'Add decks to “Chemistry”' })).toBeTruthy()
  })
})

describe('starting a deck inside a folder', () => {
  it('asks for a new deck with that folder chosen', async () => {
    withFolders()
    const onNewDeck = vi.fn()
    renderRoute('/decks', '/decks', <Decks onNewDeck={onNewDeck} onEditDeck={vi.fn()} />)
    await userEvent.click(within(section('Chemistry')).getByRole('button', { name: 'New deck here' }))
    expect(onNewDeck).toHaveBeenCalledWith(CHEM)
  })

  it('asks for one with no folder from the header', async () => {
    withFolders()
    const onNewDeck = vi.fn()
    renderRoute('/decks', '/decks', <Decks onNewDeck={onNewDeck} onEditDeck={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'New deck' }))
    // Called with nothing — not with the click event, which is not a folder.
    expect(onNewDeck).toHaveBeenCalledWith()
  })
})

describe('the folder header', () => {
  it('is a heading holding the button, so it can be navigated to as a heading', () => {
    withFolders()
    open()
    const heading = screen.getByRole('heading', { level: 2, name: 'Biology' })
    expect(within(heading).getByRole('button', { expanded: true })).toBeTruthy()
  })

  it('says how many cards are waiting inside', () => {
    library({
      folders: [{ id: BIO, name: 'Biology' }],
      decks: [{ ...deck({ id: 'cells', title: 'Cells', count: 3 }), folderId: BIO }],
    })
    open()
    // Three new cards, all due — said on the folder, not only on the card.
    const onHeader = within(section('Biology'))
      .getAllByText(/3 due/)
      .filter((el) => !el.closest('article'))
    expect(onHeader).toHaveLength(1)
  })

  it('stays folded after the page is left and come back to', async () => {
    withFolders()
    open()
    await userEvent.click(within(section('Biology')).getByRole('button', { expanded: true }))
    cleanup()

    open()
    const toggle = within(section('Biology')).getByRole('button', { name: 'Biology' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
  })

  it('opens a folded folder while a search finds something in it', async () => {
    withFolders()
    open()
    await userEvent.click(within(section('Biology')).getByRole('button', { expanded: true }))
    await userEvent.type(screen.getByLabelText('Search decks and cards'), 'Cells')
    const toggle = within(section('Biology')).getByRole('button', { name: 'Biology' })
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(titlesIn(section('Biology'))).toEqual(['Cells'])
  })

  it('keeps "New folder" as the button’s name when the label is hidden on a phone', () => {
    withFolders()
    open()
    expect(screen.getByRole('button', { name: 'New folder' }).textContent).toBe('New folder')
  })
})
