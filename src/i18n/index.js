/**
 * Gunit's words, in the reader's language.
 *
 * Every string the app itself shows lives in one dictionary per language,
 * under ./locales, and is looked up by key: `t('settings.theme')`. Nothing a
 * reader wrote — deck names, descriptions, cards — ever passes through here.
 *
 * Adding a language is two steps and touches no component:
 *
 *   1. Copy locales/en.js to locales/<code>.js and translate the values. Keys,
 *      `{placeholders}` and plural forms stay as they are; i18n.test.js fails
 *      on any key that is missing, extra, or has lost a placeholder.
 *   2. Add it to LANGUAGES below and to MESSAGES.
 *
 * A key missing from a dictionary falls back to English rather than showing
 * the key, so a half-finished language degrades to English, not to gibberish.
 *
 * Two ways in, for two kinds of caller:
 *
 *   - Components use `useT()` (useT.js), which re-renders them when the
 *     language changes.
 *   - Code outside React — a toast worded inside a callback, an error from a
 *     file parser — calls `t()` from here, which reads the language the
 *     provider last set. Those strings are made at the moment they are shown,
 *     so the current language is the right one.
 */
import en from './locales/en.js'
import fil from './locales/fil.js'

/**
 * The languages on offer. `name` is the language's name in itself, so a
 * reader who cannot read the current language can still find their own.
 * `locale` is what numbers and plural rules are worked out in, and `dates` the
 * locale a written-out date follows — British order for English, as Gunit
 * has always written it.
 */
export const LANGUAGES = [
  { code: 'en', name: 'English', locale: 'en', dates: 'en-GB' },
  { code: 'fil', name: 'Filipino', locale: 'fil-PH', dates: 'fil-PH' },
]

export const DEFAULT_LANGUAGE = 'en'

const MESSAGES = { en, fil }

export const isLanguage = (code) => LANGUAGES.some((l) => l.code === code)

const languageOf = (code) => LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0]

/** The BCP 47 locale for a language code, for Intl and for <html lang>. */
export const localeOf = (code) => languageOf(code).locale

/** The locale a date is written out in, for toLocaleDateString. */
export const dateLocaleOf = (code) => languageOf(code).dates

const lookup = (dict, key) =>
  key.split('.').reduce((node, part) => (node == null ? undefined : node[part]), dict)

const pluralRules = new Map()
const pluralOf = (code, count) => {
  if (!pluralRules.has(code)) pluralRules.set(code, new Intl.PluralRules(localeOf(code)))
  return pluralRules.get(code).select(count)
}

/**
 * A plural entry is an object with an `other` form and any of the CLDR forms
 * (`zero`, `one`, `two`, `few`, `many`) the language needs. English uses
 * `one` and `other`; Filipino nouns mostly do not change, so its entries are
 * often `other` alone.
 */
const isPlural = (value) => value !== null && typeof value === 'object' && typeof value.other === 'string'

function resolve(code, key, params) {
  let value = lookup(MESSAGES[code], key)
  if (value === undefined && code !== DEFAULT_LANGUAGE) value = lookup(MESSAGES[DEFAULT_LANGUAGE], key)
  if (isPlural(value)) {
    const count = Number(params?.count ?? 0)
    value = value[count === 0 && value.zero ? 'zero' : pluralOf(code, count)] ?? value.other
  }
  return typeof value === 'string' ? value : undefined
}

const PLACEHOLDER = /\{(\w+)\}/g

/**
 * The string for `key` in the language `code`, with `{name}` placeholders
 * filled from `params`. An unknown key comes back as itself, so a typo is
 * visible on screen and in a test rather than a blank.
 */
export function translate(code, key, params) {
  const template = resolve(isLanguage(code) ? code : DEFAULT_LANGUAGE, key, params)
  if (template === undefined) {
    if (import.meta.env?.DEV) console.warn(`[i18n] missing key "${key}"`)
    return key
  }
  if (!params) return template
  return template.replace(PLACEHOLDER, (whole, name) => (params[name] == null ? whole : String(params[name])))
}

/**
 * The same, split around placeholders so a value may be an element: a bold
 * name in the middle of a sentence stays in the sentence, wherever the
 * language puts it. Answers an array for React to render.
 */
export function translateParts(code, key, params = {}) {
  const template = resolve(isLanguage(code) ? code : DEFAULT_LANGUAGE, key, params) ?? key
  const parts = []
  let last = 0
  for (const match of template.matchAll(PLACEHOLDER)) {
    if (match.index > last) parts.push(template.slice(last, match.index))
    const value = params[match[1]]
    parts.push(value == null ? match[0] : value)
    last = match.index + match[0].length
  }
  if (last < template.length) parts.push(template.slice(last))
  return parts
}

/*
 * The language code outside React. Set by the provider as it renders, which is
 * before anything below it can make a string.
 */
let current = DEFAULT_LANGUAGE

export const currentLanguage = () => current

export function setCurrentLanguage(code) {
  current = isLanguage(code) ? code : DEFAULT_LANGUAGE
}

/** For code outside React. Components use `useT()` instead. */
export const t = (key, params) => translate(current, key, params)

/** translateParts in the current language, for a class component. */
export const parts = (key, params) => translateParts(current, key, params)

/** Every key in a dictionary, dotted. For the completeness test. */
export function keysOf(dict, prefix = '') {
  return Object.entries(dict).flatMap(([name, value]) => {
    const key = prefix ? `${prefix}.${name}` : name
    if (typeof value === 'string' || isPlural(value)) return [key]
    return keysOf(value, key)
  })
}

export { MESSAGES }
