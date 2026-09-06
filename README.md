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
`.pdf` (PDF.js, in `src/data/pdf.js`), `.docx` (Mammoth), `.pptx` (unzipped and
stripped of its XML) and `.txt`/`.md`. Slides and pages come back labelled, so
a passage can be traced to where it came from. The modal lists each file with
its word count, or with the reason it could not be read, and shows the
extracted text for review.

All of it happens in the browser. Nothing is uploaded, there is no server, and
every parser is loaded on demand — a session that imports nothing downloads
none of them. The PDF.js worker is served from this app's own origin rather
than a CDN.

### Scans and photographs

A PDF with no text layer is a picture of a page, and so is a `.png` or `.jpg`
of a handout. Those rows offer **Read with OCR**, which recognises the letters
with Tesseract.js in `src/data/ocr.js`. Scanned PDFs are drawn out page by page
first, up to twenty of them.

It is offered rather than automatic: the engine is several megabytes and
recognition takes a second or two a page, so nothing pays that cost without
being asked. Recognised text is marked as such in the file list and carries a
short warning above the review box — OCR reads well, not perfectly.

Its worker, engine and language model would otherwise come from a CDN, which
would announce every scanned page to a third party. `scripts/copy-ocr-assets.js`
copies them out of `node_modules` into `public/tesseract` — gitignored, and run
automatically by `npm run dev` and `npm run build`. That directory is about
14 MB; a browser fetches roughly 6.8 MB of it the first time OCR is used, and
never otherwise.

### From text to cards

`src/data/parse.js` splits the extracted text into cards. It recognises Q and A
lines, and one card per line separated by a tab, pipe, dash, hyphen or colon —
the shapes glossaries, handouts and Anki or Quizlet exports already come in.
The text stays editable, the separator can be chosen by hand, and the cards are
previewed with a count of the lines that would be skipped.

It splits, it does not comprehend. Turning prose into questions needs an AI
model this version does not include — no API key, no account, no external
service — and nothing is guessed in its place. Lines that will not split are
reported as skipped rather than becoming a card that says nothing.

## How study works

Grades (Again / Good / Easy) drive an SM-2 style scheduler in
`src/data/scheduler.js`: intervals grow by a per-card ease factor, a lapse drops
the card back to a ten-minute step, and review sessions draw only from cards that
have come due. Deck progress is derived from those grades, never stored
separately.

The shape of a session itself — the order cards come in, what the summary
counts, what to say to someone with nothing due — is in `src/data/session.js`,
apart from the page that draws it. Neither the clock nor the random number
generator is read there; both are arguments, so a shuffle can be replayed and a
summary measured.

Finished sessions are logged to `src/data/activity.js`, which is where the
streak, the weekly minutes chart and the daily goal come from.

Everything persists to `localStorage` under `gunit.state.v2`; older saved shapes
are migrated in place on load.

## Taking a deck with you

A library otherwise lives in one browser and nowhere else. **Export deck** on a
deck's page writes it out as `<title>.gunit.json`, and **Import deck** on the
library page reads one back — `src/data/transfer.js` handles both.

Each card's review history rides on the card rather than in a table beside it.
Ids only mean something inside the library that issued them, so importing
reissues them and the scheduling comes along attached to the card it belongs
to. Progress is re-derived rather than trusted from the file.

A file that is not ours says so instead of failing quietly, and one that is
ours but partly damaged imports what it can and reports what it left out.

## Tests

`npm test` runs everything. Most of it is the pure modules under `src/data` —
scheduling, activity, quizzes, the library filters, the readers and the card
splitter — which run in Node and are where the logic lives.

Three suites go through the DOM instead, with `// @vitest-environment jsdom` at
the top of the file rather than a global switch, so the Node suites keep the
environment they need:

- `AppContext.test.jsx` — every mutator, what persists, what happens when
  storage refuses to answer
- `ImportFileModal.test.jsx` — choosing files through to cards in a deck
- `Modal.test.jsx` — the focus trap, `inert`, and where focus goes afterwards
- `Review.test.jsx` — a session from the first card to the summary
- `Quiz.test.jsx` — answering, scoring, and the deck too small to quiz
- `DeckDetail.test.jsx` — the guards on the way into a session

Pages are rendered through `test/render-app.jsx`, which puts them inside the
store and a router at a real URL, seeds the library through `localStorage` —
where `AppProvider` actually looks — and gives them somewhere to navigate to
and a toast to speak through.

The component tests use `.txt` files only. The other readers are dynamic
imports of PDF.js, Mammoth and Tesseract, covered by their own tests, and
loading megabytes of parser to check what a modal renders would be a poor
trade.
