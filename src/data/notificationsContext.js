import { createContext, useContext } from 'react'

/** Filled by NotificationsProvider. */
export const NotificationsContext = createContext(null)

const NONE = {
  items: [],
  unread: 0,
  offline: false,
  signedIn: false,
  refresh: () => {},
  markRead: () => {},
  markAllRead: () => {},
  clear: () => {},
  clearAll: () => {},
  decline: async () => null,
  applyUpdate: null,
}

/**
 * The notification center. Safe with no provider above it — the nav is
 * rendered on its own in plenty of places — where it is simply empty.
 */
export const useNotifications = () => useContext(NotificationsContext) ?? NONE
