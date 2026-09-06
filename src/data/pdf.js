/**
 * PDF text extraction, kept in its own module.
 *
 * PDF.js is by far the largest thing this app depends on, so nothing here is
 * reachable from the main bundle: `extract.js` imports this file dynamically,
 * and the worker below rides along in the same chunk.
 *
 * A PDF has no notion of a paragraph — it has glyphs at coordinates. What
 * comes back is a stream of text runs, each flagged when the line ends after
 * it, and reassembling those is most of the work.
 */
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
// Vite fingerprints the worker and hands back its URL. It is served from this
// app's own origin — no CDN, which is the whole reason for wiring it by hand.
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

/**
 * Turns the run stream of one page into lines.
 *
 * Runs are fragments, not words: a line can arrive as "Hanni", "bal", " crossed"
 * because of kerning or a font change, so they are concatenated until `hasEOL`
 * says the line ended.
 */
export function linesFromItems(items = []) {
  const lines = []
  let line = ''

  for (const item of items) {
    if (typeof item?.str !== 'string') continue
    line += item.str
    if (item.hasEOL) {
      lines.push(line.trim())
      line = ''
    }
  }
  if (line.trim()) lines.push(line.trim())

  // A blank line is a paragraph break and worth keeping, but PDFs are full of
  // vertical padding that arrives as several in a row. Keep the first, drop
  // the rest, and drop any at the very top.
  return lines.filter((l, i) => l !== '' || (i > 0 && lines[i - 1] !== ''))
}

/**
 * Pages are labelled the way slides are, so a passage in the review panel can
 * be traced back to where it came from.
 *
 * Returns an empty string for a PDF that holds no text at all — a scan, in
 * other words, which is a case the caller reports rather than a failure.
 */
export async function textFromPdf(buffer) {
  const task = pdfjs.getDocument({
    data: buffer,
    // Nothing here renders the PDF, and neither eval nor a font loader is
    // wanted for pulling out text.
    isEvalSupported: false,
    disableFontFace: true,
    verbosity: 0,
  })

  // The loading task owns the worker, not the document, so it is what has to
  // be torn down — otherwise every import leaves one running.
  const doc = await task.promise

  try {
    const pages = []
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n)
      const content = await page.getTextContent()
      const text = linesFromItems(content.items).join('\n').trim()
      page.cleanup()
      if (text) pages.push(`--- Page ${n} ---\n${text}`)
    }
    return pages.join('\n\n')
  } finally {
    await task.destroy()
  }
}

/**
 * How many pages of a scan are worth rendering. Recognition takes a second or
 * two per page, so a whole scanned textbook would tie the tab up for an hour;
 * the caller says so rather than starting one.
 */
export const OCR_PAGE_LIMIT = 20

/**
 * Draws each page as a bitmap, for OCR to read.
 *
 * Scale matters more than anything else here: recognition on a page rendered
 * at its natural size is poor, and doubling it costs only memory.
 *
 * Unlike everything else in this file, this needs a DOM — a canvas is where a
 * PDF page gets drawn — so it is verified in the browser rather than in tests.
 */
export async function pagesToImages(buffer, { scale = 2, limit = OCR_PAGE_LIMIT } = {}) {
  const task = pdfjs.getDocument({ data: buffer, verbosity: 0 })
  const doc = await task.promise

  try {
    const images = []
    const count = Math.min(doc.numPages, limit)

    for (let n = 1; n <= count; n++) {
      const page = await doc.getPage(n)
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      /*
       * `print` rather than `display`, though nothing is being printed.
       *
       * On the display path PDF.js paces itself with requestAnimationFrame,
       * which a browser stops altogether for a hidden tab — so switching away
       * mid-scan parks the job until you switch back. Nobody is looking at
       * this canvas; it exists to be recognised. The print path schedules on
       * microtasks and keeps going.
       */
      await page.render({ canvas, viewport, intent: 'print' }).promise
      page.cleanup()
      images.push(canvas)
    }

    return { images, skipped: doc.numPages - count }
  } finally {
    await task.destroy()
  }
}
