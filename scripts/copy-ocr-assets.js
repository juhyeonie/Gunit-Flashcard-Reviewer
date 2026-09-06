/**
 * Copies the OCR engine's assets out of node_modules and into `public/`.
 *
 * Tesseract.js fetches three things at runtime — its worker script, a WASM
 * core, and a trained language model — and every one of them defaults to a
 * jsDelivr URL. Serving them ourselves is the difference between OCR that runs
 * on this machine and OCR that announces every scanned page to a CDN.
 *
 * They are copied rather than committed: npm already versions them, and the
 * language model alone is 2.9 MB. `public/tesseract/` is gitignored, and this
 * runs from `predev` and `prebuild` so it is always there when it is needed.
 */
import { copyFileSync, mkdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'public', 'tesseract')

const core = (name) => join(root, 'node_modules', 'tesseract.js-core', name)

const files = [
  join(root, 'node_modules', 'tesseract.js', 'dist', 'worker.min.js'),

  /*
   * Three builds of the same engine. Which one loads is decided in the browser
   * by feature detection — relaxed SIMD, then SIMD, then neither — so all
   * three have to be here even though only one is ever fetched.
   *
   * These are the LSTM-only builds, matching the engine mode used in ocr.js.
   * The sibling .wasm files are not copied: each .wasm.js carries its own
   * WebAssembly inline and never asks for one.
   */
  core('tesseract-core-relaxedsimd-lstm.wasm.js'),
  core('tesseract-core-simd-lstm.wasm.js'),
  core('tesseract-core-lstm.wasm.js'),

  // The integer model, not the full one: a third of the size, and the build
  // the LSTM-only engine asks for anyway.
  join(root, 'node_modules', '@tesseract.js-data', 'eng', '4.0.0_best_int', 'eng.traineddata.gz'),
]

mkdirSync(out, { recursive: true })

let total = 0
for (const from of files) {
  const name = from.split(/[\\/]/).pop()
  copyFileSync(from, join(out, name))
  total += statSync(from).size
}

console.log(`OCR assets: ${files.length} files, ${(total / 1048576).toFixed(1)} MB → public/tesseract`)
