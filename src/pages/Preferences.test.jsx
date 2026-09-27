// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deck, renderRoute, seed, stored } from '../../test/render-app.jsx'

/**
 * Settings → Language & text, and Profile: what a reader sees change, and
 * what is still there after a reload. These run as a guest, with no project —
 * the account side is in preferencesSync.test.jsx.
 */

vi.mock('../data/avatarImage.js', () => ({
  AVATAR_PIXELS: 256,
  squareAvatar: vi.fn(async (file) => new Blob([file.name], { type: 'image/webp' })),
  blobToDataUrl: vi.fn(async (blob) => `data:image/webp;base64,${btoa(await blob.text())}`),
}))

const { default: Settings } = await import('./Settings.jsx')
const { default: Decks } = await import('./Decks.jsx')
const { TopNav } = await import('../components/Navbar.jsx')
const { MAX_AVATAR_FILE } = await import('../data/avatar.js')
const { useApp } = await import('../data/useApp.js')

const open = () =>
  renderRoute(
    '/settings',
    '/settings',
    <>
      <TopNav />
      <Settings />
    </>,
  )

/** A fresh page load: everything unmounted, only storage left. */
const reload = () => {
  cleanup()
  return open()
}

const html = () => document.documentElement
const pictureInput = () => document.querySelector('input[type="file"][accept*="image"]')
const photo = (name = 'me.jpg', type = 'image/jpeg', size = 4096) => {
  const file = new File(['x'], name, { type })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

beforeEach(() => {
  localStorage.clear()
  seed({ decks: [deck({ id: 'republic', title: 'Roman Republic' })], settings: { name: 'Olive Santos' } })
})
afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('language', () => {
  it('puts the whole page, and the navigation, into the language chosen at once', async () => {
    open()
    expect(screen.getByRole('heading', { level: 1, name: 'Preferences' })).toBeTruthy()

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Language' }), 'fil')

    expect(screen.getByRole('heading', { level: 1, name: 'Mga kagustuhan' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Mga deck ko' })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Wika' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'I-save ang mga pagbabago' })).toBeTruthy()
    expect(html().getAttribute('lang')).toBe('fil-PH')
    expect(document.title).toBe('Mga kagustuhan · Gunit')
  })

  it('names each language in itself, so it can be found from any other', () => {
    open()
    const options = within(screen.getByRole('combobox', { name: 'Language' })).getAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual(['English', 'Filipino'])
  })

  it('is still chosen after a reload', async () => {
    open()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Language' }), 'fil')
    expect(stored().settings.language).toBe('fil')

    reload()
    expect(screen.getByRole('heading', { level: 1, name: 'Mga kagustuhan' })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Wika' }).value).toBe('fil')
  })

  it('never translates what the reader wrote', async () => {
    open()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Language' }), 'fil')
    cleanup()

    renderRoute('/decks', '/decks', <Decks />)
    expect(screen.getByRole('heading', { level: 1, name: 'Mga deck ko' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Roman Republic' })).toBeTruthy()
    expect(screen.getAllByText('Ancient Rome').length).toBeGreaterThan(0)
  })
})

describe('font size', () => {
  const sizes = () => within(screen.getByRole('group', { name: 'Font size' }))

  it('offers three sizes, each shown at its own size, and says which is in use', () => {
    open()
    const [small, normal, large] = ['Small', 'Default', 'Large'].map((name) => sizes().getByRole('button', { name }))
    expect(normal.getAttribute('aria-pressed')).toBe('true')
    expect(small.getAttribute('aria-pressed')).toBe('false')
    expect(small.className).toMatch(/\bfs-12\b/)
    expect(large.className).toMatch(/\bfs-15\b/)
    expect(html().getAttribute('data-font-size')).toBe('default')
  })

  it('applies at once, through the page’s text-size tokens, and is still chosen after a reload', async () => {
    open()
    await userEvent.click(sizes().getByRole('button', { name: 'Large' }))
    expect(html().getAttribute('data-font-size')).toBe('large')
    expect(sizes().getByRole('button', { name: 'Large' }).getAttribute('aria-pressed')).toBe('true')
    expect(stored().settings.fontSize).toBe('large')

    reload()
    expect(html().getAttribute('data-font-size')).toBe('large')
    expect(sizes().getByRole('button', { name: 'Large' }).getAttribute('aria-pressed')).toBe('true')
  })
})

describe('saving and cancelling', () => {
  it('puts the language and size back on Cancel', async () => {
    const { router } = open()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Language' }), 'fil')
    await userEvent.click(within(screen.getByRole('group', { name: 'Laki ng font' })).getByRole('button', { name: 'Malaki' }))
    expect(screen.getByText('May hindi pa nase-save')).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: 'Kanselahin' }))
    expect(router.state.location.pathname).toBe('/')
    expect(stored().settings).toMatchObject({ language: 'en', fontSize: 'default' })
    expect(html().getAttribute('data-font-size')).toBe('default')
  })

  it('keeps them, with the draft, on Save', async () => {
    open()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Language' }), 'fil')
    const name = screen.getByRole('textbox', { name: 'Pangalan' })
    await userEvent.clear(name)
    await userEvent.type(name, 'Olive')
    await userEvent.click(screen.getByRole('button', { name: 'I-save ang mga pagbabago' }))

    expect(stored().settings).toMatchObject({ language: 'fil', name: 'Olive' })
    expect(screen.queryByText('May hindi pa nase-save')).toBeNull()
    expect(await screen.findByText('Na-save ang mga kagustuhan')).toBeTruthy()
  })
})

describe('settings that arrive after the page opened', () => {
  it('follows them, rather than calling them unsaved or undoing them on Cancel', async () => {
    let api
    function Store() {
      api = useApp()
      return null
    }
    const { router } = renderRoute(
      '/settings',
      '/settings',
      <>
        <Store />
        <Settings />
      </>,
    )
    expect(screen.getByRole('textbox', { name: 'Name' }).value).toBe('Olive Santos')

    // The account's copy lands, as it does just after a reload when signed in.
    await act(async () => {
      api.installLibrary({ decks: [], settings: { name: 'Ben Reyes', language: 'fil', fontSize: 'large' } })
    })

    expect(screen.getByRole('textbox', { name: 'Pangalan' }).value).toBe('Ben Reyes')
    expect(screen.queryByText('May hindi pa nase-save')).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Kanselahin' }))
    expect(router.state.location.pathname).toBe('/')
    expect(stored().settings).toMatchObject({ name: 'Ben Reyes', language: 'fil', fontSize: 'large' })
  })

  it('keeps what the reader typed when something else changes', async () => {
    let api
    function Store() {
      api = useApp()
      return null
    }
    renderRoute(
      '/settings',
      '/settings',
      <>
        <Store />
        <Settings />
      </>,
    )
    const name = screen.getByRole('textbox', { name: 'Name' })
    await userEvent.clear(name)
    await userEvent.type(name, 'Olive')

    await act(async () => {
      api.installLibrary({ decks: [], settings: { name: 'Olive Santos', cardsPer: 30 } })
    })
    expect(screen.getByRole('textbox', { name: 'Name' }).value).toBe('Olive')
    expect(screen.getByText('30 cards')).toBeTruthy()
  })
})

describe('profile picture', () => {
  const chip = () => screen.getByRole('navigation').querySelector('.rounded-full.border.bg-surface')

  it('falls back to initials, or to a plain figure when there is no name', async () => {
    open()
    expect(within(chip()).getByText('OS')).toBeTruthy()
    expect(screen.getByRole('img', { name: 'No profile picture yet' }).textContent).toBe('OS')

    cleanup()
    seed({ settings: { name: '' } })
    open()
    const figure = screen.getByRole('img', { name: 'No profile picture yet' })
    expect(figure.querySelector('svg')).toBeTruthy()
    expect(chip().querySelector('svg')).toBeTruthy()
  })

  it('uploads, shows it in the top bar too, and is still there after a reload', async () => {
    open()
    fireEvent.change(pictureInput(), { target: { files: [photo('me.jpg')] } })

    expect(await screen.findByText('Profile picture added')).toBeTruthy()
    const pictures = screen.getAllByRole('img', { name: 'Your profile picture' })
    expect(pictures).toHaveLength(2)
    expect(pictures.every((img) => img.getAttribute('src').startsWith('data:image/webp'))).toBe(true)
    expect(screen.getByRole('button', { name: 'Change picture' })).toBeTruthy()

    reload()
    expect(screen.getAllByRole('img', { name: 'Your profile picture' })).toHaveLength(2)
  })

  it('replaces one picture with another', async () => {
    open()
    fireEvent.change(pictureInput(), { target: { files: [photo('first.jpg')] } })
    await screen.findByText('Profile picture added')
    const first = screen.getAllByRole('img', { name: 'Your profile picture' })[0].getAttribute('src')

    fireEvent.change(pictureInput(), { target: { files: [photo('second.png', 'image/png')] } })
    expect(await screen.findByText('Profile picture changed')).toBeTruthy()
    await waitFor(() =>
      expect(screen.getAllByRole('img', { name: 'Your profile picture' })[0].getAttribute('src')).not.toBe(first),
    )
  })

  it('removes it, leaving the fallback', async () => {
    open()
    fireEvent.change(pictureInput(), { target: { files: [photo()] } })
    await screen.findByText('Profile picture added')

    await userEvent.click(screen.getByRole('button', { name: 'Remove picture' }))
    expect(await screen.findByText('Profile picture removed')).toBeTruthy()
    expect(screen.queryByRole('img', { name: 'Your profile picture' })).toBeNull()
    expect(screen.getByRole('img', { name: 'No profile picture yet' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Remove picture' })).toBeNull()
  })

  it('refuses a file that is not a picture, and says why', async () => {
    open()
    fireEvent.change(pictureInput(), { target: { files: [photo('notes.txt', 'text/plain')] } })
    expect((await screen.findByRole('alert')).textContent).toBe(
      'That isn’t a picture Gunit can use. Choose a JPG, PNG or WebP.',
    )
    expect(screen.queryByRole('img', { name: 'Your profile picture' })).toBeNull()
  })

  it('refuses a picture that is too large, and says why', async () => {
    open()
    fireEvent.change(pictureInput(), { target: { files: [photo('huge.jpg', 'image/jpeg', MAX_AVATAR_FILE + 1)] } })
    expect((await screen.findByRole('alert')).textContent).toBe('That picture is too large. Choose one under 10 MB.')
  })

  it('keeps the file picker out of the way of keyboards and screen readers, behind a labelled button', () => {
    open()
    expect(pictureInput().tabIndex).toBe(-1)
    expect(pictureInput().getAttribute('aria-hidden')).toBe('true')
    expect(pictureInput().getAttribute('accept')).toBe('image/jpeg,image/png,image/webp')
    expect(screen.getByRole('button', { name: 'Upload picture' })).toBeTruthy()
  })
})
