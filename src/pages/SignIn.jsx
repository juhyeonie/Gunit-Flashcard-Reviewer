import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Button from '../components/Button.jsx'
import Field from '../components/Field.jsx'
import { useAuth } from '../data/useAuth.js'
import useDocumentTitle from '../hooks/useDocumentTitle.js'

/**
 * One page for the three ways in: signing in, signing up, and asking for a
 * password reset.
 *
 * They share a form and most of their copy, and separate pages would mean
 * three routes for what is really one decision. The mode is state rather than
 * a route because arriving here is arriving here — there is nothing to
 * bookmark about "the sign-up variant".
 *
 * An account is optional in Gunit, and this page says so rather than reading
 * as a wall. Decks work without one; an account is what carries them between
 * machines.
 */

const COPY = {
  in: {
    kicker: 'Welcome back',
    title: 'Sign in',
    action: 'Sign in',
    busy: 'Signing in…',
  },
  up: {
    kicker: 'New here',
    title: 'Make an account',
    action: 'Create account',
    busy: 'Creating…',
  },
  forgot: {
    kicker: 'Forgotten password',
    title: 'Send a reset link',
    action: 'Send reset link',
    busy: 'Sending…',
  },
}

export default function SignIn() {
  const { available, user, signIn, signUp, requestPasswordReset } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState('in')
  useDocumentTitle(COPY[mode].title)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [sent, setSent] = useState(false)

  const copy = COPY[mode]

  const change = (next) => {
    setMode(next)
    setError(null)
    setSent(false)
  }

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)

    const result =
      mode === 'forgot'
        ? await requestPasswordReset(email.trim())
        : mode === 'up'
          ? await signUp(email.trim(), password, name)
          : await signIn(email.trim(), password)

    setBusy(false)
    if (result.error) {
      setError(result.error)
      return
    }
    // Email confirmation is off, so signing up returns a session outright and
    // there is nothing to wait for.
    if (mode === 'forgot') setSent(true)
    else navigate('/')
  }

  if (!available) {
    return (
      <div className="rise-in mx-auto flex max-w-[460px] flex-col items-center gap-4 py-24 text-center">
        <div className="kicker">No accounts here</div>
        <h1 className="m-0 font-serif text-[32px] leading-[1.1] tracking-[-0.02em]">
          This copy of Gunit is local only
        </h1>
        <p className="m-0 max-w-[380px] text-[15px] text-ink-2 text-pretty">
          Your decks live in this browser. Nothing is missing — back them up from Settings to move
          them to another machine.
        </p>
        <Button as={Link} to="/" className="mt-2">
          Back to studying
        </Button>
      </div>
    )
  }

  if (user) {
    return (
      <div className="rise-in mx-auto flex max-w-[460px] flex-col items-center gap-4 py-24 text-center">
        <div className="kicker">Already signed in</div>
        <h1 className="m-0 font-serif text-[32px] leading-[1.1] tracking-[-0.02em]">
          You are signed in as {user.email}
        </h1>
        <Button as={Link} to="/" className="mt-2">
          Back to studying
        </Button>
      </div>
    )
  }

  return (
    <div className="rise-in mx-auto flex max-w-[420px] flex-col gap-6 py-12">
      <header>
        <div className="kicker mb-3.5">{copy.kicker}</div>
        <h1 className="m-0 mb-2.5 font-serif text-[32px] leading-[1.08] tracking-[-0.02em]">
          {copy.title}
        </h1>
        <p className="m-0 text-[15px] leading-[1.55] text-ink-2 text-pretty">
          {mode === 'forgot'
            ? 'We will email you a link that lets you choose a new password.'
            : 'An account keeps your decks and your review history across machines. Studying works without one.'}
        </p>
      </header>

      {sent ? (
        <div
          role="status"
          className="rounded-lg border border-ok-line bg-ok-soft px-4 py-3.5 text-[13px] leading-[1.5] text-ink-2"
        >
          <div className="mb-1 text-[13px] font-semibold text-ink">Check your email</div>
          If an account exists for {email}, a reset link is on its way. It expires after an hour.
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3.5" noValidate>
          {mode === 'up' && (
            <Field
              id="auth-name"
              label="Your name"
              optional
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Shown on the dashboard greeting"
            />
          )}

          <Field
            id="auth-email"
            label="Email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          {mode !== 'forgot' && (
            <Field
              id="auth-password"
              label="Password"
              type="password"
              required
              // Tells a password manager to offer a new one rather than an old.
              autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}

          {mode === 'up' && (
            <p className="m-0 text-[13px] leading-[1.5] text-ink-3">
              Eight characters or more. There is no confirmation email — you are in as soon as you
              choose one.
            </p>
          )}

          {/*
            Always mounted, so the message is announced when it appears rather
            than arriving with the region that holds it.
          */}
          <div role="status" aria-live="polite">
            {error && (
              <div className="rounded-lg border border-err bg-err-soft px-4 py-3 text-[13px] leading-[1.5] text-ink">
                {error}
              </div>
            )}
          </div>

          <Button type="submit" disabled={busy} className="mt-1">
            {busy ? copy.busy : copy.action}
          </Button>
        </form>
      )}

      <div className="flex flex-col gap-2 border-t border-line-soft pt-5 text-[13px] text-ink-2">
        {mode !== 'in' && (
          <button type="button" onClick={() => change('in')} className="self-start underline-offset-2 hover:underline">
            Already have an account? Sign in
          </button>
        )}
        {mode !== 'up' && (
          <button type="button" onClick={() => change('up')} className="self-start underline-offset-2 hover:underline">
            New here? Make an account
          </button>
        )}
        {mode !== 'forgot' && (
          <button
            type="button"
            onClick={() => change('forgot')}
            className="self-start underline-offset-2 hover:underline"
          >
            Forgotten your password?
          </button>
        )}
        <Link to="/" className="self-start text-ink-3 underline-offset-2 hover:underline">
          Keep studying without an account
        </Link>
      </div>
    </div>
  )
}
