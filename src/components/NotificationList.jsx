import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import Button from './Button.jsx'
import Mascot from './Mascot.jsx'
import { useNotifications } from '../data/notificationsContext.js'
import { reopenWhatsNew } from '../data/whatsNew.js'
import { formatRelative } from '../data/activity.js'
import { describe } from '../data/describeNotification.js'
import useT from '../i18n/useT.js'

function Item({ item, onDone }) {
  const { markRead, clear, decline, applyUpdate } = useNotifications()
  const navigate = useNavigate()
  const { t } = useT()
  const [problem, setProblem] = useState(null)
  const { title, message, actions } = describe(item, t)
  const unread = !item.read

  const act = async (action) => {
    if (action.type === 'decline') {
      const error = await decline(item)
      if (error) setProblem(error)
      return
    }
    markRead(item.id)
    if (action.type === 'reload') {
      applyUpdate?.()
      return
    }
    if (action.type === 'whats-new') reopenWhatsNew()
    else navigate(action.to)
    onDone?.()
  }

  // A reload that is no longer waiting has nothing left to do.
  const shown = actions.filter((a) => a.type !== 'reload' || applyUpdate)

  return (
    <li
      className={`flex gap-3 border-b border-line-soft px-4 py-3.5 last:border-b-0 ${unread ? 'bg-accent-soft/40' : ''}`}
    >
      <span
        aria-hidden="true"
        className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${unread ? 'bg-accent' : 'bg-transparent'}`}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-3">
          <p className={`m-0 fs-13 leading-snug ${unread ? 'font-semibold text-ink' : 'font-medium text-ink-2'}`}>
            {unread && <span className="sr-only">{t('notifications.unreadPrefix')} </span>}
            {title}
          </p>
          <span className="flex shrink-0 items-center gap-2.5">
            {unread && (
              <button
                type="button"
                onClick={() => markRead(item.id)}
                className="cursor-pointer border-0 bg-transparent p-0 fs-11 font-medium whitespace-nowrap text-ink-3 transition-colors hover:text-ink"
              >
                {t('notifications.markRead')}
              </button>
            )}
            <button
              type="button"
              onClick={() => clear(item.id)}
              aria-label={t('notifications.dismissItem', { title })}
              title={t('notifications.dismiss')}
              className="-m-1 grid cursor-pointer place-items-center rounded-md border-0 bg-transparent p-1 text-ink-3 transition-colors hover:bg-raised hover:text-ink"
            >
              <X size={14} strokeWidth={1.75} aria-hidden="true" focusable="false" />
            </button>
          </span>
        </div>
        <p className={`m-0 fs-13 leading-[1.45] text-pretty ${unread ? 'text-ink-2' : 'text-ink-3'}`}>{message}</p>
        {Number.isFinite(item.createdAt) && item.createdAt > 0 && (
          <span className="font-mono fs-10.5 leading-none tracking-[0.04em] text-ink-3">
            {formatRelative(item.createdAt)}
          </span>
        )}
        {shown.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-2">
            {shown.map((action, i) => (
              <Button
                key={action.type}
                size="sm"
                variant={i === 0 ? 'outline' : 'ghost'}
                className="!px-3 !py-2 !fs-12"
                onClick={() => act(action)}
              >
                {action.label}
              </Button>
            ))}
          </div>
        )}
        {problem && (
          <p role="alert" className="m-0 fs-12 text-err">
            {problem}
          </p>
        )}
      </div>
    </li>
  )
}

/**
 * The notification center itself: a heading with Mark all as read and Clear
 * all, then the list, or a note that there is nothing. Used by the bell's panel on a wide
 * screen and by its own page on a phone.
 */
export default function NotificationList({ onDone, headingLevel = 2 }) {
  const { items, unread, offline, markAllRead, clearAll, signedIn } = useNotifications()
  const { t } = useT()
  const Heading = `h${headingLevel}`

  return (
    <section aria-labelledby="notifications-heading" className="flex flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <Heading id="notifications-heading" className="m-0 fs-14 font-semibold text-ink">
          {t('notifications.title')}
          {unread > 0 && (
            <span className="ml-2 font-mono fs-11 font-medium text-accent">
              {t('notifications.newCount', { count: unread })}
            </span>
          )}
        </Heading>
        <span className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={markAllRead}
            disabled={!unread}
            className="cursor-pointer border-0 bg-transparent p-0 fs-12 font-medium text-ink-2 transition-colors hover:text-ink disabled:cursor-default disabled:opacity-50"
          >
            {t('notifications.markAllRead')}
          </button>
          <button
            type="button"
            onClick={clearAll}
            disabled={!items.length}
            className="cursor-pointer border-0 bg-transparent p-0 fs-12 font-medium text-ink-2 transition-colors hover:text-ink disabled:cursor-default disabled:opacity-50"
          >
            {t('notifications.clearAll')}
          </button>
        </span>
      </div>

      {offline && signedIn && (
        <p role="status" className="m-0 border-b border-line-soft px-4 py-2.5 fs-12 text-ink-3">
          {t('notifications.offline')}
        </p>
      )}

      {items.length ? (
        <ul className="m-0 list-none p-0">
          {items.map((item) => (
            <Item key={item.id} item={item} onDone={onDone} />
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
          <Mascot pose="thinking" size={72} className="mb-1" />
          <p className="m-0 font-serif fs-20 leading-tight">{t('notifications.emptyTitle')}</p>
          <p className="m-0 max-w-[260px] fs-13 text-ink-3 text-pretty">
            {t('notifications.emptyBody')}
          </p>
        </div>
      )}
    </section>
  )
}
