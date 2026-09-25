import { useCallback, useState } from 'react'
import Modal from './Modal.jsx'
import { dismissWhatsNew, launchWhatsNew, sectionsOf } from '../data/whatsNew.js'

/** One version's notes: a heading per category that has anything, and its items. */
function Sections({ entry, headingLevel }) {
  const Heading = `h${headingLevel}`
  return sectionsOf(entry).map((section) => (
    <section key={section.key} aria-labelledby={`whats-new-${entry.version}-${section.key}`}>
      <Heading
        id={`whats-new-${entry.version}-${section.key}`}
        className="kicker m-0 mb-2.5 !tracking-[0.12em]"
      >
        {section.label}
      </Heading>
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
        {section.items.map((item) => (
          <li key={item.title} className="flex gap-2.5">
            <span aria-hidden="true" className="w-3 shrink-0 font-mono text-[13px] leading-[1.45] text-accent">
              +
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm leading-[1.45] font-medium text-ink text-pretty">{item.title}</span>
              {item.detail && <span className="text-[13px] leading-[1.45] text-ink-2 text-pretty">{item.detail}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  ))
}

/**
 * What changed, shown once on the first launch of a new version.
 *
 * Only the layout lives here. What it says comes in as `entries` — read from
 * src/data/releaseNotes.js by default — so a release is announced by adding
 * notes there, never by editing this.
 *
 * Every way out counts as having read it — Got it, the close button, Escape,
 * the backdrop — because there is nothing else to do with it, and asking again
 * next launch would be the nag this is meant not to be.
 */
export function WhatsNewDialog({ version, entries, onClose }) {
  if (!entries.length) return null
  const several = entries.length > 1

  return (
    <Modal
      open
      onClose={onClose}
      kicker={`Gunit v${version}`}
      title="What’s new"
      body={several ? 'A few updates since you last opened Gunit.' : undefined}
      confirmLabel="Got it"
      onConfirm={onClose}
      cancelLabel={null}
      maxWidth={460}
    >
      <div className="mb-6 flex flex-col gap-5">
        {several
          ? entries.map((entry) => (
              <div key={entry.version} className="flex flex-col gap-4 border-t border-line-soft pt-4 first:border-t-0 first:pt-0">
                <h3 className="m-0 font-mono text-[11px] leading-none font-medium tracking-[0.06em] text-ink-3">
                  Version {entry.version}
                </h3>
                <Sections entry={entry} headingLevel={4} />
              </div>
            ))
          : <Sections entry={entries[0]} headingLevel={3} />}
      </div>
    </Modal>
  )
}

/**
 * The dialog on launch, if this launch has anything to announce. Decided once
 * per page load, from what is in storage before the app writes to it.
 */
export default function WhatsNewModal() {
  const [launch, setLaunch] = useState(() => launchWhatsNew())

  const close = useCallback(() => {
    dismissWhatsNew(launch.version)
    setLaunch((l) => ({ ...l, entries: [] }))
  }, [launch.version])

  return <WhatsNewDialog version={launch.version} entries={launch.entries} onClose={close} />
}
