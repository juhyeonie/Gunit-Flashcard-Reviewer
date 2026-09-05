import { useRef, useState } from 'react'
import Modal from './Modal.jsx'
import Field from './Field.jsx'

const ACCEPT =
  '.pdf,.pptx,.docx,.txt,application/pdf,' +
  'application/vnd.openxmlformats-officedocument.presentationml.presentation,' +
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain'

const formatSize = (n) =>
  n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`

const describe = (file) => ({
  name: file.name,
  size: formatSize(file.size),
  ext: (file.name.split('.').pop() || 'file').toUpperCase().slice(0, 4),
})

/**
 * Import lives in a modal, never a page.
 *
 * Drafting cards from a document needs an AI model, and this build ships
 * without one — no API key, no account, no external service. Rather than
 * pretend otherwise, the modal keeps its dropzone and says plainly that
 * generation is unavailable. It never invents cards: a deck created here
 * arrives empty, ready to be filled in by hand.
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

  const hasFiles = files.length > 0

  // Only the display row is kept. Nothing reads the file, so the File object
  // itself is not held on to.
  const addFiles = (chosen) => {
    const list = Array.from(chosen || [])
    if (!list.length) return
    setFiles((f) => [...f, ...list.map(describe)])
  }

  /**
   * Creates the deck when the flow started without one, then opens it so cards
   * can be written by hand. No file is read and nothing is generated.
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
      body="Drafting cards from a document needs an AI model, which this version does not include. You can still name a deck here and write its cards yourself."
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
            <span className="kicker mt-1 !leading-[1.6] !tracking-[0.1em]">
              PDF · PPTX · DOCX · TXT
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

            {files.map((f, i) => (
              <div
                key={`${f.name}-${i}`}
                className="flex items-center gap-3.5 rounded-lg border border-line bg-transparent px-[15px] py-[13px]"
              >
                <span className="grid h-10 w-8 shrink-0 place-items-center rounded border border-line bg-surface font-mono text-[9px] leading-none font-medium tracking-[0.05em] text-ink-3">
                  {f.ext}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm leading-[1.3] font-medium">{f.name}</span>
                  <span className="font-mono text-[11px] leading-[1.5] tracking-[0.04em] text-ink-3">
                    {f.size}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                  aria-label={`Remove ${f.name}`}
                  className="cursor-pointer rounded border-0 bg-transparent px-1.5 py-1 text-[16px] text-ink-3 transition-colors hover:bg-err-soft hover:text-err"
                >
                  ×
                </button>
              </div>
            ))}

            {/*
              Said once files are chosen — that is where the expectation of
              something happening to them actually forms.
            */}
            <div
              role="status"
              className="rounded-lg border border-line bg-raised px-4 py-3.5 text-[13px] leading-[1.5] text-ink-2"
            >
              <div className="mb-1 text-[13px] font-semibold text-ink">
                AI generation is unavailable
              </div>
              No cards can be drafted from {files.length === 1 ? 'this file' : 'these files'}.
              Nothing has been uploaded or read — add the cards yourself instead.
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
