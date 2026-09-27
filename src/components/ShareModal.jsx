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
import useT from '../i18n/useT.js'

/** Worded under share.access and share.role in the dictionaries. */
const ACCESS = [{ value: 'link' }, { value: 'invited' }]
const ROLES = [{ value: 'viewer' }, { value: 'editor' }]

const inputStyles =
  'rounded-lg border border-line bg-paper px-3 py-[11px] fs-15 text-ink outline-none ' +
  'placeholder:text-ink-3/70 transition-colors focus:border-accent'

/** A radio drawn the way Move deck draws its folders. */
function Choice({ name, group, option, checked, onChange, disabled }) {
  const { t } = useT()
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
        {t(`share.${group}.${option.value}.label`)}
        <span className="text-xs font-normal text-ink-3">{t(`share.${group}.${option.value}.hint`)}</span>
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
  const { t } = useT()
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
      say?.(t('share.copied'))
    } catch {
      // No clipboard permission: the link is on screen, selected, to copy by hand.
      linkRef.current?.select()
      setError(t('share.copyYourself'))
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
      say?.(t('share.invited', { address }))
    }
  }

  if (!available || !user) {
    return (
      <Modal
        open
        onClose={onClose}
        kicker={t(`share.kicker.${kind}`)}
        title={t('share.title', { name })}
        body={available ? t('share.needsAccount') : t('share.localOnly')}
        confirmLabel={available ? t('common.signIn') : t('common.done')}
        cancelLabel={available ? t('common.notNow') : t('common.close')}
        maxWidth={440}
        onConfirm={() => {
          onClose()
          if (available) navigate(`/sign-in?next=${encodeURIComponent(window.location.pathname)}`)
        }}
      />
    )
  }

  const members = settings?.members ?? []
  const summary = t(`share.summary.${draft.access}.${draft.role}`)

  return (
    <Modal
      open
      onClose={onClose}
      kicker={t(`share.kicker.${kind}`)}
      title={t('share.title', { name })}
      body={t(`share.body.${kind}`)}
      confirmLabel={copied ? t('share.copiedButton') : active ? t('share.copyLink') : t('share.shareAndCopy')}
      onConfirm={copyLink}
      confirmDisabled={loading || busy}
      cancelLabel={t('common.done')}
      maxWidth={500}
    >
      {loading ? (
        <p className="mb-6 text-sm text-ink-3" role="status">
          {t('share.checking')}
        </p>
      ) : (
        <div className="mb-6 flex flex-col gap-5">
          <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
            <legend className="kicker mb-2.5 !tracking-[0.12em]">{t('share.whoCanOpen')}</legend>
            {ACCESS.map((option) => (
              <Choice
                key={option.value}
                name="share-access"
                group="access"
                option={option}
                checked={draft.access === option.value}
                disabled={busy}
                onChange={(access) => choose({ access })}
              />
            ))}
          </fieldset>

          <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
            <legend className="kicker mb-2.5 !tracking-[0.12em]">
              {draft.access === 'link' ? t('share.linkPeople') : t('share.invitedStart')}
            </legend>
            {ROLES.map((option) => (
              <Choice
                key={option.value}
                name="share-role"
                group="role"
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
                {t('share.link')}
              </label>
              <input
                id="share-link"
                ref={linkRef}
                readOnly
                value={link}
                onFocus={(e) => e.target.select()}
                className={`${inputStyles} min-w-0 font-mono fs-13`}
              />
              <p className="m-0 text-xs text-ink-3">
                {summary}
              </p>
            </div>
          ) : (
            <p className="m-0 rounded-[7px] border border-dashed border-line px-3.5 py-3 fs-13 text-ink-2">
              {settings && !settings.active
                ? t('share.off')
                : t('share.notYet')}
            </p>
          )}

          <form onSubmit={invite} className="flex flex-col gap-[7px]">
            <label htmlFor="share-invite" className="kicker !tracking-[0.12em]">
              {t('share.inviteByEmail')}
            </label>
            <div className="flex flex-wrap gap-2">
              <input
                id="share-invite"
                type="email"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('share.emailPlaceholder')}
                className={`${inputStyles} min-w-0 flex-1 basis-[180px]`}
              />
              <select
                aria-label={t('share.invitedCan')}
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className={`${inputStyles} py-[10px]`}
              >
                <option value="viewer">{t('share.role.viewer.label')}</option>
                <option value="editor">{t('share.role.editor.label')}</option>
              </select>
              <Button type="submit" size="sm" variant="outline" disabled={busy || !email.trim()}>
                {t('share.invite')}
              </Button>
            </div>
          </form>

          {members.length > 0 && (
            <div className="flex flex-col gap-[7px]">
              <div className="kicker !tracking-[0.12em]">{t('share.sharedWith')}</div>
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
                        {m.via === 'link' ? t('share.joinedByLink') : m.joined ? t('share.joined') : t('share.pending')}
                      </span>
                    </span>
                    <select
                      aria-label={t('share.memberCan', { name: m.name ?? m.email })}
                      value={m.role}
                      disabled={busy}
                      onChange={(e) => run(() => setMemberRole(m.id, e.target.value))}
                      className={`${inputStyles} py-[7px] fs-13`}
                    >
                      <option value="viewer">{t('share.role.viewer.label')}</option>
                      <option value="editor">{t('share.role.editor.label')}</option>
                    </select>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => run(() => removeMember(m.id))}
                      aria-label={t('share.removeMember', { name: m.name ?? m.email })}
                    >
                      {t('share.remove')}
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
                {advanced ? t('share.hideOptions') : t('share.options')}
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
                        say?.(t('share.linkReset'))
                      }
                    }}
                  >
                    {t('share.resetLink')}
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={busy}
                    onClick={async () => {
                      if (await run(() => stopSharing(settings.id))) {
                        setCopied(false)
                        setAdvanced(false)
                        say?.(t('share.stopped', { name }))
                      }
                    }}
                  >
                    {t('share.stop')}
                  </Button>
                </div>
              )}
            </div>
          )}

          {error && (
            <p role="alert" className="m-0 fs-13 text-err">
              {error}
            </p>
          )}
        </div>
      )}
    </Modal>
  )
}
