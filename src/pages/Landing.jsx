import { Link } from 'react-router-dom'
import Button from '../components/Button.jsx'
import useDocumentTitle from '../hooks/useDocumentTitle.js'
import CreatorCredit from '../components/CreatorCredit.jsx'

/**
 * What somebody sees at `/` before they have signed in.
 *
 * Deliberately not a product page. There is no feature grid, no screenshot in
 * a laptop, nothing that scrolls — the whole thing is a wordmark, three lines
 * saying what this is, and the two ways in. Anyone reading it has either been
 * sent a link or typed the address, and in both cases they want to get past
 * it, so it is built to be got past.
 *
 * The third way out matters as much as the two buttons. An account is optional
 * in Gunit and always has been: decks live in this browser, every page reads
 * them synchronously, and studying works with no network and no sign-up. A
 * landing page that only offered sign-in would turn the front door into a wall
 * for the one kind of visitor this app was built around.
 */

const LINES = [
  'Build decks by hand, or from a reading you already have.',
  'Study them on a spaced-repetition schedule that grows with what you know.',
  'An account carries them between machines. It is optional.',
]

export default function Landing() {
  // No title of its own: the hook appends " · Gunit", and this page is Gunit.
  // Passing the name would put it there twice.
  useDocumentTitle(null)

  return (
    <div className="rise-in flex w-full justify-center px-4 py-14 sm:py-24">
      <div className="flex w-full max-w-[440px] flex-col items-center gap-9">
        <div className="flex flex-col items-center gap-2">
          <img src="/assets/gunit-logo.png" alt="Gunit" className="block h-11 w-auto" />
          <p className="kicker m-0 !tracking-[0.14em] text-ink-3">Your study space</p>
        </div>

        <header className="text-center">
          <h1 className="m-0 mb-3 font-serif text-[32px] leading-[1.1] tracking-[-0.02em] text-pretty sm:text-[38px]">
            A flashcard reviewer that reads your notes
          </h1>
          <p className="m-0 text-[15px] leading-[1.6] text-ink-2 text-pretty">
            Drop in a PDF, a slide deck or a page of notes and Gunit splits it into cards you can
            actually revise.
          </p>
        </header>

        <ul className="m-0 flex w-full list-none flex-col gap-3 border-y border-line-soft px-0 py-6">
          {LINES.map((line) => (
            <li key={line} className="flex gap-3 text-[14px] leading-[1.55] text-ink-2 text-pretty">
              {/* A rule rather than a tick: nothing here is a feature being sold. */}
              <span aria-hidden="true" className="mt-[10px] h-px w-3.5 shrink-0 bg-accent-line" />
              {line}
            </li>
          ))}
        </ul>

        <div className="flex w-full flex-col gap-2.5">
          <Button as={Link} to="/sign-in" variant="accent" className="w-full">
            Sign in
          </Button>
          {/*
            The sign-up flow is a mode of the sign-in page rather than a route
            of its own — there is nothing to bookmark about the sign-up variant
            — so this asks for that mode rather than for a different address.
          */}
          <Button as={Link} to="/sign-in" state={{ mode: 'up' }} variant="outline" className="w-full">
            Create an account
          </Button>
        </div>

        <Link
          to="/decks"
          className="text-[13px] text-ink-3 underline-offset-2 hover:text-ink hover:underline"
        >
          Or start studying without one
        </Link>

        {/* Last on the page, under the way in rather than beside it. */}
        <CreatorCredit className="border-t border-line-soft pt-6 w-full" />
      </div>
    </div>
  )
}
