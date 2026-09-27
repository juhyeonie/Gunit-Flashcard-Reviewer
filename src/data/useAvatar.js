import { useCallback, useContext, useSyncExternalStore } from 'react'
import { AuthContext } from './authContext.js'
import { readAvatar, subscribeAvatar } from './avatar.js'

/**
 * The picture for whoever is reading: `src` is a `data:` URL, or null for the
 * fallback. Read from this device's copy, so it is there offline.
 *
 * The auth context is read directly rather than through `useAuth`, which
 * throws without a provider: the top bar is drawn in plenty of places with
 * none, and nobody signed in simply means the guest's picture.
 */
export default function useAvatar() {
  const auth = useContext(AuthContext)
  const userId = auth?.user?.id ?? null
  const read = useCallback(() => readAvatar(userId), [userId])
  const avatar = useSyncExternalStore(subscribeAvatar, read, () => null)
  return { userId, src: avatar?.src ?? null }
}
