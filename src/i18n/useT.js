import { useContext } from 'react'
import { I18nContext } from './i18nContext.js'
import { currentLanguage, dateLocaleOf, localeOf, translate, translateParts } from './index.js'

/**
 * The words for a component, in the reader's language: `const { t } = useT()`.
 *
 * Safe with no provider above it — the error boundary around everything, a
 * component rendered alone in a test — where it uses whatever language was
 * last set, which is English until a provider says otherwise.
 */
export default function useT() {
  const ctx = useContext(I18nContext)
  if (ctx) return ctx
  const language = currentLanguage()
  return {
    language,
    locale: localeOf(language),
    dateLocale: dateLocaleOf(language),
    t: (key, params) => translate(language, key, params),
    parts: (key, params) => translateParts(language, key, params),
  }
}
