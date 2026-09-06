import { useEffect, useMemo, useRef, useState } from 'react'
import Modal from './Modal.jsx'
import Field from './Field.jsx'
import { combineText, extractText, readWithOcr } from '../data/extract.js'
import { SEPARATORS, parseCards } from '../data/parse.js'

const ACCEPT =
  '.pdf,.pptx,.docx,.txt,.md,.png,.jpg,.jpeg,.webp,.bmp,application/pdf,' +
  'application/vnd.openxmlformats-officedocument.presentationml.presentation,' +
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,image/*'

const formatSize = (n) =>
  n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`

const describe = (file) => ({
  // Kept so a scan can be handed to OCR later, if it is asked for.
  file,
  name: file.name,
  size: formatSize(file.size),
  badge: (file.name.split('.').pop() || 'file').toUpperCase().slice(0, 4),
})

/** Statuses that mean the file gave up no text, and so deserve muted styling. */
const FAILED = ['empty', 'unsupported', 'error']

const formatLabel = (id) =>
  id === 'qa' ? 'Q and A lines' : (SEPARATORS.find((s) => s.id === id)?.label ?? id)

/**
 * Import lives in a modal, never a page.
 *
 * Dropped files are read here, in the browser: a PDF through PDF.js, a .docx
 * or .pptx unzipped and stripped of its XML, a .txt read as-is. A scan or a
 * photograph holds no text to read, and is offered to OCR instead — on
 * request, because that costs megabytes and seconds where reading costs
 * neither. Nothing is uploaded: there is no server, and the material is the
 * student's own coursework.
 *
 * What is read becomes cards by splitting, not by understanding: a glossary
 * line or a Q and A pair already has a front and a back, and `parse.js` finds
 * them. Prose does not become questions here — that needs a model this build
 * ships without, and nothing is guessed in its place. The text stays editable
 * and the cards are previewed, because splitting is only ever as good as the
 * shape of what it was given.
 *
 * Mounted only while open, so every field starts fresh from useState rather
 * than being reset by an effect.
 */
