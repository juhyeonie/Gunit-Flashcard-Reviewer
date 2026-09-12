import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The colour tokens, measured rather than trusted.
 *
 * `--color-ink-3` was `oklch(0.585 …)` and measured 3.99:1 against paper —
 * under the 4.5:1 WCAG AA asks of ordinary text. It carries the kickers, the
 * hint under every settings row, the card counts, "12 cards", the tab labels:
 * sixteen distinct failures across five pages, all of them one value. Nobody
 * noticed by looking, which is the point of measuring.
 *
 * These read the real stylesheet rather than a copy, so a token edited in
 * `index.css` is a test that fails here rather than a regression that ships.
 *
 * The maths below is the WCAG definition and the CSS Color 4 conversion. It is
 * checked against the browser's own numbers in the first test — if that one
 * passes, the rest are measuring what a browser would.
 */

const css = readFileSync(fileURLToPath(new URL('../index.css', import.meta.url)), 'utf8')

/** oklch(L C H) as written in the stylesheet. */
const parseOklch = (value) => {
  const m = value.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/)
  if (!m) throw new Error(`not an oklch colour: ${value}`)
  return { L: Number(m[1]), C: Number(m[2]), h: Number(m[3]) }
}

/** oklch → oklab → linear sRGB → sRGB, per CSS Color 4. */
function toSrgb({ L, C, h }) {
  const a = C * Math.cos((h * Math.PI) / 180)
  const b = C * Math.sin((h * Math.PI) / 180)

  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3

  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
  // Clamped, because a token can name a colour just outside the sRGB gamut and
  // a browser would clip it the same way before painting.
  return lin.map((c) => Math.min(1, Math.max(0, c)))
}

/** WCAG relative luminance, from linear-light values. */
const luminance = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b

const contrast = (aValue, bValue) => {
  const [x, y] = [luminance(toSrgb(parseOklch(aValue))), luminance(toSrgb(parseOklch(bValue)))].sort(
    (p, q) => q - p,
  )
  return (x + 0.05) / (y + 0.05)
}

/** Every `--color-*: oklch(...)` inside one selector block of the stylesheet. */
const tokensIn = (selector) => {
  const start = css.indexOf(selector)
  if (start === -1) throw new Error(`no ${selector} block`)
  const block = css.slice(css.indexOf('{', start), css.indexOf('}', start))
  return Object.fromEntries(
    [...block.matchAll(/--(color-[\w-]+):\s*(oklch\([^)]+\))/g)].map((m) => [m[1], m[2]]),
  )
}

const light = tokensIn('@theme')
const dark = tokensIn('[data-theme="dark"]')

/** The four things text is ever set on. */
const SURFACES = ['color-paper', 'color-surface', 'color-raised', 'color-frame']

describe('the conversion itself', () => {
  it('reproduces what a browser measured', () => {
    // Taken from getComputedStyle in a real browser on this stylesheet: ink-3
    // against raised came to 4.92 in the light theme and 4.66 in the dark one.
    // If these drift, the maths below is wrong and nothing else here means
    // anything.
    expect(contrast(light['color-ink-3'], light['color-raised'])).toBeCloseTo(4.92, 1)
    expect(contrast(dark['color-ink-3'], dark['color-raised'])).toBeCloseTo(4.66, 1)
  })
})

describe('text on every surface it can land on', () => {
  for (const [theme, tokens] of [
    ['light', light],
    ['dark', dark],
  ]) {
    for (const ink of ['color-ink', 'color-ink-2', 'color-ink-3']) {
      for (const surface of SURFACES) {
        it(`${theme}: ${ink} on ${surface} clears AA`, () => {
          expect(contrast(tokens[ink], tokens[surface])).toBeGreaterThanOrEqual(4.5)
        })
      }
    }
  }
})

describe('the accent, which is a colour before it is a contrast', () => {
  it('is readable as text on paper in both themes', () => {
    // It is the sign-in button's label colour and the Settings wordmark.
    expect(contrast(light['color-accent'], light['color-paper'])).toBeGreaterThanOrEqual(4.5)
    expect(contrast(dark['color-accent'], dark['color-paper'])).toBeGreaterThanOrEqual(4.5)
  })

  it('keeps the three inks distinguishable from one another', () => {
    // Darkening ink-3 to clear AA narrows the gap to ink-2. Too far and the
    // hierarchy the design leans on stops being visible at all.
    for (const tokens of [light, dark]) {
      expect(contrast(tokens['color-ink'], tokens['color-ink-3'])).toBeGreaterThan(1.5)
      expect(contrast(tokens['color-ink-2'], tokens['color-ink-3'])).toBeGreaterThan(1.15)
    }
  })
})
