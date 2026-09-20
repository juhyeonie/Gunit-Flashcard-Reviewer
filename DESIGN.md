---
name: Gunit
description: A flashcard reviewer that reads your notes — a quiet reading room for studying your own material.
colors:
  paper: "oklch(0.982 0.006 85)"
  frame: "oklch(0.945 0.008 85)"
  surface: "oklch(0.998 0.003 85)"
  raised: "oklch(0.968 0.006 85)"
  line: "oklch(0.888 0.009 85)"
  line-soft: "oklch(0.932 0.007 85)"
  ink: "oklch(0.245 0.012 60)"
  ink-2: "oklch(0.4 0.011 65)"
  ink-3: "oklch(0.525 0.01 70)"
  accent: "oklch(0.455 0.058 130)"
  accent-2: "oklch(0.545 0.062 130)"
  accent-soft: "oklch(0.945 0.022 130)"
  accent-line: "oklch(0.855 0.035 130)"
  clay: "oklch(0.585 0.085 52)"
  clay-soft: "oklch(0.955 0.025 60)"
  err: "oklch(0.505 0.135 28)"
  err-soft: "oklch(0.958 0.022 30)"
typography:
  display:
    fontFamily: "Newsreader, Georgia, serif"
    fontSize: "clamp(2rem, 4vw, 2.875rem)"
    fontWeight: 400
    lineHeight: 1.06
    letterSpacing: "-0.015em"
  headline:
    fontFamily: "Newsreader, Georgia, serif"
    fontSize: "2.125rem"
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Newsreader, Georgia, serif"
    fontSize: "1.4375rem"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "normal"
  body:
    fontFamily: "Archivo, Helvetica, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  label:
    fontFamily: "\"IBM Plex Mono\", monospace"
    fontSize: "0.625rem"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "0.14em"
rounded:
  sm: "5px"
  md: "8px"
  lg: "14px"
  full: "9999px"
spacing:
  hair: "4px"
  tight: "8px"
  snug: "14px"
  base: "16px"
  card: "22px"
  section: "26px"
  dialog: "28px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.md}"
    padding: "12px 18px"
    typography: "{typography.body}"
  button-primary-hover:
    backgroundColor: "{colors.ink-2}"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "12px 18px"
  button-outline-hover:
    backgroundColor: "{colors.raised}"
  button-accent:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.paper}"
    rounded: "{rounded.md}"
    padding: "12px 18px"
  button-danger:
    backgroundColor: "{colors.err}"
    textColor: "{colors.paper}"
    rounded: "{rounded.md}"
    padding: "12px 18px"
  card-deck:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "22px"
  card-deck-hover:
    backgroundColor: "{colors.raised}"
  input-field:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "11px 12px"
  chip-filter:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.full}"
    padding: "8px 14px"
  chip-filter-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  nav-pill-active:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    padding: "9px 16px"
  badge-mastered:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
    rounded: "{rounded.sm}"
    padding: "5px 8px"
    typography: "{typography.label}"
---

# Design System: Gunit

## Overview

**Creative North Star: "The Quiet Reading Room"**

Gunit looks like a library desk, not a study app. Warm paper, a serif that belongs to a book, generous margins, and one green that behaves more like a second ink than a colour. The reader brings the effort; the room stays calm and gets out of the way. Everything on screen is either their material or a plain statement about it.

The system is calm, editorial and unhurried. Hierarchy is made with type and space before it is made with colour or weight: a serif heading against mono labels and a quiet sans body, on a surface that barely lifts off the page. Density is low where the reader is deciding (library, deck page, dialogs) and lowest of all where they are concentrating (review, quiz), which drop the navigation entirely.

The deliberate anti-reference is the gamified study app. No confetti, no badges, no streak pressure, no mascot supervising every screen. Gunit has a mascot and uses it in eight places on purpose — empty states, a finished session, a page that broke — and nowhere near a card being studied. Encouragement is not the product; the schedule is.

