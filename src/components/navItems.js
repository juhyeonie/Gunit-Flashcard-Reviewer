/**
 * The three places the app goes, shared by the top bar and the bottom one.
 *
 * In its own file so `Navbar.jsx` exports only components: a module that
 * exports anything else loses fast refresh, and the navigation is on screen
 * for every edit anyone makes.
 */
export const NAV = [
  { to: '/', label: 'Home', short: 'Home', icon: 'home', end: true },
  { to: '/decks', label: 'My decks', short: 'Decks', icon: 'decks' },
  // Only where there are accounts: a local-only copy has nobody to share with.
  { to: '/shared', label: 'Shared', short: 'Shared', icon: 'shared', accounts: true },
  // Phones only: a wide screen has the bell in the top bar instead.
  { to: '/notifications', label: 'Notifications', short: 'Alerts', icon: 'alerts', accounts: true, phoneOnly: true },
  { to: '/settings', label: 'Settings', short: 'Settings', icon: 'settings' },
]
