import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

/*
 * Gunit as an installable app that opens and works without a connection.
 *
 * What is cached, and why each way:
 *
 *   precached      the app shell: index.html, the entry, the stylesheet, the
 *                  Supabase client (a signed-in reader opening the app offline
 *                  still loads it at startup), the mascot and the icons. About
 *                  1.2 MB, fetched once in the background after the first visit,
 *                  and replaced as a set when a new version ships.
 *
 *   on first use   the file-import stack — PDF, Word, zip and OCR, around 17 MB
 *                  with the OCR engine. Most sessions never touch it; once a
 *                  reader has imported something it is kept, so importing then
 *                  works offline too. Every file is content-hashed, so cache-first
 *                  can never serve a stale one.
 *
 *   never          Supabase. Auth and the database go to the network or fail,
 *                  honestly. The app already keeps working on local storage
 *                  when they fail, and pretending otherwise from a cache would
 *                  be a lie about the reader's account.
 *
 * Updates prompt rather than swap underneath the reader: a new version waits
 * until they choose to reload, or until every Gunit window is closed, so a
 * review is never reloaded out from under them. Outdated caches are deleted
 * when the new version takes over, and index.html is revisioned in the precache
 * manifest, so nobody is left running an old shell against missing files.
 */
const pwa = VitePWA({
  registerType: 'prompt',
  // Registered in src/pwa/register.js, which also owns the update prompt.
  injectRegister: false,
  includeAssets: ['icons/apple-touch-icon.png'],
  manifest: {
    id: '/',
    name: 'Gunit',
    short_name: 'Gunit',
    description: 'A flashcard reviewer that reads your notes.',
    lang: 'en',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    // Library Olive, --color-accent: the colour the logo's back card is cut from.
    theme_color: '#4c5d3a',
    // Paper, --color-paper: what the app is written on, so the splash screen
    // hands over to the first page without a flash.
    background_color: '#fbf9f5',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  workbox: {
    globPatterns: ['**/*.{js,mjs,css,html,png,svg,webmanifest}'],
    globIgnores: [
      // Imported on demand; cached on first use below.
      '**/assets/parse-*',
      '**/assets/jszip*',
      '**/assets/pdf.worker*',
      '**/tesseract/**',
      // Source artwork the app never loads.
      '**/assets/Gunit.png',
      '**/assets/Gunit-transparent.png',
      // Added by the plugin itself from the manifest; listing them here too
      // would put each in the precache twice.
      '**/icons/**',
      'manifest.webmanifest',
    ],
    // Every route is the one page; opening /decks/abc offline gets the shell.
    navigateFallback: '/index.html',
    navigateFallbackDenylist: [/^\/tesseract\//],
    cleanupOutdatedCaches: true,
    clientsClaim: true,
    runtimeCaching: [
      {
        urlPattern: ({ url, sameOrigin }) =>
          sameOrigin && /^\/assets\/(parse-|jszip|pdf\.worker)/.test(url.pathname),
        handler: 'CacheFirst',
        options: { cacheName: 'gunit-importers', expiration: { maxEntries: 24 } },
      },
      {
        urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/tesseract/'),
        handler: 'CacheFirst',
        options: {
          cacheName: 'gunit-ocr',
          expiration: { maxEntries: 16, maxAgeSeconds: 60 * 60 * 24 * 90 },
        },
      },
      {
        urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com',
        handler: 'StaleWhileRevalidate',
        options: { cacheName: 'google-fonts-css' },
      },
      {
        urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com',
        handler: 'CacheFirst',
        options: {
          cacheName: 'google-fonts',
          cacheableResponse: { statuses: [0, 200] },
          expiration: { maxEntries: 32, maxAgeSeconds: 60 * 60 * 24 * 365 },
        },
      },
    ],
  },
})

/*
 * The import stack in chunks of its own names, so the precache above can leave
 * them out by pattern. Left to itself Vite names Mammoth's chunk "index-…",
 * indistinguishable from the app's own entry.
 */
const IMPORTERS = [
  ['pdfjs-dist', 'parse-pdf'],
  ['mammoth', 'parse-word'],
  ['tesseract.js', 'parse-ocr'],
]
// Not jszip: Mammoth carries its own copy, and a chunk of jszip's own would
// sit on both sides of it — Rollup reports that as a cycle. Left to Rollup it
// already comes out as "jszip.min-…", which the patterns above match by name.
const manualChunks = (id) => {
  if (!id.includes('node_modules')) return undefined
  for (const [pkg, name] of IMPORTERS) if (id.includes(`node_modules/${pkg}/`)) return name
  return undefined
}

export default defineConfig({
  plugins: [react(), tailwindcss(), pwa],

  build: {
    rollupOptions: { output: { manualChunks } },
  },

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
