import { useCallback, useEffect, useRef, useState } from 'react'
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { AppProvider, useApp } from './data/AppContext.jsx'
import { BottomNav, TopNav } from './components/Navbar.jsx'
import Toast from './components/Toast.jsx'
import DeckModal from './components/DeckModal.jsx'
import ImportFileModal from './components/ImportFileModal.jsx'
import CardModal from './components/CardModal.jsx'
import ConfirmModal from './components/ConfirmModal.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Decks from './pages/Decks.jsx'
import DeckDetail from './pages/DeckDetail.jsx'
import Review from './pages/Review.jsx'
import Quiz from './pages/Quiz.jsx'
import Summary from './pages/Summary.jsx'
import Settings from './pages/Settings.jsx'

const CLOSED = { kind: null }

function Shell() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { addDeck, updateDeck, removeDeck, addCards, updateCard, removeCard, say, toast } =
    useApp()

  // One value rather than a flag per modal, so the Create -> Import handoff is
  // a single swap and two modals can never be open at once.
  const [modal, setModal] = useState(CLOSED)
  const close = useCallback(() => setModal(CLOSED), [])

  const isReview = /\/review$/.test(pathname)

  // Read after the route renders, so it reflects the title that route just set.
  const [announcement, setAnnouncement] = useState('')
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return undefined
    }
    const id = setTimeout(() => setAnnouncement(document.title), 100)
    return () => clearTimeout(id)
  }, [pathname])

  const openNewDeck = () => setModal({ kind: 'deck-new' })
  const openEditDeck = (deck) => setModal({ kind: 'deck-edit', deck })
  const openNewCard = (deck) => setModal({ kind: 'card-new', deck })
  const openEditCard = (deck, index, card) => setModal({ kind: 'card-edit', deck, index, card })
  const openDeleteCard = (deck, index) => setModal({ kind: 'card-delete', deck, index })
  const openDeleteDeck = (deck) => setModal({ kind: 'deck-delete', deck })

  /** Import against an existing deck, or standing alone as a new-deck flow. */
  const openImport = (deck, draft) =>
    setModal({ kind: 'import', deck, draft, pendingDeck: !deck })

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      {!isReview && <TopNav />}

      {/*
        Screen readers announce a page change from the document title on a full
        page load; a single-page app never triggers that. This says it instead,
        after the route has had a moment to set its own title.
      */}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <main className="flex-1 px-4 pt-[22px] pb-[30px] sm:px-7 sm:pt-[34px] sm:pb-12 lg:px-12 lg:pt-11 lg:pb-[72px]">
        {/*
          Keyed by path so a crashed page clears itself when the reader
          navigates elsewhere, and scoped inside <main> so the nav stays usable
          rather than going down with the page.
        */}
        <ErrorBoundary key={pathname}>
          <Routes>
          <Route
            path="/"
            element={
              <Dashboard
                onNewDeck={openNewDeck}
                onEditDeck={openEditDeck}
                onImport={() => openImport(null)}
              />
            }
          />
          <Route path="/decks" element={<Decks onNewDeck={openNewDeck} onEditDeck={openEditDeck} />} />
          <Route
            path="/decks/:id"
            element={
              <DeckDetail
                onEditDeck={openEditDeck}
                onNewCard={openNewCard}
                onEditCard={openEditCard}
                onDeleteCard={openDeleteCard}
                onImport={(deck) => openImport(deck)}
              />
            }
          />
          <Route path="/decks/:id/review" element={<Review />} />
          <Route path="/decks/:id/quiz" element={<Quiz />} />
          <Route path="/decks/:id/summary" element={<Summary />} />
          <Route path="/settings" element={<Settings />} />
          </Routes>
        </ErrorBoundary>
      </main>

      {!isReview && <BottomNav />}

      {/*
        Modals mount only while open, and are keyed by what they are editing, so
        their draft state comes from useState on mount rather than an effect
        that resets it.
      */}
      {(modal.kind === 'deck-new' || modal.kind === 'deck-edit') && (
        <DeckModal
          key={modal.deck ? `deck-${modal.deck.id}` : 'deck-new'}
          mode={modal.kind === 'deck-edit' ? 'edit' : 'create'}
          deck={modal.deck}
          onClose={close}
          onSave={(draft) => {
            if (modal.kind === 'deck-edit') {
              updateDeck(modal.deck.id, draft)
              say('Deck updated')
            } else {
              const deck = addDeck(draft)
              say('Deck created — add your first card')
              navigate(`/decks/${deck.id}`)
            }
          }}
          // Clicking "Import a file" inside Create a Deck: this modal closes and
          // the Import modal opens, carrying whatever has been typed.
          onRequestImport={(draft) => openImport(null, draft)}
          onDelete={openDeleteDeck}
        />
      )}

      <ConfirmModal
        open={modal.kind === 'deck-delete'}
        kicker="Delete deck"
        title={`Delete “${modal.deck?.title ?? ''}”?`}
        body="Its cards and review history will be removed. This cannot be undone."
        confirmLabel="Delete deck"
        onClose={close}
        onConfirm={() => {
          const { id, title } = modal.deck
          removeDeck(id)
          say(`Deleted “${title}”`)
          // Leaving the deleted deck's own page open would strand the user on a
          // "no longer exists" screen.
          if (pathname.startsWith(`/decks/${id}`)) navigate('/decks')
        }}
      />

      {modal.kind === 'import' && (
        <ImportFileModal
          pendingDeck={modal.pendingDeck}
          initialDraft={modal.draft}
          deckId={modal.deck?.id}
          onClose={close}
          onCreateDeck={addDeck}
          onOpenDeck={(deckId) => deckId && navigate(`/decks/${deckId}`)}
          say={say}
        />
      )}

      {(modal.kind === 'card-new' || modal.kind === 'card-edit') && (
        <CardModal
          key={modal.kind === 'card-edit' ? `card-${modal.deck.id}-${modal.index}` : 'card-new'}
          mode={modal.kind === 'card-edit' ? 'edit' : 'new'}
          card={modal.card}
          onClose={close}
          onSave={(card) => {
            if (modal.kind === 'card-edit') {
              updateCard(modal.deck.id, modal.index, card)
              say('Card saved')
            } else {
              addCards(modal.deck.id, [card])
              say('Card added')
            }
          }}
        />
      )}

      <ConfirmModal
        open={modal.kind === 'card-delete'}
        kicker="Delete card"
        title="Delete this card?"
        body="It will be removed from the deck and from your review queue."
        confirmLabel="Delete card"
        onClose={close}
        onConfirm={() => {
          removeCard(modal.deck.id, modal.index)
          say('Card deleted')
        }}
      />

      <Toast message={toast} />
    </div>
  )
}

export default function App() {
  return (
    // Outer net for anything the per-route boundary sits below — the provider
    // itself, or the shell around the routes.
    <ErrorBoundary>
      <AppProvider>
        <Shell />
      </AppProvider>
    </ErrorBoundary>
  )
}
