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
| `npm run dev` | Dev server; copies the OCR assets first |
| `npm run build` | Production bundle into `dist/` |
| `npm run preview` | Serves the built bundle |
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

A rating can be taken back. Grading is otherwise one-way — `grade` folds the
new rating into whatever was there and the previous state is gone — so rating a
card "easy" by mistake put it out of reach for ten days with nothing to do
about it but delete the card and lose its history. **Undo rating**, or the `u`
key, restores the card's previous scheduling, drops it from the session's
tally, and returns to it face down. It walks back through the whole session,
not just the last card.

Finished sessions are logged to `src/data/activity.js`, which is where the
streak, the weekly minutes chart and the daily goal come from.

Everything persists to `localStorage` under `gunit.state.v2`; older saved shapes
are migrated in place on load.

## Accounts, optionally

Gunit works with no account at all, and that is not a fallback — it is the
default. Decks live in `localStorage`, every page reads them synchronously, and
a clone with no `.env` is a working flashcard app rather than a sign-in wall.

Point it at a [Supabase](https://supabase.com) project and it additionally
offers sign-up, sign-in, sign-out and password reset:

```bash
cp .env.example .env      # then fill in from Project Settings → API
```

Only the **anon key** belongs there. It is meant to be public — row level
security is what protects the data, not the secrecy of that key. The
`service_role` key bypasses row level security entirely and must never be named
`VITE_*`, because anything so named is compiled into the JavaScript every
visitor downloads.

`supabase/migrations/0001_init.sql` creates the tables and the policies. Run it
once in the dashboard's SQL editor; it is written to be safe to re-run.

### Two things to set in the dashboard

**Turn email confirmation off** (Authentication → Providers → Email). Signing up
then returns a session immediately and a new reader is studying seconds later.

**Configure custom SMTP.** Supabase's built-in sender allows two messages an
hour and only delivers to your own project team, so password reset does not
work for real users without it. [Resend](https://resend.com)'s free tier is
3,000 a month, capped at 100 a day, which is ample for a class.

### How syncing works

`localStorage` stays the copy the app reads. Every page still gets its decks
synchronously, studying still works with no network, and a paused free project
is a sync that retries rather than an app that is gone. Supabase is the durable
copy alongside it, kept in step by `src/data/LibrarySync.jsx`.

Signing in reads the account's library and decides which one wins. **An account
with nothing in it adopts whatever this browser was holding** — that is the
migration, and it is the only case where local wins. Once the account has
decks, the account is the library, because it is the copy your other machines
see. Whatever was here first is written to `gunit.state.presync` rather than
dropped.

Signing out hands the browser back what it was holding before, and the
account's decks do not stay behind. Students borrow machines, and finding
somebody else's revision on a library PC is the wrong default. Nothing is lost
by it — the account's library is in Postgres, and the two copies simply swap
places.

Changes go up as a diff, not as the whole library: `src/data/sync.js` works out
what actually changed between the last confirmed push and now, so grading one
card sends that card rather than the deck it is in. A push that fails leaves
the last-confirmed snapshot where it was, so the next change retries everything
since instead of skipping past it.

### What it costs

Nothing, within the free plan: 500 MB of database, 50,000 monthly active users,
5 GB of egress. Measured against this app's own data — 164 bytes of text per
card — two hundred students with five hundred cards each comes to roughly
50 MB.

Two free-plan facts worth knowing rather than discovering. Projects **pause
after seven days of inactivity** and need restoring by hand, which is part of
why the app keeps working from `localStorage` rather than depending on the
network. And the free plan has **no automatic backups**, which is why the
export below matters more, not less.

## Taking a deck with you

A library otherwise lives in one browser and nowhere else. **Export deck** on a
deck's page writes it out as `<title>.gunit.json`, and **Import deck** on the
library page reads one back — `src/data/transfer.js` handles both.

Each card's review history rides on the card rather than in a table beside it.
Ids only mean something inside the library that issued them, so importing
reissues them and the scheduling comes along attached to the card it belongs
to. Progress is re-derived rather than trusted from the file.

**Back up everything** and **Restore a backup**, on the settings page, do the
same for the whole library at once — every deck plus the activity log the
streak is derived from. That is the file to take before clearing site data or
moving to another machine; a deck at a time is a way to share, not a way to
keep.

Restoring adds to the library rather than replacing it. A restore that wiped
what was already there would be one misclick from losing everything, and
merging costs only duplicates, which are visible and deletable. Sessions merge
on their timestamp, so restoring the same backup twice does not double a
streak.

A file that is not ours says so instead of failing quietly, one that is ours
but partly damaged imports what it can and reports what it left out, and a
single deck offered to the restore button is named as such rather than
rejected as a stranger.

## Tests

`npm test` runs everything. Most of it is the pure modules under `src/data` —
scheduling, activity, quizzes, the library filters, the readers and the card
splitter — which run in Node and are where the logic lives.

The rest go through the DOM, with `// @vitest-environment jsdom` at the top of
each file rather than a global switch, so the Node suites keep the environment
they need:

- `AppContext.test.jsx` — every mutator, what persists, what happens when
  storage refuses to answer
- `Modal.test.jsx` — the focus trap, `inert`, and where focus goes afterwards
- `ImportFileModal.test.jsx` — choosing files through to cards in a deck
- `Dashboard.test.jsx` — the claims it makes about a library
- `Decks.test.jsx` — searching, filtering, and importing a deck file
- `DeckDetail.test.jsx` — the guards on the way into a session
- `Review.test.jsx` — a session from the first card to the summary, and undo
- `Quiz.test.jsx` — answering, scoring, and the deck too small to quiz
- `Summary.test.jsx` — both of its states
- `Settings.test.jsx` — backing the library up and restoring it

Pages are rendered through `test/render-app.jsx`, which puts them inside the
store and a router at a real URL, seeds the library through `localStorage` —
where `AppProvider` actually looks — and gives them somewhere to navigate to
and a toast to speak through.

The component tests use `.txt` files only. The other readers are dynamic
imports of PDF.js, Mammoth and Tesseract, covered by their own tests, and
loading megabytes of parser to check what a modal renders would be a poor
trade.
