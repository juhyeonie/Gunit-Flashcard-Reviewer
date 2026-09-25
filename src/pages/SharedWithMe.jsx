import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../components/Button.jsx'
import Mascot from '../components/Mascot.jsx'
import Spinner from '../components/Spinner.jsx'
import { FolderIcon, DecksIcon } from '../components/Icons.jsx'
import { useAuth } from '../data/useAuth.js'
import { listSharedWithMe, sharePath } from '../data/sharing.js'
import { formatRelative } from '../data/activity.js'
import useDocumentTitle from '../hooks/useDocumentTitle.js'

const ROLE_LABEL = { editor: 'Can edit', viewer: 'Can study' }

const stamp = (iso) => {
  const ms = iso ? Date.parse(iso) : NaN
  return Number.isNaN(ms) ? null : ms
}

/**
 * Decks and folders other people have shared with this reader: ones they were
 * invited to, and links they opened and kept.
 *
 * Read from the account each visit rather than kept here, because the answer
 * is the owners' to change — a share turned off or a role changed should be
 * what this page says the next time it is opened.
 */
export default function SharedWithMe() {
  useDocumentTitle('Shared with me')
  const { user, available, status } = useAuth()
  const [state, setState] = useState({ phase: 'loading', items: [], error: null })

  useEffect(() => {
    if (status === 'loading' || !user) return undefined
    let cancelled = false
    listSharedWithMe().then(({ data, error }) => {
      if (cancelled) return
      setState(error ? { phase: 'error', items: [], error } : { phase: 'ready', items: data ?? [], error: null })
    })
    return () => {
      cancelled = true
    }
  }, [user, status])

  const header = (
    <header className="flex flex-col gap-3 border-b border-line pb-[26px]">
      <div className="kicker">Shared</div>
      <h1 className="m-0 font-serif text-[32px] leading-[1.05] tracking-[-0.02em] sm:text-[42px]">Shared with me</h1>
      <p className="m-0 max-w-[560px] text-[15px] text-ink-2 text-pretty">
        Decks and folders classmates shared with you. Study the shared version to keep up with their
        changes, or add a copy to make it your own. Either way, your progress is yours alone.
      </p>
    </header>
  )

  if (!available || (status !== 'loading' && !user)) {
    return (
      <div className="rise-in mx-auto flex max-w-[1000px] flex-col gap-[30px]">
        {header}
        <div className="flex flex-col items-center gap-3.5 rounded-[14px] border border-dashed border-line px-5 py-[60px] text-center">
          <Mascot pose="thinking" size={92} className="mb-1" />
          <div className="font-serif text-[24px] leading-[1.2]">
            {available ? 'Sign in to see what’s shared with you' : 'This copy of Gunit has no accounts'}
          </div>
          <p className="m-0 max-w-[380px] text-sm text-ink-3 text-pretty">
            {available
              ? 'A link someone sent you opens without signing in. Signing in keeps it here, and lets people invite you by email.'
              : 'Everything stays in this browser, so there is nobody to share with. Open shared links on the main Gunit site.'}
          </p>
          {available && (
            <Button as={Link} to="/sign-in?next=%2Fshared" size="sm">
              Sign in
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="rise-in mx-auto flex max-w-[1000px] flex-col gap-[30px]">
      {header}

      {state.phase === 'loading' ? (
        <div className="flex items-center gap-2.5 text-sm text-ink-3" role="status">
          <Spinner /> Looking for decks shared with you…
        </div>
      ) : state.phase === 'error' ? (
        <p role="alert" className="m-0 text-sm text-err">
          {state.error}
        </p>
      ) : state.items.length === 0 ? (
        <div className="flex flex-col items-center gap-3.5 rounded-[14px] border border-dashed border-line px-5 py-[60px] text-center">
          <Mascot pose="thinking" size={92} className="mb-1" />
          <div className="font-serif text-[24px] leading-[1.2]">Nothing shared with you yet</div>
          <p className="m-0 max-w-[380px] text-sm text-ink-3 text-pretty">
            When someone invites you, or you open a shared link and save it, it shows up here.
          </p>
        </div>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {state.items.map((item) => {
            const path = sharePath(item.kind, item.token)
            const Icon = item.kind === 'folder' ? FolderIcon : DecksIcon
            return (
              <li
                key={item.share_id}
                className="relative flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border border-line bg-surface px-[22px] py-5 shadow-sh1 transition-[border-color,box-shadow] duration-200 hover:border-ink-3 hover:shadow-sh2"
              >
                <span className="text-ink-3">
                  <Icon />
                </span>
                <div className="flex min-w-0 flex-1 basis-[220px] flex-col gap-1.5">
                  <h2 className="m-0 font-serif text-[21px] leading-[1.2] font-normal text-pretty">
                    <Link to={path} className="text-inherit no-underline hover:underline">
                      {item.name}
                    </Link>
                  </h2>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] leading-none font-medium tracking-[0.04em] text-ink-3">
                    <span>{item.kind === 'folder' ? 'Folder' : 'Deck'}</span>
                    <span>shared by {item.owner_name}</span>
                    <span>
                      {item.kind === 'folder' ? `${item.decks} ${item.decks === 1 ? 'deck' : 'decks'} · ` : ''}
                      {item.cards} {item.cards === 1 ? 'card' : 'cards'}
                    </span>
                    <span>updated {formatRelative(stamp(item.updated_at)).toLowerCase()}</span>
                  </div>
                </div>
                <span
                  className={`rounded-[5px] border px-2 py-[5px] font-mono text-[10px] leading-none font-medium tracking-[0.06em] whitespace-nowrap uppercase ${
                    item.role === 'editor' ? 'border-accent-line bg-accent-soft text-accent' : 'border-line text-ink-3'
                  }`}
                >
                  {ROLE_LABEL[item.role] ?? ROLE_LABEL.viewer}
                </span>
                <Button as={Link} to={path} size="sm" variant="outline">
                  {item.kind === 'folder' ? 'Open' : 'Study'}
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
