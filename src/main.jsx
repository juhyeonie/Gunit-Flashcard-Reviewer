import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { watchInstallability } from './pwa/pwaState.js'
import { registerServiceWorker } from './pwa/register.js'
import './index.css'

// Before anything renders: the browser announces installability once, early.
watchInstallability()
registerServiceWorker()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
