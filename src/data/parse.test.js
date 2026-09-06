import { describe, expect, it } from 'vitest'
import { detectFormat, meaningfulLines, parseCards, splitLine } from './parse.js'

const lines = (...l) => l.join('\n')

describe('meaningfulLines', () => {
  it('drops blanks and trims what is left', () => {
    expect(meaningfulLines('  one  \n\n\n  two')).toEqual(['one', 'two'])
  })

  it('drops the headings the readers insert', () => {
    // These are ours: "# lecture.pdf" names the file a passage came from, and
    // "--- Page 3 ---" locates it. Neither is anything to learn.
    const text = lines('# lecture.pdf', '--- Page 3 ---', 'Consul: the senior magistrate')
    expect(meaningfulLines(text)).toEqual(['Consul: the senior magistrate'])
  })

  it('keeps a line that merely contains a hash', () => {
    expect(meaningfulLines('Legion #10 — the Tenth')).toEqual(['Legion #10 — the Tenth'])
  })

  it('copes with nothing', () => {
    expect(meaningfulLines()).toEqual([])
    expect(meaningfulLines('   \n  ')).toEqual([])
  })
})

describe('splitLine', () => {
  const colon = /:\s+/

  it('splits into a front and a back', () => {
    expect(splitLine('Consul: the senior magistrate', colon)).toEqual({
      front: 'Consul',
      back: 'the senior magistrate',
    })
  })

  it('splits at the first separator only', () => {
    // Otherwise the answer loses everything after its own punctuation.
    expect(splitLine('Consul: senior magistrate: two held office', colon)).toEqual({
      front: 'Consul',
      back: 'senior magistrate: two held office',
    })
  })

  it('refuses a line with nothing on one side', () => {
    expect(splitLine('Consul: ', colon)).toBe(null)
    expect(splitLine(': orphaned', colon)).toBe(null)
  })

  it('returns nothing when the separator is absent', () => {
    expect(splitLine('Consul', colon)).toBe(null)
  })
})

describe('detectFormat', () => {
  it('recognises question and answer blocks', () => {
    const text = lines(
      'Q: What was the cursus honorum?',
      'A: The ladder of public office.',
      'Q: Who were the tribunes?',
      'A: Magistrates of the plebs.',
    )
    expect(detectFormat(text)).toBe('qa')
  })

  it('recognises a single pair, which a separator would mangle', () => {
    // Read as a glossary these make two cards whose fronts are "Q" and "A".
    expect(detectFormat(lines('Q: Who were the tribunes?', 'A: Magistrates of the plebs.'))).toBe(
      'qa',
    )
  })

  it('recognises a tab-separated export', () => {
    expect(detectFormat(lines('Consul\tSenior magistrate', 'Praetor\tJudicial magistrate'))).toBe(
      'tab',
    )
  })

  it('recognises a glossary', () => {
    expect(
      detectFormat(lines('Consul: the senior magistrate', 'Praetor: the judicial magistrate')),
    ).toBe('colon')
  })

  it('prefers the less ambiguous separator when both fit', () => {
    // A tab is never accidental; a colon turns up mid-sentence all the time.
    expect(detectFormat(lines('Consul\tSenior: magistrate', 'Praetor\tJudicial: magistrate'))).toBe(
      'tab',
    )
  })

  it('refuses to guess at prose', () => {
    const prose = lines(
      'The Roman Republic lasted from 509 to 27 BC.',
      'It was governed by elected magistrates.',
      'The Senate advised them throughout.',
    )
    expect(detectFormat(prose)).toBe(null)
  })

  it('refuses when only a few lines fit', () => {
    // One glossary line in a page of prose is not a glossary.
    const mostlyProse = lines(
      'Consul: the senior magistrate',
      'The Republic lasted five centuries.',
      'Rome fought Carthage three times.',
      'Hannibal crossed the Alps.',
    )
    expect(detectFormat(mostlyProse)).toBe(null)
  })

  it('has nothing to say about nothing', () => {
    expect(detectFormat('')).toBe(null)
    expect(detectFormat('# lecture.pdf')).toBe(null)
  })
})

describe('parseCards', () => {
  it('builds cards from a glossary', () => {
    const { cards, format } = parseCards(
      lines('Consul: the senior magistrate', 'Praetor: the judicial magistrate'),
    )
    expect(format).toBe('colon')
    expect(cards).toEqual([
      { front: 'Consul', back: 'the senior magistrate' },
      { front: 'Praetor', back: 'the judicial magistrate' },
    ])
  })

  it('builds cards from question and answer blocks', () => {
    const { cards } = parseCards(
      lines(
        'Q: What was the cursus honorum?',
        'A: The ladder of public office.',
        'Q. Who were the tribunes?',
        'A. Magistrates of the plebs.',
      ),
    )
    expect(cards).toEqual([
      { front: 'What was the cursus honorum?', back: 'The ladder of public office.' },
      { front: 'Who were the tribunes?', back: 'Magistrates of the plebs.' },
    ])
  })

  it('lets either side of a Q and A run over several lines', () => {
    const { cards } = parseCards(
      lines(
        'Q: What was the cursus honorum?',
        'A: The ladder of public office.',
        'Quaestor, aedile, praetor, consul.',
      ),
    )
    expect(cards).toEqual([
      {
        front: 'What was the cursus honorum?',
        back: 'The ladder of public office. Quaestor, aedile, praetor, consul.',
      },
    ])
  })

  it('drops a question whose answer never came', () => {
    // Better a missing card than one whose back is the next question.
    const { cards, skipped } = parseCards(
      lines('Q: Unanswered?', 'Q: What was the cursus honorum?', 'A: The ladder of public office.'),
    )
    expect(cards).toEqual([
      { front: 'What was the cursus honorum?', back: 'The ladder of public office.' },
    ])
    expect(skipped).toBe(1)
  })

  it('counts the lines it could not split', () => {
    const { cards, skipped } = parseCards(
      lines('Consul: the senior magistrate', 'A heading with no definition', 'Praetor: judicial'),
      'colon',
    )
    expect(cards).toHaveLength(2)
    expect(skipped).toBe(1)
  })

  it('ignores the headings its own readers wrote', () => {
    const { cards } = parseCards(
      lines('# glossary.docx', '', '--- Page 1 ---', 'Consul: the senior magistrate'),
      'colon',
    )
    expect(cards).toEqual([{ front: 'Consul', back: 'the senior magistrate' }])
  })

  it('does not make the same card twice', () => {
    // A term defined again later in the same handout is one card, not two.
    const { cards, skipped } = parseCards(
      lines('Consul: the senior magistrate', 'Consul: the senior magistrate'),
      'colon',
    )
    expect(cards).toHaveLength(1)
    expect(skipped).toBe(1)
  })

  it('takes a format rather than guessing when told one', () => {
    const text = lines('Consul - the senior magistrate', 'Praetor - the judicial magistrate')
    expect(parseCards(text, 'hyphen').cards).toHaveLength(2)
    expect(parseCards(text, 'tab').cards).toHaveLength(0)
  })

  it('makes nothing out of prose, and says so', () => {
    const prose = lines('The Republic lasted five centuries.', 'Rome fought Carthage three times.')
    expect(parseCards(prose)).toEqual({ cards: [], skipped: 2, format: null })
  })

  it('makes nothing out of an unknown format', () => {
    expect(parseCards('Consul: senior', 'semaphore').cards).toEqual([])
  })

  it('makes nothing out of nothing', () => {
    expect(parseCards('')).toEqual({ cards: [], skipped: 0, format: null })
  })
})
