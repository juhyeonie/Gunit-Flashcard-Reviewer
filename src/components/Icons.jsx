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
