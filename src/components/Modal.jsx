import { useEffect } from 'react'
import Button from './Button.jsx'

/**
 * The prototype's single modal shell: mono kicker, serif title, body copy,
 * arbitrary content, then Cancel + a confirm button whose tone varies
 * (ink for ordinary actions, err for deletes).
 */
export default function Modal({
  open,
  onClose,
  kicker,
  title,
  body,
  children,
  confirmLabel,
  onConfirm,
  confirmVariant = 'primary',
  confirmDisabled = false,
  maxWidth = 460,
}) {
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [open, onClose])

  if (!open) return null

  return (
    /*
     * Click-to-dismiss on the backdrop is a pointer convenience only: the same
     * action is available to the keyboard through Escape (handled above) and
     * the always-visible Close button, so the backdrop needs no key handler of
     * its own and should stay out of the tab order.
     */
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      // Only a click on the backdrop itself closes; clicks inside the dialog
      // bubble up to here but are ignored, so the dialog needs no handler.
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto p-6 backdrop-blur-[3px]"
      style={{ background: 'oklch(0.245 0.012 60 / .38)' }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ maxWidth }}
        className="rise-in relative w-full rounded-[14px] border border-line bg-surface p-7 shadow-sh3"
      >
        <button
          type="button"
          onClick={onClose}
          title="Close"
          aria-label="Close"
          className="absolute top-5 right-5 grid h-[30px] w-[30px] cursor-pointer place-items-center rounded-lg border border-line bg-transparent text-[16px] text-ink-3 transition-colors hover:border-ink-3 hover:bg-raised hover:text-ink"
        >
          ×
        </button>

        <div className="kicker mb-3">{kicker}</div>
        <div className="mb-2.5 pr-10 font-serif text-[26px] leading-[1.15] text-pretty">{title}</div>
        {body && <p className="mb-[22px] text-sm text-ink-2 text-pretty">{body}</p>}

        {children}

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant={confirmVariant}
            onClick={onConfirm}
            disabled={confirmDisabled}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
