# Gunit

[![CI](https://img.shields.io/github/actions/workflow/status/juhyeonie/Gunit-Flashcard-Reviewer/ci.yml?branch=main&label=CI)](https://github.com/juhyeonie/Gunit-Flashcard-Reviewer/actions/workflows/ci.yml)
![React](https://img.shields.io/badge/React-19-149ECA)
![Vite](https://img.shields.io/badge/Vite-6-646CFF)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4)
![Supabase](https://img.shields.io/badge/Supabase-optional-3ECF8E)

A simple flashcard reviewer for studying course materials. Create decks, import
files, review with spaced repetition, and quiz yourself.

**[Try it →](https://gunit-flashcard-reviewer.vercel.app)**

## Features

- Flashcard decks
- File importing — PDF, Word, PowerPoint, text
- OCR for scanned materials
- Spaced repetition
- Quiz mode
- Progress tracking
- Deck backup & restore
- Optional account sync

## Tech stack

React · Vite · Tailwind CSS · Supabase

## Getting started

```bash
git clone https://github.com/juhyeonie/Gunit-Flashcard-Reviewer.git
cd Gunit-Flashcard-Reviewer
npm install
npm run dev
```

That's the whole thing — no account, no `.env`, no database. Decks live in the
browser. Adding a Supabase project turns on sign-in and syncing across machines;
see [the reference](docs/reference.md) for that, and for how each part works.

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server on 5174 |
| `npm run build` | Production bundle into `dist/` |
| `npm test` | Vitest, watch mode |
| `npm run lint` | ESLint |

---

Designed & developed by **Justine Andrie C. Pelgone**
