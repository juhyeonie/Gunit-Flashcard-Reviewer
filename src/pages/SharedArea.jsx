import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { AppContext } from '../data/appContext.js'
import { SharedContext } from '../data/sharedContext.js'
import { useApp } from '../data/useApp.js'
import { useAuth } from '../data/useAuth.js'
import {
  editSharedCards,
  fetchProgress,
  joinShare,
  leaveShare,
  openShare,
  progressRow,
  saveProgress,
  sharePath,
} from '../data/sharing.js'
import {
  applyGrades,
  clearPending,
  forget,
  mergeProgress,
  readShared,
  remember,
  rememberCopy,
  setEntry,
  setSuspended,
  sharedKey,
  studyDecks,
  writeShared,
} from '../data/sharedLibrary.js'
import Button from '../components/Button.jsx'
import Mascot from '../components/Mascot.jsx'
import Spinner from '../components/Spinner.jsx'
import useDocumentTitle from '../hooks/useDocumentTitle.js'
import Review from './Review.jsx'
import Quiz from './Quiz.jsx'
import Summary from './Summary.jsx'
import { SharedDeckView, SharedFolderView } from './SharedViews.jsx'

/** How long progress waits before going up, so a run of grades is one request. */
const QUIET_MS = 1000

/**
 * Everything under /shared/deck/:token and /shared/folder/:token.
 *
 * Opens the link, keeps the reader's own progress on its cards, and then gets
 * out of the way: the study pages are the app's own Review, Quiz and Summary,
 * given a store in which the decks are the shared ones and grading writes to
 * the reader's private progress instead of to a library. They cannot tell the
 * difference, and neither should the reader.
 *
 * What it never does is put the shared cards into the reader's library. That
 * library is synced as the reader's own; somebody else's deck in it would be
 * uploaded as theirs. Add to My Gunit is the one way in, and it makes a copy.
 */
