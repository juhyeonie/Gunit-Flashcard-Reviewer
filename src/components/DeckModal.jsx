import { useState } from 'react'
import Modal from './Modal.jsx'
import Button from './Button.jsx'
import Field from './Field.jsx'
import useT from '../i18n/useT.js'

/** Their words are under deckModal.source in the dictionaries. */
const SOURCES = [{ key: 'write' }, { key: 'import' }]

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
export default function DeckModal({
  mode = 'create',
  deck,
  folders = [],
  initialFolderId = null,
  onClose,
  onSave,
  onDelete,
  onRequestImport,
}) {
  const [draft, setDraft] = useState(() =>
    mode === 'edit' && deck
      ? { title: deck.title, subject: deck.subject, desc: deck.desc, folderId: deck.folderId ?? null }
      : { title: '', subject: '', desc: '', folderId: initialFolderId ?? null },
  )
  const [source, setSource] = useState('write')
  const { t } = useT()

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
      kicker={isEdit ? t('deckModal.editKicker') : t('deckModal.newKicker')}
      title={isEdit ? t('deckModal.editTitle') : t('deckModal.newTitle')}
      body={isEdit ? t('deckModal.editBody') : t('deckModal.newBody')}
      confirmLabel={isEdit ? t('common.saveChanges') : t('deckModal.create')}
      secondaryAction={
        isEdit && onDelete ? (
          <Button variant="danger" size="sm" onClick={() => onDelete(deck)}>
            {t('deckModal.delete')}
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
          label={t('deckModal.name')}
          required
          value={draft.title}
          onChange={set('title')}
          placeholder={t('deckModal.namePlaceholder')}
        />
        <Field
          id="deck-subject"
          label={t('deckModal.subject')}
          required
          value={draft.subject}
          onChange={set('subject')}
          placeholder={t('deckModal.subjectPlaceholder')}
        />
        <Field
          id="deck-desc"
          label={t('deckModal.description')}
          optional
          as="textarea"
          rows={3}
          value={draft.desc}
          onChange={set('desc')}
          placeholder={t('deckModal.descriptionPlaceholder')}
        />
        {/*
          Only once there is a folder to choose. A field whose one option is
          "No folder" asks a question nobody can answer, and the modal stays
          exactly as it was for anyone who never makes one.
        */}
        {folders.length > 0 && (
          <Field
            id="deck-folder"
            label={t('deckModal.folder')}
            optional
            as="select"
            value={draft.folderId ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, folderId: e.target.value || null }))}
            className="cursor-pointer"
          >
            <option value="">{t('deckModal.noFolder')}</option>
            {[...folders]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
          </Field>
        )}
      </div>

      {!isEdit && (
        <div className="mt-1 mb-[22px] flex flex-col gap-[9px]">
          <span className="kicker !tracking-[0.12em]">{t('deckModal.fillHow')}</span>
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
                    className={`fs-13 leading-tight font-semibold ${
                      active ? 'text-accent' : 'text-ink'
                    }`}
                  >
                    {t(`deckModal.source.${s.key}.label`)}
                  </span>
                  <span className="text-xs leading-[1.4] text-ink-3 text-pretty">{t(`deckModal.source.${s.key}.hint`)}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </Modal>
  )
}
