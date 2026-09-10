import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import Button from '../components/Button.jsx'
import { EyeIcon } from '../components/Icons.jsx'
import CreatorCredit from '../components/CreatorCredit.jsx'
import { useAuth } from '../data/useAuth.js'
import useDocumentTitle from '../hooks/useDocumentTitle.js'

/**
 * One page for the three ways in: signing in, signing up, and asking for a
 * password reset.
 *
 * They share a form and most of their copy, and separate pages would mean
 * three routes for what is really one decision. The mode is state rather than
 * a route because arriving here is arriving here — there is nothing to
 * bookmark about "the sign-up variant". "Create one" and "Forgotten your
 * password?" therefore change the mode; they are the existing flows, reached
 * the way they have always been reached.
 *
 * An account is optional in Gunit, and this page says so rather than reading
 * as a wall. Decks work without one; an account is what carries them between
 * machines.
 */

const COPY = {
  in: {
    title: 'Welcome back',
    lede: 'Sign in to continue studying.',
    action: 'Sign in',
    busy: 'Signing in…',
    document: 'Sign in',
  },
  up: {
    title: 'Make an account',
    lede: 'It keeps your decks and your review history across machines.',
    action: 'Create account',
    busy: 'Creating…',
    document: 'Make an account',
  },
  forgot: {
    title: 'Forgotten your password',
    lede: 'We will email you a link that lets you choose a new one.',
    action: 'Send reset link',
    busy: 'Sending…',
    document: 'Send a reset link',
  },
}

/**
 * The wordmark, and the one piece of decoration on the page.
 *
 * The nav's logo is an image; this is set in the app's own serif so it reads
 * as a title rather than a badge, and so it stays crisp at the size the page
 * wants it. Same typeface the deck titles use.
 */
function Wordmark() {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <img src="/assets/gunit-logo.png" alt="Gunit" className="block h-9 w-auto" />
      <p className="kicker m-0 !tracking-[0.14em] text-ink-3">Your study space</p>
    </div>
  )
}

/**
 * Label and input, close to `Field` but not it.
 *
 * `Field` puts the control inside its label, which is right everywhere else in
 * the app and wrong here: the password row needs a reveal button beside the
 * input, and a button inside a label is clicked twice — once for itself and
 * once by the label forwarding to the input.
 */
function Row({ id, label, hint, children }) {
  return (
    <div className="flex flex-col gap-[7px]">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="kicker !tracking-[0.12em]">
          {label}
        </label>
        {hint}
      </div>
      {children}
    </div>
  )
}

/**
 * The shell both dead ends and the form sit in, so the page is one shape.
 *
 * Declared out here rather than inside the component: a component defined
 * during render is a new type on every render, and React unmounts and remounts
 * the whole subtree when the type changes. The inputs would lose their
 * contents, and the focus ring, on every keystroke.
 */
function Centred({ children }) {
  return (
    // Gutters on the outside so the form itself is a true 420 on a wide screen
    // rather than 420 minus its own padding, and still has room to breathe on
    // a phone.
    <div className="rise-in flex w-full justify-center px-4 py-14 sm:py-20">
      <div className="flex w-full max-w-[420px] flex-col items-center gap-9">
        {children}
        {/*
          Here rather than in each mode, so signing in, making an account and
          asking for a reset link all carry it identically — they are one page
          wearing three sets of words, and this is the part of the shell they
          share.
        */}
        <CreatorCredit />
      </div>
    </div>
  )
}

/*
 * The focus ring is an outline, not a box-shadow.
 *
 * `shadow-[0_0_0_3px_var(--color-accent-soft)]` reads fine and does nothing:
 * Tailwind composes shadows through its own custom properties and the
 * arbitrary value never reaches them. Outline is what every button in this app
 * already focuses with, it cannot be clipped by an ancestor, and it is drawn
 * outside the border so the two do not fight.
 *
 * `outline-2` rather than `outline-[3px]`, and that is not fussiness:
 * `outline-none` above sets outline-style to none, the arbitrary form sets
 * only a width, and a 3px outline with no style is 3px of nothing.
 */
const input =
  'w-full rounded-[10px] border border-line bg-surface px-3.5 py-[13px] text-[15px] text-ink ' +
  'outline-none transition-colors placeholder:text-ink-3/70 ' +
  'focus:border-accent focus:outline-2 focus:outline-accent-soft'

