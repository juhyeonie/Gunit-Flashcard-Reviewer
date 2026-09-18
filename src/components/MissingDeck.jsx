import { Link } from 'react-router-dom'
import Button from './Button.jsx'
import Mascot from './Mascot.jsx'

/**
 * What a deck's pages show when the deck is not there: a link to one that was
 * deleted, a bookmark from another browser, an id typed by hand.
 *
 * Four pages had this, written out four times the same way. One component now,
 * so the words and the way out cannot drift apart between them.
 */
export default function MissingDeck() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center py-20 text-center">
      <Mascot pose="thinking" size={96} className="mb-5" />
      <div className="font-serif text-2xl">That deck no longer exists.</div>
      <Button as={Link} to="/decks" className="mt-5">
        All decks
      </Button>
    </div>
  )
}
