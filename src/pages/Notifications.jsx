import { useEffect } from 'react'
import NotificationList from '../components/NotificationList.jsx'
import { useNotifications } from '../data/notificationsContext.js'
import useDocumentTitle from '../hooks/useDocumentTitle.js'

/**
 * The notification center as a page, for the phone's Alerts tab — a phone
 * has no top bar to hang a panel from. The same list the bell opens.
 */
export default function Notifications() {
  useDocumentTitle('Notifications')
  const { refresh } = useNotifications()
  useEffect(() => {
    const ask = async () => {
      await refresh()
    }
    ask()
  }, [refresh])

  return (
    <div className="rise-in mx-auto flex max-w-[640px] flex-col gap-5">
      <div className="kicker">Inbox</div>
      <div className="overflow-hidden rounded-[14px] border border-line bg-surface shadow-sh1">
        <NotificationList headingLevel={1} />
      </div>
    </div>
  )
}