export default function ImportFileModal({
  pendingDeck = false,
  initialDraft,
  deckId,
  onClose,
  onCreateDeck,
  onAddCards,
  onOpenDeck,
  say,
}) {
  const [files, setFiles] = useState([])
  const [draft, setDraft] = useState(() => ({
    title: initialDraft?.title ?? '',
    subject: initialDraft?.subject ?? '',
    desc: initialDraft?.desc ?? '',
  }))
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef(null)
  const nextKey = useRef(0)

  // Reading is async and the modal can be closed mid-read. Nothing should be
  // written back into a component that is on its way out.
  const open = useRef(true)
  useEffect(() => {
    open.current = true
    return () => {
      open.current = false
    }
  }, [])

  const hasFiles = files.length > 0
  const reading = files.some((f) => f.status === 'reading')
  const read = files.filter((f) => f.status === 'ok')
  const words = read.reduce((n, f) => n + f.words, 0)
  const recognised = read.some((f) => f.viaOcr)
  const combined = useMemo(() => combineText(files), [files])

  /*
   * The text is editable, because splitting only works on text that is already
   * shaped like cards and a couple of edits is often all it takes. Until it is
   * touched it follows what was read, so adding another file still updates it.
   */
  const [edited, setEdited] = useState(null)
  const text = edited ?? combined

  const [format, setFormat] = useState('auto')
  const { cards, skipped, format: used } = useMemo(() => parseCards(text, format), [text, format])

  /**
   * Each file is staged immediately so the list appears at once, then filled in
   * as it is read. They are read independently: one corrupt archive among four
   * must not hold up or discard the other three.
   */
  const addFiles = (chosen) => {
    const list = Array.from(chosen || [])
    if (!list.length) return

    const staged = list.map((file) => ({
      key: nextKey.current++,
      ...describe(file),
      status: 'reading',
      message: '',
      text: '',
      words: 0,
    }))
    setFiles((f) => [...f, ...staged])

    staged.forEach(async (row, i) => {
      const result = await extractText(list[i])
      if (!open.current) return
      setFiles((f) => f.map((x) => (x.key === row.key ? { ...x, ...result } : x)))
    })
  }

  const update = (key, patch) =>
    setFiles((f) => f.map((x) => (x.key === key ? { ...x, ...patch } : x)))

  /**
   * Recognition takes seconds per page, so it reports how far along it is.
   * Tesseract's own progress arrives far faster than anything needs to be
   * redrawn, so only a change in whole percent is written back.
   */
  const recognise = async (row) => {
    update(row.key, { status: 'reading', pct: 0, message: '' })

    const result = await readWithOcr(row.file, (progress) => {
      if (!open.current) return
      const pct = Math.round(progress * 100)
      setFiles((f) => {
        const current = f.find((x) => x.key === row.key)
        if (!current || current.pct === pct) return f
        return f.map((x) => (x.key === row.key ? { ...x, pct } : x))
      })
    })

    if (!open.current) return
    update(row.key, { ...result, pct: undefined })
    say(result.status === 'ok' ? `Read ${result.words} words from ${row.name}` : result.message)
  }

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(text)
      say('Text copied')
    } catch {
      // Clipboard access is refused outside a secure context; the textarea is
      // still there to select from by hand.
      say('Could not copy — select the text instead')
    }
  }

  /**
   * Creates the deck when the flow started without one, saves whatever the
   * text split into, and opens the deck either way. A deck with no cards is
   * still a deck worth starting.
   */
  const confirm = () => {
    let id = deckId

    if (pendingDeck) {
      if (!draft.title.trim()) {
        say('Name the deck first')
        return
      }
      id = onCreateDeck({
        title: draft.title,
        subject: draft.subject || 'General',
        desc: draft.desc,
      }).id
    }

    if (cards.length) onAddCards?.(id, cards)
    onClose()
    say(
      cards.length
        ? `Added ${cards.length} ${cards.length === 1 ? 'card' : 'cards'}`
        : pendingDeck
          ? 'Deck created — add your first card'
          : 'Nothing to add — write the cards yourself',
    )
    onOpenDeck?.(id)
  }

  const set = (key) => (e) => setDraft((d) => ({ ...d, [key]: e.target.value }))

  return (
    <Modal
      open
      onClose={onClose}
      maxWidth={520}
      kicker={pendingDeck ? 'New deck' : 'Import material'}
      title="Import a file"
      body="Your material is read here in the browser and never uploaded. Lines already shaped like a card become one — check the preview before you add them."
      confirmLabel={
        cards.length
          ? `Add ${cards.length} ${cards.length === 1 ? 'card' : 'cards'}`
          : pendingDeck
            ? 'Create empty deck'
            : 'Add cards by hand'
      }
      onConfirm={confirm}
    >
      {pendingDeck && (
        <div className="mb-5 flex flex-col gap-3.5 border-b border-line-soft pb-5">
          <Field
            id="import-title"
            label="Deck name"
            value={draft.title}
            onChange={set('title')}
            placeholder="e.g. Roman Provinces"
          />
          <div className="grid grid-cols-2 gap-2.5">
            <Field
              id="import-subject"
              label="Subject"
              value={draft.subject}
              onChange={set('subject')}
              placeholder="Ancient Rome"
            />
            <Field
              id="import-desc"
              label="Description"
              value={draft.desc}
              onChange={set('desc')}
              placeholder="What this deck covers"
            />
          </div>
        </div>
      )}

      <div className="mb-6 flex flex-col gap-[11px]">
        {!hasFiles && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              addFiles(e.dataTransfer.files)
            }}
            className={`flex w-full cursor-pointer flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              dragging
                ? 'border-accent bg-accent-soft'
                : 'border-line bg-transparent hover:border-accent hover:bg-accent-soft'
            }`}
          >
            <span className="grid h-[42px] w-[42px] place-items-center rounded-full border border-line bg-surface text-[17px] text-ink-3">
              ↑
            </span>
            <span className="font-serif text-[22px] leading-[1.2]">
              {dragging ? 'Drop to add' : 'Drop your material here'}
            </span>
            <span className="text-[13px] text-ink-3">
              or <span className="border-b border-accent-line text-accent">browse your device</span>
            </span>
            <span className="kicker mt-1 !leading-[1.6] !tracking-[0.1em]">
              PDF · DOCX · PPTX · TXT · scans
            </span>
          </button>
        )}

        {hasFiles && (
          <>
            <div className="flex items-center justify-between gap-3">
              <span className="kicker !tracking-[0.12em]">Selected files</span>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="cursor-pointer border-0 bg-transparent p-0 text-[13px] font-medium text-ink-2 transition-colors hover:text-accent"
              >
                + Add more
              </button>
            </div>

            {files.map((f) => (
              <div
                key={f.key}
                className="flex items-center gap-3.5 rounded-lg border border-line bg-transparent px-[15px] py-[13px]"
              >
                <span className="grid h-10 w-8 shrink-0 place-items-center rounded border border-line bg-surface font-mono text-[9px] leading-none font-medium tracking-[0.05em] text-ink-3">
                  {f.badge}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm leading-[1.3] font-medium">{f.name}</span>
                  <span
                    className={`font-mono text-[11px] leading-[1.5] tracking-[0.04em] ${
                      f.status === 'error' ? 'text-err' : 'text-ink-3'
                    }`}
                  >
                    {f.size}
                    {f.status === 'reading' &&
                      (f.pct === undefined ? ' · Reading…' : ` · Recognising… ${f.pct}%`)}
                    {f.status === 'ok' &&
                      ` · ${f.words.toLocaleString()} words${f.viaOcr ? ', read by OCR' : ''}`}
                    {f.status === 'ok' && f.note && ` · ${f.note}`}
                    {FAILED.includes(f.status) && ` · ${f.message}`}
                  </span>
                </span>

                {/*
                  Offered, never automatic: recognising a scan pulls down
                  several megabytes of engine and takes seconds a page.
                */}
                {f.ocr && f.status !== 'ok' && f.status !== 'reading' && (
                  <button
                    type="button"
                    onClick={() => recognise(f)}
                    className="shrink-0 cursor-pointer rounded-[20px] border border-line bg-transparent px-3 py-1.5 text-xs leading-none font-medium text-ink-2 transition-colors hover:border-accent hover:text-accent"
                  >
                    Read with OCR
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setFiles((prev) => prev.filter((x) => x.key !== f.key))}
                  aria-label={`Remove ${f.name}`}
                  className="cursor-pointer rounded border-0 bg-transparent px-1.5 py-1 text-[16px] text-ink-3 transition-colors hover:bg-err-soft hover:text-err"
                >
                  ×
                </button>
              </div>
            ))}

            {/*
              One announcement for the whole batch. Reading finishes out of
              order, so per-file updates would interrupt a screen reader
              repeatedly to say much the same thing.
            */}
            <div role="status" className="sr-only">
              {reading
                ? 'Reading files'
                : `Read ${read.length} of ${files.length} files, ${words} words`}
            </div>

            {read.length > 0 && (
              <div className="mt-1 flex flex-col gap-2.5">
                <Field
                  id="import-text"
                  label={`Extracted text · ${words.toLocaleString()} words`}
                  as="textarea"
                  rows={7}
                  value={text}
                  onChange={(e) => setEdited(e.target.value)}
                  className="!text-[13px] leading-[1.55]"
                />
                {recognised && (
                  <p className="m-0 text-[13px] leading-[1.5] text-ink-3">
                    Some of this was recognised from a picture. OCR reads well but not perfectly —
                    worth a look before you build cards on it.
                  </p>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label
                    htmlFor="import-format"
                    className="flex items-center gap-2 text-[13px] text-ink-2"
                  >
                    Split on
                    <select
                      id="import-format"
                      value={format}
                      onChange={(e) => setFormat(e.target.value)}
                      className="cursor-pointer rounded-[5px] border border-line bg-surface px-[9px] py-[7px] text-xs leading-none font-medium text-ink-2"
                    >
                      <option value="auto">Work it out</option>
                      <option value="qa">Q and A lines</option>
                      {SEPARATORS.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex items-center gap-3.5">
                    {/*
                      An edit takes the text out of step with the files, so a
                      file added afterwards would have nowhere to appear. This
                      is the way back — and the way out of a bad edit.
                    */}
                    {edited !== null && (
                      <button
                        type="button"
                        onClick={() => setEdited(null)}
                        className="cursor-pointer border-0 bg-transparent p-0 text-[13px] font-medium text-ink-2 transition-colors hover:text-accent"
                      >
                        Reset text
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={copyText}
                      className="cursor-pointer border-0 bg-transparent p-0 text-[13px] font-medium text-ink-2 transition-colors hover:text-accent"
                    >
                      Copy text
                    </button>
                  </div>
                </div>

                {/*
                  The preview is the honest part of this: splitting is not
                  comprehension, and seeing the first few cards is how you find
                  that out before a hundred of them land in a deck.
                */}
                {cards.length > 0 ? (
                  <div className="flex flex-col gap-1.5 rounded-lg border border-line bg-raised p-3">
                    <div className="kicker !tracking-[0.12em]">
                      {cards.length} {cards.length === 1 ? 'card' : 'cards'}
                      {/* Says what "work it out" worked out, so a wrong guess
                          is visible rather than just a wrong preview. */}
                      {format === 'auto' && used && ` · split on ${formatLabel(used)}`}
                      {skipped > 0 && ` · ${skipped} ${skipped === 1 ? 'line' : 'lines'} skipped`}
                    </div>
                    <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                      {cards.slice(0, 3).map((card, i) => (
                        <li key={i} className="text-[13px] leading-[1.45]">
                          <span className="font-medium">{card.front}</span>
                          <span className="text-ink-3"> → {card.back}</span>
                        </li>
                      ))}
                    </ul>
                    {cards.length > 3 && (
                      <div className="text-[13px] text-ink-3">
                        and {cards.length - 3} more, in the deck once you add them
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-line px-3 py-2.5 text-[13px] leading-[1.5] text-ink-3">
                    Nothing here splits into cards. Lines shaped{' '}
                    <span className="text-ink-2">Term — definition</span> or{' '}
                    <span className="text-ink-2">Q: … / A: …</span> do — edit the text above, or
                    pick the separator yourself.
                  </div>
                )}
              </div>
            )}

            {/*
              Said once files are chosen — that is where the expectation of
              cards appearing actually forms. Splitting lines is not the same
              as understanding them, and the difference is worth stating.
            */}
            <div className="rounded-lg border border-line bg-raised px-4 py-3.5 text-[13px] leading-[1.5] text-ink-2">
              <div className="mb-1 text-[13px] font-semibold text-ink">
                {read.length > 0 ? 'Cards are split, not written' : 'Cards are not written for you'}
              </div>
              {read.length > 0
                ? 'The text was read on this device and went nowhere else. Lines already shaped like a card become one; turning prose into questions would need an AI model this version does not include.'
                : files.some((f) => f.ocr)
                  ? 'Nothing has been read yet. Those pages are pictures, so try Read with OCR above — or add the cards yourself.'
                  : 'Nothing readable came out of your selection, and no cards can be drafted from it. You can still add the cards yourself.'}
            </div>
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT}
        onChange={(e) => {
          addFiles(e.target.files)
          e.target.value = ''
        }}
        className="absolute -left-[9999px] h-px w-px opacity-0"
      />
    </Modal>
  )
}
