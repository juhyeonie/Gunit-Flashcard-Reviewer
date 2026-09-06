import { useEffect, useMemo, useRef, useState } from 'react'
import Modal from './Modal.jsx'
import Field from './Field.jsx'
import { combineText, extractText } from '../data/extract.js'

const ACCEPT =
  '.pdf,.pptx,.docx,.txt,.md,application/pdf,' +
  'application/vnd.openxmlformats-officedocument.presentationml.presentation,' +
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain'

const formatSize = (n) =>
  n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`

const describe = (file) => ({
  name: file.name,
  size: formatSize(file.size),
  badge: (file.name.split('.').pop() || 'file').toUpperCase().slice(0, 4),
})

/** Statuses that mean the file gave up no text, and so deserve muted styling. */
const FAILED = ['empty', 'planned', 'unsupported', 'error']

/**
 * Import lives in a modal, never a page.
 *
 * Dropped files are read here, in the browser: a .docx or .pptx is unzipped
 * and its XML stripped, a .txt read as-is. Nothing is uploaded — there is no
 * server, and the material is the student's own coursework.
 *
 * Drafting cards from that text automatically would need an AI model, and this
 * build ships without one. So the modal stops at the text: it shows what it
 * read, and the cards are written by hand. It never invents cards, and a deck
 * created here arrives empty.
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
  const combined = useMemo(() => combineText(files), [files])

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

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(combined)
      say('Text copied')
    } catch {
      // Clipboard access is refused outside a secure context; the textarea is
      // still there to select from by hand.
      say('Could not copy — select the text instead')
    }
  }

  /**
   * Creates the deck when the flow started without one, then opens it so cards
   * can be written from the text above. Nothing is generated.
   */
  const confirm = () => {
    if (pendingDeck) {
      if (!draft.title.trim()) {
        say('Name the deck first')
        return
      }
      const deck = onCreateDeck({
        title: draft.title,
        subject: draft.subject || 'General',
        desc: draft.desc,
      })
      onClose()
      say('Deck created — add your first card')
      onOpenDeck?.(deck.id)
      return
    }
    onClose()
    onOpenDeck?.(deckId)
  }

  const set = (key) => (e) => setDraft((d) => ({ ...d, [key]: e.target.value }))

  return (
    <Modal
      open
      onClose={onClose}
      maxWidth={520}
      kicker={pendingDeck ? 'New deck' : 'Import material'}
      title="Import a file"
      body="Your material is read here in the browser and never uploaded. Drafting cards from it automatically needs an AI model this version does not include, so the text is yours to work from."
      confirmLabel={pendingDeck ? 'Create empty deck' : 'Add cards by hand'}
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
            <span className="kicker mt-1 !leading-[1.6] !tracking-[0.1em]">DOCX · PPTX · TXT</span>
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
                    {f.status === 'reading' && ' · Reading…'}
                    {f.status === 'ok' && ` · ${f.words.toLocaleString()} words`}
                    {FAILED.includes(f.status) && ` · ${f.message}`}
                  </span>
                </span>
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
              <div className="mt-1 flex flex-col gap-2">
                <Field
                  id="import-text"
                  label={`Extracted text · ${words.toLocaleString()} words`}
                  as="textarea"
                  rows={7}
                  readOnly
                  value={combined}
                  className="!text-[13px] leading-[1.55]"
                />
                <button
                  type="button"
                  onClick={copyText}
                  className="cursor-pointer self-end border-0 bg-transparent p-0 text-[13px] font-medium text-ink-2 transition-colors hover:text-accent"
                >
                  Copy text
                </button>
              </div>
            )}

            {/*
              Said once files are chosen — that is where the expectation of
              cards appearing actually forms.
            */}
            <div className="rounded-lg border border-line bg-raised px-4 py-3.5 text-[13px] leading-[1.5] text-ink-2">
              <div className="mb-1 text-[13px] font-semibold text-ink">
                Cards are not drafted automatically
              </div>
              {read.length > 0
                ? 'The text was read on this device and went nowhere else. Writing cards from it needs an AI model this version does not include — copy what you need and add the cards yourself.'
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
