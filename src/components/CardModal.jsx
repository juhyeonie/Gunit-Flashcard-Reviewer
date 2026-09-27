import { useState } from 'react'
import Modal from './Modal.jsx'
import Field from './Field.jsx'
import useT from '../i18n/useT.js'

/**
 * Mounted only while open, and keyed by the card being edited, so the draft
 * starts fresh from useState rather than being reset by an effect.
 */
export default function CardModal({ mode = 'new', card, onClose, onSave }) {
  const { t } = useT()
  const [draft, setDraft] = useState(() =>
    mode === 'edit' && card ? { front: card.front, back: card.back } : { front: '', back: '' },
  )

  const set = (key) => (e) => setDraft((d) => ({ ...d, [key]: e.target.value }))
  const valid = draft.front.trim() && draft.back.trim()

  return (
    <Modal
      open
      onClose={onClose}
      maxWidth={520}
      kicker={mode === 'edit' ? t('cardModal.editKicker') : t('cardModal.newKicker')}
      title={mode === 'edit' ? t('cardModal.editTitle') : t('cardModal.newTitle')}
      body={mode === 'edit' ? t('cardModal.editBody') : t('cardModal.newBody')}
      confirmLabel={mode === 'edit' ? t('cardModal.save') : t('cardModal.add')}
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
          label={t('cardModal.front')}
          as="textarea"
          rows={2}
          serif
          value={draft.front}
          onChange={set('front')}
          placeholder={t('cardModal.frontPlaceholder')}
        />
        <Field
          id="card-back"
          label={t('cardModal.back')}
          as="textarea"
          rows={3}
          value={draft.back}
          onChange={set('back')}
          placeholder={t('cardModal.backPlaceholder')}
        />
      </div>
    </Modal>
  )
}
