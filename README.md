# Gunit

A flashcard reviewer: build decks by hand or from your own course material, study
them on a spaced-repetition schedule, and quiz yourself.

React + Vite + Tailwind v4.

## Running it

```bash
npm install
npm run dev
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server, including the card-generation endpoint |
| `npm run build` | Production bundle into `dist/` |
| `npm run preview` | Serves the build, endpoint included |
| `npm test` | Vitest, watch mode |
| `npm run test:run` | Vitest, single pass |
| `npm run lint` | ESLint |

## Importing material

Dropping a PDF, PPTX, DOCX or TXT into **Import a file** sends it to Claude,
which drafts the cards.

That needs an API key:

```bash
cp .env.example .env   # then paste your key into .env
```

`.env` is gitignored. Without a key the import flow still runs and tells you
what is missing — nothing else in the app depends on it.

### Where the key lives

The key is read by `server/generate-cards.js`, which runs **in Node, never in the
browser**. `vite.config.js` loads it into the dev server's own process, and the
browser only ever posts files to `/api/generate-cards`. A key bundled into
client-side JavaScript is readable by anyone who opens devtools, so it stays on
the server side.

`server/vite-plugin.js` mounts that handler on the dev and preview servers. **A
static production deploy needs the same `generateCards` function hosted as a
serverless function at `/api/generate-cards`** — the client needs no changes.

### How files are read

- **PDF** goes to Claude as a document block, so the model reads the page layout
  rather than a flattened text scrape.
- **DOCX and PPTX** are unzipped and their XML stripped to text (both are ZIP
  archives; Word keeps one body document, PowerPoint one file per slide).
- **TXT** is read directly.

Oversized material is refused with a message rather than silently truncated, so
you never get cards drafted from only the first half of your notes.

## How study works

Grades (Again / Good / Easy) drive an SM-2 style scheduler in
`src/data/scheduler.js`: intervals grow by a per-card ease factor, a lapse drops
the card back to a ten-minute step, and review sessions draw only from cards that
have come due. Deck progress is derived from those grades, never stored
separately.

Finished sessions are logged to `src/data/activity.js`, which is where the
streak, the weekly minutes chart and the daily goal come from.

Everything persists to `localStorage` under `gunit.state.v2`; older saved shapes
are migrated in place on load.
