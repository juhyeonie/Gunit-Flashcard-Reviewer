// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AppProvider } from './AppContext.jsx'
import { AuthContext } from './authContext.js'
import { useApp } from './useApp.js'
import { GUEST_KEY, userKey } from './storageKeys.js'
import { FOLDER_NAME_MAX, normalizeState, parseStoredState } from './normalize.js'
import { grade } from './scheduler.js'

/**
 * Folders, as the store holds them.
 *
 * One level: a folder is a name and an id, and each deck says which folder it
 * is in, or null. Nothing is ever copied into a folder, so there is nothing to
 * duplicate and nothing a folder's deletion could take with it.
 */

const wrapper = (user = null) => {
  function Identity({ children }) {
    return (
      <AuthContext.Provider value={{ user, available: Boolean(user), status: 'ready' }}>
        <AppProvider>{children}</AppProvider>
      </AuthContext.Provider>
    )
  }
  return Identity
}

const store = (user) => renderHook(() => useApp(), { wrapper: wrapper(user) })

const T0 = Date.UTC(2026, 3, 1, 9)

/** A library with history in it, so "untouched" can visibly fail. */
const library = () => {
  const graded = grade(undefined, 'good', T0)
  return {
    decks: [
      {
        id: 'cells',
        title: 'Cells',
        subject: 'Biology',
        desc: '',
        cards: [
          { id: 'c1', front: 'Mitochondria?', back: 'Powerhouse.' },
          { id: 'c2', front: 'Ribosome?', back: 'Makes proteins.' },
        ],
        schedule: { c1: graded },
      },
      {
        id: 'bonds',
        title: 'Bonds',
        subject: 'Chemistry',
        desc: '',
        cards: [{ id: 'b1', front: 'Covalent?', back: 'Shared electrons.' }],
        schedule: {},
      },
    ],
    sessions: [],
  }
}

const seed = (state = library()) => localStorage.setItem(GUEST_KEY, JSON.stringify(state))
const stored = () => JSON.parse(localStorage.getItem(GUEST_KEY))
const deckOf = (result, id) => result.current.decks.find((d) => d.id === id)

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('an existing library, from before folders', () => {
  it('loads with every deck ungrouped', () => {
    const state = normalizeState(library(), T0)
    expect(state.folders).toEqual([])
    for (const deck of state.decks) expect(deck.folderId).toBe(null)
  })

  it('keeps every card and every schedule exactly as it was', () => {
    const before = library()
    const after = normalizeState(before, T0)
    const cells = after.decks.find((d) => d.id === 'cells')
    expect(cells.cards).toEqual(before.decks[0].cards)
    expect(cells.schedule).toEqual(before.decks[0].schedule)
  })

  it('writes the migrated shape back', () => {
    seed()
    const { unmount } = store()
    unmount()
    const saved = stored()
    expect(saved.folders).toEqual([])
    expect(saved.decks.every((d) => d.folderId === null)).toBe(true)
  })
})

describe('a deck whose folder is not there', () => {
  it('is ungrouped when the library loads', () => {
    // Deleted on another device, or lost from a hand-edited file.
    const state = library()
    state.folders = [{ id: 'bio', name: 'Biology' }]
    state.decks[0].folderId = 'bio'
    state.decks[1].folderId = 'gone'
    const loaded = normalizeState(state, T0)
    expect(loaded.decks.find((d) => d.id === 'cells').folderId).toBe('bio')
    expect(loaded.decks.find((d) => d.id === 'bonds').folderId).toBe(null)
  })

  it('drops a folder with no name or no id, and ungroups its decks', () => {
    const state = library()
    state.folders = [{ id: 'x', name: '   ' }, { name: 'No id' }, 'nonsense']
    state.decks[0].folderId = 'x'
    const loaded = normalizeState(state, T0)
    expect(loaded.folders).toEqual([])
    expect(loaded.decks[0].folderId).toBe(null)
  })

  it('survives a stored payload with no folders key at all', () => {
    const { state, ok } = parseStoredState(JSON.stringify({ decks: [], sessions: [] }))
    expect(ok).toBe(true)
    expect(state.folders).toEqual([])
  })
})