export default function SharedArea() {
  const { kind, token } = useParams()
  const app = useApp()
  const { user, available, status: authStatus } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const userId = user?.id ?? null
  const base = sharePath(kind, token)

  /* The reader's store, following whoever is signed in — as the library does. */
  const key = sharedKey(userId)
  const [store, setStore] = useState(() => readShared(key))
  const [storeKey, setStoreKey] = useState(key)
  if (storeKey !== key) {
    setStoreKey(key)
    setStore(readShared(key))
  }
  useEffect(() => writeShared(key, store), [key, store])

  const [answer, setAnswer] = useState(() => store.cache[token]?.answer ?? null)
  const [phase, setPhase] = useState(() => (store.cache[token] ? 'ready' : 'loading'))
  const [offline, setOffline] = useState(false)
  const [refreshTick, setRefreshTick] = useState(0)

  /*
   * Opening the link. Waits for the session to be known, so a signed-in reader
   * is not first shown what an anonymous one would be.
   */
  const knownKind = kind === 'deck' || kind === 'folder'

  useEffect(() => {
    if (!knownKind || authStatus === 'loading') return undefined
    let cancelled = false

    ;(async () => {
      const cached = readShared(key).cache[token]?.answer ?? null
      if (!available) {
        if (cached) {
          setAnswer(cached)
          setOffline(true)
          setPhase('ready')
        } else setPhase('no_accounts')
        return
      }

      const { data, error } = await openShare(token)
      if (cancelled) return
      if (error || !data) {
        // No connection, or a project not set up for sharing: the copy from
        // last time, if there is one, is still worth studying.
        if (cached) {
          setAnswer(cached)
          setOffline(true)
          setPhase('ready')
        } else {
          setPhase('error')
          setAnswer({ error })
        }
        return
      }
      if (data.status !== 'ok' || data.kind !== kind) {
        setStore((s) => forget(s, token))
        setAnswer(null)
        setPhase(data.status === 'ok' ? 'not_found' : data.status)
        return
      }

      setAnswer(data)
      setOffline(false)
      setPhase('ready')
      setStore((s) => remember(s, token, data))

      // The reader's own progress from the account, under anything newer here.
      if (userId) {
        const ids = data.decks.flatMap((d) => d.cards.map((c) => c.id))
        const { data: rows } = await fetchProgress(ids)
        if (!cancelled && rows) setStore((s) => mergeProgress(s, rows))
      }
    })()

    return () => {
      cancelled = true
    }
  }, [kind, knownKind, token, key, userId, available, authStatus, refreshTick])

  const role = answer?.role ?? 'viewer'
  const joined = Boolean(answer?.joined)
  const isOwner = role === 'owner'

  /*
   * Progress going up, a beat after the last grade. Only for a reader who has
   * joined: the database keeps progress for members, and studying signed in
   * joins. A guest's progress stays on this device, which is where a guest's
   * everything lives.
   */
  useEffect(() => {
    if (!userId || !joined || offline || !store.pending.length) return undefined
    const timer = setTimeout(async () => {
      const ids = store.pending.filter((id) => store.progress[id])
      const gone = store.pending.filter((id) => !store.progress[id])
      const rows = ids.map((id) => progressRow(userId, id, store.progress[id]))
      const { error } = await saveProgress(rows)
      if (!error) setStore((s) => clearPending(s, [...ids, ...gone]))
    }, QUIET_MS)
    return () => clearTimeout(timer)
  }, [userId, joined, offline, store.pending, store.progress])

  const decks = useMemo(() => studyDecks(answer?.status === 'ok' ? answer : null, store), [answer, store])

  const deckPath = useCallback(
    (id, rest = '') => (rest || kind === 'folder' ? `${base}/d/${id}${rest}` : base),
    [base, kind],
  )

  /** Joins, if signed in and not already on it. Studying signed in is joining. */
  const join = useCallback(async () => {
    if (!userId || joined || isOwner || offline) return true
    const { data } = await joinShare(token)
    if (data?.status === 'ok') {
      setAnswer((a) => ({ ...a, joined: true, role: data.role ?? a.role }))
      return true
    }
    return false
  }, [userId, joined, isOwner, offline, token])

  const leave = useCallback(async () => {
    const { error } = await leaveShare(answer.share_id)
    if (error) {
      app.say(error)
      return
    }
    setAnswer((a) => ({ ...a, joined: false }))
    app.say('Removed from Shared with me')
  }, [answer, app])

  const study = useCallback(
    async (deckId, mode) => {
      await join()
      navigate(deckPath(deckId, `/${mode}`))
    },
    [join, navigate, deckPath],
  )

  /**
   * Add to My Gunit: a copy, with nothing tying it back. New ids for the deck
   * and every card, so the owner's later edits never reach it and nothing the
   * reader does to it reaches the owner. The reader's own progress comes
   * along — it was theirs already — and nobody else's.
   */
  const addToMine = useCallback(
    (sources, folderName = null) => {
      let folder = null
      if (folderName) {
        folder =
          app.folders.find((f) => f.name.trim().toLowerCase() === folderName.trim().toLowerCase()) ??
          app.createFolder(folderName)
      }
      const placed = sources.map((d) => {
        const mine = app.importDeck({
          title: d.title,
          subject: d.subject,
          desc: d.desc,
          cards: d.cards.map((c) => ({ front: c.front, back: c.back, scheduling: d.schedule[c.id] })),
        })
        if (folder) app.moveDeckToFolder(mine.id, folder.id)
        return [d.id, mine.id]
      })
      setStore((s) => placed.reduce((acc, [from, to]) => rememberCopy(acc, from, to), s))
      return placed
    },
    [app],
  )

  /** The reader's own copy of a shared deck, if they made one and still have it. */
  const copyOf = useCallback(
    (deckId) => {
      const mine = store.copies[deckId]
      return mine && app.decks.some((d) => d.id === mine) ? mine : null
    },
    [store.copies, app.decks],
  )

  /**
   * An editor's change, sent and then read back: the account is what it is
   * after the change, not what this page guessed it would be.
   */
  const editCards = useCallback(
    async (deckId, upsert, remove = []) => {
      const { data, error } = await editSharedCards(token, deckId, upsert, remove)
      if (error) {
        app.say(error)
        return false
      }
      if (data?.refused?.length) app.say('Someone else changed this deck — showing it as it is now')
      setRefreshTick((t) => t + 1)
      return true
    },
    [token, app],
  )

  /** Where a new card goes: after the last one. */
  const nextPosition = useCallback(
    (deckId) => {
      const cards = answer?.decks?.find((d) => d.id === deckId)?.cards ?? []
      return cards.reduce((max, c) => Math.max(max, (c.position ?? 0) + 1), 0)
    },
    [answer],
  )

  const shared = useMemo(
    () => ({
      kind,
      token,
      base,
      answer,
      decks,
      role,
      joined,
      isOwner,
      offline,
      signedIn: Boolean(userId),
      accounts: available,
      signInPath: `/sign-in?next=${encodeURIComponent(pathname)}`,
      study,
      join,
      leave,
      addToMine,
      copyOf,
      editCards,
      nextPosition,
      deckPath,
    }),
    [kind, token, base, answer, decks, role, joined, isOwner, offline, userId, available, pathname,
     study, join, leave, addToMine, copyOf, editCards, nextPosition, deckPath],
  )

  /*
   * The store the study pages see. The reader's streak and settings are the
   * reader's own, so those pass straight through; the decks and everything
   * that grades them are the shared ones and this reader's private progress.
   */
  const scoped = useMemo(
    () => ({
      ...app,
      decks,
      folders: [],
      deckPath,
      recordGrades: (deckId, grades) => setStore((s) => applyGrades(s, deckId, grades)),
      restoreSchedule: (_deckId, cardId, entry) => setStore((s) => setEntry(s, cardId, entry)),
      setCardSuspended: (_deckId, cardId, suspended) => setStore((s) => setSuspended(s, cardId, suspended)),
    }),
    [app, decks, deckPath],
  )

  if (!knownKind) return <SharedNotice phase="not_found" kind="deck" />
  if (phase !== 'ready') return <SharedNotice phase={phase} kind={kind} answer={answer} signInPath={shared.signInPath} />

  return (
    <SharedContext.Provider value={shared}>
      <AppContext.Provider value={scoped}>
        <Routes>
          <Route index element={kind === 'folder' ? <SharedFolderView /> : <SharedDeckView />} />
          <Route path="d/:id" element={<SharedDeckView />} />
          <Route path="d/:id/review" element={<Review />} />
          <Route path="d/:id/quiz" element={<Quiz />} />
          <Route path="d/:id/summary" element={<Summary />} />
          <Route path="*" element={<SharedNotice phase="not_found" kind={kind} />} />
        </Routes>
      </AppContext.Provider>
    </SharedContext.Provider>
  )
}

