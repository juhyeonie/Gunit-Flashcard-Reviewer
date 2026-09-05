import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Button from './Button.jsx'

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),' +
  'select:not([disabled]),[tabindex]:not([tabindex="-1"])'

const focusableIn = (root) =>
  [...root.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null)

/**
 * The prototype's single modal shell: mono kicker, serif title, body copy,
 * arbitrary content, then Cancel + a confirm button whose tone varies
 * (ink for ordinary actions, err for deletes).
 *
 * Rendered through a portal so the rest of the app can be marked `inert` while
 * it is open. `aria-modal="true"` promises assistive technology that everything
 * behind the dialog is unavailable; without inert that promise is false — the
 * page behind stays focusable and readable.
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
  secondaryAction,
  maxWidth = 460,
}) {
  const dialogRef = useRef(null)
  const returnFocusTo = useRef(null)

  /**
   * Everything that has to be undone in a fixed order lives in one effect:
   * focus can only be restored after `inert` is lifted, and separate effects
   * give no guarantee about which cleanup runs first.
   */
  useEffect(() => {
    if (!open) return undefined

    returnFocusTo.current = document.activeElement

    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKey)

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const root = document.getElementById('root')
    if (root) root.inert = true

    // Focus moves in only after the trigger has been captured above, which is
    // why no field here uses autoFocus: that fires during commit, before this
    // effect, and would make the "previous" element the dialog's own input.
    const dialog = dialogRef.current
    const firstField = dialog?.querySelector('input,textarea,select')
    ;(firstField ?? dialog)?.focus()

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
      // Lift inert first: focusing anything under an inert root is refused,
      // which would silently drop the reader onto <body>.
      if (root) root.inert = false
      const target = returnFocusTo.current
      if (target?.isConnected) target.focus()
    }
  }, [open, onClose])

  /** Keeps Tab and Shift+Tab cycling inside the dialog. */
  const onKeyDown = (e) => {
    if (e.key !== 'Tab') return
    const items = focusableIn(e.currentTarget)
    if (!items.length) {
      e.preventDefault()
      return
    }
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement

    if (e.shiftKey && (active === first || active === e.currentTarget)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  if (!open) return null

  return createPortal(
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
      {/*
        The Tab handler is the focus trap itself — a keyboard listener on the
        dialog container is how the pattern is built, not an accessibility
        slip. The dialog is reachable only programmatically (tabIndex -1).
      */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        style={{ maxWidth }}
        className="rise-in relative w-full rounded-[14px] border border-line bg-surface p-7 shadow-sh3 outline-none"
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

        <div className="flex items-center justify-end gap-2">
          {/* Destructive actions sit apart from the confirm button so they
              cannot be hit by someone reaching for "Save". */}
          {secondaryAction && <div className="mr-auto">{secondaryAction}</div>}
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" variant={confirmVariant} onClick={onConfirm} disabled={confirmDisabled}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
