import { useCallback, useEffect, useRef, useState } from 'react'
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { AppProvider } from './data/AppContext.jsx'
import { AuthProvider } from './data/AuthProvider.jsx'
import LibrarySync from './data/LibrarySync.jsx'
import NotificationsProvider from './data/NotificationsProvider.jsx'
import { useApp } from './data/useApp.js'
import { BottomNav, TopNav } from './components/Navbar.jsx'
import Toast from './components/Toast.jsx'
import DeckModal from './components/DeckModal.jsx'
import ImportFileModal from './components/ImportFileModal.jsx'
import CardModal from './components/CardModal.jsx'
import ConfirmModal from './components/ConfirmModal.jsx'
import MoveDeckModal from './components/MoveDeckModal.jsx'
import ShareModal from './components/ShareModal.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import UpdateNotice from './components/UpdateNotice.jsx'
import WhatsNewModal from './components/WhatsNewModal.jsx'
import Home from './pages/Home.jsx'
import Decks from './pages/Decks.jsx'
import DeckDetail from './pages/DeckDetail.jsx'
import Review from './pages/Review.jsx'
import Quiz from './pages/Quiz.jsx'
import Summary from './pages/Summary.jsx'
import Settings from './pages/Settings.jsx'
import SignIn from './pages/SignIn.jsx'
import ResetPassword from './pages/ResetPassword.jsx'
import SharedArea from './pages/SharedArea.jsx'
import SharedWithMe from './pages/SharedWithMe.jsx'
import Notifications from './pages/Notifications.jsx'

const CLOSED = { kind: null }

function Shell() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const {
    addDeck,
    updateDeck,
    removeDeck,
    addCards,
    updateCard,
    removeCard,
    resetDeck,
    folders,
    moveDeckToFolder,
    say,
    toast,
  } = useApp()

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

  // A folder id when started from inside a folder; anything else (a click
  // event, nothing) means no folder.
  const openNewDeck = (folderId) =>
    setModal({ kind: 'deck-new', folderId: typeof folderId === 'string' ? folderId : null })
  const openEditDeck = (deck) => setModal({ kind: 'deck-edit', deck })
  const openNewCard = (deck) => setModal({ kind: 'card-new', deck })
  const openEditCard = (deck, index, card) => setModal({ kind: 'card-edit', deck, index, card })
  const openDeleteCard = (deck, index) => setModal({ kind: 'card-delete', deck, index })
  const openDeleteDeck = (deck) => setModal({ kind: 'deck-delete', deck })
  const openResetDeck = (deck) => setModal({ kind: 'deck-reset', deck })
  const openMoveDeck = (deck) => setModal({ kind: 'deck-move', deck })
  const openShare = (shareKind, resource) => setModal({ kind: 'share', shareKind, resource })

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
              <Home
                onNewDeck={openNewDeck}
                onEditDeck={openEditDeck}
                onImport={() => openImport(null)}
              />
            }
          />
          <Route
            path="/decks"
            element={
              <Decks
                onNewDeck={openNewDeck}
                onEditDeck={openEditDeck}
                onShareFolder={(folder) => openShare('folder', folder)}
              />
            }
          />
          <Route
            path="/decks/:id"
            element={
              <DeckDetail
                onEditDeck={openEditDeck}
                onNewCard={openNewCard}
                onEditCard={openEditCard}
                onDeleteCard={openDeleteCard}
                onResetDeck={openResetDeck}
                onMoveDeck={openMoveDeck}
                onShareDeck={(deck) => openShare('deck', deck)}
                onImport={(deck) => openImport(deck)}
              />
            }
          />
          <Route path="/decks/:id/review" element={<Review />} />
          <Route path="/decks/:id/quiz" element={<Quiz />} />
          <Route path="/decks/:id/summary" element={<Summary />} />
          <Route path="/settings" element={<Settings />} />
          {/*
            Opening a shared link needs no account; saving it, editing it or
            being invited does. Both are reachable either way, and each says
            what signing in would add.
          */}
          <Route path="/shared" element={<SharedWithMe />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/shared/:kind/:token/*" element={<SharedArea />} />
          {/*
            Both are reachable whether or not a project is configured: each
            says plainly that this copy is local-only rather than 404ing on a
            link someone was sent.
          */}
          <Route path="/sign-in" element={<SignIn />} />
          <Route path="/reset-password" element={<ResetPassword />} />
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
          folders={folders}
          initialFolderId={modal.folderId}
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

      <ConfirmModal
        open={modal.kind === 'deck-reset'}
        kicker="Reset progress"
        title={`Reset progress for “${modal.deck?.title ?? ''}”?`}
        body="Every card becomes new again and the deck drops to 0% known. The cards, and the days you have already studied, are kept."
        confirmLabel="Reset progress"
        onClose={close}
        onConfirm={() => {
          resetDeck(modal.deck.id)
          say(`Reset “${modal.deck.title}”`)
        }}
      />

      {modal.kind === 'deck-move' && (
        <MoveDeckModal
          key={`move-${modal.deck.id}`}
          deck={modal.deck}
          folders={folders}
          onClose={close}
          onMove={(folderId) => {
            moveDeckToFolder(modal.deck.id, folderId)
            const name = folders.find((f) => f.id === folderId)?.name
            say(name ? `Moved to “${name}”` : 'Moved to Ungrouped')
          }}
        />
      )}

      {modal.kind === 'share' && (
        <ShareModal
          key={`share-${modal.resource.id}`}
          kind={modal.shareKind}
          resource={modal.resource}
          onClose={close}
          say={say}
        />
      )}

      {modal.kind === 'import' && (
        <ImportFileModal
          pendingDeck={modal.pendingDeck}
          initialDraft={modal.draft}
          deckId={modal.deck?.id}
          onClose={close}
          onCreateDeck={addDeck}
          onAddCards={addCards}
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
      <UpdateNotice />
      {/*
        Not over a review: a reader who reloaded mid-session sees it when they
        leave, rather than having the card they were on covered.
      */}
      {!isReview && <WhatsNewModal />}
    </div>
  )
}

export default function App() {
  return (
    // Outer net for anything the per-route boundary sits below — the provider
    // itself, or the shell around the routes.
    <ErrorBoundary>
      {/*
        Auth wraps the store rather than the other way round: who is signed in
        decides which library the store should be holding, not the reverse.
      */}
      <AuthProvider>
        <AppProvider>
          {/* Renders nothing; carries the library to and from the account. */}
          <LibrarySync />
          {/* The notification center's state, for the bell, the tab and the page. */}
          <NotificationsProvider>
            <Shell />
          </NotificationsProvider>
        </AppProvider>
      </AuthProvider>
    </ErrorBoundary>
  )
}