**Key Characteristics:**
- Warm paper and ink, never white and black
- One accent, used for progress and correctness only
- Serif headings, sans body, mono labels — three families doing three jobs
- Flat at rest; a shadow is a response, not a decoration
- Hairline borders (1px) as the main separator
- Every screen readable at 375px, with the navigation moving to the thumb

## Colors

A warm, paper-toned neutral field with exactly one accent: a deep olive that is closer to ink than to a brand colour.

### Primary
- **Library Olive** (`{colors.accent}`): the one accent. It marks progress and correctness and nothing else — the progress meter fill, "12 due", the mastered badge, a correct quiz answer, the accent-toned sign-in button, and focus outlines. Its darker step (`{colors.accent-2}`) is the hover, and `{colors.accent-soft}` / `{colors.accent-line}` are its fill and border tints for badges and chips.

### Tertiary
- **Clay** (`{colors.clay}`): a warm terracotta used as a per-deck hue and for the occasional non-alarming highlight. It is generated per deck rather than chosen, so it never competes with Library Olive for meaning.
- **Signal Red** (`{colors.err}`): destruction and failure only — delete buttons, "Again" in review, error text. `{colors.err-soft}` is its hover wash.

### Neutral
- **Paper** (`{colors.paper}`): the page the app is written on.
- **Frame** (`{colors.frame}`): the desk the paper sits on — the body background, one step darker than the page.
- **Surface** (`{colors.surface}`): cards and dialogs, one step lighter than paper so a card reads as a sheet laid on it.
- **Raised** (`{colors.raised}`): hover fills and inset groups.
- **Line** (`{colors.line}`) and **Line Soft** (`{colors.line-soft}`): the hairline borders and the fainter rules between sections.
- **Ink** (`{colors.ink}`), **Ink 2** (`{colors.ink-2}`), **Ink 3** (`{colors.ink-3}`): headings and body; secondary prose; labels, counts and hints.

### Named Rules

**The Second Ink Rule.** Library Olive is not decoration. If a green element does not mean *progress*, *correct* or *due*, it is the wrong colour — use ink.

**The Warm Field Rule.** Nothing in the neutral field is pure. Every paper tone carries hue 85 and every ink carries hue 60–70; `#fff` and `#000` appear nowhere.

**The Measured Grey Rule.** `{colors.ink-3}` is the floor for text. It sits at 0.525 lightness because that is the lightest value clearing 4.5:1 on the darkest surface it is ever set against, and `src/data/contrast.test.js` fails the build if it drifts. Nothing lighter is allowed to carry words.

## Typography

**Display Font:** Newsreader (with Georgia, serif)
**Body Font:** Archivo (with Helvetica, sans-serif)
**Label/Mono Font:** IBM Plex Mono (monospace)

**Character:** A book face for anything named, a plain grotesque for anything read at length, and a mono for anything counted. The serif is set at normal weight and negative tracking, so headings feel typeset rather than bolded; the mono appears only in small uppercase, where it reads as a printed tag on a page.

### Hierarchy
- **Display** (400, `clamp(2rem, 4vw, 2.875rem)`, 1.06, -0.015em): the page title on the library, dashboard and settings.
- **Headline** (400, 34px, 1.1, -0.02em): the one statement on a full-page state — "Nothing is due right now", "This page stopped working", the sign-in heading.
- **Title** (400, 23px, 1.2): deck names on cards, folder names, dialog titles (26px in dialogs).
- **Body** (400, 15px, 1.55): all running prose. Explanatory paragraphs are held to ~380–440px, roughly 55–65 characters.
- **Label** (500, 10–11px, 0.12–0.14em, uppercase): the mono tag above a heading, counts ("12 cards", "8 due"), badges, and stat captions.

### Named Rules

**The Three Jobs Rule.** Serif names things, sans explains them, mono counts them. A number that can be counted is set in mono; a sentence never is.

**The Unbolded Heading Rule.** Serif headings stay at 400. Emphasis comes from size, space and the negative tracking, never from weight — `font-bold` on a serif heading is a defect.

## Layout

