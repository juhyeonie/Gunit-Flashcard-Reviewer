import { useEffect, useRef } from 'react'

const ALIGN = {
  right: 'right-0 origin-top-right',
  left: 'left-0 origin-top-left',
  // The deck-header actions sit right-aligned on wide screens but wrap to the
  // left edge on narrow ones, where right-0 would push the panel off-screen.
  responsive: 'left-0 origin-top-left sm:right-0 sm:left-auto sm:origin-top-right',
}

/** Dropdown panel used by "Study this deck", "Add cards" and the card kebab. */
export default function Menu({ open, onClose, align = 'right', width = 230, children, className = '' }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => {
      if (!ref.current?.contains(e.target)) onClose?.()
    }
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      ref={ref}
      style={{ minWidth: width }}
      className={`rise-in absolute top-[calc(100%+6px)] z-10 flex max-w-[calc(100vw-2rem)] flex-col gap-0.5 rounded-lg border border-line bg-surface p-[5px] shadow-sh3 ${ALIGN[align]} ${className}`}
    >
      {children}
    </div>
  )
}

export function MenuItem({ title, hint, danger = false, ...props }) {
  return (
    <button
      type="button"
      className={`flex cursor-pointer flex-col gap-[3px] rounded-[5px] border-0 bg-transparent p-[11px] text-left transition-colors ${
        danger ? 'hover:bg-err-soft' : 'hover:bg-raised'
      }`}
      {...props}
    >
      <span className={`text-[13px] font-semibold leading-tight ${danger ? 'text-err' : 'text-ink'}`}>
        {title}
      </span>
      {hint && <span className="text-xs leading-[1.4] text-ink-3">{hint}</span>}
    </button>
  )
}
