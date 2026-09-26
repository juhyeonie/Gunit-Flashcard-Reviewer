/**
 * What changed in each version of Gunit, as readers are told on their first
 * launch of it.
 *
 * The only place release notes live. To announce a release: bump the version
 * in package.json as usual, and add an entry here with the same version. The
 * What's New dialog reads this and nothing else, so nothing in it needs
 * touching.
 *
 * Each entry has any of four lists — `new`, `improved`, `fixed`, `removed` —
 * and a list left out, or empty, is simply not shown. An item is either a
 * sentence, or `{ title, detail }` for a short heading with a line under it.
 * Keep them short and in the reader's words: what they can now do, not what
 * the code does.
 *
 * Newest first. A version with no entry here is a release with nothing to
 * announce, and nobody is shown anything for it.
 */
export const RELEASE_NOTES = [
  {
    version: '1.2.1',
    fixed: [
      {
        title: 'Your quiz answers are safe',
        detail: 'Leaving a quiz part-way — the nav bar, a link, or Back — now asks first, so a stray tap no longer throws your answers away.',
      },
    ],
  },
  {
    version: '1.2.0',
    new: [
      {
        title: 'Notifications',
        detail: 'The bell — Alerts on a phone — tells you when a deck is shared with you, when your access changes, and when cards are due.',
      },
      {
        title: 'See what you’ve shared',
        detail: 'Decks and folders you share are marked “Shared” in My decks.',
      },
    ],
    improved: [
      {
        title: 'Changes from your other devices',
        detail: 'Come back to Gunit and what changed elsewhere is already here, including cards a co-editor added.',
      },
    ],
  },
  {
    version: '1.1.0',
    new: [
      {
        title: 'Share decks and folders',
        detail: 'Send a link, or invite classmates by email, to study your reviewer or edit it with you.',
      },
      {
        title: 'Shared with me',
        detail: 'A new tab for everything others have shared with you.',
      },
      {
        title: 'Study shared, or keep a copy',
        detail: 'Follow the shared version as it changes, or add your own copy to My Gunit.',
      },
    ],
    improved: [
      {
        title: 'Your progress stays yours',
        detail: 'On a shared deck everyone studies on their own schedule. Nobody sees anyone else’s.',
      },
      'Signing in takes you back to the page you were on.',
    ],
    fixed: [
      'A deck deleted on one device no longer comes back from another that was open.',
      'Syncing no longer stops after studying a deck deleted on another device.',
    ],
  },
  {
    version: '1.0.2',
    fixed: [
      'Libraries with more than 1,000 cards or study sessions now load in full.',
    ],
  },
  {
    version: '1.0.1',
    fixed: [
      'Decks, cards and folders deleted offline stay deleted once you reconnect.',
      'Reopening Gunit no longer brings back what another device deleted.',
    ],
  },
]
