/**
 * Building a multiple-choice quiz from a deck.
 *
 * Pure, so the question shapes can be checked without rendering anything.
 */

import { t } from '../i18n/index.js'

/**
 * A quiz needs four cards: the answer plus three distractors drawn from the
 * deck's other backs. Below that the "choice" is not a choice — a one-card deck
 * offers a single option, which is the correct one, and clicking it still
 * writes a grade and schedules the card as if something had been recalled.
 */
export const MIN_QUIZ_CARDS = 4

export const canQuiz = (deck) => (deck?.cards?.length ?? 0) >= MIN_QUIZ_CARDS

export const shuffled = (arr) => {
  const next = [...arr]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const swap = next[i]
    next[i] = next[j]
    next[j] = swap
  }
  return next
}

/**
 * One question per card: the front is the prompt, its back the right answer,
 * and three other backs are the distractors.
 */
export const buildQuestions = (cards) =>
  shuffled(cards).map((card) => {
    const distractors = shuffled(cards.filter((c) => c !== card)).slice(0, 3)
    const options = shuffled([card, ...distractors])
    return { card, options, answer: options.indexOf(card) }
  })

export const verdictFor = (score, total) => {
  const ratio = total ? score / total : 0
  if (ratio >= 0.85) return t('quiz.verdict.strong')
  if (ratio >= 0.5) return t('quiz.verdict.solid')
  return t('quiz.verdict.again')
}
