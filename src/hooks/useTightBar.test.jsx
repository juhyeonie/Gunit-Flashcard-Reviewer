// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import useTightBar from './useTightBar.js'

/**
 * When the top bar lets its streak label go, and when it takes it back.
 *
 * jsdom lays nothing out, so the bar here is a set of boxes with the sizes a
 * browser would report, and the resize observer is one the test can fire.
 */

let fire
beforeEach(() => {
  globalThis.ResizeObserver = class {
    constructor(callback) {
      fire = () => act(() => callback([]))
    }
    observe() {}
    disconnect() {}
  }
})
afterEach(() => {
  cleanup()
  delete globalThis.ResizeObserver
})

/** Sizes as a browser would measure them: [logo, pill, side], and the label's width. */
function makeBar() {
  const box = (sizes) => ({ ...sizes })
  const label = { offsetWidth: 110 }
  const logo = box({ clientWidth: 43, firstElementChild: { offsetWidth: 28 } })
  const pill = box({ scrollWidth: 340, clientWidth: 340 })
  const bell = { offsetWidth: 36 }
  const chip = { offsetWidth: 180 }
  const side = {
    clientWidth: 226,
    children: [bell, chip],
    querySelector: () => (bar.showsLabel ? label : null),
  }
  const bar = { children: [logo, pill, side], scrollWidth: 660, clientWidth: 660, showsLabel: true, logo, pill, side, chip }
  return bar
}

function Probe({ bar, onTight }) {
  onTight(useTightBar({ current: bar }))
  return null
}

describe('the streak label', () => {
  it('stays while everything fits, steps out when the tabs are squeezed, and comes back only with room for it', () => {
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({ columnGap: '10px' })
    const bar = makeBar()
    let tight = null
    render(<Probe bar={bar} onTight={(value) => (tight = value)} />)
    expect(tight).toBe(false)

    // Longer words: the tabs no longer fit their pill.
    bar.pill.scrollWidth = 400
    fire()
    expect(tight).toBe(true)

    // The label goes, and the tabs fit again; the chip is just the picture.
    bar.showsLabel = false
    bar.pill.scrollWidth = 340
    bar.side.children[1].offsetWidth = 46
    bar.side.clientWidth = 150
    bar.logo.clientWidth = 60
    fire()
    // 150 - (36 + 46 + 10) + (60 - 28) - 9 = 81: not room for 110. It stays out.
    expect(tight).toBe(true)

    // The window widens.
    bar.side.clientWidth = 200
    fire()
    // 200 - 92 + 32 - 9 = 131: room. It comes back.
    expect(tight).toBe(false)
  })

  it('does nothing where the browser cannot measure', () => {
    delete globalThis.ResizeObserver
    let tight = null
    render(<Probe bar={makeBar()} onTight={(value) => (tight = value)} />)
    expect(tight).toBe(false)
  })
})
