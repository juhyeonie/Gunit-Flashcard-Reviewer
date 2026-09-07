import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Button from '../components/Button.jsx'
import Field from '../components/Field.jsx'
import { useAuth } from '../data/useAuth.js'
import useDocumentTitle from '../hooks/useDocumentTitle.js'

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
  useDocumentTitle('Choose a new password')

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
        <h1 className="m-0 font-serif text-[28px] leading-[1.15]">
          This copy of Gunit has no accounts
        </h1>
        <Button as={Link} to="/" className="mt-5">
          Back to studying
        </Button>
      </div>
    )
  }

  // The token is read as the page loads, so a moment of "loading" here is the
  // link being exchanged rather than anything being wrong.
  if (status === 'loading') {
    return (
      <div className="rise-in mx-auto max-w-[460px] py-24 text-center">
        <p className="m-0 text-[15px] text-ink-2">Checking your link…</p>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="rise-in mx-auto flex max-w-[460px] flex-col items-center gap-4 py-24 text-center">
        <div className="kicker">Link expired</div>
        <h1 className="m-0 font-serif text-[30px] leading-[1.1] tracking-[-0.02em]">
          That link cannot be used
        </h1>
        <p className="m-0 max-w-[380px] text-[15px] text-ink-2 text-pretty">
          Reset links last an hour and work once. Ask for another and it will still be the same
          account waiting.
        </p>
        <Button as={Link} to="/sign-in" className="mt-2">
          Ask for a new link
        </Button>
      </div>
    )
  }

  return (
    <div className="rise-in mx-auto flex max-w-[420px] flex-col gap-6 py-12">
      <header>
        <div className="kicker mb-3.5">Almost done</div>
        <h1 className="m-0 mb-2.5 font-serif text-[32px] leading-[1.08] tracking-[-0.02em]">
          Choose a new password
        </h1>
        <p className="m-0 text-[15px] leading-[1.55] text-ink-2 text-pretty">
          For {user.email}. You will stay signed in on this device afterwards.
        </p>
      </header>

      <form onSubmit={submit} className="flex flex-col gap-3.5" noValidate>
        <Field
          id="new-password"
          label="New password"
          type="password"
          required
          autoComplete="new-password"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <p className="m-0 text-[13px] leading-[1.5] text-ink-3">Eight characters or more.</p>

        <div role="status" aria-live="polite">
          {error && (
            <div className="rounded-lg border border-err bg-err-soft px-4 py-3 text-[13px] leading-[1.5] text-ink">
              {error}
            </div>
          )}
        </div>

        <Button type="submit" disabled={busy} className="mt-1">
          {busy ? 'Saving…' : 'Save password'}
        </Button>
      </form>
    </div>
  )
}
