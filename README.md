# Gunit

[![CI](https://img.shields.io/github/actions/workflow/status/juhyeonie/Gunit-Flashcard-Reviewer/ci.yml?branch=main\&label=CI)](https://github.com/juhyeonie/Gunit-Flashcard-Reviewer/actions/workflows/ci.yml)
![React](https://img.shields.io/badge/React-19-149ECA)
![Vite](https://img.shields.io/badge/Vite-6-646CFF)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4)
![Supabase](https://img.shields.io/badge/Supabase-optional-3ECF8E)

A simple flashcard reviewer for studying course materials.

Create decks, import study materials, review with spaced repetition, and test yourself with quizzes.

## Features

* Flashcard decks
* File importing — PDF, Word, PowerPoint, and text
* OCR for scanned materials
* Spaced repetition
* Quiz mode
* Progress tracking
* Deck backup and restore
* Optional account sync

## Tech Stack

React · Vite · Tailwind CSS · Supabase

## Getting Started

```bash
git clone https://github.com/juhyeonie/Gunit-Flashcard-Reviewer.git
cd Gunit-Flashcard-Reviewer
npm install
npm run dev
```

Gunit works without an account, `.env` file, or database. Your decks are stored locally in the browser.

For account sign-in and syncing across devices, you can connect a Supabase project. See [`docs/reference.md`](docs/reference.md) for setup and technical details.

## Scripts

| Script          | Description                  |
| --------------- | ---------------------------- |
| `npm run dev`   | Start the development server |
| `npm run build` | Build the production bundle  |
| `npm test`      | Run tests                    |
| `npm run lint`  | Run ESLint                   |

---

Designed and developed by **Justine Andrie C. Pelgone**
