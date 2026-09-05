import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { generateCards, textFromOfficeFile } from './generate-cards.js'

/** Minimal DOCX: the body Word actually reads. */
const docx = async (paragraphs) => {
  const zip = new JSZip()
  const body = paragraphs
    .map((t) => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`)
    .join('')
  zip.file('word/document.xml', `<?xml version="1.0"?><w:document><w:body>${body}</w:body></w:document>`)
  return zip.generateAsync({ type: 'nodebuffer' })
}

/** Minimal PPTX: one XML file per slide, text in <a:t> runs. */
const pptx = async (slides) => {
  const zip = new JSZip()
  slides.forEach((runs, i) => {
    const text = runs.map((t) => `<a:p><a:r><a:t>${t}</a:t></a:r></a:p>`).join('')
    zip.file(`ppt/slides/slide${i + 1}.xml`, `<?xml version="1.0"?><p:sld><p:cSld>${text}</p:cSld></p:sld>`)
  })
  return zip.generateAsync({ type: 'nodebuffer' })
}

describe('docx extraction', () => {
  it('pulls paragraph text out of the document body', async () => {
    const text = await textFromOfficeFile(await docx(['The consuls held office together.']), 'docx')
    expect(text).toContain('The consuls held office together.')
    expect(text).not.toContain('<w:')
  })

  it('keeps paragraphs on separate lines', async () => {
    const text = await textFromOfficeFile(await docx(['First point', 'Second point']), 'docx')
    expect(text.split('\n').filter(Boolean).length).toBeGreaterThan(1)
  })

  it('decodes XML entities', async () => {
    const text = await textFromOfficeFile(await docx(['Rome &amp; Carthage']), 'docx')
    expect(text).toContain('Rome & Carthage')
  })

  it('rejects a docx with no document body', async () => {
    const zip = new JSZip()
    zip.file('word/other.xml', '<x/>')
    await expect(
      textFromOfficeFile(await zip.generateAsync({ type: 'nodebuffer' }), 'docx'),
    ).rejects.toThrow(/no readable document body/)
  })
})

describe('pptx extraction', () => {
  it('pulls text from every slide', async () => {
    const text = await textFromOfficeFile(await pptx([['Punic Wars'], ['Cannae, 216 BC']]), 'pptx')
    expect(text).toContain('Punic Wars')
    expect(text).toContain('Cannae, 216 BC')
  })

  it('labels slides so the model can see the structure', async () => {
    const text = await textFromOfficeFile(await pptx([['A'], ['B']]), 'pptx')
    expect(text).toContain('--- Slide 1 ---')
    expect(text).toContain('--- Slide 2 ---')
  })

  it('orders slides numerically, not lexically', async () => {
    // slide2 must not sort after slide10.
    const slides = Array.from({ length: 11 }, (_, i) => [`Slide body ${i + 1}`])
    const text = await textFromOfficeFile(await pptx(slides), 'pptx')
    expect(text.indexOf('Slide body 2')).toBeLessThan(text.indexOf('Slide body 10'))
  })

  it('rejects a pptx with no slides', async () => {
    const zip = new JSZip()
    zip.file('ppt/presentation.xml', '<x/>')
    await expect(
      textFromOfficeFile(await zip.generateAsync({ type: 'nodebuffer' }), 'pptx'),
    ).rejects.toThrow(/no slides with text/)
  })
})

/**
 * These all fail validation before the Anthropic client is constructed, so they
 * never touch the network and need no API key.
 */
describe('request validation', () => {
  const b64 = (s) => Buffer.from(s, 'utf8').toString('base64')

  it('rejects a request with no files', async () => {
    await expect(generateCards({ files: [] })).rejects.toMatchObject({
      status: 400,
      message: /No files were uploaded/,
    })
  })

  it('rejects a non-array files field', async () => {
    await expect(generateCards({ files: 'nope' })).rejects.toMatchObject({ status: 400 })
  })

  it('names the unsupported file rather than failing vaguely', async () => {
    await expect(
      generateCards({ files: [{ name: 'lecture.key', data: b64('x') }] }),
    ).rejects.toMatchObject({ status: 400, message: /lecture\.key is not a supported file type/ })
  })

  it('rejects a file with no readable text', async () => {
    await expect(
      generateCards({ files: [{ name: 'empty.txt', data: b64('   ') }] }),
    ).rejects.toMatchObject({ status: 400, message: /No readable text/ })
  })

  it('refuses oversized material instead of silently truncating it', async () => {
    await expect(
      generateCards({ files: [{ name: 'huge.txt', data: b64('a'.repeat(700_000)) }] }),
    ).rejects.toMatchObject({ status: 413, message: /smaller batches/ })
  })
})