A single centred column, widened per page rather than globally: 1080px in the library, 760px in the quiz, 680px in settings, 660px on the summary, 520px on full-page states, 440–460px on the landing page and in dialogs. Page padding steps with the viewport (16px → 28px → 48px) and vertical rhythm runs 22px → 34px → 44px from phone to desktop.

Deck grids are `repeat(auto-fill, minmax(310px, 1fr))` with a 16px gutter, collapsing to one column below 640px. Sections within a page are separated by 26–38px and divided by a hairline rule; groups inside a section sit 14–16px apart. More space goes above a heading than below it.

The breakpoint that matters is Tailwind's `sm` (640px). Below it the top navigation is replaced by a bottom tab bar with a 56px minimum row and `env(safe-area-inset-bottom)` padding, headers wrap, and long labels are allowed to hide in favour of their icons — the folder header drops its counts to a second line rather than truncating the name.

### Named Rules

**The Thumb Rule.** Below 640px, primary navigation belongs at the bottom of the screen and every target is at least 44px.

**The No Sideways Scroll Rule.** Nothing scrolls horizontally at 375px. Long unbroken words are already handled globally by `overflow-wrap: break-word` on `body`; new layouts must not reintroduce a fixed width wider than the screen.

## Elevation & Depth

Flat at rest. Depth is carried first by the tonal steps — frame under paper under surface — and a shadow appears only as a response to state: a card lifts under the cursor, a dialog sits above the page, a menu panel floats over what it covers. A surface that is simply sitting there has at most a 1px hairline.

### Shadow Vocabulary
- **Hairline** (`0 1px 1px oklch(0.245 0.012 60 / 0.04)`): the barely-there seat under a library deck card at rest.
- **Lift** (`0 10px 30px -14px oklch(0.245 0.012 60 / 0.18), 0 1px 2px oklch(0.245 0.012 60 / 0.05)`): hover on a deck card, and anything that should read as picked up.
- **Float** (`0 30px 70px -30px oklch(0.245 0.012 60 / 0.32)`): dialogs and dropdown panels, which are above the page rather than on it.

Every shadow is tinted with ink rather than black, and carries both an offset and a soft blur. In the dark theme the same three roles are re-tuned to pure black at higher alpha.

### Named Rules

**The Flat-At-Rest Rule.** A shadow must answer something — hover, focus, or a layer genuinely above the page. Ambient shadow on a static surface is decoration and is not used.

## Shapes

Rectangles with small, consistent radii: 5px on badges and inset controls, 8px on buttons, fields and icon buttons, 14px on cards and dialogs, and full rounding on the two pill families (nav pills and filter chips). Nothing is a circle except avatars and the small state dots.

Separation is a 1px border in `{colors.line}`, or `{colors.line-soft}` where the rule is structural rather than containing. Borders do the work that shadows do elsewhere: a deck card is a bordered sheet, not a floating slab. The one repeating flourish is a 3px accent strip along the top edge of a deck card, carrying that deck's own hue.

### Named Rules

**The Hairline Rule.** 1px borders separate things. A border thicker than 1px is reserved for a deck's accent strip and the review screen's rating row; thick coloured borders on rounded cards are not part of this system.

## Components

### Buttons
- **Shape:** gently rounded (8px), never pill-shaped except filter chips and nav pills.
- **Primary:** ink on paper text (`{components.button-primary}`), 12px × 18px, 14px semibold. This is the ordinary confirm.
- **Accent:** Library Olive, used on exactly one screen — sign-in — where there is no deck on the page to reserve the green for.
- **Outline / Ghost / Quiet:** transparent with a hairline border and ink text; hover fills with `{colors.raised}` and darkens the border to `{colors.ink-3}`.
- **Danger:** Signal Red fill for destructive confirms; destructive items in menus are red text, not red fills.
- **Hover / Focus:** colour transitions at 150ms; `active:scale-[0.975]` gives the press. Focus is a 2px accent outline at 2px offset, never a removed outline.

