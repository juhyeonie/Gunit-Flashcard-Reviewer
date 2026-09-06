import { describe, expect, it } from 'vitest'
import { overall } from './ocr.js'

/**
 * Only the progress arithmetic is testable here. The engine itself is
 * WebAssembly loaded into a browser worker from files this app serves, so
 * recognition is verified by running it — see the OCR notes in the README.
 */
describe('overall', () => {
  it('is the fraction of one image when there is only one', () => {
    expect(overall(0, 1, 0)).toBe(0)
    expect(overall(0, 1, 0.5)).toBe(0.5)
    expect(overall(1, 1, 0)).toBe(1)
  })

  it('scales each image into its own share of the whole', () => {
    // Tesseract reports 0 to 1 for every image it starts, so a four-page scan
    // would otherwise run the bar to the end four times over.
    expect(overall(0, 4, 1)).toBe(0.25)
    expect(overall(2, 4, 0)).toBe(0.5)
    expect(overall(3, 4, 1)).toBe(1)
  })

  it('never runs backwards between images', () => {
    // Finishing image 2 and starting image 3 must not dip.
    expect(overall(2, 4, 0)).toBeGreaterThanOrEqual(overall(1, 4, 1))
  })
})
