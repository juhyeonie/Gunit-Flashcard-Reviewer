import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Button from '../components/Button.jsx'
import Modal from '../components/Modal.jsx'
import { useApp } from '../data/useApp.js'
import useDocumentTitle from '../hooks/useDocumentTitle.js'
import { useAuth } from '../data/useAuth.js'
import { fromLibraryTransfer, libraryFileName, toLibraryTransfer } from '../data/transfer.js'

function Row({ label, hint, children }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-[18px] border-b border-line-soft py-[18px]">
      <div className="min-w-[200px] flex-1">
        <div className="mb-1 text-[15px] leading-[1.3] font-medium">{label}</div>
        <div className="text-[13px] text-ink-3 text-pretty">{hint}</div>
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

const textInput =
  'w-[220px] rounded-[5px] border border-line bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-accent'

/**
 * Preferences are edited as a draft.
 *
 * Every field used to write straight through on each keystroke, which made both
 * buttons untrue: "Save changes" announced a save when nothing was pending, and
 * "Cancel" navigated away from edits that had already been kept — mistype your
 * name, press Cancel, and the mistake stayed.
 *
 * Theme is the one setting applied as you pick it, because choosing a theme
 * without seeing it is no choice at all. Cancel puts it back.
 */
export default function Settings() {
  const { theme, toggleTheme, settings, updateSettings, say, decks, sessions, restoreLibrary } =
    useApp()
  useDocumentTitle('Preferences')
  const navigate = useNavigate()

  const [draft, setDraft] = useState(settings)
  // State rather than a ref: this is read while rendering, to work out whether
  // anything is unsaved.
  const [themeOnEntry, setThemeOnEntry] = useState(theme)
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }))

  const dirty =
    theme !== themeOnEntry ||
    Object.keys(draft).some((k) => draft[k] !== settings[k])

  const save = () => {
    updateSettings(draft)
    setThemeOnEntry(theme)
    say('Preferences saved')
  }

  const cancel = () => {
    if (theme !== themeOnEntry) toggleTheme()
    navigate('/')
  }

  const fileRef = useRef(null)
  const deckCount = decks.length
  const { available, user, signOut } = useAuth()

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
    say(error ?? 'Signed out')
  }

  /**
   * A deck at a time is a way to share; this is the file you want before
   * clearing site data or moving to another machine.
   */
  const backUp = () => {
    const name = libraryFileName()
    const blob = new Blob([JSON.stringify(toLibraryTransfer({ decks, sessions }), null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = name
    link.click()
    // Revoking in the same tick can cancel the save before it starts.
    setTimeout(() => URL.revokeObjectURL(url), 0)
    say(`Backed up ${deckCount} ${deckCount === 1 ? 'deck' : 'decks'}`)
  }

  const restore = async (file) => {
    if (!file) return
    const { library, error, skippedDecks } = fromLibraryTransfer(await file.text())
    if (error) {
      say(error)
      return
    }
    const { decks: added, sessions: logged } = restoreLibrary(library)
    const lost = skippedDecks
      ? ` — ${skippedDecks} unreadable ${skippedDecks === 1 ? 'deck' : 'decks'} left out`
      : ''
    say(
      `Restored ${added} ${added === 1 ? 'deck' : 'decks'} and ` +
        `${logged} ${logged === 1 ? 'session' : 'sessions'}${lost}`,
    )
  }

  return (
    <div className="rise-in mx-auto flex max-w-[680px] flex-col gap-[38px]">
      <header>
        <div className="kicker mb-3.5">Settings</div>
        <h1 className="m-0 font-serif text-[32px] leading-[1.06] tracking-[-0.015em] sm:text-[40px]">
          Preferences
        </h1>
      </header>

      <section>
        <h2 className="kicker m-0 mb-1 border-b border-line pb-3 !text-[11px]">Appearance</h2>
        <Row label="Theme" hint="Warm paper by day, warm dark at night.">
          <div className="flex gap-[3px] rounded-md border border-line bg-raised p-[3px]">
            {['Light', 'Dark'].map((option) => {
              const active = theme === option.toLowerCase()
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    if (!active) toggleTheme()
                  }}
                  className={`cursor-pointer rounded border-0 px-3.5 py-2 text-[13px] leading-none font-medium ${
                    active ? 'bg-surface text-ink' : 'bg-transparent text-ink-3'
                  }`}
                >
                  {option}
                </button>
              )
            })}
          </div>
        </Row>
      </section>

      <section>
        <h2 className="kicker m-0 mb-1 border-b border-line pb-3 !text-[11px]">Review</h2>
        <Row label="Cards per session" hint="The queue stops here even if more are due.">
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="5"
              max="60"
              step="5"
              value={draft.cardsPer}
              aria-label="Cards per session"
              onChange={(e) => set({ cardsPer: Number(e.target.value) })}
              className="w-[150px] accent-accent"
            />
            <span className="w-16 font-mono text-xs font-medium whitespace-nowrap text-ink-2">
              {draft.cardsPer} cards
            </span>
          </div>
        </Row>
        <Row
          label="Reveal answer automatically"
          hint="Flip the card after four seconds instead of waiting for a keypress."
        >
          <Toggle
            label="Reveal answer automatically"
            on={draft.autoReveal}
            onClick={() => set({ autoReveal: !draft.autoReveal })}
          />
        </Row>
        <Row label="Shuffle new sessions" hint="Start each session in random order.">
          <Toggle
            label="Shuffle new sessions"
            on={draft.shuffleFirst}
            onClick={() => set({ shuffleFirst: !draft.shuffleFirst })}
          />
        </Row>
      </section>

      <section>
        <h2 className="kicker m-0 mb-1 border-b border-line pb-3 !text-[11px]">About you</h2>
        <Row label="Name" hint="Shown on the dashboard greeting.">
          <input
            value={draft.name}
            aria-label="Name"
            placeholder="Not set"
            onChange={(e) => set({ name: e.target.value })}
            className={textInput}
          />
        </Row>
      </section>

      <div className="flex items-center gap-2">
        <Button onClick={save} disabled={!dirty}>
          Save changes
        </Button>
        <Button variant="ghost" onClick={cancel}>
          Cancel
        </Button>
        {dirty && <span className="kicker">Unsaved changes</span>}
      </div>

      {/*
        Below the save row on purpose: these act at once and have nothing to do
        with the draft above them.
      */}
      {/*
        Only shown where there is a project to sign in to. A local-only copy of
        Gunit should not advertise an account it cannot make.
      */}
      {available && (
        <section>
          <h2 className="kicker m-0 mb-1 border-b border-line pb-3 !text-[11px]">Signing in</h2>
          {user ? (
            <Row label="Signed in" hint={user.email}>
              <Button variant="outline" size="sm" onClick={() => setConfirmingSignOut(true)}>
                Sign out
              </Button>
            </Row>
          ) : (
            <Row
              label="Not signed in"
              hint="Your decks are in this browser only. An account carries them between machines."
            >
              <Button as={Link} variant="outline" size="sm" to="/sign-in">
                Sign in
              </Button>
            </Row>
          )}
        </section>
      )}

      <section>
        <h2 className="kicker m-0 mb-1 border-b border-line pb-3 !text-[11px]">Your library</h2>
        <Row
          label="Back it up"
          hint={`Writes every deck and its review history to a file. ${deckCount} ${
            deckCount === 1 ? 'deck' : 'decks'
          } right now.`}
        >
          <Button variant="outline" size="sm" onClick={backUp}>
            Back up everything
          </Button>
        </Row>
        <Row
          label="Restore a backup"
          hint="Adds the decks in the file to this library rather than replacing what is here."
        >
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            Restore a backup
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
        <h2 className="kicker m-0 mb-1 border-b border-line pb-3 !text-[11px]">About</h2>
        <div className="flex flex-col gap-1">
          <div className="font-serif text-[20px] leading-[1.2] text-accent">Gunit</div>
          <p className="m-0 text-[13px] leading-[1.5] text-ink-2">
            Designed &amp; developed by{' '}
            <span className="font-semibold text-ink">Justine Pelgone</span>
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
        kicker="Signing out"
        title="Sign out of Gunit?"
        body="Your decks stay in your account and come back when you sign in. This browser returns to its own library, and the account's copy is taken off this machine — so studying offline here will need a sign-in first."
        confirmLabel={signingOut ? 'Signing out…' : 'Sign out'}
        confirmDisabled={signingOut}
        cancelLabel="Stay signed in"
        onConfirm={leave}
      />
    </div>
  )
}
