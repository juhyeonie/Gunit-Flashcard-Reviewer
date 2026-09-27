import { DEFAULT_LANGUAGE, currentLanguage, t } from '../i18n/index.js'

/**
 * Supabase Auth's refusals, in the reader's language.
 *
 * The server words its errors in English, and the sign-in form used to show
 * them exactly as they came. The ones a reader actually meets are matched here
 * and said in the current language; anything unrecognised is still shown as
 * the server said it, since an honest English sentence beats a vague
 * translated one. In English the server's message is shown untouched.
 */
const KNOWN = [
  [/invalid login credentials/i, () => t('auth.errors.invalidCredentials')],
  [/user already registered|already been registered/i, () => t('auth.errors.alreadyRegistered')],
  [/email not confirmed/i, () => t('auth.errors.emailNotConfirmed')],
  [/password should be at least (\d+)/i, (m) => t('auth.errors.passwordShort', { count: Number(m[1]) })],
  [/invalid format|valid email/i, () => t('auth.errors.invalidEmail')],
  [/different from the old password/i, () => t('auth.errors.samePassword')],
]

export function authMessage(message) {
  if (!message) return t('common.somethingWrong')
  if (currentLanguage() === DEFAULT_LANGUAGE) return message
  for (const [pattern, say] of KNOWN) {
    const match = pattern.exec(message)
    if (match) return say(match)
  }
  return message
}
