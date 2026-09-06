import { describe, expect, it } from 'vitest'
import { drawn, pdfWith, written } from '../../test/pdf-fixture.js'
import { linesFromItems, textFromPdf } from './pdf.js'

const item = (str, hasEOL = false) => ({ str, hasEOL })

describe('linesFromItems', () => {
  it('joins the fragments a line arrives in', () => {
    // Kerning and font changes split a single line into several runs.
    expect(linesFromItems([item('Hanni'), item('bal'), item(' crossed', true)])).toEqual([
      'Hannibal crossed',
    ])
  })

  it('starts a new line at each end-of-line flag', () => {
    expect(linesFromItems([item('One', true), item('Two', true)])).toEqual(['One', 'Two'])
  })

  it('keeps the last line even without a closing flag', () => {
    expect(linesFromItems([item('One', true), item('Two')])).toEqual(['One', 'Two'])
  })

  it('keeps one blank line as a paragraph break', () => {
    expect(linesFromItems([item('One', true), item('', true), item('Two', true)])).toEqual([
      'One',
      '',
      'Two',
    ])
  })

  it('collapses the padding a PDF pads a page with', () => {
    const items = [item('One', true), item('', true), item('', true), item('', true), item('Two')]
    expect(linesFromItems(items)).toEqual(['One', '', 'Two'])
  })

  it('drops blank lines before any text', () => {
    expect(linesFromItems([item('', true), item('One', true)])).toEqual(['One'])
  })

  it('ignores items that carry no string', () => {
    expect(linesFromItems([item('One'), { type: 'beginMarkedContent' }, item('!', true)])).toEqual([
      'One!',
    ])
  })

  it('copes with nothing at all', () => {
    expect(linesFromItems()).toEqual([])
    expect(linesFromItems([])).toEqual([])
  })
})

describe('textFromPdf', () => {
  it('reads the text off a page', async () => {
    const text = await textFromPdf(pdfWith([written('Hannibal crossed the Alps.')]))
    expect(text).toContain('Hannibal crossed the Alps.')
  })

  it('labels each page, in order', async () => {
    const text = await textFromPdf(pdfWith([written('First page'), written('Second page')]))
    expect(text).toBe('--- Page 1 ---\nFirst page\n\n--- Page 2 ---\nSecond page')
  })

  it('leaves out a page with no text on it', async () => {
    const text = await textFromPdf(pdfWith([written('Only this one'), drawn]))
    expect(text).toBe('--- Page 1 ---\nOnly this one')
  })

  it('returns nothing for a PDF that is all pictures', async () => {
    // What a scan is: ink on the page, no text layer to read. The caller
    // reports that rather than treating it as a failure.
    expect(await textFromPdf(pdfWith([drawn, drawn]))).toBe('')
  })

  it('rejects something that is not a PDF at all', async () => {
    const notPdf = new TextEncoder().encode('just some words in a file').buffer
    await expect(textFromPdf(notPdf)).rejects.toThrow()
  })
})
