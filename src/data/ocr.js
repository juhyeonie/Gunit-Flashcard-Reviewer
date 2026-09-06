/**
 * Optical character recognition, for pages that are pictures.
 *
 * A photographed handout or a scanned chapter has no text layer to read, so
 * the letters have to be recognised from the image. Tesseract.js does that in
 * WebAssembly, here on this machine.
 *
 * Its engine, worker and language model would otherwise be fetched from a CDN
 * — three requests announcing that someone is reading a scanned page. They are
 * served from this app instead, copied into `public/tesseract` by
 * `scripts/copy-ocr-assets.js`.
 *
 * None of it is loaded until someone asks for it. Together the assets are
 * several megabytes, and most imports are ordinary documents.
 */

/** Where the copied engine lives, honouring a non-root deployment. */
const assets = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/tesseract`

/**
 * Recognition is slow enough that it needs a running commentary, but its own
 * progress reports restart from zero for each image. This maps them onto one
 * fraction across the whole job.
 */
export const overall = (index, count, fraction) => (index + fraction) / count

/**
 * Reads text off a list of images — a Blob, a File or a canvas each.
 *
 * Pages are labelled the way the other readers label theirs, and a page that
 * comes back blank is left out rather than contributing an empty heading.
 *
 * @param {Array} images
 * @param {(progress: number) => void} [onProgress] 0 to 1, across all images
 */
export async function textFromImages(images, onProgress) {
  const { createWorker } = await import('tesseract.js')

  let index = 0
  const worker = await createWorker('eng', 1, {
    workerPath: `${assets}/worker.min.js`,
    corePath: `${assets}/`,
    langPath: assets,
    // Setting up costs several megabytes and a few seconds, so it is reported
    // as progress too rather than looking like a hang.
    logger: ({ progress }) => onProgress?.(overall(index, images.length, progress || 0)),
  })

  try {
    const pages = []
    for (const image of images) {
      const { data } = await worker.recognize(image)
      const text = (data?.text || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
      if (text) {
        pages.push(images.length > 1 ? `--- Page ${index + 1} ---\n${text}` : text)
      }
      index += 1
      onProgress?.(overall(index, images.length, 0))
    }
    return pages.join('\n\n')
  } finally {
    await worker.terminate()
  }
}
