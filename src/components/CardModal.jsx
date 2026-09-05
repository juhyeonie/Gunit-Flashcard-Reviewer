import { useEffect, useState } from 'react'
import Modal from './Modal.jsx'
import Field from './Field.jsx'

export default function CardModal({ open, mode = 'new', card, onClose, onSave }) {
  const [draft, setDraft] = useState({ front: '', back: '' })

  useEffect(() => {
    if (!open) return
    setDraft(mode === 'edit' && card ? { front: card.front, back: card.back } : { front: '', back: '' })
  }, [open, mode, card])

  const set = (key) => (e) => setDraft((d) => ({ ...d, [key]: e.target.value }))
  const valid = draft.front.trim() && draft.back.trim()

  return (
    <Modal
      open={open}
      onClose={onClose}
      maxWidth={520}
      kicker={mode === 'edit' ? 'Edit card' : 'New card'}
      title={mode === 'edit' ? 'Edit flashcard' : 'Add a flashcard'}
      body={
        mode === 'edit'
          ? 'Changes apply from the next review onward.'
          : 'Keep the front to one question. The back can carry a sentence of context.'
      }
      confirmLabel={mode === 'edit' ? 'Save card' : 'Add card'}
      confirmDisabled={!valid}
      onConfirm={() => {
        if (!valid) return
        onSave({ front: draft.front.trim(), back: draft.back.trim() })
        onClose()
      }}
    >
      <div className="mb-6 flex flex-col gap-4">
        <Field
          id="card-front"
          label="Front — the question"
          as="textarea"
          rows={2}
          serif
          value={draft.front}
          onChange={set('front')}
          placeholder="What was the cursus honorum?"
          autoFocus
        />
        <Field
          id="card-back"
          label="Back — the answer"
          as="textarea"
          rows={3}
          value={draft.back}
          onChange={set('back')}
          placeholder="The sequence of public offices…"
        />
      </div>
    </Modal>
  )
}
