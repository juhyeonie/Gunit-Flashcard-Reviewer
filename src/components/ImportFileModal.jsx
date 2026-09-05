import { useEffect, useRef, useState } from 'react'
import Modal from './Modal.jsx'
import Field from './Field.jsx'
import { DRAFTED } from '../data/seed.js'

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
 * Import lives in a modal, never a page. It runs in one of four phases:
 * empty (dropzone) → selected (file list) → loading (simulated drafting) →
 * done (summary). `pendingDeck` means no deck exists yet, so the deck fields
 * appear above the dropzone and the deck is created on confirm.
 */
export default function ImportFileModal({
  open,
  pendingDeck = false,
  initialDraft,
  deckId,
  onClose,
  onCreateDeck,
  onAddCards,
  onOpenDeck,
  say,
}) {
  const [phase, setPhase] = useState('empty')
  const [files, setFiles] = useState([])
  const [pct, setPct] = useState(0)
  const [draft, setDraft] = useState({ title: '', subject: '', desc: '' })
  const [dragging, setDragging] = useState(false)
  const [result, setResult] = useState({ total: 0, title: '' })
  const inputRef = useRef(null)
  const timer = useRef(null)
  const targetDeck = useRef(null)
  const progress = useRef(0)

  useEffect(() => {
    if (!open) return
    setPhase('empty')
    setFiles([])
    setPct(0)
    setDragging(false)
    setResult({ total: 0, title: '' })
    setDraft({
      title: initialDraft?.title ?? '',
      subject: initialDraft?.subject ?? '',
      desc: initialDraft?.desc ?? '',
    })
    targetDeck.current = deckId ?? null
  }, [open, initialDraft, deckId])

  useEffect(() => () => clearInterval(timer.current), [])

  const addFiles = (picked) => {
    const list = Array.from(picked || [])
    if (!list.length) return
    setFiles((f) => [...f, ...list.map(describe)])
    setPhase('selected')
  }

  // Mirrors the prototype's simulated drafting: 11% every 220ms, then the
  // DRAFTED cards land on the target deck.
  //
  // Progress is tracked in a ref rather than read back through a setState
  // updater: the completion step has side effects (it writes cards to the
  // deck), and StrictMode invokes updater functions twice, which would import
  // every card twice over.
  const generate = () => {
    setPhase('loading')
    progress.current = 8
    setPct(8)
    clearInterval(timer.current)
    timer.current = setInterval(() => {
      progress.current += 11
      if (progress.current < 100) {
        setPct(progress.current)
        return
      }
      clearInterval(timer.current)
      setPct(100)
      onAddCards(targetDeck.current, DRAFTED)
      setResult({ total: DRAFTED.length, title: draft.title || 'this deck' })
      setPhase('done')
    }, 220)
  }

  const confirm = () => {
    if (phase === 'loading') return
    if (phase === 'done') {
      onClose()
      onOpenDeck?.(targetDeck.current)
      return
    }
    if (!files.length) {
      say('Add at least one file')
      return
    }
    if (pendingDeck) {
      if (!draft.title.trim()) {
        say('Name the deck first')
        return
      }
      const deck = onCreateDeck({
        title: draft.title,
        subject: draft.subject || 'General',
        desc: draft.desc || 'Drafted from uploaded material.',
      })
      targetDeck.current = deck.id
      setResult((r) => ({ ...r, title: deck.title }))
    }
    generate()
  }

  const set = (key) => (e) => setDraft((d) => ({ ...d, [key]: e.target.value }))

  const confirmLabel =
    phase === 'loading' ? 'Generating…' : phase === 'done' ? 'Open deck' : 'Generate flashcards'

  return (
    <Modal
      open={open}
      onClose={onClose}
      maxWidth={520}
      kicker={pendingDeck ? 'New deck from a file' : 'Import material'}
      title={phase === 'done' ? 'Cards drafted' : 'Import a file'}
      body={
        phase === 'done'
          ? 'They are saved to the deck — open it to edit the wording.'
          : phase === 'loading'
            ? 'Reading your files and drafting cards.'
            : 'Drop a reading, lecture slides or notes and Gunit drafts the cards for you. Nothing leaves your device in this prototype.'
      }
      confirmLabel={confirmLabel}
      confirmDisabled={phase === 'loading'}
      onConfirm={confirm}
    >
      {pendingDeck && phase !== 'done' && (
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
        {phase === 'empty' && (
          <div
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
            className={`flex cursor-pointer flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center transition-colors ${
              dragging ? 'border-accent bg-accent-soft' : 'border-line bg-transparent hover:border-accent hover:bg-accent-soft'
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
              PDF · PPTX · DOCX · TXT — up to 25 MB
            </span>
          </div>
        )}

        {(phase === 'selected' || phase === 'loading') && (
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
                    {phase === 'loading' ? 'Drafting cards…' : f.size}
                  </span>
                  {phase === 'loading' && (
                    <span className="mt-[7px] block h-[3px] overflow-hidden rounded-sm bg-raised">
                      <span
                        className="block h-full bg-accent transition-transform duration-200 ease-linear"
                        style={{ transform: `scaleX(${pct / 100})`, transformOrigin: 'left center' }}
                      />
                    </span>
                  )}
                </span>
                {phase === 'selected' && (
                  <button
                    type="button"
                    onClick={() => {
                      const next = files.filter((_, j) => j !== i)
                      setFiles(next)
                      if (!next.length) setPhase('empty')
                    }}
                    aria-label={`Remove ${f.name}`}
                    className="cursor-pointer rounded border-0 bg-transparent px-1.5 py-1 text-[16px] text-ink-3 transition-colors hover:bg-err-soft hover:text-err"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </>
        )}

        {phase === 'done' && (
          <div className="rounded-lg border border-accent-line bg-accent-soft px-4 py-3.5">
            <div className="mb-1.5 text-[13px] leading-none font-semibold text-accent">
              {result.total} cards drafted
            </div>
            <div className="text-[13px] leading-[1.5] text-ink-2">
              Saved to <em className="font-serif text-sm">{result.title}</em>. Review the wording
              before you study.
            </div>
          </div>
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
