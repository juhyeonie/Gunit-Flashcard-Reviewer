/**
 * Stands in for Vite's `?url` import of the PDF.js worker when the tests run.
 *
 * In the browser that import yields a URL the worker is fetched from. Node has
 * no worker to fetch, so PDF.js falls back to importing the file itself — for
 * which it needs a real path on disk, not a served URL.
 */
// A file:// URL, not a drive path: Node's ESM loader rejects "C:\..." outright.
export default new URL('../node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).href
