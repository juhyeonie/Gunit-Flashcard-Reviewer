import { useNavigate } from 'react-router-dom'
import Button from '../components/Button.jsx'
import { useApp } from '../data/AppContext.jsx'

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

export default function Settings() {
  const { theme, toggleTheme, settings, updateSettings, say } = useApp()
  const navigate = useNavigate()

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
              value={settings.cardsPer}
              aria-label="Cards per session"
              onChange={(e) => updateSettings({ cardsPer: Number(e.target.value) })}
              className="w-[150px] accent-accent"
            />
            <span className="w-16 font-mono text-xs font-medium whitespace-nowrap text-ink-2">
              {settings.cardsPer} cards
            </span>
          </div>
        </Row>
        <Row
          label="Reveal answer automatically"
          hint="Flip the card after four seconds instead of waiting for a keypress."
        >
          <Toggle
            label="Reveal answer automatically"
            on={settings.autoReveal}
            onClick={() => updateSettings({ autoReveal: !settings.autoReveal })}
          />
        </Row>
        <Row label="Shuffle new sessions" hint="Start each session in random order.">
          <Toggle
            label="Shuffle new sessions"
            on={settings.shuffleFirst}
            onClick={() => updateSettings({ shuffleFirst: !settings.shuffleFirst })}
          />
        </Row>
      </section>

      <section>
        <h2 className="kicker m-0 mb-1 border-b border-line pb-3 !text-[11px]">Account</h2>
        <Row label="Name" hint="Shown on the dashboard greeting.">
          <input
            value={settings.name}
            aria-label="Name"
            onChange={(e) => updateSettings({ name: e.target.value })}
            className={textInput}
          />
        </Row>
        <Row label="Email" hint="Used for the weekly study summary.">
          <input
            value={settings.email}
            aria-label="Email"
            onChange={(e) => updateSettings({ email: e.target.value })}
            className={textInput}
          />
        </Row>
      </section>

      <div className="flex gap-2">
        <Button onClick={() => say('Preferences saved')}>Save changes</Button>
        <Button variant="ghost" onClick={() => navigate('/')}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
