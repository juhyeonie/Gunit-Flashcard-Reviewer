import {
  Bell,
  ChevronDown,
  Cog,
  Eye,
  EyeOff,
  Folder,
  GalleryVerticalEnd,
  House,
  Pencil,
  Users,
} from 'lucide-react'

/*
 * Gunit's icons, from Lucide.
 *
 * Each is wrapped under the name the app has always used, so a page asks for
 * a HomeIcon or a FolderIcon and never knows where it comes from — swapping
 * one for another is a change here and nowhere else.
 *
 * They share one recipe: `currentColor`, so each inherits whatever the link or
 * button around it is doing and the active colour is set once; a 1.75 stroke,
 * a touch lighter than Lucide's default 2, which at these sizes sits with the
 * app's thin mono labels rather than shouting over them; and `aria-hidden`,
 * every one, because each sits beside its own label or inside a control that
 * carries the name — a screen reader announcing "home, Home" is worse than
 * silent.
 */
const STROKE = 1.75
const quiet = { 'aria-hidden': 'true', focusable: 'false' }

/** The pencil on every deck card and deck header. */
export function PencilIcon({ size = 13 }) {
  return <Pencil size={size} strokeWidth={2} {...quiet} />
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
 * The password reveal: the eye while it is hidden, the eye struck through
 * once it shows. No title — the button that holds it carries the accessible
 * name, and a title here would announce it twice.
 */
export function EyeIcon({ shown = false, size = 16 }) {
  const Glyph = shown ? EyeOff : Eye
  return <Glyph size={size} strokeWidth={STROKE} {...quiet} />
}

/* The navigation marks: the phone's tab bar and the Shared list. */
export function HomeIcon({ size = 20 }) {
  return <House size={size} strokeWidth={STROKE} {...quiet} />
}

/** Stacked cards, because a deck is a stack of them. */
export function DecksIcon({ size = 20 }) {
  return <GalleryVerticalEnd size={size} strokeWidth={STROKE} {...quiet} />
}

/** People: what others have shared with you. */
export function SharedIcon({ size = 20 }) {
  return <Users size={size} strokeWidth={STROKE} {...quiet} />
}

/** The notification center. */
export function BellIcon({ size = 20 }) {
  return <Bell size={size} strokeWidth={STROKE} {...quiet} />
}

/** The cog: settings, as every app draws them. */
export function SettingsIcon({ size = 20 }) {
  return <Cog size={size} strokeWidth={STROKE} {...quiet} />
}

export function FolderIcon({ size = 16 }) {
  return <Folder size={size} strokeWidth={STROKE} {...quiet} />
}

/** A disclosure chevron, pointing down when what it controls is open. */
export function ChevronIcon({ size = 14 }) {
  return <ChevronDown size={size} strokeWidth={STROKE} {...quiet} />
}
