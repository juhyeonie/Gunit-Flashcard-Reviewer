import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import JSZip from 'jszip'

/**
 * Card generation, server side.
 *
 * This runs in Node, never in the browser, because it holds the Anthropic API
 * key. A key shipped to the client is readable by anyone who opens devtools, so
 * the browser only ever talks to this handler.
 */

const MODEL = 'claude-opus-5'

/** Roughly four characters per token; the guard below is deliberately generous. */
const MAX_CHARS = 600_000
const MAX_PDF_BYTES = 25 * 1024 * 1024

const CardsSchema = z.object({
  cards: z
    .array(
      z.object({
        front: z.string().describe('One question, answerable from the source material.'),
        back: z.string().describe('The answer, with a sentence of context where it helps.'),
      }),
    )
    .describe('The flashcards drafted from the material.'),
})

const SYSTEM = `You write flashcards for a student revising from their own course material.

Rules:
- Every card must be answerable from the supplied material. Never introduce outside facts.
- One idea per card. Split compound questions rather than writing a card with two answers.
- Fronts are questions. Prefer "What was the cursus honorum?" over "The cursus honorum".
- Backs are complete but tight — a sentence, occasionally two when context earns it.
- Cover the material evenly instead of over-weighting the opening pages.
- Skip title slides, tables of contents, bibliographies, and administrative notes.
- Match the source's own terminology and spelling.
- If the material is too thin to support good cards, return fewer rather than padding.`

const stripXml = (xml) =>
  xml
    .replace(/<\/a:p>|<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

/**
 * DOCX and PPTX are both zipped XML, so one unzip covers them: Word keeps its
 * body in word/document.xml, PowerPoint one file per slide.
 */
export async function textFromOfficeFile(buffer, ext) {
  const zip = await JSZip.loadAsync(buffer)

  if (ext === 'docx') {
    const doc = zip.file('word/document.xml')
    if (!doc) throw new Error('That .docx has no readable document body.')
    return stripXml(await doc.async('string'))
  }

  const slides = zip
    .file(/^ppt\/slides\/slide\d+\.xml$/)
    // slide2 must not sort before slide10.
    .sort((a, b) => {
      const n = (f) => Number(f.name.match(/slide(\d+)\.xml$/)[1])
      return n(a) - n(b)
    })
  if (!slides.length) throw new Error('That .pptx has no slides with text.')

  const parts = await Promise.all(
    slides.map(async (slide, i) => `--- Slide ${i + 1} ---\n${stripXml(await slide.async('string'))}`),
  )
  return parts.join('\n\n')
}

/**
 * Turns one uploaded file into a content block.
 *
 * PDFs go to Claude as a document block rather than being text-extracted here:
 * the model reads the page layout directly, which keeps slide and column
 * structure that a text scrape would flatten.
 */
async function blockForFile(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase()
  const buffer = Buffer.from(file.data, 'base64')

  if (ext === 'pdf') {
    if (buffer.byteLength > MAX_PDF_BYTES) {
      throw new Error(`${file.name} is larger than the 25 MB limit.`)
    }
    return {
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: file.data },
      title: file.name,
    }
  }

  let text
  if (ext === 'docx' || ext === 'pptx') {
    text = await textFromOfficeFile(buffer, ext)
  } else if (ext === 'txt' || ext === 'md' || ext === 'csv') {
    text = buffer.toString('utf8')
  } else {
    throw new Error(`${file.name} is not a supported file type (PDF, PPTX, DOCX or TXT).`)
  }

  if (!text.trim()) throw new Error(`No readable text was found in ${file.name}.`)
  return { type: 'text', text: `--- ${file.name} ---\n${text}` }
}

/**
 * Drafts flashcards from the uploaded files.
 *
 * @param {{files: {name: string, data: string}[], count?: number, deckTitle?: string}} input
 * @returns {Promise<{cards: {front: string, back: string}[]}>}
 */
export async function generateCards({ files, count = 12, deckTitle }) {
  if (!Array.isArray(files) || !files.length) {
    throw Object.assign(new Error('No files were uploaded.'), { status: 400 })
  }

  const blocks = []
  for (const file of files) {
    try {
      blocks.push(await blockForFile(file))
    } catch (err) {
      throw Object.assign(err, { status: 400 })
    }
  }

  // Never silently truncate: if the material is too big, say so and let the
  // user split it rather than quietly dropping the second half of their notes.
  const chars = blocks.reduce((n, b) => n + (b.type === 'text' ? b.text.length : 0), 0)
  if (chars > MAX_CHARS) {
    throw Object.assign(
      new Error(
        `That is a lot of material (about ${Math.round(chars / 1000)}k characters). ` +
          'Import it in smaller batches so nothing gets dropped.',
      ),
      { status: 413 },
    )
  }

  const client = new Anthropic()

  const instruction =
    `Write about ${count} flashcards from the material above` +
    (deckTitle ? `, for a deck called "${deckTitle}".` : '.') +
    ' Favour the ideas a student would actually be tested on.'

  // Streamed because course material can be long on both sides of the call,
  // and a non-streaming request that size risks an HTTP timeout.
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    thinking: { type: 'adaptive' },
    output_config: { format: zodOutputFormat(CardsSchema) },
    messages: [{ role: 'user', content: [...blocks, { type: 'text', text: instruction }] }],
  })

  const response = await stream.finalMessage()

  if (response.stop_reason === 'refusal') {
    throw Object.assign(new Error('Claude declined to draft cards from that material.'), {
      status: 422,
    })
  }

  // parsed_output is null when the model's JSON did not satisfy the schema.
  const parsed =
    response.parsed_output ??
    (() => {
      const text = response.content.find((b) => b.type === 'text')?.text
      try {
        return CardsSchema.parse(JSON.parse(text ?? ''))
      } catch {
        return null
      }
    })()

  if (!parsed?.cards?.length) {
    throw Object.assign(new Error('No cards could be drafted from that material.'), { status: 422 })
  }

  const cards = parsed.cards
    .map((c) => ({ front: String(c.front).trim(), back: String(c.back).trim() }))
    .filter((c) => c.front && c.back)

  return { cards, usage: response.usage }
}
