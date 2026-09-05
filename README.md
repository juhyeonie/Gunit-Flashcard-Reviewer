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

**Import a file** keeps its dropzone, but drafting cards from a document needs
an AI model and this version does not include one — there is no API key, no
account and no external service.

Choosing files still works; the modal then says plainly that AI generation is
unavailable, and nothing is uploaded or read. A deck started from that flow is
created empty, and its cards are written by hand like any other.

Decks and cards are otherwise fully editable: create, rename, delete, add cards,
edit them, import nothing.

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
