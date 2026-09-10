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
    /*
     * Vitest defaults to five seconds a test, and this suite runs twenty-five
     * files in twenty-five workers. On a machine with anything else going on,
     * ordinary DOM tests that finish in tens of milliseconds when run alone
     * cross that line together: one run in four failed somewhere between three
     * and eight tests at once, spread across six unrelated files, every one of
     * them reporting "Test timed out in 5000ms" at a duration just past it.
     *
     * Nothing here is slow. The default is simply tuned for a suite smaller
     * than this one, and a timeout that fires on a busy laptop is a test that
     * reports the laptop rather than the code. Twenty seconds matches the
     * budget the PDF tests already give themselves by hand.
     *
     * The cost is that a genuinely hung test now takes twenty seconds to say
     * so instead of five. That is the right way round: a slow report is an
     * inconvenience, and a false failure teaches you to distrust the suite.
     */
    testTimeout: 20_000,
    hookTimeout: 20_000,
    /*
     * The suite runs as a clone with no project, always.
     *
     * Vitest loads .env the same way the dev server does, and `isConfigured`
     * in supabase.js is read once at import. So the moment a developer
     * configured a real project, seven tests that assert the local-only path
     * began asserting the opposite — and one of them signed in for real,
     * against the live project, on every single run. It came back "Invalid
     * login credentials", which is the polite version of what that is.
     *
     * Blanking the two variables here makes the suite independent of whatever
     * is in .env. Tests that want a configured project mock supabase.js
     * outright, as LibrarySync.test.jsx does, rather than depending on the
     * machine they happen to run on.
     */
    env: {
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_ANON_KEY: '',
    },
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
