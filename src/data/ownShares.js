import { useContext, useEffect, useSyncExternalStore } from 'react'
import { AuthContext } from './authContext.js'
import { getSupabase } from './supabase.js'

/**
 * Which of the reader's own decks and folders are shared right now, so the
 * library can say so beside them.
 *
 * One read per account per page load — the owner's own `shares` rows, which
 * row level security already limits them to — and after that the Share
 * dialog says what changed. Kept outside React because a deck card on the
 * dashboard and the same deck's page ask the same question, and one answer
 * should serve both without asking the network twice.
 *
 * Only a hint. Nothing is decided by it: who can open a share is Postgres's
 * business, and a hint that is stale or missing — offline, or a project that
 * has not run 0006 — is just a marker not shown.
 */

let state = { userId: null, decks: new Set(), folders: new Set() }
let loadingFor = null
const listeners = new Set()

const publish = (next) => {
  state = next
  for (const listener of listeners) listener()
}

const subscribe = (listener) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const getSnapshot = () => state

/** Reads the account's shares once for this reader, or forgets them when nobody is signed in. */
export async function loadOwnShares(userId) {
  if (!userId) {
    loadingFor = null
    if (state.userId) publish({ userId: null, decks: new Set(), folders: new Set() })
    return
  }
  if (loadingFor === userId) return
  loadingFor = userId
  publish({ userId, decks: new Set(), folders: new Set() })

  try {
    const supabase = await getSupabase()
    if (!supabase) return
    const { data, error } = await supabase
      .from('shares')
      .select('deck_id, folder_id')
      .eq('owner_id', userId)
      .is('revoked_at', null)
    if (error || !data || loadingFor !== userId) return
    publish({
      userId,
      decks: new Set(data.map((s) => s.deck_id).filter(Boolean)),
      folders: new Set(data.map((s) => s.folder_id).filter(Boolean)),
    })
  } catch {
    // Offline or not set up: no markers, which is all this costs.
  }
}

/** What the Share dialog just did, so the marker follows without a read. */
export function noteShared(kind, id, shared) {
  const key = kind === 'folder' ? 'folders' : 'decks'
  const next = new Set(state[key])
  if (shared) next.add(id)
  else next.delete(id)
  publish({ ...state, [key]: next })
}

/** For tests: a fresh page load. */
export function resetOwnShares() {
  loadingFor = null
  publish({ userId: null, decks: new Set(), folders: new Set() })
}

/**
 * `{ deck(id), folder(id) }`: whether each is shared. Loads on first use for
 * whoever is signed in. Reads the auth context directly rather than through
 * useAuth, so a deck card rendered with no auth around it — as the local-only
 * app and plenty of tests render it — just shows no marker.
 */
export function useOwnShares() {
  const auth = useContext(AuthContext)
  const userId = auth?.available ? (auth.user?.id ?? null) : null
  useEffect(() => {
    if (auth?.status === 'loading') return
    loadOwnShares(userId)
  }, [userId, auth?.status])
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const mine = snapshot.userId === userId && userId !== null
  return {
    deck: (id) => mine && snapshot.decks.has(id),
    folder: (id) => mine && snapshot.folders.has(id),
  }
}