### Cards / Containers
- **Corner style:** 14px.
- **Background:** `{colors.surface}`, on a `{colors.frame}` page.
- **Shadow strategy:** hairline at rest, lift on hover (see Elevation).
- **Border:** 1px `{colors.line}`, darkening to `{colors.ink-3}` on hover.
- **Internal padding:** 22px in the library, 20px on the dashboard variant.
- **Distinctive behaviour:** the whole card is clickable, but only the title is a real link — its `::after` is stretched across the card so there is one unambiguous target for keyboard and screen-reader users, with the edit button lifted above that layer.

### Inputs / Fields
- **Style:** `{colors.paper}` fill inside a 1px `{colors.line}` border at 8px radius, 15px text, 11px × 12px padding.
- **Label:** the mono uppercase label sits above the field, with a Library Olive asterisk when required and a lowercase "optional" tag when not.
- **Focus:** the border becomes `{colors.accent}`; no glow, no shadow.
- **Error:** the message is Signal Red text beneath the field, and the field is marked `aria-invalid`.

### Navigation
- **Desktop:** a sticky 70px glass bar — `var(--glass)`, the paper colour at 82% alpha, with a 14px backdrop blur and 150% saturation — holding a centred pill group. The active pill is a `{colors.surface}` fill with a hairline border; the inactive ones are `{colors.ink-2}` text on the raised track.
- **Mobile:** the same glass, moved to a bottom tab bar: icon over a mono uppercase label, the active tab in `{colors.accent}` with a 2px accent bar across the top of the tab.
- **Review and quiz screens drop the navigation entirely.**

### Dialogs
A `{colors.surface}` sheet at 14px radius with the Float shadow, on a blurred ink wash (`oklch(0.245 0.012 60 / .38)`, 3px blur). Structure is fixed: mono kicker, serif title (26px, as an `h2` that names the dialog), body sentence, content, then Cancel and a confirm button on the right, with any destructive action pushed to the far left so it cannot be hit while reaching for Save.

### The Kicker
The mono uppercase label above a page or dialog title — "LIBRARY", "NEW FOLDER", "ALL CAUGHT UP". It is this system's one persistent typographic signature and the reason the mono family exists. It is a label, never a sentence, and never longer than three words.

### The Mascot
A red panda, cut from one reference sheet (`docs/mascot/reference.png`), drawn at one scale across five poses, always `aria-hidden`, and placed only where a page has a moment to spare: empty states, nothing due, a finished session or quiz, a missing deck, a crashed page, and the landing page. Its ground shadow is drawn in CSS (`--mascot-ground`) rather than baked into the image, so it takes the theme.

## Do's and Don'ts

### Do:
- **Do** use Library Olive only for progress, correctness and due counts — the Second Ink Rule.
- **Do** set every named thing in Newsreader at weight 400, and let size and -0.02em tracking carry the emphasis.
- **Do** put counts, badges and kickers in IBM Plex Mono, uppercase, 10–11px, tracking 0.12–0.14em.
- **Do** separate with 1px hairlines in `{colors.line}` before reaching for a shadow.
- **Do** keep text at or above `{colors.ink-3}`; the contrast test reads `src/index.css` directly and fails the build on drift.
- **Do** give every dialog a real `h2` title and a focus trap that returns focus where it came from.
- **Do** design the 375px view at the same time as the desktop one; navigation moves to the bottom there.
- **Do** state plainly what a destructive action will and will not remove, in the dialog body.

### Don't:
- **Don't** add a second accent hue. A new colour means a new meaning; there is one.
- **Don't** put ambient shadow on a resting surface, or a zero-offset coloured halo anywhere.
- **Don't** bold a serif heading, or set body copy in the mono face.
- **Don't** use pure white or pure black — every neutral is warm-tinted in light, cool-tinted in dark.
- **Don't** celebrate ordinary actions: no confetti, no badges, no streak pressure, no mascot beside a card being studied.
- **Don't** let the mascot appear more than once on a screen, or carry the word "Gunit" — the wordmark is the brand mark.
- **Don't** introduce a thick coloured border on a rounded card; the one exception is the deck card's 3px top strip.
- **Don't** animate without a reason: motion is a 200ms ease-out entrance (`rise-in`) or a 150ms colour transition, and it degrades under `prefers-reduced-motion`.
