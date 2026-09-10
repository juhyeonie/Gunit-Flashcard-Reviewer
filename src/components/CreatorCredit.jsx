/**
 * Who made this, said once per screen that has room for it.
 *
 * One component rather than the same three lines in three files, so the
 * wording and the weight cannot drift apart between the landing page and the
 * authentication screens — which sit next to each other in a reader's session
 * and would show the difference immediately.
 *
 * Deliberately quiet, but not at the cost of being readable. `text-ink-3`,
 * the app's usual grey for asides, measures 3.99:1 against paper — under the
 * 4.5:1 that WCAG AA asks of text this size. So the line is `text-ink-2`
 * (8.76:1) and does its receding through size and position instead: twelve
 * pixels, centred, under everything else on the page rather than beside it.
 *
 * The name is lifted to full `text-ink` and medium weight so it reads as a
 * name rather than as part of the sentence — a difference in weight, not in
 * colour, so it survives a monochrome display and anyone who cannot separate
 * the greys.
 *
 * A `<p>`, because it is a sentence.
 */
export default function CreatorCredit({ className = '' }) {
  return (
    <p className={`m-0 text-center text-[12px] leading-[1.5] text-ink-2 ${className}`}>
      Designed &amp; developed by{' '}
      <span className="font-medium text-ink">Justine Pelgone</span>
    </p>
  )
}
