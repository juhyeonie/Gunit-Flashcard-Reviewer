import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/Button.jsx'
import { useApp } from '../data/AppContext.jsx'
import useDocumentTitle from '../hooks/useDocumentTitle.js'
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
        <h2 className="kicker m-0 mb-1 border-b border-line pb-3 !text-[11px]">Account</h2>
        <Row label="Name" hint="Shown on the dashboard greeting.">
          <input
            value={draft.name}
            aria-label="Name"
            onChange={(e) => set({ name: e.target.value })}
            className={textInput}
          />
        </Row>
        <Row label="Email" hint="Used for the weekly study summary.">
          <input
            value={draft.email}
            aria-label="Email"
            onChange={(e) => set({ email: e.target.value })}
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

      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        onChange={(e) => {
          restore(e.target.files?.[0])
          e.target.value = ''
        }}
        className="absolute -left-[9999px] h-px w-px opacity-0"
      />
    </div>
  )
}
