import { useLayoutEffect, useRef, useState } from 'react'

/**
 * Whether the top bar is too narrow for everything in it, so the streak label
 * should step out.
 *
 * The bar has always fitted in English at the default size. Longer words —
 * Filipino, or large text — can make the tabs, the logo and the chip wider
 * than a tablet, and the page then scrolled sideways. The label is the part
 * least missed: the picture beside it stays, and the streak is on the
 * dashboard in full.
 *
 * Measured rather than guessed at with breakpoints, because the room needed
 * depends on the language and the text size, and a breakpoint would hide the
 * label for everyone at a width where English fits perfectly well.
 *
 * The bar is squeezed when its tab pill cannot show all of itself (it is
 * allowed to shrink, and scrolls when it does) or the bar overflows. Once the
 * label is out, it comes back only when there is room for it again, so the
 * bar never flickers between the two.
 *
 * `bar` holds the logo, the tabs and the right-hand side, in that order; the
 * label is marked `data-streak`.
 */
export default function useTightBar(bar) {
  const [tight, setTight] = useState(false)
  const labelWidth = useRef(0)

  useLayoutEffect(() => {
    const root = bar.current
    if (!root || typeof ResizeObserver === 'undefined') return undefined
    const [logo, pill, side] = root.children
    if (!logo || !pill || !side) return undefined

    const check = () => {
      const label = side.querySelector('[data-streak]')
      if (label) labelWidth.current = label.offsetWidth
      const squeezed = pill.scrollWidth > pill.clientWidth + 1 || root.scrollWidth > root.clientWidth + 1
      const gap = parseFloat(getComputedStyle(side).columnGap) || 0
      const used = [...side.children].reduce((n, child) => n + child.offsetWidth, 0) + gap * (side.children.length - 1)
      // Room to spare on either side: the label, back, takes it from the
      // logo's side as readily as from its own, as the bar always has.
      const spare = side.clientWidth - used + (logo.clientWidth - (logo.firstElementChild?.offsetWidth ?? 0))
      // Less the label's own gap inside the chip, beside the picture.
      const room = spare - 9
      setTight((was) => (was ? squeezed || room < labelWidth.current : squeezed))
    }

    const observer = new ResizeObserver(check)
    observer.observe(root)
    observer.observe(pill)
    observer.observe(side)
    check()
    return () => observer.disconnect()
  }, [bar])

  return tight
}
