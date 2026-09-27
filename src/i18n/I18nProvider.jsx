import { useLayoutEffect, useMemo } from 'react'
import { I18nContext } from './i18nContext.js'
import { dateLocaleOf, localeOf, setCurrentLanguage, translate, translateParts } from './index.js'

/**
 * The reader's language, for everything below it.
 *
 * Mounted by the store, which is where the setting lives, so the language
 * follows whoever is signed in exactly as the theme does.
 */
export default function I18nProvider({ language, children }) {
  // During render rather than in an effect: a child's own render may already
  // make a string with `t()`, and it must make it in this language.
  setCurrentLanguage(language)

  // Before paint, so a screen reader and the browser's own spell-check and
  // hyphenation never see Filipino text marked as English, even for a frame.
  useLayoutEffect(() => {
    document.documentElement.lang = localeOf(language)
  }, [language])

  const value = useMemo(() => {
    const t = (key, params) => translate(language, key, params)
    return {
      language,
      locale: localeOf(language),
      dateLocale: dateLocaleOf(language),
      t,
      /** For a sentence with an element in it. See translateParts. */
      parts: (key, params) => translateParts(language, key, params),
    }
  }, [language])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
