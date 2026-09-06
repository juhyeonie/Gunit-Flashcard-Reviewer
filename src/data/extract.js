/**
 * Reading imported documents, in the browser.
 *
 * Everything here runs locally: the file is read from disk into memory, its
 * text is pulled out, and nothing is uploaded anywhere. That matters twice
 * over — the material is a student's own coursework, and this build has no
 * server to send it to.
 *
 * Only the plumbing is async. The parsing itself is pure functions over an
 * ArrayBuffer, so it can be tested without a DOM or a real file picker.
 *
 * A page with no text layer — a scan, a photograph of a handout — has to be
 * recognised rather than read. That is `readWithOcr` below, and it is a
 * separate call on purpose: it costs several megabytes and takes seconds per
 * page, so it happens when someone asks for it, never as part of an import.
 *
 * Every parser is loaded on demand. Together they are several times the size
 * of the app, and most sessions never import anything.
 */

/** Extensions this step can actually read, in the order the UI lists them. */
export const READABLE = ['pdf', 'docx', 'pptx', 'txt', 'md']

/** Pictures. Nothing to read without OCR, but not a mistake to have chosen. */
export const IMAGES = ['png', 'jpg', 'jpeg', 'webp', 'bmp']

/**
 * A ceiling on what is pulled into memory. Course material sits far below
 * this; the cap is here so a mistaken drag of a video cannot lock the tab.
 */
export const MAX_BYTES = 20 * 1024 * 1024

