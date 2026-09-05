/**
 * Serves POST /api/generate-cards from the Vite dev and preview servers.
 *
 * The handler runs in Node so the Anthropic API key stays on this side. The
 * browser posts files here and gets cards back; it never sees the key.
 *
 * For a static production deploy, host the same `generateCards` function as a
 * serverless function at the same path — nothing in the client needs to change.
 */

// Base64 inflates by about a third, so this comfortably clears the 25 MB
// per-file limit the UI advertises.
const MAX_BODY_BYTES = 80 * 1024 * 1024

const readJson = (req) =>
  new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Upload is too large.'), { status: 413 }))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(Object.assign(new Error('Malformed request body.'), { status: 400 }))
      }
    })
    req.on('error', reject)
  })

const send = (res, status, body) => {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

const middleware = async (req, res, next) => {
  if (!req.url?.startsWith('/api/generate-cards')) return next()
  if (req.method !== 'POST') return send(res, 405, { error: 'Use POST.' })

  if (!process.env.ANTHROPIC_API_KEY) {
    return send(res, 503, {
      error:
        'No ANTHROPIC_API_KEY is set. Add it to a .env file in the project root and restart the dev server.',
    })
  }

  try {
    const body = await readJson(req)
    // Imported lazily so a missing key or SDK problem cannot break `vite dev`
    // for the rest of the app.
    const { generateCards } = await import('./generate-cards.js')
    const result = await generateCards(body)
    send(res, 200, result)
  } catch (err) {
    const status = err.status ?? (err.status === 0 ? 500 : err.constructor?.name?.includes('Anthropic') ? 502 : 500)
    if (status >= 500) console.error('[generate-cards]', err)
    send(res, status, { error: err.message ?? 'Card generation failed.' })
  }
}

export default function generateCardsPlugin() {
  return {
    name: 'gunit-generate-cards',
    // Block bodies matter here: Vite treats a value returned from these hooks
    // as a post-hook to invoke after its own middlewares, and `.use()` returns
    // the connect app — which Vite would then call with no request.
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}