export default function SignIn() {
  const { available, user, signIn, signUp, requestPasswordReset } = useAuth()
  const navigate = useNavigate()
  /*
   * The landing page's "Create an account" asks for the sign-up mode by
   * carrying it in the navigation rather than in the address. The mode has
   * never been a route — there is nothing to bookmark about the sign-up
   * variant — and inventing one to serve a button would be a worse trade than
   * reading a hint the router already carries.
   */
  const { state } = useLocation()
  const [mode, setMode] = useState(state?.mode === 'up' ? 'up' : 'in')
  useDocumentTitle(COPY[mode].document)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [reveal, setReveal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [sent, setSent] = useState(false)

  const copy = COPY[mode]

  const change = (next) => {
    setMode(next)
    setError(null)
    setSent(false)
    setReveal(false)
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
      <Centred>
        <Wordmark />
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="kicker">No accounts here</div>
          <h1 className="m-0 font-serif text-[30px] leading-[1.12] tracking-[-0.02em]">
            This copy of Gunit is local only
          </h1>
          <p className="m-0 max-w-[360px] text-[15px] leading-[1.55] text-ink-2 text-pretty">
            Your decks live in this browser. Nothing is missing — back them up from Settings to move
            them to another machine.
          </p>
          <Button as={Link} to="/" className="mt-1">
            Back to studying
          </Button>
        </div>
      </Centred>
    )
  }

  if (user) {
    return (
      <Centred>
        <Wordmark />
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="kicker">Already signed in</div>
          <h1 className="m-0 font-serif text-[30px] leading-[1.12] tracking-[-0.02em]">
            You are signed in as {user.email}
          </h1>
          <Button as={Link} to="/" className="mt-1">
            Back to studying
          </Button>
        </div>
      </Centred>
    )
  }

  return (
    <Centred>
      <Wordmark />

      <div className="flex w-full flex-col gap-7">
        <header className="text-center">
          <h1 className="m-0 mb-2 font-serif text-[30px] leading-[1.12] tracking-[-0.02em]">
            {copy.title}
          </h1>
          <p className="m-0 text-[15px] leading-[1.55] text-ink-2 text-pretty">{copy.lede}</p>
        </header>

        {sent ? (
          <div
            role="status"
            className="rounded-[10px] border border-ok-line bg-ok-soft px-4 py-3.5 text-[13px] leading-[1.5] text-ink-2"
          >
            <div className="mb-1 font-semibold text-ink">Check your email</div>
            If an account exists for {email}, a reset link is on its way. It expires after an hour.
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            {mode === 'up' && (
              <Row
                id="auth-name"
                label="Your name"
                hint={<span className="text-[12px] text-ink-3">optional</span>}
              >
                <input
                  id="auth-name"
                  className={input}
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Shown on the dashboard greeting"
                />
              </Row>
            )}

            <Row id="auth-email" label="Email">
              <input
                id="auth-email"
                className={input}
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Row>

            {mode !== 'forgot' && (
              <Row
                id="auth-password"
                label="Password"
                hint={
                  mode === 'in' && (
                    <button
                      type="button"
                      onClick={() => change('forgot')}
                      className="cursor-pointer border-0 bg-transparent p-0 text-[12px] text-ink-3 underline-offset-2 transition-colors hover:text-accent hover:underline"
                    >
                      Forgot password?
                    </button>
                  )
                }
              >
                <div className="relative">
                  <input
                    id="auth-password"
                    className={`${input} pr-11`}
                    type={reveal ? 'text' : 'password'}
                    required
                    // Tells a password manager to offer a new one, not an old.
                    autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setReveal((v) => !v)}
                    // The name says what pressing it does, and `pressed` says
                    // which state it is in — the icon alone says neither.
                    aria-label={reveal ? 'Hide password' : 'Show password'}
                    aria-pressed={reveal}
                    aria-controls="auth-password"
                    className="absolute top-1/2 right-1.5 grid h-8 w-8 -translate-y-1/2 cursor-pointer place-items-center rounded-lg border-0 bg-transparent text-ink-3 transition-colors hover:bg-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    <EyeIcon shown={reveal} />
                  </button>
                </div>
              </Row>
            )}

            {mode === 'up' && (
              <p className="m-0 text-[13px] leading-[1.5] text-ink-3">
                Eight characters or more. There is no confirmation email — you are in as soon as you
                choose one.
              </p>
            )}

            {/*
              Always mounted, so the message is announced when it appears
              rather than arriving with the region that holds it.
            */}
            <div role="status" aria-live="polite">
              {error && (
                <div className="rounded-[10px] border border-err bg-err-soft px-4 py-3 text-[13px] leading-[1.5] text-ink">
                  {error}
                </div>
              )}
            </div>

            <Button type="submit" variant="accent" disabled={busy} className="mt-1 w-full">
              {busy ? copy.busy : copy.action}
            </Button>
          </form>
        )}

        <div className="flex flex-col items-center gap-2.5 border-t border-line-soft pt-6 text-[13px] text-ink-2">
          {mode === 'in' && (
            <p className="m-0">
              Don&rsquo;t have an account?{' '}
              <button
                type="button"
                onClick={() => change('up')}
                className="cursor-pointer border-0 bg-transparent p-0 text-[13px] font-semibold text-accent underline-offset-2 hover:underline"
              >
                Create one
              </button>
            </p>
          )}
          {mode !== 'in' && (
            <p className="m-0">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => change('in')}
                className="cursor-pointer border-0 bg-transparent p-0 text-[13px] font-semibold text-accent underline-offset-2 hover:underline"
              >
                Sign in
              </button>
            </p>
          )}
          <Link to="/" className="text-ink-3 underline-offset-2 hover:underline">
            Keep studying without an account
          </Link>
        </div>
      </div>
    </Centred>
  )
}
