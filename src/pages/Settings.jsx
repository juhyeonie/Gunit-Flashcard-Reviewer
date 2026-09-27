import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Button from '../components/Button.jsx'
import Modal from '../components/Modal.jsx'
import Avatar from '../components/Avatar.jsx'
import { useApp } from '../data/useApp.js'
import useDocumentTitle from '../hooks/useDocumentTitle.js'
import { useAuth } from '../data/useAuth.js'
import { fromLibraryTransfer, libraryFileName, toLibraryTransfer } from '../data/transfer.js'
import Spinner from '../components/Spinner.jsx'
import usePwa from '../pwa/usePwa.js'
import { promptInstall } from '../pwa/pwaState.js'
import useOnline from '../hooks/useOnline.js'
import useAvatar from '../data/useAvatar.js'
import { AVATAR_TYPES, removeAvatar, setAvatar } from '../data/avatar.js'
import { FONT_SIZES } from '../data/preferences.js'
import { LANGUAGES } from '../i18n/index.js'
import useT from '../i18n/useT.js'

function Row({ label, hint, children, labelFor }) {
  const Label = labelFor ? 'label' : 'div'
  return (
    <div className="flex flex-wrap items-center justify-between gap-[18px] border-b border-line-soft py-[18px]">
      <div className="min-w-[200px] flex-1">
        <Label htmlFor={labelFor} className="mb-1 block fs-15 leading-[1.3] font-medium">
          {label}
        </Label>
        <div className="fs-13 text-ink-3 text-pretty">{hint}</div>
      </div>
      {children}
    </div>
  )
}

function Toggle({ on, onClick, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className={`flex h-[26px] w-11 cursor-pointer rounded-[14px] border p-0.5 transition-colors ${
        on ? 'justify-end border-accent bg-accent' : 'justify-start border-line bg-line-soft'
      }`}
    >
      <span className={`block h-5 w-5 rounded-full ${on ? 'bg-paper' : 'bg-surface'}`} />
    </button>
  )
}

/**
 * A few choices side by side, the one in use raised: the control Theme has
 * always been, now shared with Font size. Each is a button that says whether
 * it is pressed, inside a group named for what it chooses, so a screen reader
 * hears "Font size, group — Large, toggle button, pressed".
 */
