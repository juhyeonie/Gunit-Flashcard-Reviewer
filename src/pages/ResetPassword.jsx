import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Button from '../components/Button.jsx'
import Field from '../components/Field.jsx'
import { useAuth } from '../data/useAuth.js'
import useDocumentTitle from '../hooks/useDocumentTitle.js'
import Spinner from '../components/Spinner.jsx'
import useT from '../i18n/useT.js'

/**
 * Where a reset link lands.
 *
 * The link carries a token in the URL fragment, which the Supabase client
 * exchanges for a short-lived session as the page loads — so by the time this
 * renders there is a user, and setting a password is an ordinary update rather
 * than anything special.
 *
 * That also means the honest failure here is arriving with no session at all:
 * a link that has expired, been used, or been typed by hand. It says so and
 * offers another, rather than showing a form that cannot work.
 */
export default function ResetPassword() {
  const { available, status, user, updatePassword } = useAuth()
  const navigate = useNavigate()
  const { t } = useT()
  useDocumentTitle(t('resetPassword.title'))

  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)

    const { error: failed } = await updatePassword(password)
    setBusy(false)
    if (failed) {
      setError(failed)
      return
    }
    navigate('/')
  }

  if (!available) {
    return (
      <div className="rise-in mx-auto max-w-[460px] py-24 text-center">
        <h1 className="m-0 font-serif fs-28 leading-[1.15]">
          {t('resetPassword.noAccounts')}
        </h1>
        <Button as={Link} to="/" className="mt-5">
          {t('signIn.backToStudying')}
        </Button>
      </div>
    )
  }

  // The token is read as the page loads, so a moment of "loading" here is the
  // link being exchanged rather than anything being wrong.
  if (status === 'loading') {
    return (
      <div className="rise-in mx-auto flex max-w-[460px] items-center justify-center gap-2.5 py-24">
        <Spinner className="text-ink-3" />
        <p className="m-0 fs-15 text-ink-2">{t('resetPassword.checking')}</p>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="rise-in mx-auto flex max-w-[460px] flex-col items-center gap-4 py-24 text-center">
        <div className="kicker">{t('resetPassword.expiredKicker')}</div>
        <h1 className="m-0 font-serif fs-30 leading-[1.1] tracking-[-0.02em]">
          {t('resetPassword.expiredTitle')}
        </h1>
        <p className="m-0 max-w-[380px] fs-15 text-ink-2 text-pretty">
          {t('resetPassword.expiredBody')}
        </p>
        <Button as={Link} to="/sign-in" className="mt-2">
          {t('resetPassword.askAgain')}
        </Button>
      </div>
    )
  }

  return (
    <div className="rise-in mx-auto flex max-w-[420px] flex-col gap-6 py-12">
      <header>
        <div className="kicker mb-3.5">{t('resetPassword.kicker')}</div>
        <h1 className="m-0 mb-2.5 font-serif fs-32 leading-[1.08] tracking-[-0.02em]">
          {t('resetPassword.title')}
        </h1>
        <p className="m-0 fs-15 leading-[1.55] text-ink-2 text-pretty">
          {t('resetPassword.forEmail', { email: user.email })}
        </p>
      </header>

      <form onSubmit={submit} className="flex flex-col gap-3.5" noValidate>
        <Field
          id="new-password"
          label={t('resetPassword.newPassword')}
          type="password"
          required
          autoComplete="new-password"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <p className="m-0 fs-13 leading-[1.5] text-ink-3">{t('resetPassword.rule')}</p>

        <div role="status" aria-live="polite">
          {error && (
            <div className="rounded-lg border border-err bg-err-soft px-4 py-3 fs-13 leading-[1.5] text-ink">
              {error}
            </div>
          )}
        </div>

        <Button type="submit" disabled={busy} className="mt-1">
          {busy && <Spinner />}
          {busy ? t('resetPassword.saving') : t('resetPassword.save')}
        </Button>
      </form>
    </div>
  )
}
