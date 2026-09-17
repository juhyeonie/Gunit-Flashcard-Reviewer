/**
 * The app's one loading indicator: a thin ring with a single arc, turning.
 *
 * Drawn in `currentColor`, so it takes the colour of whatever it sits in — ink
 * on a page, paper inside a dark button, grey in a file row — and never needs a
 * variant for any of them.
 *
 * Always decorative. Every place this appears already says what is happening
 * in words ("Signing in…", "Reading…"), and those words are what a screen
 * reader should hear. A spinner announced as well would only be noise.
 *
 * A CSS animation rather than anything scripted, because the moments it covers
 * are exactly the moments the main thread is busy — parsing a PDF, running OCR,
 * loading the account client. A compositor animation keeps turning through
 * that; a requestAnimationFrame one would stall in the one place it is needed.
 */
export default function Spinner({ size = 14, className = '' }) {
  return (
    <span
      aria-hidden="true"
      className={`spinner inline-block shrink-0 animate-spin rounded-full border-[1.5px] border-current border-t-transparent opacity-80 ${className}`}
      style={{ width: size, height: size }}
    />
  )
}

/**
 * A wait the size of a page, for the moments a route has nothing to show yet.
 *
 * Held back for 400ms before it appears. Most of these waits are a session
 * restored from local storage and finish in tens of milliseconds, and a
 * spinner that flashes for one frame reads as a glitch rather than as loading.
 * So the quick case stays the blank beat it always was, and only a genuinely
 * slow one — a phone on a poor connection fetching the account client — gets
 * told that something is happening.
 *
 * The status text is in the document from the first frame, so a screen reader
 * hears it at once; only the drawing waits.
 */
export function PageLoading({ label = 'Loading' }) {
  return (
    <div role="status" className="grid min-h-[40vh] place-items-center">
      {/* The delay lives on a wrapper: an element has one `animation`, and
          the spinner's is already the turning. */}
      <span className="reveal-late inline-flex text-ink-3">
        <Spinner size={22} />
      </span>
      <span className="sr-only">{label}</span>
    </div>
  )
}
