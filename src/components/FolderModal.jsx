import { useState } from 'react'
import Modal from './Modal.jsx'
import Field from './Field.jsx'
import { FOLDER_NAME_MAX } from '../data/normalize.js'

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
      kicker={isRename ? 'Rename folder' : 'New folder'}
      title={isRename ? 'Rename this folder' : 'Create a folder'}
      body={
        isRename
          ? 'Every deck in it moves with it — nothing else changes.'
          : 'Group decks by course, term or anything else. A deck can sit in one folder, or in none.'
      }
      confirmLabel={isRename ? 'Save name' : 'Create folder'}
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
          label="Folder name"
          required
          value={name}
          maxLength={FOLDER_NAME_MAX}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Biology 101"
          aria-invalid={taken || undefined}
          aria-describedby={taken ? 'folder-name-taken' : undefined}
        />
        {taken && (
          <p id="folder-name-taken" className="m-0 text-[13px] text-err">
            There is already a folder called “{clean}”.
          </p>
        )}
      </div>
    </Modal>
  )
}
