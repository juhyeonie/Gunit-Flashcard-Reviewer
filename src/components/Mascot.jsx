import poses from '../assets/mascot/poses.json'
import studying from '../assets/mascot/studying.png'
import thinking from '../assets/mascot/thinking.png'
import correct from '../assets/mascot/correct.png'
import resting from '../assets/mascot/resting.png'
import celebrate from '../assets/mascot/celebrate.png'

/**
 * Gunit's red panda.
 *
 * The mascot, not the logo: the wordmark stays the brand, and this appears
 * only where a page has a moment to spare — an empty state, a finished
 * session, somewhere a reader has ended up by mistake. Never while they are
 * studying, and never on something they do fifty times a session.
 *
 * Every pose is cut from one reference sheet (docs/mascot/reference.png) by
 * scripts/build-mascot.ps1, at one scale, and none is redrawn. That is what
 * keeps the fur, the charcoal and the proportions identical from pose to pose.
 *
 *   studying   reading a green book     — somewhere to start
 *   thinking   paw to chin, a question  — something is not where you expected
 *   correct    both paws up             — a good result
 *   resting    curled up asleep         — nothing is due; come back later
 *   celebrate  arms up, sparkles        — a session finished
 *
 * Always decorative. Wherever it appears, the words beside it say what is
 * going on, and those are what a screen reader should hear.
 */

const SOURCES = { studying, thinking, correct, resting, celebrate }

/*
 * `size` is a scale rather than a width. The poses were cut at one scale and
 * differ in shape — asleep is long and low, celebrating is wide with its
 * sparkles — so giving each the same width would shrink the panda in some and
 * grow it in others. Every pose is drawn at `size / BASE` of its cut size
 * instead, and the panda is the same size on every page. A sitting pose comes
 * out roughly `size` pixels tall.
 */
const BASE = 300

/**
 * @param narrowSize  the size on a phone, where it differs. The landing page
 *   needs it: at full size the panda pushed "Sign in" under the tab bar on a
 *   375px screen, and the one thing that page must never do is hide the way in.
 */
export default function Mascot({ pose, size = 112, narrowSize, className = '' }) {
  const src = SOURCES[pose]
  const meta = poses[pose]
  if (!src || !meta) return null

  const width = Math.round((meta.width * size) / BASE)
  const height = Math.round((meta.height * size) / BASE)
  const narrowWidth = Math.round((meta.width * (narrowSize ?? size)) / BASE)
  const { ground } = meta

  return (
    <span
      aria-hidden="true"
      data-mascot={pose}
      className={`mascot relative inline-block shrink-0 select-none ${className}`}
      // Width from a variable so a media query can swap it; height follows
      // from the aspect ratio, so the two can never disagree.
      style={{
        '--mascot-width': `${width}px`,
        '--mascot-width-narrow': `${narrowWidth}px`,
        aspectRatio: `${meta.width} / ${meta.height}`,
      }}
    >
      {/*
        The ground shadow, where the reference drew it. Taken out of the
        image and drawn here so it can take the theme's colour: baked in, it
        was a pale cream puddle under the panda on the dark theme.
      */}
      <span
        className="mascot-ground absolute"
        style={{
          left: `${ground.left * 100}%`,
          top: `${ground.top * 100}%`,
          width: `${ground.width * 100}%`,
          height: `${ground.height * 100}%`,
        }}
      />
      <img
        src={src}
        alt=""
        width={width}
        height={height}
        decoding="async"
        draggable={false}
        className="relative block h-full w-full"
      />
    </span>
  )
}