function Segmented({ label, options, value, onChange }) {
  return (
    <div role="group" aria-label={label} className="flex gap-[3px] rounded-md border border-line bg-raised p-[3px]">
      {options.map((option) => {
        const active = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => {
              if (!active) onChange(option.value)
            }}
            className={`cursor-pointer rounded border-0 px-3.5 py-2 leading-none font-medium ${option.size ?? 'fs-13'} ${
              active ? 'bg-surface text-ink' : 'bg-transparent text-ink-3'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

const textInput =
  'w-[220px] rounded-[5px] border border-line bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-accent'

/**
 * Each size's own word, set at that size, so the three can be told apart at a
 * glance before any is chosen. Still `fs-*`, so they grow and shrink together
 * with the rest of the page and stay in proportion.
 */
const SIZE_SAMPLE = { small: 'fs-12', default: 'fs-13', large: 'fs-15' }

/** Kept apart from the draft above it: these act at once, the moment they are chosen. */
const LIVE = ['language', 'fontSize']

/**
 * The profile picture: the one in use, or the fallback, and the ways to
 * change it.
 *
 * A guest's is kept in this browser. An account's goes to Supabase Storage,
 * which needs the connection — offline the buttons wait for one rather than
 * failing, and the picture already here keeps showing (avatar.js).
 */
function PictureRow({ name }) {
  const { t } = useT()
  const { say } = useApp()
  const { available, user } = useAuth()
  const online = useOnline()
  const { userId, src } = useAvatar()
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)

  // An account's picture lives on the server; a guest's never leaves here.
  const offline = Boolean(user) && !online

  const pick = async (file) => {
    if (!file) return
    setError(null)
    setBusy('upload')
    const had = Boolean(src)
    const { error: problem } = await setAvatar(userId, file)
    setBusy(null)
    if (problem) setError(t(problem))
    else say(had ? t('avatar.changed') : t('avatar.added'))
  }

  const remove = async () => {
    setError(null)
    setBusy('remove')
    const { error: problem } = await removeAvatar(userId)
    setBusy(null)
    if (problem) setError(t(problem))
    else say(t('avatar.removed'))
  }

  const hint = user
    ? online
      ? t('avatar.hintAccount')
      : t('avatar.hintOffline')
    : available
      ? t('avatar.hintGuest')
      : t('avatar.hintLocal')

  return (
    <Row label={t('avatar.label')} hint={hint}>
      <div className="flex flex-wrap items-center gap-3">
        <Avatar src={src} name={name} size={56} alt={src ? t('avatar.yours') : t('avatar.none')} />
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={offline || Boolean(busy)}
            title={offline ? t('avatar.needsConnection') : undefined}
            onClick={() => inputRef.current?.click()}
          >
            {busy === 'upload' ? (
              <>
                <Spinner />
                {t('avatar.uploading')}
              </>
            ) : src ? (
              t('avatar.change')
            ) : (
              t('avatar.upload')
            )}
          </Button>
          {src && (
            <Button
              variant="ghost"
              size="sm"
              disabled={offline || Boolean(busy)}
              title={offline ? t('avatar.needsConnection') : undefined}
              onClick={remove}
            >
              {busy === 'remove' ? (
                <>
                  <Spinner />
                  {t('avatar.removing')}
                </>
              ) : (
                t('avatar.remove')
              )}
            </Button>
          )}
        </div>
      </div>
      {/* Always mounted, so a refusal is announced as it appears. */}
      <div role="alert" className="w-full empty:hidden">
        {error && <p className="m-0 fs-13 text-err">{error}</p>}
      </div>
      {/*
        Driven by the buttons above, like the backup file picker below, so it
        is out of the tab order and hidden from the reader.
      */}
      <input
        ref={inputRef}
        type="file"
        tabIndex={-1}
        aria-hidden="true"
        accept={AVATAR_TYPES.join(',')}
        onChange={(e) => {
          pick(e.target.files?.[0])
          e.target.value = ''
        }}
        className="absolute -left-[9999px] h-px w-px opacity-0"
      />
    </Row>
  )
}

/**
 * Preferences are edited as a draft.
 *
 * Every field used to write straight through on each keystroke, which made both
 * buttons untrue: "Save changes" announced a save when nothing was pending, and
 * "Cancel" navigated away from edits that had already been kept — mistype your
 * name, press Cancel, and the mistake stayed.
 *
 * Theme, language and font size are applied as you pick them, because
 * choosing any of the three without seeing it is no choice at all — the page
 * redraws in the language or at the size chosen. Cancel puts them back.
 *
 * What the page starts from can move under it. Opened straight after a
 * reload, it renders before the account's library has been read, and the
 * account's name, language and size arrive a moment later. Anything the
 * reader has not touched here follows the store; before this, the name box
 * sat empty over "Unsaved changes", and Cancel would have put back the
 * values from before the account arrived.
 */
export default function Settings() {
  const { theme, toggleTheme, settings, updateSettings, say, decks, folders, sessions, restoreLibrary } =
    useApp()
  const { t } = useT()
  useDocumentTitle(t('settings.title'))
  const navigate = useNavigate()

  const [draft, setDraft] = useState(settings)
  // State rather than a ref: this is read while rendering, to work out whether
  // anything is unsaved.
  const [onEntry, setOnEntry] = useState(() => ({
    theme,
    language: settings.language,
    fontSize: settings.fontSize,
  }))
  // The live settings the reader has changed on this page, and the store as
  // this page last saw it.
  const [touched, setTouched] = useState(() => new Set())
  const [seen, setSeen] = useState({ settings, theme })
  if (seen.settings !== settings || seen.theme !== theme) {
    const was = seen.settings
    setSeen({ settings, theme })
    setDraft((d) => {
      const next = { ...d }
      for (const key of Object.keys(settings)) {
        if (!LIVE.includes(key) && d[key] === was[key]) next[key] = settings[key]
      }
      return next
    })
    setOnEntry((entry) => ({
      theme: touched.has('theme') ? entry.theme : theme,
      language: touched.has('language') ? entry.language : settings.language,
      fontSize: touched.has('fontSize') ? entry.fontSize : settings.fontSize,
    }))
  }
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }))
  /** A live setting, applied now and remembered as the reader's doing. */
  const choose = (key, apply) => {
    setTouched((keys) => new Set(keys).add(key))
    apply()
  }

  const dirty =
    theme !== onEntry.theme ||
    LIVE.some((k) => settings[k] !== onEntry[k]) ||
    Object.keys(draft).some((k) => !LIVE.includes(k) && draft[k] !== settings[k])

  const save = () => {
    const { language: _language, fontSize: _fontSize, ...kept } = draft
    updateSettings(kept)
    setOnEntry({ theme, language: settings.language, fontSize: settings.fontSize })
    setTouched(new Set())
    say(t('settings.saved'))
  }

  const cancel = () => {
    if (theme !== onEntry.theme) toggleTheme()
    if (LIVE.some((k) => settings[k] !== onEntry[k])) {
      updateSettings({ language: onEntry.language, fontSize: onEntry.fontSize })
    }
    navigate('/')
  }

  const fileRef = useRef(null)
  const deckCount = decks.length
  const { available, user, signOut } = useAuth()
  const { installPrompt, installed } = usePwa()
  const online = useOnline()

  /*
   * Signing out asks first, and it did not used to.
   *
   * It stopped being a one-click undo when the storage was split: the account's
   * library now comes off this machine as well as off the screen. Nothing is
   * lost by it — the decks are in Postgres and signing back in fetches them —
   * but on a train that is the difference between having your decks and not,
   * and it is worth a sentence before rather than a surprise after.
   */
  const [confirmingSignOut, setConfirmingSignOut] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  const leave = async () => {
    // Busy, because this is no longer instant: whatever the push debounce is
    // still holding goes up first, and that is a round trip.
    setSigningOut(true)
    const { error } = await signOut()
    setSigningOut(false)
    setConfirmingSignOut(false)
    say(error ?? t('settings.signedOutToast'))
  }

  /**
   * A deck at a time is a way to share; this is the file you want before
   * clearing site data or moving to another machine.
   */
  const backUp = () => {
    const name = libraryFileName()
    const blob = new Blob([JSON.stringify(toLibraryTransfer({ decks, sessions, folders }), null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = name
    link.click()
    // Revoking in the same tick can cancel the save before it starts.
    setTimeout(() => URL.revokeObjectURL(url), 0)
    say(t('settings.backedUp', { count: deckCount }))
  }

  const restore = async (file) => {
    if (!file) return
    const { library, error, skippedDecks } = fromLibraryTransfer(await file.text())
    if (error) {
      say(error)
      return
    }
    const { decks: added, sessions: logged } = restoreLibrary(library)
    const restored = t('settings.restored', {
      decks: t('folders.deckCount', { count: added }),
      sessions: t('settings.sessionCount', { count: logged }),
    })
    say(skippedDecks ? `${restored}${t('settings.restoredLost', { count: skippedDecks })}` : restored)
  }

  return (
    <div className="rise-in mx-auto flex max-w-[680px] flex-col gap-[38px]">
      <header>
        <div className="kicker mb-3.5">{t('nav.settings')}</div>
        <h1 className="m-0 font-serif fs-32 leading-[1.06] tracking-[-0.015em] sm:fs-40">
          {t('settings.title')}
        </h1>
      </header>

      <section>
        <h2 className="kicker m-0 mb-1 border-b border-line pb-3 !fs-11">{t('settings.sections.appearance')}</h2>
        <Row label={t('settings.theme.label')} hint={t('settings.theme.hint')}>
          <Segmented
            label={t('settings.theme.label')}
            value={theme}
            onChange={() => choose('theme', toggleTheme)}
            options={[
              { value: 'light', label: t('settings.theme.light') },
              { value: 'dark', label: t('settings.theme.dark') },
            ]}
          />
        </Row>
      </section>

      {/*
        Language and text size together: both are about reading the app, both
        apply the moment they are picked, and both follow the reader to their
        other devices once they are signed in.
      */}
      <section>
        <h2 className="kicker m-0 mb-1 border-b border-line pb-3 !fs-11">{t('settings.sections.language')}</h2>
        <Row label={t('settings.language.label')} hint={t('settings.language.hint')} labelFor="settings-language">
          <select
            id="settings-language"
            value={settings.language}
            onChange={(e) => {
              const language = e.target.value
              choose('language', () => updateSettings({ language }))
            }}
            className={`${textInput} cursor-pointer`}
          >
            {LANGUAGES.map((language) => (
              // Each in its own name, so it can be found by someone who cannot
              // read the language the page is in.
              <option key={language.code} value={language.code} lang={language.locale}>
                {language.name}
              </option>
            ))}
          </select>
        </Row>
        <Row label={t('settings.fontSize.label')} hint={t('settings.fontSize.hint')}>
          <Segmented
            label={t('settings.fontSize.label')}
            value={settings.fontSize}
            onChange={(fontSize) => choose('fontSize', () => updateSettings({ fontSize }))}
            options={FONT_SIZES.map((size) => ({
              value: size,
              label: t(`settings.fontSize.${size}`),
              size: SIZE_SAMPLE[size],
            }))}
          />
        </Row>
      </section>

      <section>
        <h2 className="kicker m-0 mb-1 border-b border-line pb-3 !fs-11">{t('settings.sections.review')}</h2>
        <Row label={t('settings.cardsPer.label')} hint={t('settings.cardsPer.hint')}>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="5"
              max="60"
              step="5"
              value={draft.cardsPer}
              aria-label={t('settings.cardsPer.label')}
              onChange={(e) => set({ cardsPer: Number(e.target.value) })}
              className="w-[150px] accent-accent"
            />
            <span className="w-16 font-mono text-xs font-medium whitespace-nowrap text-ink-2">
              {t('deck.cardCount', { count: draft.cardsPer })}
            </span>
          </div>
        </Row>
        <Row label={t('settings.autoReveal.label')} hint={t('settings.autoReveal.hint')}>
          <Toggle
            label={t('settings.autoReveal.label')}
            on={draft.autoReveal}
            onClick={() => set({ autoReveal: !draft.autoReveal })}
          />
        </Row>
        <Row label={t('settings.shuffle.label')} hint={t('settings.shuffle.hint')}>
          <Toggle
            label={t('settings.shuffle.label')}
            on={draft.shuffleFirst}
            onClick={() => set({ shuffleFirst: !draft.shuffleFirst })}
          />
        </Row>
      </section>

      <section>
        <h2 className="kicker m-0 mb-1 border-b border-line pb-3 !fs-11">{t('settings.sections.aboutYou')}</h2>
        <Row label={t('settings.name.label')} hint={t('settings.name.hint')}>
          <input
            value={draft.name}
            aria-label={t('settings.name.label')}
            placeholder={t('settings.name.placeholder')}
            onChange={(e) => set({ name: e.target.value })}
            className={textInput}
          />
        </Row>
      </section>

      <div className="flex items-center gap-2">
        <Button onClick={save} disabled={!dirty}>
          {t('common.saveChanges')}
        </Button>
        <Button variant="ghost" onClick={cancel}>
          {t('common.cancel')}
        </Button>
        {dirty && <span className="kicker">{t('settings.unsaved')}</span>}
      </div>

      {/*
        Below the save row on purpose: these act at once and have nothing to do
        with the draft above them.
      */}
      <section>
        <h2 className="kicker m-0 mb-1 border-b border-line pb-3 !fs-11">{t('settings.sections.profile')}</h2>
        <PictureRow name={settings.name} />
      </section>

      {/*
        Only shown where there is a project to sign in to. A local-only copy of
        Gunit should not advertise an account it cannot make.
      */}
      {available && (
        <section>
          <h2 className="kicker m-0 mb-1 border-b border-line pb-3 !fs-11">{t('settings.sections.signingIn')}</h2>
          {/*
            Offline, the account is not pretended into. Studying and editing
            carry on against this device's copy; signing in or out needs the
            server, so those wait for a connection rather than failing when
            pressed. Signing out offline could not send the last changes
            first, which is the one thing it must do before it lets go.
          */}
          {user ? (
            <Row
              label={t('settings.signedIn.label')}
              hint={online ? user.email : t('settings.signedIn.offline', { email: user.email })}
            >
              <Button
                variant="outline"
                size="sm"
                disabled={!online}
                title={online ? undefined : t('settings.signedIn.needsConnection')}
                onClick={() => setConfirmingSignOut(true)}
              >
                {t('settings.signOut.action')}
              </Button>
            </Row>
          ) : (
            <Row
              label={t('settings.signedOut.label')}
              hint={online ? t('settings.signedOut.hint') : t('settings.signedOut.offline')}
            >
              {online ? (
                <Button as={Link} variant="outline" size="sm" to="/sign-in">
                  {t('common.signIn')}
                </Button>
              ) : (
                <Button variant="outline" size="sm" disabled>
                  {t('common.signIn')}
                </Button>
              )}
            </Row>
          )}
        </section>
      )}

      {/*
        Only where the browser can actually install Gunit and it is not already
        installed. Safari and Firefox offer no install prompt to a page, so they
        get no button here — their own "Add to Home Screen" is the way — rather
        than a button that could only fail.
      */}
      {installPrompt && !installed && (
        <section>
          <h2 className="kicker m-0 mb-1 border-b border-line pb-3 !fs-11">{t('settings.sections.device')}</h2>
          <Row label={t('settings.install.label')} hint={t('settings.install.hint')}>
            <Button variant="outline" size="sm" onClick={() => promptInstall()}>
              {t('settings.install.action')}
            </Button>
          </Row>
        </section>
      )}

      <section>
        <h2 className="kicker m-0 mb-1 border-b border-line pb-3 !fs-11">{t('settings.sections.library')}</h2>
        <Row label={t('settings.backup.label')} hint={t('settings.backup.hint', { count: deckCount })}>
          <Button variant="outline" size="sm" onClick={backUp}>
            {t('settings.backup.action')}
          </Button>
        </Row>
        <Row label={t('settings.restore.label')} hint={t('settings.restore.hint')}>
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            {t('settings.restore.label')}
          </Button>
        </Row>
      </section>

      {/*
        Where app credits belong, and the one place the app talks about itself
        rather than about your library. "About you", further up, is your name —
        a different thing that happens to share a word.

        Allowed to be a little louder than the same line on the landing page:
        nobody arrives here by accident, and it is the last thing on the page.
      */}
      <section className="flex flex-col gap-3.5">
        <h2 className="kicker m-0 mb-1 border-b border-line pb-3 !fs-11">{t('settings.sections.about')}</h2>
        <div className="flex flex-col gap-1">
          <div className="font-serif fs-20 leading-[1.2] text-accent">Gunit</div>
          {/*
            Set at build time from package.json and the commit, so it is the
            version actually running — after "A new version is ready" is taken,
            this is where the reader can see that it was.
          */}
          <p className="m-0 font-mono fs-12 leading-[1.5] text-ink-3">
            {t('settings.version', {
              version: import.meta.env.VITE_APP_VERSION,
              commit: import.meta.env.VITE_APP_COMMIT,
            })}
          </p>
          <p className="m-0 fs-13 leading-[1.5] text-ink-2">
            <Credit />
          </p>
        </div>
      </section>

      {/*
        Driven by the visible button above, so it is taken out of the tab order
        and hidden from the reader. Left in, focus lands on an invisible
        control off the side of the page with nothing to announce.
      */}
      <input
        ref={fileRef}
        type="file"
        tabIndex={-1}
        aria-hidden="true"
        accept=".json,application/json"
        onChange={(e) => {
          restore(e.target.files?.[0])
          e.target.value = ''
        }}
        className="absolute -left-[9999px] h-px w-px opacity-0"
      />

      <Modal
        open={confirmingSignOut}
        onClose={() => setConfirmingSignOut(false)}
        maxWidth={420}
        kicker={t('settings.signOut.kicker')}
        title={t('settings.signOut.title')}
        body={t('settings.signOut.body')}
        confirmLabel={
          signingOut ? (
            <>
              <Spinner />
              {t('settings.signOut.busy')}
            </>
          ) : (
            t('settings.signOut.action')
          )
        }
        confirmDisabled={signingOut}
        cancelLabel={t('settings.signOut.stay')}
        onConfirm={leave}
      />
    </div>
  )
}

/** The credit line, with the name in the same place in any language. */
function Credit() {
  const { parts } = useT()
  return parts('credit.line', {
    name: (
      <span key="name" className="font-semibold text-ink">
        Justine Pelgone
      </span>
    ),
  })
}
