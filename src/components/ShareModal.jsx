import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Modal from './Modal.jsx'
import Button from './Button.jsx'
import { useAuth } from '../data/useAuth.js'
import { flushPendingSync } from '../data/pendingSync.js'
import { noteShared } from '../data/ownShares.js'
import {
  inviteToShare,
  removeMember,
  resetShareLink,
  setMemberRole,
  setShare,
  shareSettings,
  shareUrl,
  stopSharing,
} from '../data/sharing.js'

const ACCESS = [
  { value: 'link', label: 'Anyone with the link', hint: 'No account needed to study it.' },
  { value: 'invited', label: 'Only invited people', hint: 'They sign in with the address you invite.' },
]
const ROLES = [
  { value: 'viewer', label: 'Can study', hint: 'Study it, and add a copy to their own Gunit.' },
  { value: 'editor', label: 'Can edit', hint: 'Also add and change cards. Never delete the deck.' },
]

const inputStyles =
  'rounded-lg border border-line bg-paper px-3 py-[11px] text-[15px] text-ink outline-none ' +
  'placeholder:text-ink-3/70 transition-colors focus:border-accent'

/** A radio drawn the way Move deck draws its folders. */
function Choice({ name, option, checked, onChange, disabled }) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-[7px] border px-3.5 py-3 transition-colors hover:border-ink-3 ${
        checked ? 'border-accent bg-accent-soft' : 'border-line bg-transparent'
      } ${disabled ? 'pointer-events-none opacity-60' : ''}`}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={() => onChange(option.value)}
        className="mt-0.5 accent-[var(--color-accent)]"
      />
      <span className="flex min-w-0 flex-1 flex-col text-sm font-medium">
        {option.label}
        <span className="text-xs font-normal text-ink-3">{option.hint}</span>
      </span>
    </label>
  )
}

/**
 * Sharing a deck or a folder: who can open it, what they can do, the link,
 * and the people it has been given to.
 *
 * Nothing is shared until the reader asks for the link or invites someone —
 * opening this dialog to look is not sharing. After that every change goes up
 * at once, because a link already in someone's hands should stop working the
 * moment its owner says so.
 *
 * Needs the deck or folder to be in the account, so anything still waiting to
 * sync is sent first.
 */
export default function ShareModal({ kind, resource, onClose, say }) {
  const navigate = useNavigate()
  const { user, available } = useAuth()
  const name = kind === 'deck' ? resource.title : resource.name

  const [settings, setSettings] = useState(null)
  const [draft, setDraft] = useState({ access: 'link', role: 'viewer' })
  const [loading, setLoading] = useState(Boolean(user && available))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [email, setEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('viewer')
  const [advanced, setAdvanced] = useState(false)
  const [copied, setCopied] = useState(false)
  const linkRef = useRef(null)
  const alive = useRef(true)

  const active = Boolean(settings?.active)
  const link = active ? shareUrl(kind, settings.token) : ''

  const adopt = useCallback((next) => {
    // The library's "Shared" marker follows, whether or not this is still open.
    noteShared(kind, resource.id, Boolean(next?.active))
    if (!alive.current) return
    setSettings(next)
    if (next?.active) setDraft({ access: next.access, role: next.role })
  }, [kind, resource.id])

  useEffect(() => {
    alive.current = true
    if (!user || !available) return () => {
      alive.current = false
    }
    ;(async () => {
      await flushPendingSync()
      const { data, error: failed } = await shareSettings(kind, resource.id)
      if (!alive.current) return
      setLoading(false)
      if (failed) setError(failed)
      else adopt(data)
    })()
    return () => {
      alive.current = false
    }
  }, [user, available, kind, resource.id, adopt])

  /** Runs one change against the account, and shows whatever comes back. */
  const run = async (work) => {
    setBusy(true)
    setError(null)
    const { data, error: failed } = await work()
    if (!alive.current) return null
    setBusy(false)
    if (failed) {
      setError(failed)
      return null
    }
    adopt(data)
    return data
  }

  const choose = (patch) => {
    const next = { ...draft, ...patch }
    setDraft(next)
    // Not shared yet: nothing to change until the link is asked for.
    if (active) run(() => setShare(kind, resource.id, next.access, next.role))
  }

  const ensureShared = async () =>
    active ? settings : run(() => setShare(kind, resource.id, draft.access, draft.role))

  const copyLink = async () => {
    const shared = await ensureShared()
    if (!shared) return
    const url = shareUrl(kind, shared.token)
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      say?.('Link copied')
    } catch {
      // No clipboard permission: the link is on screen, selected, to copy by hand.
      linkRef.current?.select()
      setError('Copy the link above — this browser would not let Gunit do it.')
    }
  }

  const invite = async (e) => {
    e.preventDefault()
    const address = email.trim()
    if (!address) return
    const shared = await ensureShared()
    if (!shared) return
    const done = await run(() => inviteToShare(shared.id, address, inviteRole))
    if (done) {
      setEmail('')
      say?.(`Invited ${address}`)
    }
  }

  if (!available || !user) {
    return (
      <Modal
        open
        onClose={onClose}
        kicker={kind === 'deck' ? 'Share deck' : 'Share folder'}
        title={`Share “${name}”`}
        body={
          available
            ? 'Sharing needs an account, so the people you share with know it came from you. Sign in, then share from here.'
            : 'This copy of Gunit keeps everything in this browser, with no accounts, so there is nothing to share from. Export the deck to hand it over as a file instead.'
        }
        confirmLabel={available ? 'Sign in' : 'Done'}
        cancelLabel={available ? 'Not now' : 'Close'}
        maxWidth={440}
        onConfirm={() => {
          onClose()
          if (available) navigate(`/sign-in?next=${encodeURIComponent(window.location.pathname)}`)
        }}
      />
    )
  }

  const members = settings?.members ?? []
  const who = draft.access === 'link' ? 'Anyone with the link' : 'Only people you invite'
  const can = draft.role === 'editor' ? 'can study and edit it' : 'can study it'

  return (
    <Modal
      open
      onClose={onClose}
      kicker={kind === 'deck' ? 'Share deck' : 'Share folder'}
      title={`Share “${name}”`}
      body={
        kind === 'folder'
          ? 'Everyone you share it with gets every deck in it — and any you file in it later. Their study progress stays their own, and so does yours.'
          : 'They see your cards, never your progress: each person studies on their own schedule.'
      }
      confirmLabel={copied ? 'Copied' : active ? 'Copy link' : 'Share and copy link'}
      onConfirm={copyLink}
      confirmDisabled={loading || busy}
      cancelLabel="Done"
      maxWidth={500}
    >
      {loading ? (
        <p className="mb-6 text-sm text-ink-3" role="status">
          Checking how this is shared…
        </p>
      ) : (
        <div className="mb-6 flex flex-col gap-5">
          <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
            <legend className="kicker mb-2.5 !tracking-[0.12em]">Who can open it</legend>
            {ACCESS.map((option) => (
              <Choice
                key={option.value}
                name="share-access"
                option={option}
                checked={draft.access === option.value}
                disabled={busy}
                onChange={(access) => choose({ access })}
              />
            ))}
          </fieldset>

          <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
            <legend className="kicker mb-2.5 !tracking-[0.12em]">
              {draft.access === 'link' ? 'People with the link' : 'Invited people start as'}
            </legend>
            {ROLES.map((option) => (
              <Choice
                key={option.value}
                name="share-role"
                option={option}
                checked={draft.role === option.value}
                disabled={busy}
                onChange={(role) => choose({ role })}
              />
            ))}
          </fieldset>

          {active ? (
            <div className="flex flex-col gap-[7px]">
              <label htmlFor="share-link" className="kicker !tracking-[0.12em]">
                Link
              </label>
              <input
                id="share-link"
                ref={linkRef}
                readOnly
                value={link}
                onFocus={(e) => e.target.select()}
                className={`${inputStyles} min-w-0 font-mono text-[13px]`}
              />
              <p className="m-0 text-xs text-ink-3">
                {who} {can}.
              </p>
            </div>
          ) : (
            <p className="m-0 rounded-[7px] border border-dashed border-line px-3.5 py-3 text-[13px] text-ink-2">
              {settings && !settings.active
                ? 'Sharing is off. Turning it back on makes a new link — the old one stays dead.'
                : 'Not shared yet. Nothing is shared until you copy the link or invite someone.'}
            </p>
          )}

          <form onSubmit={invite} className="flex flex-col gap-[7px]">
            <label htmlFor="share-invite" className="kicker !tracking-[0.12em]">
              Invite by email
            </label>
            <div className="flex flex-wrap gap-2">
              <input
                id="share-invite"
                type="email"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="classmate@school.edu"
                className={`${inputStyles} min-w-0 flex-1 basis-[180px]`}
              />
              <select
                aria-label="Invited person can"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className={`${inputStyles} py-[10px]`}
              >
                <option value="viewer">Can study</option>
                <option value="editor">Can edit</option>
              </select>
              <Button type="submit" size="sm" variant="outline" disabled={busy || !email.trim()}>
                Invite
              </Button>
            </div>
          </form>

          {members.length > 0 && (
            <div className="flex flex-col gap-[7px]">
              <div className="kicker !tracking-[0.12em]">Shared with</div>
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {members.map((m) => (
                  <li
                    key={m.id}
                    className="flex flex-wrap items-center gap-2 rounded-[7px] border border-line px-3.5 py-2.5"
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium">{m.name ?? m.email}</span>
                      <span className="truncate text-xs text-ink-3">
                        {m.name && m.email ? `${m.email} · ` : ''}
                        {m.via === 'link' ? 'joined by link' : m.joined ? 'joined' : 'invited — not opened yet'}
                      </span>
                    </span>
                    <select
                      aria-label={`What ${m.name ?? m.email} can do`}
                      value={m.role}
                      disabled={busy}
                      onChange={(e) => run(() => setMemberRole(m.id, e.target.value))}
                      className={`${inputStyles} py-[7px] text-[13px]`}
                    >
                      <option value="viewer">Can study</option>
                      <option value="editor">Can edit</option>
                    </select>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => run(() => removeMember(m.id))}
                      aria-label={`Remove ${m.name ?? m.email}`}
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {active && (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setAdvanced((v) => !v)}
                aria-expanded={advanced}
                className="self-start border-0 bg-transparent p-0 text-xs font-medium text-ink-3 transition-colors hover:text-ink"
              >
                {advanced ? 'Hide link options' : 'Link options'}
              </button>
              {advanced && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={async () => {
                      if (await run(() => resetShareLink(settings.id))) {
                        setCopied(false)
                        say?.('New link made — the old one no longer works')
                      }
                    }}
                  >
                    Reset link
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={busy}
                    onClick={async () => {
                      if (await run(() => stopSharing(settings.id))) {
                        setCopied(false)
                        setAdvanced(false)
                        say?.(`Stopped sharing “${name}”`)
                      }
                    }}
                  >
                    Stop sharing
                  </Button>
                </div>
              )}
            </div>
          )}

          {error && (
            <p role="alert" className="m-0 text-[13px] text-err">
              {error}
            </p>
          )}
        </div>
      )}
    </Modal>
  )
}