export const extensionOf = (name = '') => {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

/**
 * DOCX and PPTX are zipped XML. Tags carry the formatting, not the words, so
 * they are dropped — but paragraph and slide-line ends become newlines first,
 * or every sentence would run into the next one.
 */
export const stripXml = (xml) =>
  xml
    .replace(/<\/a:p>|<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/[ \t]+/g, ' ')
    // A closing </w:t> leaves a space behind, so without this every line would
    // end in one — invisible on screen, but noise in the text handed on later.
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

export const wordCount = (text = '') => (text.trim() ? text.trim().split(/\s+/).length : 0)

/**
 * A failure worded for the person who chose the file. Anything a parser throws
 * on its own is written for whoever wrote the parser — JSZip, for one, answers
 * a renamed .pptx with "Can't find end of central directory" and a link to its
 * own docs — so those are replaced rather than shown.
 */
const readError = (message) => Object.assign(new Error(message), { readable: true })

const messageFor = (err, ext) =>
  err?.readable ? err.message : `Could not read that .${ext} — it may be damaged`

/** Word keeps its body in one file, which Mammoth knows how to walk. */
export async function textFromDocx(buffer) {
  const { default: mammoth } = await import('mammoth')
  const { value } = await mammoth.extractRawText({ arrayBuffer: buffer })
  return (value || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * PowerPoint keeps one XML file per slide. Slides are labelled in the output
 * because a card drafted later reads very differently with its slide for
 * context, and because it makes the review panel skimmable.
 */
export async function textFromPptx(buffer) {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(buffer)
  const slides = zip
    .file(/^ppt\/slides\/slide\d+\.xml$/)
    // slide2 must not sort before slide10.
    .sort((a, b) => {
      const n = (f) => Number(f.name.match(/slide(\d+)\.xml$/)[1])
      return n(a) - n(b)
    })

  if (!slides.length) throw readError('No slides in that file')

  const parts = await Promise.all(
    slides.map(async (slide, i) => {
      const text = stripXml(await slide.async('string'))
      return text ? `--- Slide ${i + 1} ---\n${text}` : ''
    }),
  )
  return parts.filter(Boolean).join('\n\n')
}

const KINDS = {
  pdf: 'PDF',
  docx: 'Document',
  pptx: 'Slides',
  txt: 'Plain text',
  md: 'Plain text',
  png: 'Image',
  jpg: 'Image',
  jpeg: 'Image',
  webp: 'Image',
  bmp: 'Image',
}

/** The blank case, worded for what actually happened. */
const EMPTY_MESSAGE = {
  // A PDF that yields nothing almost always holds page images rather than
  // text. The file is fine; it is a picture, and pictures need OCR.
  pdf: 'No text layer — this looks like a scan',
}

const emptyMessageFor = (ext) =>
  IMAGES.includes(ext) ? 'A picture, with nothing to read out of it directly' : EMPTY_MESSAGE[ext]

const shape = (file) => {
  const ext = extensionOf(file.name)
  return {
    name: file.name,
    ext,
    kind: KINDS[ext] || '',
    text: '',
    words: 0,
    note: '',
    // Whether recognising the picture is worth offering. Only ever true where
    // there is genuinely an image to look at.
    ocr: false,
  }
}

/**
 * Reads one file and always resolves — never throws. A modal showing four
 * files should report the one that failed and keep the other three, so a
 * failure is a value here rather than an exception.
 *
 * Never runs OCR. That is `readWithOcr`, and it waits to be asked.
 *
 * @returns {{ status: 'ok'|'empty'|'unsupported'|'error', text: string,
 *             words: number, kind: string, message: string, ocr: boolean }}
 */
export async function extractText(file) {
  const base = shape(file)
  const { ext } = base

  if (IMAGES.includes(ext)) {
    return { ...base, status: 'empty', ocr: true, message: emptyMessageFor(ext) }
  }
  if (!READABLE.includes(ext)) {
    return { ...base, status: 'unsupported', message: `Cannot read .${ext || 'this'} files` }
  }
  if (file.size > MAX_BYTES) {
    return { ...base, status: 'error', message: 'Too large to read — 20 MB is the limit' }
  }

  try {
    let text
    if (ext === 'pdf') {
      const { textFromPdf } = await import('./pdf.js')
      text = await textFromPdf(await file.arrayBuffer())
    } else if (ext === 'docx') text = await textFromDocx(await file.arrayBuffer())
    else if (ext === 'pptx') text = await textFromPptx(await file.arrayBuffer())
    else text = (await file.text()).trim()

    if (!text) {
      return {
        ...base,
        status: 'empty',
        ocr: ext === 'pdf',
        message: emptyMessageFor(ext) || 'No readable text found',
      }
    }
    return { ...base, status: 'ok', text, words: wordCount(text), message: '' }
  } catch (err) {
    // A corrupt archive, a renamed file, a .docx that is really a .doc.
    return { ...base, status: 'error', message: messageFor(err, ext) }
  }
}

/**
 * Recognises the text in a picture — an image file, or every page of a scanned
 * PDF drawn out as one.
 *
 * Separate from `extractText` because it is expensive in every sense: several
 * megabytes of engine, seconds of work per page, and a result that is a good
 * guess rather than a transcript. Nobody should pay that without choosing to.
 *
 * @param {File} file
 * @param {(progress: number) => void} [onProgress] 0 to 1
 */
export async function readWithOcr(file, onProgress) {
  const base = { ...shape(file), ocr: true, viaOcr: true }
  const { ext } = base

  try {
    const { textFromImages } = await import('./ocr.js')
    let images = [file]
    let skipped = 0

    if (ext === 'pdf') {
      const { pagesToImages, OCR_PAGE_LIMIT } = await import('./pdf.js')
      const rendered = await pagesToImages(await file.arrayBuffer())
      images = rendered.images
      skipped = rendered.skipped
      if (skipped > 0) base.note = `first ${OCR_PAGE_LIMIT} pages, ${skipped} left unread`
    }

    const text = await textFromImages(images, onProgress)
    if (!text) return { ...base, status: 'empty', message: 'Nothing legible on those pages' }
    return { ...base, status: 'ok', text, words: wordCount(text), message: '' }
  } catch (err) {
    return { ...base, status: 'error', message: messageFor(err, ext) }
  }
}

/**
 * Joins what was read into one block, headed by filename so the reviewer can
 * tell where a passage came from. Files that produced nothing are left out
 * entirely — their status is already reported against the file itself.
 */
export function combineText(results = []) {
  return results
    .filter((r) => r.status === 'ok' && r.text)
    .map((r) => `# ${r.name}\n\n${r.text}`)
    .join('\n\n\n')
}
