// @vitest-environment jsdom
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Settings from './Settings.jsx'
import { LIBRARY_FORMAT, toLibraryTransfer, toTransfer } from '../data/transfer.js'
import { deck, entry, renderRoute, seed, stored } from '../../test/render-app.jsx'

/**
 * The preferences page, and the two things on it that touch the whole library.
 *
 * Backing up and restoring are the only actions here that act at once rather
 * than through the draft, and the only ones that can lose something.
 */

const open = () => renderRoute('/settings', '/settings', <Settings />)

const filePicker = () => document.querySelector('input[type="file"]')

const asFile = (payload) =>
  new File([JSON.stringify(payload)], 'backup.json', { type: 'application/json' })

/** Catches what the anchor was pointed at, without a real download. */
const captureSave = () => {
  const blobs = []
  const saved = {}
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    blobs.push(blob)
    return 'blob:library'
  })
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
    saved.name = this.download
  })
  return { blobs, saved }
}

beforeEach(() => {
  localStorage.clear()
  seed({
    decks: [
      deck({ id: 'republic', title: 'Roman Republic', count: 2, schedule: { c0: entry(60) } }),
      deck({ id: 'punic', title: 'Punic Wars', count: 1 }),
    ],
    sessions: [{ at: 1000, deckId: 'republic', reviewed: 4, seconds: 60 }],
  })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('backing the library up', () => {
  it('writes a dated file holding every deck', async () => {
    const { blobs, saved } = captureSave()
    open()

    await userEvent.click(screen.getByRole('button', { name: 'Back up everything' }))

    expect(saved.name).toMatch(/^gunit-library-\d{4}-\d{2}-\d{2}\.json$/)
    const written = JSON.parse(await blobs[0].text())
    expect(written.format).toBe(LIBRARY_FORMAT)
    expect(written.decks.map((d) => d.title)).toEqual(['Roman Republic', 'Punic Wars'])
  })

  it('takes the review history and the activity log with it', async () => {
    const { blobs } = captureSave()
    open()

    await userEvent.click(screen.getByRole('button', { name: 'Back up everything' }))

    const written = JSON.parse(await blobs[0].text())
    expect(written.decks[0].cards[0].scheduling).toMatchObject({ interval: 1440 })
    expect(written.sessions).toHaveLength(1)
  })

  it('says how much it saved', async () => {
    captureSave()
    open()

    await userEvent.click(screen.getByRole('button', { name: 'Back up everything' }))
    expect(await screen.findByText('Backed up 2 decks')).toBeTruthy()
  })
})

describe('restoring a backup', () => {
  const backup = () =>
    toLibraryTransfer(
      {
        decks: [
          {
            title: 'Late Antiquity',
            subject: 'Rome',
            desc: '',
            cards: [{ id: 'z0', front: 'Diocletian?', back: 'Split the empire.' }],
            schedule: {},
          },
        ],
        sessions: [{ at: 2000, deckId: 'late', reviewed: 3, seconds: 45 }],
      },
      { now: 1_700_000_000_000 },
    )

  it('adds to the library rather than replacing it', async () => {
    open()
    await userEvent.upload(filePicker(), asFile(backup()))

    await waitFor(() => expect(stored().decks).toHaveLength(3))
    expect(stored().decks.map((d) => d.title)).toContain('Roman Republic')
    expect(stored().decks.map((d) => d.title)).toContain('Late Antiquity')
  })

  it('says what came in', async () => {
    open()
    await userEvent.upload(filePicker(), asFile(backup()))
    expect(await screen.findByText('Restored 1 deck and 1 session')).toBeTruthy()
  })

  it('points out a single deck offered by mistake', async () => {
    // The two files look alike, and the wrong one is easy to reach for.
    open()
    await userEvent.upload(filePicker(), asFile(toTransfer(deck({ count: 1 }))))

    expect(await screen.findByText(/single deck — import it from the library page/)).toBeTruthy()
    expect(stored().decks).toHaveLength(2)
  })

  it('refuses a file from somewhere else, and changes nothing', async () => {
    open()
    await userEvent.upload(filePicker(), asFile({ notes: [] }))

    expect(await screen.findByText(/not exported from Gunit/)).toBeTruthy()
    expect(stored().decks).toHaveLength(2)
  })

  it('restores what it can and says what it dropped', async () => {
    open()
    await userEvent.upload(
      filePicker(),
      asFile({ ...backup(), decks: [{ title: 'Fine', cards: [] }, { title: 'Broken' }] }),
    )

    expect(await screen.findByText(/1 unreadable deck left out/)).toBeTruthy()
    await waitFor(() => expect(stored().decks).toHaveLength(3))
  })
})
