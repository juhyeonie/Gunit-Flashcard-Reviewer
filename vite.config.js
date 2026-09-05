import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import generateCards from './server/vite-plugin.js'

export default defineConfig(({ mode }) => {
  // Vite only exposes VITE_-prefixed vars to the client. ANTHROPIC_API_KEY is
  // loaded into this Node process instead, so the card-generation middleware
  // can read it and the browser bundle never sees it.
  Object.assign(process.env, loadEnv(mode, process.cwd(), 'ANTHROPIC_'))

  return { plugins: [react(), tailwindcss(), generateCards()] }
})
