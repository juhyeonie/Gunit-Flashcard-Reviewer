import { createContext } from 'react'

/**
 * The context object on its own, away from both the provider that fills it and
 * the hooks that read it.
 *
 * All three used to live in one file, which meant that file exported a
 * component and two hooks — and Vite's fast refresh gives up on any module
 * that does, reloading the whole page instead. Editing the store is exactly
 * when you least want the page state you were debugging thrown away.
 */
export const AppContext = createContext(null)
