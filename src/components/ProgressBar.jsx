/**
 * Thin rule-style meter. The prototype draws it at 3px on deck cards, 4px in
 * the bento panels and 5px on the review summary, and the fill takes the deck's
 * own accent hue — so height, track and fill colour are all props.
 *
 * `label` names the meter for assistive technology. Without one a screen reader
 * announces "progress bar, 58%" with nothing to say what is at 58%, and the
 * dashboard alone shows eight of them.
 */
export default function ProgressBar({
  value = 0,
  height = 3,
  accent = 'var(--color-accent)',
  track = 'var(--color-raised)',
  label,
  className = '',
}) {
  const pct = Math.min(100, Math.max(0, value))
  return (
    <div
      className={`w-full overflow-hidden rounded-sm ${className}`}
      style={{ height, background: track }}
      role="progressbar"
      aria-label={label}
      aria-valuenow={pct}
      aria-valuetext={`${pct}%`}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-sm transition-[width] duration-300"
        style={{ width: `${pct}%`, background: accent }}
      />
    </div>
  )
}
