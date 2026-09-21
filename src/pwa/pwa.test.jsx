// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getSnapshot,
  isStandalone,
  offerUpdate,
  promptInstall,
  resetPwaState,
  watchInstallability,
} from './pwaState.js'
import UpdateNotice from '../components/UpdateNotice.jsx'
import Settings from '../pages/Settings.jsx'
import SignIn from '../pages/SignIn.jsx'
import { AppProvider } from '../data/AppContext.jsx'
import { AuthContext } from '../data/authContext.js'

/**
 * Gunit as an installed app: what the browser says about installing it, the
 * one place it is offered, the update that waits for the reader, and the
 * account being honest about needing a connection.
 */

/** A browser window of our own, so listeners do not leak between tests. */
function fakeWindow({ standalone = false } = {}) {
  const target = new EventTarget()
  const media = new EventTarget()
  media.matches = standalone
  target.matchMedia = () => media
  target.navigator = {}
  return { win: target, media }
}

/** What Chromium hands a page that could be installed. */
function installEvent(outcome = 'accepted') {
  const event = new Event('beforeinstallprompt', { cancelable: true })
  event.prompt = vi.fn(async () => {})
  event.userChoice = Promise.resolve({ outcome })
  return event
}

const setOnline = (value) =>
  Object.defineProperty(navigator, 'onLine', { configurable: true, value })

const auth = (over = {}) => ({
  available: true,
  status: 'ready',
  user: null,
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  requestPasswordReset: vi.fn(),
  ...over,
})

const renderWith = (node, value = auth()) =>
  render(
    <AuthContext.Provider value={value}>
      <AppProvider>
        <MemoryRouter>{node}</MemoryRouter>
      </AppProvider>
    </AuthContext.Provider>,
  )

beforeEach(() => {
  resetPwaState()
  localStorage.clear()
  setOnline(true)
})
afterEach(() => {
  cleanup()
  resetPwaState()
  setOnline(true)
})

describe('what the browser says about installing', () => {
  it('holds the install prompt instead of letting the browser show its own', () => {
    const { win } = fakeWindow()
    watchInstallability(win)
    const event = installEvent()
    win.dispatchEvent(event)

    // Held for Settings, not shown as a banner over what the reader came for.
    expect(event.defaultPrevented).toBe(true)
    expect(getSnapshot().installPrompt).toBe(event)
  })

  it('shows it only when asked, and only once', async () => {
    const { win } = fakeWindow()
    watchInstallability(win)
    const event = installEvent('accepted')
    win.dispatchEvent(event)

    expect(await promptInstall()).toBe('accepted')
    expect(event.prompt).toHaveBeenCalledTimes(1)
    // A prompt can be used once; after it, the browser decides.
    expect(getSnapshot().installPrompt).toBe(null)
    expect(await promptInstall()).toBe('unavailable')
  })

  it('knows once the app has been installed', () => {
    const { win } = fakeWindow()
    watchInstallability(win)
    win.dispatchEvent(installEvent())
    win.dispatchEvent(new Event('appinstalled'))
    expect(getSnapshot()).toMatchObject({ installed: true, installPrompt: null })
  })

  it('knows when it is already running as the installed app', () => {
    const { win } = fakeWindow({ standalone: true })
    watchInstallability(win)
    expect(getSnapshot().installed).toBe(true)
  })

  it('notices a tab turning into the installed app', () => {
    const { win, media } = fakeWindow()
    watchInstallability(win)
    const change = new Event('change')
    change.matches = true
    media.dispatchEvent(change)
    expect(getSnapshot().installed).toBe(true)
  })

  it('reads iOS’s own flag for a home-screen app', () => {
    const was = window.navigator.standalone
    Object.defineProperty(window.navigator, 'standalone', { configurable: true, value: true })
    expect(isStandalone()).toBe(true)
    Object.defineProperty(window.navigator, 'standalone', { configurable: true, value: was })
  })
})

