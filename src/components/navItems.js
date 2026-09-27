/**
 * The places the app goes, shared by the top bar and the bottom one. Their
 * names are in the dictionaries: `nav.<icon>` for the top bar, and
 * `nav.short.<icon>` for the phone's tab bar, where each is read out only.
 *
 * In its own file so `Navbar.jsx` exports only components: a module that
 * exports anything else loses fast refresh, and the navigation is on screen
 * for every edit anyone makes.
 */
export const NAV = [
  { to: '/', icon: 'home', end: true },
  { to: '/decks', icon: 'decks' },
  // Only where there are accounts: a local-only copy has nobody to share with.
  { to: '/shared', icon: 'shared', accounts: true },
  // Phones only: a wide screen has the bell in the top bar instead.
  { to: '/notifications', icon: 'alerts', accounts: true, phoneOnly: true },
  { to: '/settings', icon: 'settings' },
]
