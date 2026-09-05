/**
 * The app's only feedback channel for most actions — deck and card changes,
 * the interval a rating just scheduled, and the guards that explain why
 * something did not happen.
 *
 * The live region is always mounted, even with nothing to say. A region created
 * at the same moment its text appears is unreliably announced; one that already
 * exists announces the change every time.
 */
export default function Toast({ message }) {
  return (
    <div role="status" aria-live="polite" aria-atomic="true">
      {message && (
        <div className="toast-in fixed bottom-7 left-1/2 z-60 flex -translate-x-1/2 items-center gap-3 rounded-[7px] bg-ink px-[18px] py-[13px] text-paper shadow-sh3">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          <span className="text-[13px] font-medium leading-none">{message}</span>
        </div>
      )}
    </div>
  )
}
