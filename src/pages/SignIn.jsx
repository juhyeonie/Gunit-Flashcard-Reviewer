import { useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import Button from '../components/Button.jsx'
import { EyeIcon } from '../components/Icons.jsx'
import CreatorCredit from '../components/CreatorCredit.jsx'
import { useAuth } from '../data/useAuth.js'
import useDocumentTitle from '../hooks/useDocumentTitle.js'
import Spinner from '../components/Spinner.jsx'
import useOnline from '../hooks/useOnline.js'
import useT from '../i18n/useT.js'

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

/** One mode's words, from the dictionary: signIn.<mode>.title and so on. */
const copyFor = (t, mode) => ({
  title: t(`signIn.${mode}.title`),
  lede: t(`signIn.${mode}.lede`),
  action: t(`signIn.${mode}.action`),
  busy: t(`signIn.${mode}.busy`),
  document: t(`signIn.${mode}.document`),
})

/**
 * The wordmark, and the one piece of decoration on the page.
 *
 * The nav's logo is an image; this is set in the app's own serif so it reads
 * as a title rather than a badge, and so it stays crisp at the size the page
 * wants it. Same typeface the deck titles use.
 */
function Wordmark() {
  const { t } = useT()
  return (
    <div className="flex flex-col items-center gap-1.5">
      <img src="/assets/gunit-logo.png" alt="Gunit" className="block h-9 w-auto" />
      <p className="kicker m-0 !tracking-[0.14em] text-ink-3">{t('signIn.tagline')}</p>
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
  'w-full rounded-[10px] border border-line bg-surface px-3.5 py-[13px] fs-15 text-ink ' +
  'outline-none transition-colors placeholder:text-ink-3/70 ' +
  'focus:border-accent focus:outline-2 focus:outline-accent-soft'

/**
 * Where to go once signed in: back to the page that sent the reader here — a
 * shared deck they wanted to save — or home. Only a path within this app, so
 * a crafted link cannot bounce a fresh sign-in off to somebody else's site.
 */
const safeNext = (next) =>
  typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') && !next.includes('\\') ? next : '/'

export default function SignIn() {
  const { available, user, signIn, signUp, requestPasswordReset } = useAuth()
  const online = useOnline()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  /*
   * The landing page's "Create an account" asks for the sign-up mode by
   * carrying it in the navigation rather than in the address. The mode has
   * never been a route — there is nothing to bookmark about the sign-up
   * variant — and inventing one to serve a button would be a worse trade than
   * reading a hint the router already carries.
   */
  const { state } = useLocation()
  const [mode, setMode] = useState(state?.mode === 'up' ? 'up' : 'in')
  const { t } = useT()
  const copy = copyFor(t, mode)
  useDocumentTitle(copy.document)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [reveal, setReveal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [sent, setSent] = useState(false)

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
    else navigate(safeNext(searchParams.get('next')))
  }

  if (!available) {
    return (
      <Centred>
        <Wordmark />
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="kicker">{t('signIn.localKicker')}</div>
          <h1 className="m-0 font-serif fs-30 leading-[1.12] tracking-[-0.02em]">
            {t('signIn.localTitle')}
          </h1>
          <p className="m-0 max-w-[360px] fs-15 leading-[1.55] text-ink-2 text-pretty">
            {t('signIn.localBody')}
          </p>
          <Button as={Link} to="/" className="mt-1">
            {t('signIn.backToStudying')}
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
          <div className="kicker">{t('signIn.alreadyKicker')}</div>
          <h1 className="m-0 font-serif fs-30 leading-[1.12] tracking-[-0.02em]">
            {t('signIn.alreadyTitle', { email: user.email })}
          </h1>
          <Button as={Link} to={safeNext(searchParams.get('next'))} className="mt-1">
            {t('signIn.backToStudying')}
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
          <h1 className="m-0 mb-2 font-serif fs-30 leading-[1.12] tracking-[-0.02em]">
            {copy.title}
          </h1>
          <p className="m-0 fs-15 leading-[1.55] text-ink-2 text-pretty">{copy.lede}</p>
        </header>

        {sent ? (
          <div
            role="status"
            className="rounded-[10px] border border-ok-line bg-ok-soft px-4 py-3.5 fs-13 leading-[1.5] text-ink-2"
          >
            <div className="mb-1 font-semibold text-ink">{t('signIn.checkEmail')}</div>
            {t('signIn.resetSent', { email })}
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            {mode === 'up' && (
              <Row
                id="auth-name"
                label={t('signIn.name')}
                hint={<span className="fs-12 text-ink-3">{t('field.optional')}</span>}
              >
                <input
                  id="auth-name"
                  className={input}
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('signIn.namePlaceholder')}
                />
              </Row>
            )}

            <Row id="auth-email" label={t('signIn.email')}>
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
                label={t('signIn.password')}
                hint={
                  mode === 'in' && (
                    <button
                      type="button"
                      onClick={() => change('forgot')}
                      className="cursor-pointer border-0 bg-transparent p-0 fs-12 text-ink-3 underline-offset-2 transition-colors hover:text-accent hover:underline"
                    >
                      {t('signIn.forgotLink')}
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
                    aria-label={reveal ? t('signIn.hidePassword') : t('signIn.showPassword')}
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
              <p className="m-0 fs-13 leading-[1.5] text-ink-3">
                {t('signIn.passwordRule')}
              </p>
            )}

            {/*
              Always mounted, so the message is announced when it appears
              rather than arriving with the region that holds it.
            */}
            <div role="status" aria-live="polite">
              {error && (
                <div className="rounded-[10px] border border-err bg-err-soft px-4 py-3 fs-13 leading-[1.5] text-ink">
                  {error}
                </div>
              )}
            </div>

            {/*
              Offline, the account cannot be reached, and a form that let the
              reader try would answer with a network error that means nothing
              to them. Said before they type, instead.
            */}
            {!online && (
              <p role="status" className="m-0 fs-13 leading-[1.5] text-ink-2 text-pretty">
                {t('signIn.offline')}
              </p>
            )}
            <Button
              type="submit"
              variant="accent"
              disabled={busy || !online}
              className="mt-1 w-full"
            >
              {busy && <Spinner />}
              {busy ? copy.busy : copy.action}
            </Button>
          </form>
        )}

        <div className="flex flex-col items-center gap-2.5 border-t border-line-soft pt-6 fs-13 text-ink-2">
          {mode === 'in' && (
            <p className="m-0">
              {t('signIn.noAccount')}{' '}
              <button
                type="button"
                onClick={() => change('up')}
                className="cursor-pointer border-0 bg-transparent p-0 fs-13 font-semibold text-accent underline-offset-2 hover:underline"
              >
                {t('signIn.createOne')}
              </button>
            </p>
          )}
          {mode !== 'in' && (
            <p className="m-0">
              {t('signIn.haveAccount')}{' '}
              <button
                type="button"
                onClick={() => change('in')}
                className="cursor-pointer border-0 bg-transparent p-0 fs-13 font-semibold text-accent underline-offset-2 hover:underline"
              >
                {t('common.signIn')}
              </button>
            </p>
          )}
          <Link to="/" className="text-ink-3 underline-offset-2 hover:underline">
            {t('signIn.withoutAccount')}
          </Link>
        </div>
      </div>
    </Centred>
  )
}
