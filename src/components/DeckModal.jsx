import { useState } from 'react'
import Modal from './Modal.jsx'
import Button from './Button.jsx'
import Field from './Field.jsx'

const SOURCES = [
  { key: 'write', label: 'Write my own', hint: 'Add cards by hand, one at a time.' },
  { key: 'import', label: 'Import a file', hint: 'Draft cards from notes or slides.' },
]

/**
 * Create and Edit share one modal — the prototype uses the same fields for
 * both, differing only in kicker, title, body and the source picker.
 *
 * In create mode, clicking "Import a file" hands off: this modal closes and the
 * Import modal opens carrying whatever has been typed so far.
 *
 * Mounted only while open, and keyed by the deck being edited, so the draft
 * starts fresh from useState rather than being reset by an effect.
 */
export default function DeckModal({ mode = 'create', deck, onClose, onSave, onDelete, onRequestImport }) {
  const [draft, setDraft] = useState(() =>
    mode === 'edit' && deck
      ? { title: deck.title, subject: deck.subject, desc: deck.desc }
      : { title: '', subject: '', desc: '' },
  )
  const [source, setSource] = useState('write')

  const set = (key) => (e) => setDraft((d) => ({ ...d, [key]: e.target.value }))
  const valid = draft.title.trim() && draft.subject.trim()

  const pickSource = (key) => {
    setSource(key)
    if (key === 'import') onRequestImport?.(draft)
  }

  const isEdit = mode === 'edit'

  return (
    <Modal
      open
      onClose={onClose}
      kicker={isEdit ? 'Edit deck' : 'New deck'}
      title={isEdit ? 'Deck details' : 'Create a deck'}
      body={
        isEdit
          ? 'Renaming a deck keeps all of its cards and review history.'
          : 'Name it, then choose how its cards get written.'
      }
      confirmLabel={isEdit ? 'Save changes' : 'Create deck'}
      secondaryAction={
        isEdit && onDelete ? (
          <Button variant="danger" size="sm" onClick={() => onDelete(deck)}>
            Delete deck
          </Button>
        ) : null
      }
      confirmDisabled={!valid}
      onConfirm={() => {
        if (!valid) return
        onSave(draft)
        onClose()
      }}
    >
      <div className="mb-6 flex flex-col gap-4">
        <Field
          id="deck-title"
          label="Deck name"
          required
          value={draft.title}
          onChange={set('title')}
          placeholder="e.g. Roman Provinces"
          // Moving focus into a dialog on open is the expected behaviour here.
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
        />
        <Field
          id="deck-subject"
          label="Subject"
          required
          value={draft.subject}
          onChange={set('subject')}
          placeholder="Ancient Rome"
        />
        <Field
          id="deck-desc"
          label="Description"
          optional
          as="textarea"
          rows={3}
          value={draft.desc}
          onChange={set('desc')}
          placeholder="What this deck covers"
        />
      </div>

      {!isEdit && (
        <div className="mt-1 mb-[22px] flex flex-col gap-[9px]">
          <span className="kicker !tracking-[0.12em]">Then, how do you want to fill it?</span>
          <div className="grid grid-cols-2 gap-2">
            {SOURCES.map((s) => {
              const active = source === s.key
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => pickSource(s.key)}
                  className={`flex cursor-pointer flex-col gap-1.5 rounded-[7px] border p-3.5 text-left transition-colors hover:border-ink-3 ${
                    active ? 'border-accent bg-accent-soft' : 'border-line bg-transparent'
                  }`}
                >
                  <span
                    className={`text-[13px] leading-tight font-semibold ${
                      active ? 'text-accent' : 'text-ink'
                    }`}
                  >
                    {s.label}
                  </span>
                  <span className="text-xs leading-[1.4] text-ink-3 text-pretty">{s.hint}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </Modal>
  )
}
