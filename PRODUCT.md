# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Confirmed:** anyone self-studying — languages, certifications, hobby subjects — rather than a cohort tied to one course or institution. There is no class, no teacher and no roster behind a Gunit library; the person studying is the only person involved.

A consequence worth keeping in view: a self-learner arrives with their own material and no one to set it up for them, so the first minute has to work with whatever file they already have.

**Evidenced, not confirmed:** the interface is built to be used at phone width as well as on a laptop (every page is checked at 375px, and the navigation becomes a bottom tab bar there).

## Product Purpose

Gunit turns material somebody already has — a PDF, a slide deck, a Word file, a page of notes, a scan — into flashcards, and then schedules those cards so they come back just before they would be forgotten.

Success is someone reviewing their own material regularly without first spending an evening typing cards.

## Positioning

**Confirmed:** Gunit works with no account at all. Decks live in the browser, every page reads them synchronously, and studying works signed out and offline. An account is optional and adds one thing — the same library on another machine.

This is the claim a neighbouring product cannot honestly copy: Anki needs an install and AnkiWeb for syncing, and Quizlet is an account-first service with a paid tier. Gunit's front door opens straight into a working app.

The second half of the pitch, evidenced throughout the codebase: it reads your own files into cards, including scans through OCR, in the browser.

## Operating Context

- Someone studying alone, from material they already hold, on a laptop or a phone.
- Files arrive as PDF, Word, PowerPoint or plain text; scanned pages are read with OCR in the browser.
- Reviewing is a short, repeated session: a queue of due cards, three grades (Again, Good, Easy), then a summary. Quiz mode builds multiple-choice questions from a deck's own cards.
- A library is organised with one level of folders. A deck is in one folder or none.
- Decks can be exported and imported as files, one deck or the whole library, which is also how a library moves between browsers without an account.

## Capabilities and Constraints

**Confirmed constraint:** an account stays optional. Studying must work signed out; local storage stays what the app reads, and sync is layered on top rather than underneath.

**Standing instruction from the owner:** no paid AI services or APIs. Parsing and OCR run in the browser.

**Evidenced in the codebase and infrastructure:**

- React 19, Vite 6, Tailwind CSS v4, React Router 7; no server of its own.
- Supabase (Postgres, Auth, row-level security) is optional: with no project configured the app runs entirely locally, which is what a fresh clone does.
- Hosted on Vercel; Supabase and Vercel are both on free tiers, and the Supabase free tier pauses a project after a week of inactivity.
- Spaced repetition is an SM-2 variant with three grades; intervals are held in minutes.
- Scheduling rides on the card, so it survives export, import and sync.
- A signed-out visitor starts with one example deck, "How Gunit works", whose cards explain the app.

**Undecided / not established:** whether Gunit is ever offered to people other than the owner's own circle; whether any paid tier or hosting spend is ever acceptable; who, if anyone, supports users.

## Brand Commitments

- The name is **Gunit**. The wordmark logo is the brand mark.
- A red panda is the mascot, separate from the logo, drawn from one reference sheet (`docs/mascot/reference.png`). Its identity is fixed: red-orange fur, cream face markings, dark charcoal body and paws, striped tail. New poses are cut from that sheet rather than redrawn, and the word "Gunit" never appears on the mascot.
- The creator credit reads "Designed & developed by Justine Pelgone" and appears on the landing page, the sign-in page and Settings — and deliberately nowhere else. The README credits "Justine Andrie C. Pelgone".
- Voice, as written throughout the interface: plain, calm, and specific. It says what happened and what will happen ("Its 2 decks move to Ungrouped. No decks or cards are deleted."), never congratulates the reader for ordinary actions, and avoids streaks-as-pressure, badges and exclamation marks.

## Evidence on Hand

- A working, deployed app: <https://gunit-flashcard-reviewer.vercel.app>
- `README.md` and `docs/reference.md` (how each part works, and the Supabase setup).
- `docs/mascot/reference.png` — the mascot sheet, the source of truth for the character.
- `supabase/migrations/` — schema, row-level security, the sync function, and folders.
- Around 980 tests, including ones that measure colour contrast against the real stylesheet.

**Absences future work must not fabricate:** there are no users other than the owner so far, no testimonials, no usage numbers, no press, no pricing, and no institutional partner. Gunit has never been used by a class or an institution.

## Product Principles

1. **The local library is the product; the account is an accessory.** Anything that makes studying depend on being signed in is a regression.
2. **Somebody's own work outranks tidiness.** Migrations keep a deck a reader has touched, deletions never cascade into cards or schedules, and a failed sync leaves the local copy alone.
3. **Start from the file they already have.** The import path is the product's first impression, not a power feature.
4. **Say what happened, plainly.** Every destructive action states what it will and will not remove; nothing is celebrated that the reader did not earn.
5. **A phone is a first-class place to study**, not a narrowed desktop.

## Accessibility & Inclusion

No standard was set by the owner. What the codebase already holds itself to, and what future work should not fall below:

- Text contrast is tested against the real stylesheet at WCAG AA (4.5:1 body, 3:1 large), in both light and dark themes.
- Dialogs trap focus, restore it on close, and are named by a real heading.
- Interactive controls carry accessible names; the mascot and decorative marks are hidden from assistive technology.
- Motion respects `prefers-reduced-motion`, including the loading spinner, which stops turning and breathes instead.
