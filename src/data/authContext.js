import { createContext } from 'react'

/**
 * Kept apart from the provider and the hook so each of those files exports
 * only one kind of thing and fast refresh keeps working on them — the same
 * split the app store uses.
 */
export const AuthContext = createContext(null)