describe('Install Gunit, in Settings', () => {
  it('is offered when the browser can install and the app is not installed', async () => {
    const event = installEvent()
    const { win } = fakeWindow()
    watchInstallability(win)
    act(() => {
      win.dispatchEvent(event)
    })
    renderWith(<Settings />)

    await userEvent.click(screen.getByRole('button', { name: 'Install' }))
    expect(event.prompt).toHaveBeenCalled()
  })

  it('is not there when the browser offers no install prompt', () => {
    // Safari and Firefox: no event, so no button that could only fail.
    renderWith(<Settings />)
    expect(screen.queryByText('Install Gunit')).toBe(null)
  })

  it('is not there once Gunit is installed', () => {
    const { win } = fakeWindow({ standalone: true })
    watchInstallability(win)
    act(() => {
      win.dispatchEvent(installEvent())
    })
    renderWith(<Settings />)
    expect(screen.queryByText('Install Gunit')).toBe(null)
  })

  it('goes away the moment the app is installed', async () => {
    const { win } = fakeWindow()
    watchInstallability(win)
    act(() => {
      win.dispatchEvent(installEvent())
    })
    renderWith(<Settings />)
    expect(screen.getByText('Install Gunit')).toBeTruthy()
    act(() => {
      win.dispatchEvent(new Event('appinstalled'))
    })
    expect(screen.queryByText('Install Gunit')).toBe(null)
  })
})

describe('a new version', () => {
  it('says nothing until one is waiting', () => {
    render(<UpdateNotice />)
    expect(screen.queryByText(/new version/)).toBe(null)
  })

  it('waits for the reader to take it, rather than reloading under them', async () => {
    const apply = vi.fn()
    render(<UpdateNotice />)
    act(() => offerUpdate(apply))

    expect(screen.getByRole('status').textContent).toMatch(/A new version of Gunit is ready/)
    expect(apply).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(apply).toHaveBeenCalledTimes(1)
  })
})

describe('the account, without a connection', () => {
  it('says signing in needs a connection, and does not try', () => {
    setOnline(false)
    renderWith(<SignIn />)
    expect(screen.getByText(/You’re offline. Signing in needs a connection/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sign in' }).disabled).toBe(true)
  })

  it('lets them try as soon as the connection is back', () => {
    setOnline(false)
    renderWith(<SignIn />)
    act(() => {
      setOnline(true)
      window.dispatchEvent(new Event('online'))
    })
    expect(screen.queryByText(/You’re offline/)).toBe(null)
    expect(screen.getByRole('button', { name: 'Sign in' }).disabled).toBe(false)
  })

  it('keeps a signed-in reader studying, and holds signing out until it can send', () => {
    setOnline(false)
    renderWith(<Settings />, auth({ user: { id: 'u1', email: 'reader@example.com' } }))
    expect(screen.getByText(/offline\. Changes are saved here and sync when you reconnect/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sign out' }).disabled).toBe(true)
  })
})

describe('the page shell', () => {
  const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')
  const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')

  it('lets the safe-area insets report real values on iOS', () => {
    // Without viewport-fit=cover every env(safe-area-inset-*) is 0, and the tab
    // bar sat under the home indicator of an installed app.
    expect(html).toMatch(/<meta name="viewport"[^>]*viewport-fit=cover/)
  })

  it('carries the olive theme colour and the iOS home-screen icon', () => {
    expect(html).toMatch(/<meta name="theme-color" content="#4c5d3a"/)
    expect(html).toMatch(/<link rel="apple-touch-icon" href="\/icons\/apple-touch-icon\.png"/)
  })

  it('keeps form text at 16px on touch screens, so iOS does not zoom into it', () => {
    const at = css.indexOf('@media (pointer: coarse)')
    expect(at).toBeGreaterThan(-1)
    expect(css.slice(at, css.indexOf('\n}', at))).toMatch(/font-size:\s*max\(16px/)
  })

  it('has the icons the manifest names, at the sizes it claims', () => {
    for (const [name, size] of [
      ['icon-192.png', 192],
      ['icon-512.png', 512],
      ['icon-maskable-512.png', 512],
      ['apple-touch-icon.png', 180],
    ]) {
      const png = readFileSync(resolve(process.cwd(), 'public/icons', name))
      expect(png.readUInt32BE(16)).toBe(size)
      expect(png.readUInt32BE(20)).toBe(size)
    }
  })
})

describe('which Gunit this is', () => {
  it('says its version and commit in Settings → About', () => {
    const { version } = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'))
    renderWith(<Settings />)
    const line = screen.getByText(/^Version /).textContent
    // package.json's version, not a number typed into the page.
    const [label, commit] = line.split(' · ')
    expect(label).toBe(`Version ${version}`)
    expect(commit).toMatch(/^([0-9a-f]{7}|dev)$/)
    expect(line).not.toMatch(/undefined/)
  })
})