describe('creating a folder', () => {
  it('adds it and hands it back', () => {
    seed()
    const { result } = store()
    let made
    act(() => {
      made = result.current.createFolder('  Biology  ')
    })
    expect(made.name).toBe('Biology')
    expect(result.current.folders).toEqual([made])
  })

  it('gives it a uuid, the id the account will hold', () => {
    const { result } = store()
    let made
    act(() => {
      made = result.current.createFolder('Biology')
    })
    expect(made.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('refuses a blank name', () => {
    const { result } = store()
    let made
    act(() => {
      made = result.current.createFolder('   ')
    })
    expect(made).toBe(null)
    expect(result.current.folders).toEqual([])
  })

  it('keeps a name to the length the database holds', () => {
    const { result } = store()
    act(() => {
      result.current.createFolder('x'.repeat(200))
    })
    expect(result.current.folders[0].name).toHaveLength(FOLDER_NAME_MAX)
  })

  it('survives a reload', () => {
    const first = store()
    act(() => {
      first.result.current.createFolder('Biology')
    })
    first.unmount()
    const { result } = store()
    expect(result.current.folders.map((f) => f.name)).toEqual(['Biology'])
  })
})

describe('renaming a folder', () => {
  it('changes the name everywhere, because it is stored once', () => {
    seed()
    const { result } = store()
    let bio
    act(() => {
      bio = result.current.createFolder('Biology')
    })
    act(() => result.current.moveDeckToFolder('cells', bio.id))
    act(() => result.current.renameFolder(bio.id, 'Biology 101'))

    expect(result.current.folders).toEqual([{ id: bio.id, name: 'Biology 101' }])
    // The deck still points at the same folder, which now has the new name.
    expect(deckOf(result, 'cells').folderId).toBe(bio.id)
  })

  it('ignores a blank new name', () => {
    const { result } = store()
    let bio
    act(() => {
      bio = result.current.createFolder('Biology')
    })
    act(() => result.current.renameFolder(bio.id, '  '))
    expect(result.current.folders[0].name).toBe('Biology')
  })
})

describe('deleting a folder', () => {
  const withFolder = () => {
    seed()
    const hook = store()
    let bio
    act(() => {
      bio = hook.result.current.createFolder('Biology')
    })
    act(() => hook.result.current.moveDeckToFolder('cells', bio.id))
    return { ...hook, bio }
  }

  it('moves its decks to Ungrouped', () => {
    const { result, bio } = withFolder()
    act(() => result.current.deleteFolder(bio.id))
    expect(result.current.folders).toEqual([])
    expect(deckOf(result, 'cells').folderId).toBe(null)
  })

  it('deletes no deck, no card and no schedule', () => {
    const { result, bio } = withFolder()
    const before = deckOf(result, 'cells')
    act(() => result.current.deleteFolder(bio.id))
    const after = deckOf(result, 'cells')
    expect(result.current.decks).toHaveLength(2)
    expect(after.cards).toEqual(before.cards)
    expect(after.schedule).toEqual(before.schedule)
  })

  it('leaves decks in other folders where they are', () => {
    const { result, bio } = withFolder()
    let chem
    act(() => {
      chem = result.current.createFolder('Chemistry')
    })
    act(() => result.current.moveDeckToFolder('bonds', chem.id))
    act(() => result.current.deleteFolder(bio.id))
    expect(deckOf(result, 'bonds').folderId).toBe(chem.id)
  })
})

describe('moving a deck', () => {
  it('files it in a folder', () => {
    seed()
    const { result } = store()
    let bio
    act(() => {
      bio = result.current.createFolder('Biology')
    })
    act(() => result.current.moveDeckToFolder('cells', bio.id))
    expect(deckOf(result, 'cells').folderId).toBe(bio.id)
  })

  it('moves it between folders, without copying it', () => {
    seed()
    const { result } = store()
    let bio, chem
    act(() => {
      bio = result.current.createFolder('Biology')
      chem = result.current.createFolder('Chemistry')
    })
    act(() => result.current.moveDeckToFolder('cells', bio.id))
    act(() => result.current.moveDeckToFolder('cells', chem.id))
    expect(deckOf(result, 'cells').folderId).toBe(chem.id)
    expect(result.current.decks.filter((d) => d.id === 'cells')).toHaveLength(1)
  })

  it('moves it back to Ungrouped with null', () => {
    seed()
    const { result } = store()
    let bio
    act(() => {
      bio = result.current.createFolder('Biology')
    })
    act(() => result.current.moveDeckToFolder('cells', bio.id))
    act(() => result.current.moveDeckToFolder('cells', null))
    expect(deckOf(result, 'cells').folderId).toBe(null)
  })

  it('keeps its schedule when it moves', () => {
    seed()
    const { result } = store()
    const before = deckOf(result, 'cells').schedule
    let bio
    act(() => {
      bio = result.current.createFolder('Biology')
    })
    act(() => result.current.moveDeckToFolder('cells', bio.id))
    expect(deckOf(result, 'cells').schedule).toEqual(before)
  })

  it('refuses a folder that does not exist, leaving the deck ungrouped', () => {
    seed()
    const { result } = store()
    act(() => result.current.moveDeckToFolder('cells', 'no-such-folder'))
    expect(deckOf(result, 'cells').folderId).toBe(null)
  })
})

describe('creating and editing a deck with a folder', () => {
  it('creates a deck straight into a folder', () => {
    const { result } = store()
    let bio, made
    act(() => {
      bio = result.current.createFolder('Biology')
    })
    act(() => {
      made = result.current.addDeck({ title: 'Cells', subject: 'Biology', desc: '', folderId: bio.id })
    })
    expect(deckOf(result, made.id).folderId).toBe(bio.id)
  })

  it('creates an ungrouped deck when no folder is given', () => {
    const { result } = store()
    let made
    act(() => {
      made = result.current.addDeck({ title: 'Cells', subject: 'Biology', desc: '' })
    })
    expect(deckOf(result, made.id).folderId).toBe(null)
  })

  it('moves a deck through an edit, and keeps everything else', () => {
    seed()
    const { result } = store()
    let bio
    act(() => {
      bio = result.current.createFolder('Biology')
    })
    const before = deckOf(result, 'cells')
    act(() =>
      result.current.updateDeck('cells', {
        title: 'Cells, revised',
        subject: before.subject,
        desc: before.desc,
        folderId: bio.id,
      }),
    )
    const after = deckOf(result, 'cells')
    expect(after.folderId).toBe(bio.id)
    expect(after.title).toBe('Cells, revised')
    expect(after.schedule).toEqual(before.schedule)
  })

  it('does not file a deck into a folder deleted while the dialog was open', () => {
    seed()
    const { result } = store()
    let bio
    act(() => {
      bio = result.current.createFolder('Biology')
    })
    act(() => result.current.deleteFolder(bio.id))
    act(() => result.current.updateDeck('cells', { folderId: bio.id }))
    expect(deckOf(result, 'cells').folderId).toBe(null)
  })
})

describe('restoring a backup with folders', () => {
  const backup = () => ({
    folders: [
      { id: 'f-bio', name: 'Biology' },
      { id: 'f-chem', name: 'Chemistry' },
    ],
    decks: [
      { title: 'Cells', subject: 'Biology', desc: '', folder: 'f-bio', cards: [{ front: 'Q', back: 'A', scheduling: null }] },
      { title: 'Bonds', subject: 'Chemistry', desc: '', folder: 'f-chem', cards: [] },
      { title: 'Loose', subject: 'General', desc: '', folder: null, cards: [] },
    ],
    sessions: [],
  })

  it('restores the folder structure', () => {
    const { result } = store()
    act(() => {
      result.current.restoreLibrary(backup())
    })
    const byName = Object.fromEntries(result.current.folders.map((f) => [f.name, f.id]))
    expect(Object.keys(byName).sort()).toEqual(['Biology', 'Chemistry'])
    const find = (title) => result.current.decks.find((d) => d.title === title)
    expect(find('Cells').folderId).toBe(byName.Biology)
    expect(find('Bonds').folderId).toBe(byName.Chemistry)
    expect(find('Loose').folderId).toBe(null)
  })

  it('mints its own folder ids rather than trusting the file', () => {
    const { result } = store()
    act(() => {
      result.current.restoreLibrary(backup())
    })
    for (const f of result.current.folders) expect(['f-bio', 'f-chem']).not.toContain(f.id)
  })

  it('files into a folder that already exists by that name, rather than making a second', () => {
    const { result } = store()
    let bio
    act(() => {
      bio = result.current.createFolder('biology')
    })
    act(() => {
      result.current.restoreLibrary(backup())
    })
    expect(result.current.folders.filter((f) => f.name.toLowerCase() === 'biology')).toHaveLength(1)
    expect(result.current.decks.find((d) => d.title === 'Cells').folderId).toBe(bio.id)
  })

  it('does not double the folders when the same backup is restored twice', () => {
    const { result } = store()
    act(() => {
      result.current.restoreLibrary(backup())
    })
    act(() => {
      result.current.restoreLibrary(backup())
    })
    expect(result.current.folders).toHaveLength(2)
  })

  it('reports how many folders it made', () => {
    const { result } = store()
    let report
    act(() => {
      report = result.current.restoreLibrary(backup())
    })
    expect(report.folders).toBe(2)
  })
})

describe('the account library', () => {
  const USER = { id: '686963f7-42a5-4f94-9225-52a8a0a4859a' }

  it('keeps its folders under its own key, apart from the guest library', () => {
    const signedIn = store(USER)
    act(() => {
      signedIn.result.current.createFolder('Account folder')
    })
    signedIn.unmount()

    expect(JSON.parse(localStorage.getItem(userKey(USER.id))).folders.map((f) => f.name)).toEqual([
      'Account folder',
    ])
    const guest = store()
    expect(guest.result.current.folders).toEqual([])
  })
})
