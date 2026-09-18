import { useState } from 'react'
import Modal from './Modal.jsx'
import { FolderIcon } from './Icons.jsx'

/**
 * Where a deck lives: one of the folders, or none.
 *
 * A list of choices rather than a dropdown, because the choice is the whole of
 * the dialog and every option should be visible at once. "Ungrouped" is first
 * and always there, so taking a deck out of a folder is the same gesture as
 * putting it in one.
 *
 * Moving changes the deck's folder and nothing else: its cards, its schedule
 * and its history go with it untouched.
 */
export default function MoveDeckModal({ deck, folders = [], onClose, onMove }) {
  const [target, setTarget] = useState(deck?.folderId ?? null)
  const current = deck?.folderId ?? null

  const options = [
    { id: null, name: 'Ungrouped', hint: 'Not in any folder' },
    ...[...folders]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((f) => ({ id: f.id, name: f.name, hint: null })),
  ]

  return (
    <Modal
      open
      onClose={onClose}
      kicker="Move deck"
      title={`Move “${deck?.title ?? ''}”`}
      body={
        folders.length
          ? 'Its cards and review history come with it.'
          : 'There are no folders yet. Make one from the library, then file decks in it here.'
      }
      confirmLabel="Move deck"
      confirmDisabled={target === current}
      maxWidth={420}
      onConfirm={() => {
        if (target === current) return
        onMove(target)
        onClose()
      }}
    >
      <fieldset className="m-0 mb-6 flex flex-col gap-1.5 border-0 p-0">
        <legend className="kicker mb-2.5 !tracking-[0.12em]">Folder</legend>
        {options.map((option) => {
          const checked = target === option.id
          return (
            <label
              key={option.id ?? 'ungrouped'}
              className={`flex cursor-pointer items-center gap-3 rounded-[7px] border px-3.5 py-3 transition-colors hover:border-ink-3 ${
                checked ? 'border-accent bg-accent-soft' : 'border-line bg-transparent'
              }`}
            >
              <input
                type="radio"
                name="deck-folder"
                checked={checked}
                onChange={() => setTarget(option.id)}
                className="accent-[var(--color-accent)]"
              />
              <span className={option.id ? 'text-ink-2' : 'text-ink-3'}>
                <FolderIcon />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{option.name}</span>
                {option.hint && <span className="text-xs text-ink-3">{option.hint}</span>}
              </span>
              {option.id === current && (
                <span className="kicker shrink-0 !tracking-[0.1em]">Now</span>
              )}
            </label>
          )
        })}
      </fieldset>
    </Modal>
  )
}
