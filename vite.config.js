import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],

  server: {
    /*
     * 5174 rather than Vite's own 5173, which is taken here by another app.
     *
     * A fixed default matters for more than tidiness: Supabase checks the
     * password-reset redirect against an allow list of exact origins, and its
     * wildcards cannot span a port. A dev server that lands somewhere new each
     * morning means a reset link that stops working. PORT still wins when a
     * caller assigns one.
     */
    port: Number(process.env.PORT) || 5174,
  },
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
