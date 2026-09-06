import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    alias: {
      /*
       * Mammoth picks its unzip implementation through the "browser" field in
       * its package.json. Vite honours that when it builds the app, so the
       * browser reads a .docx from an ArrayBuffer — but Vitest resolves as
       * Node, where that same call fails with "Could not find file in
       * options". Pointing the tests at the prebuilt browser bundle makes them
       * exercise the code path the app actually ships.
       */
      mammoth: fileURLToPath(new URL('./node_modules/mammoth/mammoth.browser.js', import.meta.url)),
      /*
       * `?url` is a Vite idiom Vitest resolves to a served path, which Node
       * then cannot import from disk. See the note in the stand-in itself.
       */
      'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url': fileURLToPath(
        new URL('./test/pdf-worker-url.js', import.meta.url),
      ),
    },
  },
})
