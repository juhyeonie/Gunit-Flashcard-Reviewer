/**
 * Client half of card generation. Posts the uploaded files to the server-side
 * endpoint, which holds the API key and talks to Claude.
 */

/** File → base64 without the `data:...;base64,` prefix. */
export const toBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`))
    reader.readAsDataURL(file)
  })

/**
 * @param {File[]} files
 * @param {{count?: number, deckTitle?: string, signal?: AbortSignal}} options
 * @returns {Promise<{front: string, back: string}[]>}
 */
export async function generateCards(files, { count, deckTitle, signal } = {}) {
  const payload = {
    count,
    deckTitle,
    files: await Promise.all(
      files.map(async (file) => ({ name: file.name, data: await toBase64(file) })),
    ),
  }

  let response
  try {
    response = await fetch('/api/generate-cards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    })
  } catch (err) {
    if (err.name === 'AbortError') throw err
    throw new Error('Could not reach the card generator. Is the dev server running?')
  }

  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(body.error ?? `Card generation failed (${response.status}).`)
  }
  return body.cards ?? []
}
