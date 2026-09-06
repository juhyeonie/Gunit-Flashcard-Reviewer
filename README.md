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

**Import a file** reads what you drop on it. `src/data/extract.js` handles
`.docx` (Mammoth), `.pptx` (unzipped and stripped of its XML, one labelled
block per slide) and `.txt`/`.md`. The modal lists each file with its word
count, or with the reason it could not be read, and shows the extracted text
for review.

All of it happens in the browser. Nothing is uploaded, there is no server, and
both parsers are loaded on demand — a session that imports nothing downloads
neither.

PDF is accepted by the picker but not read yet; those files say so rather than
failing silently. Scanned pages and OCR are a later step.

Drafting cards from that text automatically would need an AI model, and this
version does not include one — no API key, no account, no external service. So
the flow stops at the text: copy what you need, and write the cards yourself. A
deck started from this flow is created empty.

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
