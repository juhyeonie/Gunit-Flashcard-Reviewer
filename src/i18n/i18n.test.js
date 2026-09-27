// @vitest-environment node
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  LANGUAGES,
  MESSAGES,
  isLanguage,
  keysOf,
  localeOf,
  setCurrentLanguage,
  t,
  translate,
  translateParts,
} from './index.js'

/**
 * The dictionaries, checked against each other and against the code.
 *
 * A language is only as finished as its dictionary, and "Do not partially
 * translate" is a promise nothing else in the suite would notice being broken:
 * a key missing from Filipino quietly shows English, and a key the code asks
 * for that exists nowhere shows the key itself.
 */

const SRC = fileURLToPath(new URL('..', import.meta.url))

const valueAt = (dict, key) => key.split('.').reduce((node, part) => node?.[part], dict)
const placeholders = (value) => {
  const texts = typeof value === 'string' ? [value] : Object.values(value)
  return new Set(texts.flatMap((text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1])))
}

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === 'i18n' ? [] : sourceFiles(path)
    return /\.(jsx?|mjs)$/.test(name) && !/\.test\./.test(name) ? [path] : []
  })
}

describe('the dictionaries', () => {
  const english = keysOf(MESSAGES.en).sort()

  it('has one for every language on offer, and nothing else', () => {
    expect(Object.keys(MESSAGES).sort()).toEqual(LANGUAGES.map((l) => l.code).sort())
  })

  for (const { code } of LANGUAGES.filter((l) => l.code !== 'en')) {
    it(`gives ${code} every key English has, and no others`, () => {
      const theirs = keysOf(MESSAGES[code]).sort()
      expect(english.filter((k) => !theirs.includes(k))).toEqual([])
      expect(theirs.filter((k) => !english.includes(k))).toEqual([])
    })

    it(`fills the same blanks in ${code} as in English`, () => {
      const wrong = english.filter((key) => {
        const ours = placeholders(valueAt(MESSAGES.en, key))
        const theirs = placeholders(valueAt(MESSAGES[code], key))
        // A plural's count may go unsaid in one form ("Isang araw na"); any
        // other blank must be there, and nothing may be invented.
        const needed = [...ours].filter((p) => p !== 'count')
        return [...theirs].some((p) => !ours.has(p)) || needed.some((p) => !theirs.has(p))
      })
      expect(wrong).toEqual([])
    })

    it(`leaves no ${code} entry empty`, () => {
      const empty = keysOf(MESSAGES[code]).filter((key) => {
        const value = valueAt(MESSAGES[code], key)
        return (typeof value === 'string' ? [value] : Object.values(value)).some((text) => !text.trim())
      })
      expect(empty).toEqual([])
    })
  }

  it('gives every plural an `other` form, which is what every language falls back to', () => {
    for (const { code } of LANGUAGES) {
      for (const key of keysOf(MESSAGES[code])) {
        const value = valueAt(MESSAGES[code], key)
        if (typeof value !== 'string') expect(typeof value.other, `${code}: ${key}`).toBe('string')
      }
    }
  })
})

describe('the code', () => {
  const files = sourceFiles(SRC)

  it('asks only for keys that exist', () => {
    const missing = []
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      for (const [, key] of text.matchAll(/\b(?:t|parts)\(\s*'([a-zA-Z][\w.-]*)'/g)) {
        if (valueAt(MESSAGES.en, key) === undefined) missing.push(`${file.slice(SRC.length)}: ${key}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('builds keys only under namespaces that exist', () => {
    const missing = []
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      for (const [, prefix] of text.matchAll(/\bt\(\s*`([a-zA-Z][\w.-]*)\.\$\{/g)) {
        if (typeof valueAt(MESSAGES.en, prefix) !== 'object') missing.push(`${file.slice(SRC.length)}: ${prefix}`)
      }
    }
    expect(missing).toEqual([])
  })
})

describe('translate', () => {
  it('fills in blanks', () => {
    expect(translate('en', 'folderModal.taken', { name: 'Biology' })).toBe('There is already a folder called “Biology”.')
    expect(translate('fil', 'folderModal.taken', { name: 'Biology' })).toBe('May folder nang may pangalang “Biology”.')
  })

  it('chooses the plural by count, in each language’s own rules', () => {
    expect(translate('en', 'deck.cardCount', { count: 1 })).toBe('1 card')
    expect(translate('en', 'deck.cardCount', { count: 3 })).toBe('3 cards')
    expect(translate('fil', 'deck.cardCount', { count: 3 })).toBe('3 card')
  })

  it('falls back to English for a key a language lacks, and to the key itself for one nobody has', () => {
    const fil = MESSAGES.fil
    const saved = fil.common.cancel
    delete fil.common.cancel
    try {
      expect(translate('fil', 'common.cancel')).toBe('Cancel')
    } finally {
      fil.common.cancel = saved
    }
    expect(translate('fil', 'no.such.key')).toBe('no.such.key')
  })

  it('treats an unknown language as English', () => {
    expect(isLanguage('xx')).toBe(false)
    expect(translate('xx', 'common.cancel')).toBe('Cancel')
    expect(localeOf('xx')).toBe('en')
  })

  it('keeps an element where the language puts it', () => {
    const name = { element: 'bold' }
    expect(translateParts('en', 'credit.line', { name })).toEqual(['Designed & developed by ', name])
    expect(translateParts('fil', 'credit.line', { name })).toEqual(['Dinisenyo at ginawa ni ', name])
  })

  it('answers code outside React in whatever language was last set', () => {
    setCurrentLanguage('fil')
    try {
      expect(t('common.cancel')).toBe('Kanselahin')
    } finally {
      setCurrentLanguage('en')
    }
    expect(t('common.cancel')).toBe('Cancel')
  })
})
