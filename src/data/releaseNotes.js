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
 * An item can carry its own words for another language, under that
 * language's code: `{ title, detail, fil: { title, detail } }`. A reader in a
 * language an item has no words for sees the English.
 *
 * Newest first. A version with no entry here is a release with nothing to
 * announce, and nobody is shown anything for it.
 */
export const RELEASE_NOTES = [
  {
    version: '1.4.0',
    new: [
      {
        title: 'Clear your notifications',
        detail: 'Dismiss one with ×, or empty the list with Clear all.',
        fil: {
          title: 'Linisin ang mga notification mo',
          detail: 'Alisin ang isa gamit ang ×, o ubusin ang listahan gamit ang Alisin lahat.',
        },
      },
    ],
  },
  {
    version: '1.3.1',
    improved: [
      {
        title: 'Fresh icons',
        detail: 'Cleaner, more familiar icons throughout — and a cog for Settings.',
        fil: {
          title: 'Mga bagong icon',
          detail: 'Mas malinis at mas pamilyar na mga icon sa buong app — at isang cog para sa Mga setting.',
        },
      },
      {
        title: 'A tidier tab bar on your phone',
        detail: 'Just the icons now, with more room around them.',
        fil: {
          title: 'Mas maayos na tab bar sa phone mo',
          detail: 'Mga icon na lang, na may mas maluwag na espasyo.',
        },
      },
    ],
  },
  {
    version: '1.3.0',
    improved: [
      {
        title: 'A floating tab bar on your phone',
        detail: 'It steps aside while you scroll down to read, and comes back as soon as you scroll up.',
        fil: {
          title: 'Lumulutang na tab bar sa phone mo',
          detail: 'Tumatabi ito habang nag-i-scroll ka pababa para magbasa, at bumabalik agad kapag nag-scroll ka pataas.',
        },
      },
    ],
  },
  {
    version: '1.2.1',
    fixed: [
      {
        title: 'Your quiz answers are safe',
        detail: 'Leaving a quiz part-way — the nav bar, a link, or Back — now asks first, so a stray tap no longer throws your answers away.',
        fil: {
          title: 'Ligtas ang mga sagot mo sa quiz',
          detail: 'Magtatanong muna bago ka umalis sa quiz sa kalagitnaan — sa nav bar, sa link, o sa Back — kaya hindi na mawawala ang mga sagot mo dahil sa maling pindot.',
        },
      },
    ],
  },
  {
    version: '1.2.0',
    new: [
      {
        title: 'Notifications',
        detail: 'The bell — Alerts on a phone — tells you when a deck is shared with you, when your access changes, and when cards are due.',
        fil: {
          title: 'Mga notification',
          detail: 'Sasabihin sa iyo ng kampana — Mga alerto sa phone — kapag may deck na ibinahagi sa iyo, kapag nagbago ang access mo, at kapag may card na dapat i-review.',
        },
      },
      {
        title: 'See what you’ve shared',
        detail: 'Decks and folders you share are marked “Shared” in My decks.',
        fil: {
          title: 'Tingnan ang mga ibinahagi mo',
          detail: 'May markang “Naka-share” sa Mga deck ko ang mga deck at folder na ibinabahagi mo.',
        },
      },
    ],
    improved: [
      {
        title: 'Changes from your other devices',
        detail: 'Come back to Gunit and what changed elsewhere is already here, including cards a co-editor added.',
        fil: {
          title: 'Mga pagbabago mula sa iba mong device',
          detail: 'Pagbalik mo sa Gunit, nandito na ang mga nagbago sa ibang lugar, kasama ang mga card na idinagdag ng kasama mong nag-e-edit.',
        },
      },
    ],
  },
  {
    version: '1.1.0',
    new: [
      {
        title: 'Share decks and folders',
        detail: 'Send a link, or invite classmates by email, to study your reviewer or edit it with you.',
        fil: {
          title: 'Mag-share ng mga deck at folder',
          detail: 'Magpadala ng link, o mag-imbita ng mga kaklase sa email, para pag-aralan ang reviewer mo o i-edit ito kasama mo.',
        },
      },
      {
        title: 'Shared with me',
        detail: 'A new tab for everything others have shared with you.',
        fil: {
          title: 'Ibinahagi sa akin',
          detail: 'Bagong tab para sa lahat ng ibinahagi sa iyo ng iba.',
        },
      },
      {
        title: 'Study shared, or keep a copy',
        detail: 'Follow the shared version as it changes, or add your own copy to My Gunit.',
        fil: {
          title: 'Pag-aralan ang naka-share, o magtabi ng kopya',
          detail: 'Sundan ang naka-share na bersyon habang nagbabago ito, o magdagdag ng sarili mong kopya sa Gunit ko.',
        },
      },
    ],
    improved: [
      {
        title: 'Your progress stays yours',
        detail: 'On a shared deck everyone studies on their own schedule. Nobody sees anyone else’s.',
        fil: {
          title: 'Sa iyo lang ang progreso mo',
          detail: 'Sa isang naka-share na deck, may kanya-kanyang iskedyul ang bawat isa. Walang nakakakita ng sa iba.',
        },
      },
      {
        title: 'Signing in takes you back to the page you were on.',
        fil: { title: 'Ibabalik ka ng pag-sign in sa page na pinanggalingan mo.' },
      },
    ],
    fixed: [
      {
        title: 'A deck deleted on one device no longer comes back from another that was open.',
        fil: { title: 'Hindi na bumabalik mula sa ibang nakabukas na device ang deck na binura sa isang device.' },
      },
      {
        title: 'Syncing no longer stops after studying a deck deleted on another device.',
        fil: { title: 'Hindi na humihinto ang pag-sync pagkatapos pag-aralan ang deck na binura sa ibang device.' },
      },
    ],
  },
  {
    version: '1.0.2',
    fixed: [
      {
        title: 'Libraries with more than 1,000 cards or study sessions now load in full.',
        fil: { title: 'Buo nang naglo-load ang mga library na may higit 1,000 card o study session.' },
      },
    ],
  },
  {
    version: '1.0.1',
    fixed: [
      {
        title: 'Decks, cards and folders deleted offline stay deleted once you reconnect.',
        fil: { title: 'Nananatiling bura ang mga deck, card at folder na binura nang offline kapag naka-connect ka na ulit.' },
      },
      {
        title: 'Reopening Gunit no longer brings back what another device deleted.',
        fil: { title: 'Hindi na ibinabalik ng muling pagbukas ng Gunit ang binura ng ibang device.' },
      },
    ],
  },
]
