# Gunit — reference

The long version: how each part works and why, plus the Supabase and deploy
steps you need when setting this up somewhere new. [The README](../README.md)
is the short one.

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
| `npm run dev` | Dev server on **5174**; copies the OCR assets first |
| `npm run build` | Production bundle into `dist/` |
| `npm run preview` | Serves the built bundle |
| `npm test` | Vitest, watch mode |
| `npm run test:run` | Vitest, single pass |
| `npm run lint` | ESLint |

5174 rather than Vite's usual 5173, and fixed rather than whatever is free:
Supabase checks the password-reset link against an allow list of exact origins,
and a dev server that moves between ports is a reset link that stops working.
`PORT` overrides it.

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

A card can also be set aside. **Suspend card**, on the card's own menu, keeps
the card and its whole review history but stops offering it — for something off
the syllabus, or known so cold that being asked is a waste of the session. It
is left out of the queue, of "review ahead", of the due count and of the
percentage known, so a deck half suspended can still reach 100%. Unsuspending
resumes the schedule where it stopped rather than starting the card over, which
is the difference between this and deleting it.

A deck can be put back to unstudied. **Reset progress**, on the deck's menu,
clears every schedule entry so all its cards are new again. Two things survive
deliberately: suspended cards stay suspended, because that is a decision about
what to study rather than a record of having studied it, and the session log is
untouched — it says which days the reader sat down and worked, and resetting a
deck is not grounds for rewriting that.

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

The files in `supabase/migrations/` create the tables, the policies and the
function that applies a change set. Run them in order in the dashboard's SQL
editor; each is written to be safe to re-run.

`0003` adds the `suspended` column and replaces `sync_library` with a version
that carries it. Replacing the function whole rather than patching it is the
only option — a function is its body — and it has to carry the column or every
push would reset it: `on conflict do update` writes the columns it names, so a
card suspended on one machine would come back from the account unsuspended.

`0002` matters more than it looks. A change set goes up as one call to
`sync_library`, which is one statement to Postgres and therefore one
transaction — so a push either lands completely or not at all. Sent as separate
requests it could fail part way and leave the account holding decks whose cards
never arrived, which the next sign-in would read back as the truth.

### Three things to set in the dashboard

**Turn email confirmation off** (Authentication → Providers → Email). Signing up
then returns a session immediately and a new reader is studying seconds later.

**Configure custom SMTP.** Supabase's built-in sender allows two messages an
hour and only delivers to your own project team, so password reset does not
work for real users without it. [Resend](https://resend.com)'s free tier is
3,000 a month, capped at 100 a day, which is ample for a class. Verify the
sender domain with Resend first or the mail bounces silently.

**Allow the reset link back in.** Authentication → URL Configuration → Redirect
URLs, add `http://localhost:5174/reset-password` and the deployed equivalent.
The link is built from `window.location.origin`, and Supabase rejects any
origin not on that list — quietly, after the email has already been sent. Its
wildcards match paths but not ports, so each port needs its own entry, which is
why the dev server has a fixed one.

### How syncing works

`localStorage` stays the copy the app reads. Every page still gets its decks
synchronously, studying still works with no network, and a paused free project
is a sync that retries rather than an app that is gone. Supabase is the durable
copy alongside it, kept in step by `src/data/LibrarySync.jsx`.

**Every library has its own key.** Signed out you are reading
`gunit.state.guest`; signed in, `gunit.state.user.<id>`. Signing in and out
changes which key is read and nothing else — nothing is copied on the way in,
nothing is swapped on the way out, and the two libraries have no slot to meet
in.

**Signing out takes the account's library off the machine**, once whatever was
queued has gone up — not merely off the screen. Students borrow machines, and a
copy of somebody's revision left on a library PC is the wrong thing to leave
behind. Nothing is lost by it: the library is in Postgres and signing in again
fetches it. What it costs is the offline copy, so signing in somewhere with no
network gives you nothing to read until there is a connection — the right way
round of the two. The key stays if the final push failed, because then the copy
about to be removed is the only one.

**An empty account is asked, not filled.** Sign in with a new account while the
guest library has decks and Gunit offers to bring them in. It is a question
rather than a default: the decks in front of you when you sign up are not
always yours, and once they are in an account they follow it to every machine
it signs in on. They are **copied**, so they stay on this browser too, and
answering no is remembered so the same question does not return on every
sign-in.

Decks brought in are given new ids on the way. A deck id that already looks
like a uuid means some account uploaded that library once — quite possibly a
different one on a shared browser — and offering those ids back reaches for
rows the new account does not own, which row level security refuses outright.

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

## Deploying it

`vercel.json` is here because a single-page app on a static host needs one
thing the dev server does for free:

```json
"rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
```

Every route in this app is client-side. Without that rule a direct request to
`/decks/republic` or `/reset-password` is a request for a file that does not
exist, and the host answers 404 — so refreshing anywhere but the home page
fails, shared links fail, and the password reset link is dead on arrival at the
one moment somebody needs it. `npm run preview` will not show you this: Vite's
preview server does the fallback itself, which is exactly why it is easy to
ship without.

It does not shadow the real files. Vercel checks the filesystem before applying
rewrites, so `/assets/...` and `/tesseract/...` are served as themselves and
only unmatched paths fall through to `index.html`.

The cache headers follow what is actually true of each directory. Vite puts a
content hash in every `/assets` filename, so those can be immutable for a year
— a changed file is a changed name. The OCR assets under `/tesseract` are
copied out of `node_modules` under fixed names, so a dependency upgrade changes
their contents without changing their URLs: a week, revalidating in the
background, rather than immutable. `index.html` is never cached, or a deploy
would not be picked up.

### Before the first deploy

**Set the environment variables in the host, not just in `.env`.** Vite inlines
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` at build time, so they have to
be present when Vercel builds — not merely available at runtime. Missing, the
build silently succeeds and ships an app with no accounts. Only the anon key
belongs there.

**Add the deployed origin to Supabase.** Authentication → URL Configuration →
Redirect URLs needs `https://your-domain/reset-password`. Supabase matches
origins exactly, so the `localhost` entry does nothing for production, and it
rejects a bad origin *after* the email has gone out.

**Point Resend at the real domain** if one is verified, rather than
`onboarding@resend.dev`, which only delivers to the address the Resend account
was opened with.

### Two things to know rather than fix

Asset paths are absolute, so the app has to be served from a domain root. A
subpath deployment — a GitHub Pages project site, say — needs `base` set in
`vite.config.js`.

And a free Supabase project **pauses after seven days of inactivity**. A
deployed but unused copy will need restoring by hand. Studying still works
while it is down, because the library is read from this browser; syncing is
what stops.

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

Every push and pull request runs lint, the whole suite and a production build
on GitHub Actions — `.github/workflows/ci.yml`, about a minute. It calls the
same npm scripts you would, so what CI checks and what you check cannot drift
apart. The build is there deliberately and is not redundant: the tests import
modules directly, and it is the only step that proves Vite can still resolve,
transform and bundle the app, OCR assets included.

`npm test` runs everything. Most of it is the pure modules under `src/data` —
scheduling, activity, quizzes, the library filters, the readers and the card
splitter — which run in Node and are where the logic lives.

The rest go through the DOM, with `// @vitest-environment jsdom` at the top of
each file rather than a global switch, so the Node suites keep the environment
they need:

- `AppContext.test.jsx` — every mutator, what persists, what happens when
  storage refuses to answer
- `ErrorBoundary.test.jsx` — the fallback, and the reset that copies the
  library aside before clearing it
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