const NOTICES = {
  not_found: {
    kicker: 'Link unavailable',
    title: (noun) => `This shared ${noun} is no longer available`,
    body: 'The link may have been reset or mistyped, or the owner deleted it. Ask them for a new one.',
  },
  revoked: {
    kicker: 'Sharing turned off',
    title: (noun) => `This shared ${noun} is no longer available`,
    body: 'Its owner stopped sharing it. If you added a copy to your Gunit, that copy is still yours.',
  },
  sign_in: {
    kicker: 'Invited people only',
    title: () => 'Sign in to open this',
    body: 'It is shared with specific people. Sign in with the email address it was sent to.',
  },
  no_access: {
    kicker: 'Invited people only',
    title: () => 'This isn’t shared with this account',
    body: 'It is shared with specific people, and this account is not one of them. If it was sent to another address of yours, sign in with that one — or ask the owner to invite you.',
  },
  no_accounts: {
    kicker: 'Local-only Gunit',
    title: () => 'This copy of Gunit can’t open shared links',
    body: 'It keeps everything in this browser, with no accounts to share between. Open the link on the main Gunit site instead.',
  },
  error: {
    kicker: 'Couldn’t open the link',
    title: () => 'Nothing to show yet',
    body: 'Shared decks need a connection the first time they are opened. Once opened, they can be studied offline.',
  },
}

/** What a link says when it will not open, and the way out of it. */
function SharedNotice({ phase, kind, answer, signInPath }) {
  useDocumentTitle(kind === 'folder' ? 'Shared folder' : 'Shared deck')
  if (phase === 'loading') {
    return (
      <div className="flex items-center justify-center gap-2.5 py-24 text-sm text-ink-3" role="status">
        <Spinner />
        Opening the shared {kind === 'folder' ? 'folder' : 'deck'}…
      </div>
    )
  }
  const notice = NOTICES[phase] ?? NOTICES.not_found
  const noun = kind === 'folder' ? 'folder' : 'deck'
  return (
    <div className="rise-in mx-auto flex max-w-xl flex-col items-center py-16 text-center">
      <Mascot pose="thinking" size={96} className="mb-5" />
      <div className="kicker mb-3">{notice.kicker}</div>
      <h1 className="m-0 font-serif text-[28px] leading-[1.15] font-normal text-pretty">{notice.title(noun)}</h1>
      <p className="mt-3 mb-0 max-w-[420px] text-[15px] text-ink-2 text-pretty">
        {phase === 'error' && answer?.error ? `${answer.error} ${notice.body}` : notice.body}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {phase === 'sign_in' && (
          <Button as={Link} to={signInPath}>
            Sign in
          </Button>
        )}
        {/* Signed in already: switching accounts starts from signing out. */}
        {phase === 'no_access' && (
          <Button as={Link} to="/settings">
            Switch account
          </Button>
        )}
        <Button as={Link} to="/" variant="outline">
          Go to Gunit
        </Button>
      </div>
    </div>
  )
}
