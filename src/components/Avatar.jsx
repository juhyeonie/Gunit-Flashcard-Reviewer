import { PersonIcon } from './Icons.jsx'

/** Empty when there is no name, which is the ordinary state of a new reader. */
const initialsOf = (name = '') =>
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

/**
 * A round profile picture, or the fallback in its place: the reader's
 * initials on the accent tint, as the top bar has always drawn them, or a
 * plain figure when there is no name either.
 *
 * `alt` names the picture for a screen reader. Left out, the whole thing is
 * decorative — where the name is already written beside it.
 */
export default function Avatar({ src, name, size = 28, alt, className = '' }) {
  const shape = `shrink-0 rounded-full border border-accent-line ${className}`
  if (src) {
    return (
      <img
        src={src}
        alt={alt ?? ''}
        width={size}
        height={size}
        className={`${shape} bg-accent-soft object-cover`}
        style={{ width: size, height: size }}
      />
    )
  }
  const initials = initialsOf(name)
  return (
    <span
      role={alt ? 'img' : undefined}
      aria-label={alt}
      aria-hidden={alt ? undefined : true}
      className={`${shape} grid place-items-center bg-accent-soft leading-none font-semibold text-accent`}
      // Initials a little under half the disc, as the 28px one always had them.
      style={{ width: size, height: size, fontSize: Math.round(size * 0.39) }}
    >
      {initials || <PersonIcon size={Math.round(size * 0.55)} />}
    </span>
  )
}
