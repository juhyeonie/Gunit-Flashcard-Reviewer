import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createBrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { watchInstallability } from './pwa/pwaState.js'
import { registerServiceWorker } from './pwa/register.js'
import { launchWhatsNew } from './data/whatsNew.js'
import './index.css'

// Before anything renders: the browser announces installability once, early.
watchInstallability()
registerServiceWorker()
// Decided before the store first writes, which is how a first visit is told
// apart from a returning reader. The dialog reads this decision.
launchWhatsNew()

/*
 * A data router, with the whole app as one catch-all route and its own
 * <Routes> inside, exactly as before. The data router is what lets a page
 * stop a navigation it would lose work to — an unfinished quiz — whether it
 * comes from a link, the nav bar or the browser's back button.
 */
const router = createBrowserRouter([{ path: '*', element: <App /> }])

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
