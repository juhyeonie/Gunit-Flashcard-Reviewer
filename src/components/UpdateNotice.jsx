import usePwa from '../pwa/usePwa.js'

/**
 * A new version of Gunit is ready.
 *
 * Said once, quietly, and left to the reader: the new version is already
 * downloaded and waits for a reload they choose, so a review is never pulled
 * out from under them. Dismissed, it simply takes over the next time every
 * Gunit window is closed.
 *
 * Sits where the toast sits and wears the same clothes, lifted above the tab
 * bar on a phone so it covers nothing the thumb needs.
 */
export default function UpdateNotice() {
  const { update } = usePwa()
  if (!update) return null

  return (
    <div
      role="status"
      className="toast-in fixed bottom-[calc(env(safe-area-inset-bottom)+80px)] left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-[7px] bg-ink py-[9px] pr-[9px] pl-[18px] text-paper shadow-sh3 sm:bottom-7"
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
      <span className="text-[13px] leading-snug font-medium">A new version of Gunit is ready.</span>
      <button
        type="button"
        onClick={update}
        className="shrink-0 cursor-pointer rounded-[5px] border border-paper/30 bg-transparent px-3 py-1.5 text-[13px] leading-none font-semibold text-paper transition-colors hover:bg-paper/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Reload
      </button>
    </div>
  )
}
