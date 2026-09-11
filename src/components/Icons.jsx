/** The pencil glyph the prototype inlines on every deck card and deck header. */
export function PencilIcon({ size = 13 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11.2 2.3l2.5 2.5-8 8H3.2v-2.5l8-8z" />
      <path d="M9.6 3.9l2.5 2.5" />
    </svg>
  )
}

export function EditButton({ className = '', size = 26, ...props }) {
  return (
    <button
      type="button"
      title="Edit deck"
      aria-label="Edit deck"
      style={{ width: size, height: size }}
      className={`grid shrink-0 cursor-pointer place-items-center rounded-md border border-transparent bg-transparent p-0 text-ink-3 transition-colors hover:border-line hover:bg-raised hover:text-ink ${className}`}
      {...props}
    >
      <PencilIcon />
    </button>
  )
}

/**
 * The password reveal, as one icon that changes rather than two that swap.
 *
 * `currentColor` throughout so it inherits whatever the button beside it is
 * doing, and no title: the button that holds it carries the accessible name,
 * and a title here would announce twice.
 */
export function EyeIcon({ shown = false, size = 16 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M1.5 10S4.6 4.5 10 4.5 18.5 10 18.5 10 15.4 15.5 10 15.5 1.5 10 1.5 10Z" />
      <circle cx="10" cy="10" r="2.75" />
      {shown && <path d="M3 17 17 3" />}
    </svg>
  )
}

/*
 * The three navigation marks, drawn to the same recipe as the eye above:
 * currentColor, 1.5 stroke, 20x20, rounded joins. They inherit whatever the
 * tab beside them is doing, so the active colour is set once on the link.
 *
 * `aria-hidden`, every one of them. Each sits beside its own label in the tab
 * bar, and a screen reader announcing "home, Home" is worse than silent.
 */
const mark = { width: 20, height: 20, viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true', focusable: 'false' }

export function HomeIcon() {
  return (
    <svg {...mark}>
      <path d="M3 8.2 10 3l7 5.2V16a1 1 0 0 1-1 1h-3.5v-4.5h-5V17H4a1 1 0 0 1-1-1Z" />
    </svg>
  )
}

/** Stacked cards, because a deck is a stack of them. */
export function DecksIcon() {
  return (
    <svg {...mark}>
      <rect x="3" y="6.5" width="14" height="10.5" rx="2" />
      <path d="M5.5 4h9" />
    </svg>
  )
}

/** Sliders rather than a gear: these are preferences, not machinery. */
export function SettingsIcon() {
  return (
    <svg {...mark}>
      <path d="M3 6h7M14 6h3M3 14h3M10 14h7" />
      <circle cx="12" cy="6" r="2" />
      <circle cx="8" cy="14" r="2" />
    </svg>
  )
}
