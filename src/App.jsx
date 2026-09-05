import { useCallback, useState } from 'react'
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { AppProvider, useApp } from './data/AppContext.jsx'
import { BottomNav, TopNav } from './components/Navbar.jsx'
import Toast from './components/Toast.jsx'
import DeckModal from './components/DeckModal.jsx'
import ImportFileModal from './components/ImportFileModal.jsx'
import CardModal from './components/CardModal.jsx'
import ConfirmModal from './components/ConfirmModal.jsx'
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
  const { addDeck, updateDeck, addCards, updateCard, removeCard, say, toast } = useApp()

  // One value rather than a flag per modal, so the Create -> Import handoff is
  // a single swap and two modals can never be open at once.
  const [modal, setModal] = useState(CLOSED)
  const close = useCallback(() => setModal(CLOSED), [])

  const isReview = /\/review$/.test(pathname)

  const openNewDeck = () => setModal({ kind: 'deck-new' })
  const openEditDeck = (deck) => setModal({ kind: 'deck-edit', deck })
  const openNewCard = (deck) => setModal({ kind: 'card-new', deck })
  const openEditCard = (deck, index, card) => setModal({ kind: 'card-edit', deck, index, card })
  const openDeleteCard = (deck, index) => setModal({ kind: 'card-delete', deck, index })

  /** Import against an existing deck, or standing alone as a new-deck flow. */
  const openImport = (deck, draft) =>
    setModal({ kind: 'import', deck, draft, pendingDeck: !deck })

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      {!isReview && <TopNav />}

      <main className="flex-1 px-4 pt-[22px] pb-[30px] sm:px-7 sm:pt-[34px] sm:pb-12 lg:px-12 lg:pt-11 lg:pb-[72px]">
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
      </main>

      {!isReview && <BottomNav />}

      <DeckModal
        open={modal.kind === 'deck-new' || modal.kind === 'deck-edit'}
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
      />

      <ImportFileModal
        open={modal.kind === 'import'}
        pendingDeck={modal.pendingDeck}
        initialDraft={modal.draft}
        deckId={modal.deck?.id}
        onClose={close}
        onCreateDeck={addDeck}
        onAddCards={(deckId, cards) => {
          addCards(deckId, cards)
          say(`${cards.length} cards drafted`)
        }}
        onOpenDeck={(deckId) => deckId && navigate(`/decks/${deckId}`)}
        say={say}
      />

      <CardModal
        open={modal.kind === 'card-new' || modal.kind === 'card-edit'}
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
    <AppProvider>
      <Shell />
    </AppProvider>
  )
}
