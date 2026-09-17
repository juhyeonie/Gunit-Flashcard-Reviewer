// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import Spinner, { PageLoading } from './Spinner.jsx'

/**
 * The loading indicator, and the stylesheet rules that make it behave.
 *
 * Half of what matters here is CSS that jsdom never runs — the delay before a
 * page spinner appears, and what happens to an endless turn when a reader has
 * asked for less motion. Those are read from `index.css` itself, the same way
 * the contrast tests do, so a rule edited there is a failing test here.
 */

// From the project root rather than from this file's URL: under jsdom, `URL`
// is jsdom's own, and it will not hand back a file path.
const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')

/** The body of the first rule whose selector is exactly `selector`, after `from`. */
const ruleBody = (selector, from = 0) => {
  const at = css.indexOf(`${selector} {`, from)
  if (at === -1) return null
  return css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at))
}

const reducedMotion = css.indexOf('@media (prefers-reduced-motion: reduce)')

afterEach(cleanup)

describe('the spinner', () => {
  it('is hidden from assistive technology', () => {
    // Every place it appears already says what is happening in words.
    const { container } = render(<Spinner />)
    expect(container.firstChild.getAttribute('aria-hidden')).toBe('true')
  })

  it('takes the colour of whatever it sits in', () => {
    // Ink on a page, paper inside a dark button: no variant needed for either.
    const { container } = render(<Spinner />)
    expect(container.firstChild.className).toMatch(/border-current/)
    expect(container.firstChild.className).toMatch(/border-t-transparent/)
  })

  it('turns by transform, so it keeps turning while the page is busy', () => {
    // Tailwind's `animate-spin` is a CSS rotation — composited, and still
    // moving while a PDF is parsed on the main thread.
    const { container } = render(<Spinner />)
    expect(container.firstChild.className).toMatch(/animate-spin/)
  })

  it('is sized by its prop', () => {
    const { container } = render(<Spinner size={22} />)
    expect(container.firstChild.style.width).toBe('22px')
    expect(container.firstChild.style.height).toBe('22px')
  })
})

describe('a page that is still loading', () => {
  it('says so to a screen reader from the first frame', () => {
    render(<PageLoading />)
    expect(screen.getByRole('status').textContent).toBe('Loading')
  })

  it('takes a more specific label when it has one', () => {
    render(<PageLoading label="Checking your link" />)
    expect(screen.getByRole('status').textContent).toBe('Checking your link')
  })

  it('keeps the delay off the spinner itself', () => {
    // An element has one `animation`. On the same element as the turning,
    // the delayed fade would replace it and the spinner would never move.
    render(<PageLoading />)
    const spinner = screen.getByRole('status').querySelector('.spinner')
    expect(spinner.className).not.toMatch(/reveal-late/)
    expect(spinner.parentElement.className).toMatch(/reveal-late/)
  })

  it('stays out of sight for a wait too short to notice', () => {
    // Most restores are local and finish in tens of milliseconds. A spinner
    // that flashes for one frame reads as a glitch.
    const body = ruleBody('.reveal-late')
    expect(body).toMatch(/fadeIn/)
    expect(body).toMatch(/\b0\.4s\b/)
    // `both` holds it at opacity 0 through the delay rather than showing it
    // first and then fading it in.
    expect(body).toMatch(/\bboth\b/)
  })

  it('fades rather than slides into place', () => {
    const at = css.indexOf('@keyframes fadeIn')
    const keyframes = css.slice(at, css.indexOf('\n}', at))
    expect(keyframes).toMatch(/opacity/)
    expect(keyframes).not.toMatch(/transform/)
  })
})

describe('when a reader has asked for less motion', () => {
  it('stops the turning and breathes instead', () => {
    // The blanket rule shortens every animation to 160ms, which would spin an
    // endless ring six times a second — far more motion, not less.
    expect(reducedMotion).toBeGreaterThan(-1)
    const body = ruleBody('.spinner', reducedMotion)
    expect(body).not.toBe(null)
    expect(body).toMatch(/breathe/)
    expect(body).toMatch(/infinite/)
  })

  it('beats the blanket rule, which is also important', () => {
    const body = ruleBody('.spinner', reducedMotion)
    expect(body).toMatch(/!important/)
    // And sits inside the reduced-motion block, not after it, where it would
    // stop every spinner turning for everyone. Rules inside the block are
    // indented, so the first brace at the start of a line closes the block.
    const blockEnd = css.indexOf('\n}', reducedMotion)
    expect(css.indexOf('.spinner {', reducedMotion)).toBeLessThan(blockEnd)
  })

  it('breathes slowly, and by opacity alone', () => {
    const body = ruleBody('.spinner', reducedMotion)
    const seconds = Number(body.match(/breathe\s+([\d.]+)s/)[1])
    expect(seconds).toBeGreaterThanOrEqual(1)

    const at = css.indexOf('@keyframes breathe')
    const keyframes = css.slice(at, css.indexOf('\n}', at))
    expect(keyframes).toMatch(/opacity/)
    expect(keyframes).not.toMatch(/transform/)
  })
})
