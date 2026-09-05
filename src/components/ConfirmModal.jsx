import Modal from './Modal.jsx'

/** Destructive confirmations — the prototype tones the confirm button err-red. */
export default function ConfirmModal({ open, kicker, title, body, confirmLabel, onClose, onConfirm }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      maxWidth={420}
      kicker={kicker}
      title={title}
      body={body}
      confirmLabel={confirmLabel}
      confirmVariant="danger"
      onConfirm={() => {
        onConfirm()
        onClose()
      }}
    />
  )
}
