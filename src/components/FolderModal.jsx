import { useState } from 'react'
import Modal from './Modal.jsx'
import Field from './Field.jsx'
import { FOLDER_NAME_MAX } from '../data/normalize.js'
import useT from '../i18n/useT.js'

/**
 * Naming a folder, new or existing. One field, because a folder is only a name.
 *
 * Two folders with the same name are refused. Nothing would break — folders
 * are told apart by id — but two "Biology" folders side by side is a question
 * the reader then has to answer every time they file a deck.
 *
 * Mounted only while open, and keyed by the folder, so the draft starts from
 * useState rather than being reset by an effect — as DeckModal does.
 */
export default function FolderModal({ mode = 'create', folder, folders = [], onClose, onSave }) {
  const { t } = useT()
  const [name, setName] = useState(mode === 'rename' && folder ? folder.name : '')
  const clean = name.trim()
  const isRename = mode === 'rename'

  const taken = folders.some(
    (f) => f.id !== folder?.id && f.name.trim().toLowerCase() === clean.toLowerCase(),
  )
  const unchanged = isRename && clean === folder?.name
  const valid = clean.length > 0 && !taken && !unchanged

  return (
    <Modal
      open
      onClose={onClose}
      kicker={isRename ? t('folderModal.renameKicker') : t('folderModal.newKicker')}
      title={isRename ? t('folderModal.renameTitle') : t('folderModal.newTitle')}
      body={isRename ? t('folderModal.renameBody') : t('folderModal.newBody')}
      confirmLabel={isRename ? t('folderModal.saveName') : t('folderModal.create')}
      confirmDisabled={!valid}
      maxWidth={420}
      onConfirm={() => {
        if (!valid) return
        onSave(clean)
        onClose()
      }}
    >
      <div className="mb-6 flex flex-col gap-2">
        <Field
          id="folder-name"
          label={t('folderModal.name')}
          required
          value={name}
          maxLength={FOLDER_NAME_MAX}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('folderModal.placeholder')}
          aria-invalid={taken || undefined}
          aria-describedby={taken ? 'folder-name-taken' : undefined}
        />
        {taken && (
          <p id="folder-name-taken" className="m-0 fs-13 text-err">
            {t('folderModal.taken', { name: clean })}
          </p>
        )}
      </div>
    </Modal>
  )
}
