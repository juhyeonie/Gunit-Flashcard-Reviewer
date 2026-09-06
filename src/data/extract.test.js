import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { drawn, pdfWith, written } from '../../test/pdf-fixture.js'
import {
  combineText,
  extensionOf,
  extractText,
  readWithOcr,
  stripXml,
  textFromDocx,
  textFromPptx,
  wordCount,
} from './extract.js'

/*
 * Starting a PDF.js worker in Node takes seconds, and more of them when the
 * rest of the suite is competing for the machine. The 5s default passes alone
 * and fails intermittently in a full run, so the tests that spin one up say
 * how long they actually need.
 */
const WORKER = 20_000

/** A real File, so the code under test uses the same API the browser gives it. */
const fileOf = (name, contents = '') => new File([contents], name)

const zipOf = async (entries) => {
  const zip = new JSZip()
  for (const [path, body] of Object.entries(entries)) zip.file(path, body)
  return zip.generateAsync({ type: 'arraybuffer' })
}

const slideXml = (text) =>
  `<p:sld><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`

const docxOf = (paragraphs) =>
  zipOf({
    '[Content_Types].xml':
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '</Types>',
    '_rels/.rels':
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>',
    'word/document.xml':
      '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
      paragraphs.map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`).join('') +
      '</w:body></w:document>',
  })

describe('extensionOf', () => {
  it('lowercases and takes the last segment', () => {
    expect(extensionOf('Lecture Notes.DOCX')).toBe('docx')
    expect(extensionOf('week.1.final.pptx')).toBe('pptx')
  })

  it('returns nothing for a name without one', () => {
    expect(extensionOf('README')).toBe('')
    // A dotfile is not an extension.
    expect(extensionOf('.gitignore')).toBe('')
    expect(extensionOf(undefined)).toBe('')
  })
})

describe('stripXml', () => {
  it('drops tags but keeps the words', () => {
    expect(stripXml('<a:t>Consul</a:t>')).toBe('Consul')
  })

  it('breaks a line at the end of each paragraph', () => {
    // Without this, two paragraphs read as one run-on sentence.
    expect(stripXml('<w:p><w:t>First.</w:t></w:p><w:p><w:t>Second.</w:t></w:p>')).toBe(
      'First.\nSecond.',
    )
  })

  it('decodes the escaped characters XML requires', () => {
    expect(stripXml('<w:t>Senate &amp; People &lt;SPQR&gt; &quot;Rome&quot;</w:t>')).toBe(
      'Senate & People <SPQR> "Rome"',
    )
  })

  it('collapses the whitespace left behind by removed tags', () => {
    expect(stripXml('<a><b>One</b> <c>Two</c></a>')).toBe('One Two')
  })
})

describe('wordCount', () => {
  it('counts words across any run of whitespace', () => {
    expect(wordCount('one two\nthree   four')).toBe(4)
  })

  it('counts nothing as nothing', () => {
    expect(wordCount('   ')).toBe(0)
    expect(wordCount()).toBe(0)
  })
})

describe('textFromPptx', () => {
  it('reads every slide, labelled', async () => {
    const buf = await zipOf({
      'ppt/slides/slide1.xml': slideXml('The Roman Republic'),
      'ppt/slides/slide2.xml': slideXml('Magistracies'),
    })
    expect(await textFromPptx(buf)).toBe(
      '--- Slide 1 ---\nThe Roman Republic\n\n--- Slide 2 ---\nMagistracies',
    )
  })

  it('orders slides numerically, not alphabetically', async () => {
    // slide10 sorts before slide2 as a string, which would scramble the order.
    const buf = await zipOf({
      'ppt/slides/slide2.xml': slideXml('Second'),
      'ppt/slides/slide10.xml': slideXml('Tenth'),
    })
    const text = await textFromPptx(buf)
    expect(text.indexOf('Second')).toBeLessThan(text.indexOf('Tenth'))
  })

  it('skips a slide with no text rather than leaving a gap', async () => {
    const buf = await zipOf({
      'ppt/slides/slide1.xml': slideXml('Only this one'),
      'ppt/slides/slide2.xml': '<p:sld><p:cSld><p:spTree/></p:cSld></p:sld>',
    })
    expect(await textFromPptx(buf)).toBe('--- Slide 1 ---\nOnly this one')
  })

  it('refuses an archive with no slides in it', async () => {
    const buf = await zipOf({ 'docProps/app.xml': '<Properties/>' })
    await expect(textFromPptx(buf)).rejects.toThrow(/no slides/i)
  })
})

describe('textFromDocx', () => {
  it('separates paragraphs with a blank line', async () => {
    const buf = await docxOf(['The cursus honorum.', 'A ladder of public office.'])
    expect(await textFromDocx(buf)).toBe('The cursus honorum.\n\nA ladder of public office.')
  })
})

describe('extractText', () => {
  it('reads a plain text file', async () => {
    const out = await extractText(fileOf('notes.txt', '  Hannibal crossed the Alps.  '))
    expect(out).toMatchObject({ status: 'ok', text: 'Hannibal crossed the Alps.', words: 4 })
  })

  it('carries the filename through, for the review panel', async () => {
    expect((await extractText(fileOf('week-3.txt', 'x'))).name).toBe('week-3.txt')
  })

  it('reads a real PDF end to end', async () => {
    const file = new File([pdfWith([written('Sulla marched on Rome.')])], 'lecture.pdf')
    expect(await extractText(file)).toMatchObject({
      status: 'ok',
      kind: 'PDF',
      text: '--- Page 1 ---\nSulla marched on Rome.',
    })
  }, WORKER)

  it('tells a scanned PDF apart from an empty one', async () => {
    // Pages of pictures are the ordinary case for a photographed handout, and
    // "no readable text found" would send someone looking for a broken file.
    const file = new File([pdfWith([drawn])], 'scan.pdf')
    const out = await extractText(file)
    expect(out.status).toBe('empty')
    expect(out.message).toMatch(/scan/i)
    // And it is the one PDF case where recognising the pages is worth offering.
    expect(out.ocr).toBe(true)
  }, WORKER)

  it('does not offer OCR for a PDF it could already read', async () => {
    const file = new File([pdfWith([written('Sulla marched on Rome.')])], 'lecture.pdf')
    expect((await extractText(file)).ocr).toBe(false)
  }, WORKER)

  it('reports a file that is not really a PDF', async () => {
    const out = await extractText(fileOf('renamed.pdf', 'just some words in a file'))
    expect(out).toMatchObject({
      status: 'error',
      message: 'Could not read that .pdf — it may be damaged',
    })
  }, WORKER)

  it('names the type it cannot read', async () => {
    expect(await extractText(fileOf('lecture.mp4', 'x'))).toMatchObject({
      status: 'unsupported',
      message: 'Cannot read .mp4 files',
      ocr: false,
    })
  })

  it('offers OCR for a picture rather than calling it unsupported', async () => {
    // A photographed page is a reasonable thing to import. It is just not
    // something that can be read without recognising it first.
    expect(await extractText(fileOf('page.jpg', 'x'))).toMatchObject({
      status: 'empty',
      kind: 'Image',
      ocr: true,
    })
  })

  it('does not offer OCR where there is no picture to recognise', async () => {
    expect((await extractText(fileOf('blank.txt', '  '))).ocr).toBe(false)
  })

  it('never runs OCR by itself', async () => {
    // Recognising costs megabytes and seconds. Importing must stay cheap, so
    // a picture comes back empty and waits to be asked.
    expect((await extractText(fileOf('page.png', 'x'))).text).toBe('')
  })

  it('reports an empty file instead of an empty success', async () => {
    // Otherwise the review panel would show a blank box and no reason for it.
    expect((await extractText(fileOf('blank.txt', '   \n  '))).status).toBe('empty')
  })

  it('refuses a file past the size cap without reading it', async () => {
    const huge = fileOf('huge.txt', 'x')
    Object.defineProperty(huge, 'size', { value: 21 * 1024 * 1024 })
    expect((await extractText(huge)).status).toBe('error')
  })

  it('returns a corrupt archive as a failed result, never a throw', async () => {
    // One bad file among four must not take the other three down with it.
    const out = await extractText(fileOf('broken.pptx', 'not a zip at all'))
    expect(out.status).toBe('error')
    expect(out.message).toBe('Could not read that .pptx — it may be damaged')
  })

  it('does not pass a parser’s own wording on to the reader', async () => {
    // JSZip answers a renamed file with "Can't find end of central directory"
    // and a link to its documentation. That is a message for a developer.
    const out = await extractText(fileOf('broken.docx', 'not a zip at all'))
    expect(out.message).not.toMatch(/central directory|https?:/)
  })

  it('reads a real .docx end to end', async () => {
    const buf = await docxOf(['Tribunes were sacrosanct.'])
    const out = await extractText(new File([buf], 'rome.docx'))
    expect(out).toMatchObject({ status: 'ok', kind: 'Document', text: 'Tribunes were sacrosanct.' })
  })
})

describe('combineText', () => {
  const ok = (name, text) => ({ name, status: 'ok', text })

  it('heads each passage with the file it came from', () => {
    expect(combineText([ok('a.txt', 'One'), ok('b.txt', 'Two')])).toBe(
      '# a.txt\n\nOne\n\n\n# b.txt\n\nTwo',
    )
  })

  it('leaves out files that produced nothing', () => {
    const out = combineText([ok('a.txt', 'One'), { name: 'b.pdf', status: 'planned', text: '' }])
    expect(out).toBe('# a.txt\n\nOne')
  })

  it('returns nothing when nothing was read', () => {
    expect(combineText([])).toBe('')
    expect(combineText()).toBe('')
  })
})

describe('readWithOcr', () => {
  it('returns a failure as a value, never a throw', async () => {
    // Drawing PDF pages out needs a canvas, so this fails under Node — which
    // is exactly the shape the modal has to survive: the row reports it and
    // the other files carry on.
    const out = await readWithOcr(new File([pdfWith([drawn])], 'scan.pdf'))
    expect(out.status).toBe('error')
    expect(out.message).toBeTruthy()
  })

  it('marks its result as recognised, so the reader can be told', async () => {
    const out = await readWithOcr(new File([pdfWith([drawn])], 'scan.pdf'))
    expect(out).toMatchObject({ viaOcr: true, ocr: true, name: 'scan.pdf' })
  })
})
