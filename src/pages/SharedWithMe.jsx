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
import useT from '../i18n/useT.js'


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
  const { t } = useT()
  useDocumentTitle(t('sharedWithMe.title'))
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
      <div className="kicker">{t('nav.shared')}</div>
      <h1 className="m-0 font-serif fs-32 leading-[1.05] tracking-[-0.02em] sm:fs-42">{t('sharedWithMe.title')}</h1>
      <p className="m-0 max-w-[560px] fs-15 text-ink-2 text-pretty">
        {t('sharedWithMe.lede')}
      </p>
    </header>
  )

  if (!available || (status !== 'loading' && !user)) {
    return (
      <div className="rise-in mx-auto flex max-w-[1000px] flex-col gap-[30px]">
        {header}
        <div className="flex flex-col items-center gap-3.5 rounded-[14px] border border-dashed border-line px-5 py-[60px] text-center">
          <Mascot pose="thinking" size={92} className="mb-1" />
          <div className="font-serif fs-24 leading-[1.2]">
            {available ? t('sharedWithMe.signInTitle') : t('resetPassword.noAccounts')}
          </div>
          <p className="m-0 max-w-[380px] text-sm text-ink-3 text-pretty">
            {available
              ? t('sharedWithMe.signInBody')
              : t('sharedWithMe.localBody')}
          </p>
          {available && (
            <Button as={Link} to="/sign-in?next=%2Fshared" size="sm">
              {t('common.signIn')}
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
          <Spinner /> {t('sharedWithMe.looking')}
        </div>
      ) : state.phase === 'error' ? (
        <p role="alert" className="m-0 text-sm text-err">
          {state.error}
        </p>
      ) : state.items.length === 0 ? (
        <div className="flex flex-col items-center gap-3.5 rounded-[14px] border border-dashed border-line px-5 py-[60px] text-center">
          <Mascot pose="thinking" size={92} className="mb-1" />
          <div className="font-serif fs-24 leading-[1.2]">{t('sharedWithMe.emptyTitle')}</div>
          <p className="m-0 max-w-[380px] text-sm text-ink-3 text-pretty">
            {t('sharedWithMe.emptyBody')}
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
                  <h2 className="m-0 font-serif fs-21 leading-[1.2] font-normal text-pretty">
                    <Link to={path} className="text-inherit no-underline hover:underline">
                      {item.name}
                    </Link>
                  </h2>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono fs-11 leading-none font-medium tracking-[0.04em] text-ink-3">
                    <span>{t(`sharedWithMe.kind.${item.kind === 'folder' ? 'folder' : 'deck'}`)}</span>
                    <span>{t('sharedWithMe.by', { name: item.owner_name })}</span>
                    <span>
                      {item.kind === 'folder' ? `${t('folders.deckCount', { count: item.decks })} · ` : ''}
                      {t('deck.cardCount', { count: item.cards })}
                    </span>
                    <span>{t('sharedWithMe.updated', { when: formatRelative(stamp(item.updated_at)).toLowerCase() })}</span>
                  </div>
                </div>
                <span
                  className={`rounded-[5px] border px-2 py-[5px] font-mono fs-10 leading-none font-medium tracking-[0.06em] whitespace-nowrap uppercase ${
                    item.role === 'editor' ? 'border-accent-line bg-accent-soft text-accent' : 'border-line text-ink-3'
                  }`}
                >
                  {t(`share.role.${item.role === 'editor' ? 'editor' : 'viewer'}.label`)}
                </span>
                <Button as={Link} to={path} size="sm" variant="outline">
                  {item.kind === 'folder' ? t('sharedWithMe.open') : t('sharedWithMe.study')}
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
