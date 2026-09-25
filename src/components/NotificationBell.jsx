import { useCallback, useState } from 'react'
import Menu from './Menu.jsx'
import NotificationList from './NotificationList.jsx'
import { BellIcon } from './Icons.jsx'
import { useNotifications } from '../data/notificationsContext.js'

/**
 * The bell in the top bar, beside the streak: a dot when something is unread,
 * and the notification center in a panel under it. Opening it asks the account
 * for anything new; everything already known is on screen meanwhile.
 *
 * Phones have no top bar — they reach the same list from the Alerts tab.
 */
export default function NotificationBell() {
  const { unread, refresh } = useNotifications()
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          if (!open) refresh()
          setOpen((v) => !v)
        }}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`relative grid h-9 w-9 cursor-pointer place-items-center rounded-full border bg-surface text-ink-2 transition-colors hover:border-ink-3 hover:text-ink ${
          open ? 'border-ink-3 text-ink' : 'border-line'
        }`}
      >
        <BellIcon size={18} />
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute top-[7px] right-[8px] h-2 w-2 rounded-full border-[1.5px] border-surface bg-accent"
          />
        )}
      </button>
      <Menu open={open} onClose={close} align="right" width={360} className="w-[360px] !gap-0 overflow-hidden !p-0">
        <div role="dialog" aria-label="Notifications" className="max-h-[min(70vh,560px)] overflow-y-auto">
          <NotificationList onDone={close} />
        </div>
      </Menu>
    </div>
  )
}
