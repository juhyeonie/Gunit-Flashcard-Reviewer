import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Button from '../components/Button.jsx'
import Menu, { MenuItem } from '../components/Menu.jsx'
import Modal from '../components/Modal.jsx'
import CardModal from '../components/CardModal.jsx'
import ConfirmModal from '../components/ConfirmModal.jsx'
import Mascot from '../components/Mascot.jsx'
import ProgressBar from '../components/ProgressBar.jsx'
import { useApp } from '../data/useApp.js'
import { useShared } from '../data/sharedContext.js'
import { dueCount, entryFor, isSuspended } from '../data/scheduler.js'
import { MIN_QUIZ_CARDS, canQuiz } from '../data/quiz.js'
import { formatRelative } from '../data/activity.js'
import { accentOf } from '../data/seed.js'
import useDocumentTitle from '../hooks/useDocumentTitle.js'

const ROLE_LABEL = { owner: 'Yours', editor: 'Can edit', viewer: 'Can study' }

const stamp = (iso) => {
  const ms = iso ? Date.parse(iso) : NaN
  return Number.isNaN(ms) ? null : ms
}

/** Who shared it and what the reader may do with it, in one line. */
function Byline({ owner, role }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
      <span>{role === 'owner' ? 'Shared by you' : `Shared by ${owner}`}</span>
      <span
        className={`rounded-[5px] border px-2 py-[5px] font-mono text-[10px] leading-none font-medium tracking-[0.06em] whitespace-nowrap uppercase ${
          role === 'viewer' ? 'border-line text-ink-3' : 'border-accent-line bg-accent-soft text-accent'
        }`}
      >
        {ROLE_LABEL[role] ?? ROLE_LABEL.viewer}
      </span>
    </div>
  )
}

function Stats({ items }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-0.5">
      {items.map((s) => (
        <div key={s.label} className="py-0.5 pr-5">
          <div
            className="mb-[7px] font-serif text-[26px] leading-none"
            style={s.accent ? { color: 'var(--color-accent)' } : undefined}
          >
            {s.value}
          </div>
          <div className="kicker !tracking-[0.12em]">{s.label}</div>
        </div>
      ))}
    </div>
  )
}

/** Said once, near the top: the thing a reader most needs to trust about this. */
function Notes({ shared, noun }) {
  return (
    <>
      {shared.isOwner && (
        <p className="m-0 rounded-[10px] border border-line bg-surface px-4 py-3 text-[13px] text-ink-2 text-pretty">
          This is your {noun}, as the people you shared it with see it. They get the cards, never your
          progress. Change who has it from Share on your own {noun}.
        </p>
      )}
      {shared.offline && (
        <p
          role="status"
          className="m-0 rounded-[10px] border border-dashed border-line px-4 py-3 text-[13px] text-ink-2"
        >
          You’re offline — this is the copy saved on this device. Your progress is kept and goes up when
          you reconnect.
        </p>
      )}
    </>
  )
}

/**
 * Add to My Gunit, for someone not signed in. The copy can live in this
 * browser as the rest of a guest's decks do, or in an account; they choose.
 */
function GuestCopyModal({ title, signInPath, onClose, onConfirm }) {
  return (
    <Modal
      open
      onClose={onClose}
      kicker="Add to My Gunit"
      title={`Add “${title}”?`}
      body="You’re not signed in, so the copy stays in this browser, with your other decks here. Sign in first to keep it in your account and on your other devices."
      confirmLabel="Add to this browser"
      cancelLabel="Not now"
      onConfirm={() => {
        onClose()
        onConfirm()
      }}
      secondaryAction={
        <Button as={Link} to={signInPath} size="sm" variant="ghost">
          Sign in
        </Button>
      }
      maxWidth={440}
    />
  )
}

/** A deck shared on its own, or one opened from a shared folder. */
export function SharedDeckView() {
  const { id } = useParams()
  const shared = useShared()
  const { say } = useApp()
  const navigate = useNavigate()
  const deck = id ? shared.decks.find((d) => d.id === id) : shared.decks[0]
  const { answer, role } = shared
  useDocumentTitle(deck ? `${deck.title} — shared` : 'Shared deck')

  const [studyMenu, setStudyMenu] = useState(false)
  const [moreMenu, setMoreMenu] = useState(false)
  const [cardMenu, setCardMenu] = useState(null)
  const [dialog, setDialog] = useState(null)

  if (!deck) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center py-20 text-center">
        <Mascot pose="thinking" size={96} className="mb-5" />
        <div className="font-serif text-2xl">That deck is no longer in this share.</div>
        <p className="mt-3 mb-0 text-sm text-ink-2">It may have been moved out of the folder, or deleted.</p>
        <Button as={Link} to={shared.base} className="mt-5">
          Back to {answer?.kind === 'folder' ? answer.name : 'the share'}
        </Button>
      </div>
    )
  }

  const canEdit = (role === 'editor' || role === 'owner') && shared.signedIn && !shared.offline
  const hasCards = deck.cards.length > 0
  const due = dueCount(deck)
  const inFolder = answer.kind === 'folder'
  const mine = shared.copyOf(deck.id)

  const startStudy = (mode) => {
    setStudyMenu(false)
    if (!hasCards) {
      say('There are no cards in this deck yet')
      return
    }
    if (mode === 'quiz' && !canQuiz(deck)) {
      say(`A quiz needs ${MIN_QUIZ_CARDS} cards — this deck has ${deck.cards.length}`)
      return
    }
    shared.study(deck.id, mode)
  }

  const copy = () => {
    const [[, ownId]] = shared.addToMine([deck])
    say(`Added “${deck.title}” to My Gunit`)
    navigate(`/decks/${ownId}`)
  }
  const askCopy = () => (shared.signedIn || !shared.accounts ? copy() : setDialog({ kind: 'guest-copy' }))

  const saveCard = async (card, index) => {
    const existing = index == null ? null : deck.cards[index]
    const position = existing ? index : shared.nextPosition(deck.id)
    const ok = await shared.editCards(deck.id, [
      { id: existing?.id ?? globalThis.crypto.randomUUID(), front: card.front, back: card.back, position },
    ])
    if (ok) say(existing ? 'Card saved for everyone' : 'Card added for everyone')
  }

  return (
    <div className="rise-in mx-auto flex max-w-[1000px] flex-col gap-[30px]">
      <Link
        to={inFolder ? shared.base : shared.signedIn ? '/shared' : '/'}
        className="self-start border-0 bg-transparent p-0 text-xs font-medium whitespace-nowrap text-ink-3 transition-colors hover:text-ink"
      >
        ← {inFolder ? answer.name : shared.signedIn ? 'Shared with me' : 'Gunit'}
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-[22px] border-b border-line pb-[26px]">
        <div className="min-w-0 max-w-[560px]">
          <div className="kicker mb-3.5">{deck.subject}</div>
          <h1 className="m-0 mb-3 min-w-0 font-serif text-[32px] leading-[1.05] tracking-[-0.02em] text-pretty sm:text-[42px]">
            {deck.title}
          </h1>
          <div className="mb-3">
            <Byline owner={answer.owner_name} role={role} />
          </div>
          {deck.desc && <p className="m-0 text-[15px] text-ink-2 text-pretty">{deck.desc}</p>}
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Button
              variant={hasCards ? 'primary' : 'outline'}
              onClick={() => setStudyMenu((v) => !v)}
              aria-expanded={studyMenu}
              aria-haspopup="true"
            >
              <span>Study shared version</span>
              <span className="text-[10px] opacity-70">▾</span>
            </Button>
            <Menu open={studyMenu} onClose={() => setStudyMenu(false)} align="responsive">
              <MenuItem title="Flashcards" hint="Your own schedule — private to you." onClick={() => startStudy('review')} />
              <MenuItem title="Quiz" hint="Answer multiple choice and get scored." onClick={() => startStudy('quiz')} />
            </Menu>
          </div>

          {shared.isOwner ? (
            <Button as={Link} to={`/decks/${deck.id}`} variant="outline">
              Open in My decks
            </Button>
          ) : mine ? (
            <Button as={Link} to={`/decks/${mine}`} variant="outline">
              Open your copy
            </Button>
          ) : (
            <Button variant="outline" onClick={askCopy}>
              Add to My Gunit
            </Button>
          )}

          {(canEdit || mine || (shared.signedIn && !shared.isOwner && !inFolder && !shared.offline)) && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setMoreMenu((v) => !v)}
                title="More"
                aria-label="More options"
                aria-expanded={moreMenu}
                aria-haspopup="true"
                className={`grid h-[42px] w-[42px] cursor-pointer place-items-center rounded-lg border bg-transparent p-0 text-[15px] leading-none text-ink-3 transition-colors hover:border-ink-3 hover:bg-raised hover:text-ink ${
                  moreMenu ? 'border-ink-3 bg-raised' : 'border-line'
                }`}
              >
                ⋮
              </button>
              <Menu open={moreMenu} onClose={() => setMoreMenu(false)} align="right" width={250}>
                {canEdit && (
                  <MenuItem
                    title="Add a card"
                    hint="Everyone with this deck sees it."
                    onClick={() => {
                      setMoreMenu(false)
                      setDialog({ kind: 'card-new' })
                    }}
                  />
                )}
                {mine && (
                  <MenuItem
                    title="Add another copy"
                    hint="You already have one in My Gunit."
                    onClick={() => {
                      setMoreMenu(false)
                      askCopy()
                    }}
                  />
                )}
                {shared.signedIn && !shared.isOwner && !inFolder && !shared.offline &&
                  (shared.joined ? (
                    <MenuItem
                      title="Remove from Shared with me"
                      hint="Your copy, if you made one, stays."
                      danger
                      onClick={() => {
                        setMoreMenu(false)
                        shared.leave()
                      }}
                    />
                  ) : (
                    <MenuItem
                      title="Save to Shared with me"
                      hint="Find it again from the Shared tab."
                      onClick={async () => {
                        setMoreMenu(false)
                        if (await shared.join()) say('Saved to Shared with me')
                      }}
                    />
                  ))}
              </Menu>
            </div>
          )}
        </div>
      </header>

      <Notes shared={shared} noun="deck" />

      <Stats
        items={[
          { label: 'Cards', value: String(deck.cards.length) },
          // The owner's own schedule is on their own deck, not here: counting
          // theirs from this page's empty store would say every card is due.
          ...(shared.isOwner
            ? []
            : [
                { label: 'Due for you', value: String(due), accent: due > 0 },
                { label: 'You know', value: `${Math.round(deck.progress * 100)}%` },
              ]),
          { label: 'Updated', value: formatRelative(stamp(deck.updatedAt)) },
        ]}
      />

      {hasCards ? (
        <ul className="flex flex-col gap-2.5">
          {deck.cards.map((card, i) => {
            const off = isSuspended(entryFor(deck, card))
            return (
              <li
                key={card.id}
                className={`relative flex flex-col gap-3.5 rounded-xl border bg-surface px-[22px] py-5 shadow-sh1 ${
                  off ? 'border-dashed border-line-soft' : 'border-line'
                }`}
              >
                <div className="flex items-start gap-[18px]">
                  <span className="w-[26px] shrink-0 pt-1 font-mono text-[11px] leading-[1.5] font-medium tracking-[0.06em] text-ink-3">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div className={`min-w-0 flex-1 font-serif text-[19px] leading-[1.32] text-pretty ${off ? 'text-ink-3' : ''}`}>
                    {card.front}
                  </div>
                  <div className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() => setCardMenu(cardMenu === i ? null : i)}
                      title="Card options"
                      aria-label="Card options"
                      className={`grid h-7 w-7 cursor-pointer place-items-center rounded-[5px] border bg-transparent text-sm leading-none font-medium text-ink-3 transition-colors hover:border-ink-3 hover:text-ink ${
                        cardMenu === i ? 'border-ink-3 bg-raised' : 'border-line'
                      }`}
                    >
                      ⋮
                    </button>
                    <Menu open={cardMenu === i} onClose={() => setCardMenu(null)} width={220}>
                      {canEdit && (
                        <MenuItem
                          title="Edit card"
                          hint="For everyone with this deck."
                          onClick={() => {
                            setCardMenu(null)
                            setDialog({ kind: 'card-edit', index: i, card })
                          }}
                        />
                      )}
                      <SuspendItem deck={deck} card={card} off={off} index={i} close={() => setCardMenu(null)} />
                      {canEdit && (
                        <MenuItem
                          title="Delete card"
                          hint="For everyone with this deck."
                          danger
                          onClick={() => {
                            setCardMenu(null)
                            setDialog({ kind: 'card-delete', card })
                          }}
                        />
                      )}
                    </Menu>
                  </div>
                </div>
                <div className={`border-t border-line-soft pt-3.5 text-sm leading-[1.55] text-pretty sm:pl-11 ${off ? 'text-ink-3' : 'text-ink-2'}`}>
                  {card.back}
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="flex flex-col items-center gap-3.5 rounded-[14px] border border-dashed border-line px-5 py-[70px] text-center">
          <Mascot pose="thinking" size={92} className="mb-1" />
          <div className="font-serif text-[24px] leading-[1.2]">No cards yet</div>
          <p className="m-0 max-w-[360px] text-sm text-ink-3 text-pretty">
            {canEdit ? 'Add the first card — everyone with this deck will see it.' : 'Cards the owner adds will appear here.'}
          </p>
          {canEdit && (
            <Button size="sm" onClick={() => setDialog({ kind: 'card-new' })}>
              Add a card
            </Button>
          )}
        </div>
      )}

      {(dialog?.kind === 'card-new' || dialog?.kind === 'card-edit') && (
        <CardModal
          key={dialog.kind === 'card-edit' ? `shared-card-${dialog.card.id}` : 'shared-card-new'}
          mode={dialog.kind === 'card-edit' ? 'edit' : 'new'}
          card={dialog.card}
          onClose={() => setDialog(null)}
          onSave={(card) => saveCard(card, dialog.kind === 'card-edit' ? dialog.index : null)}
        />
      )}

      <ConfirmModal
        open={dialog?.kind === 'card-delete'}
        kicker="Delete card"
        title="Delete this card for everyone?"
        body="It comes out of the shared deck for everyone who studies it, the owner included. Copies people already made keep theirs."
        confirmLabel="Delete card"
        onClose={() => setDialog(null)}
        onConfirm={async () => {
          if (await shared.editCards(deck.id, [], [dialog.card.id])) say('Card deleted for everyone')
        }}
      />

      {dialog?.kind === 'guest-copy' && (
        <GuestCopyModal
          title={deck.title}
          signInPath={shared.signInPath}
          onClose={() => setDialog(null)}
          onConfirm={copy}
        />
      )}
    </div>
  )
}

/** Suspending is the reader's own business, whatever their role. */
function SuspendItem({ deck, card, off, index, close }) {
  const { setCardSuspended, say } = useApp()
  return (
    <MenuItem
      title={off ? 'Unsuspend for me' : 'Suspend for me'}
      hint={off ? 'Back into your rotation.' : 'Only your rotation. Nobody else’s changes.'}
      onClick={() => {
        close()
        setCardSuspended(deck.id, card.id, !off)
        say(off ? `Card ${index + 1} is back in your rotation` : `Card ${index + 1} suspended for you`)
      }}
    />
  )
}

/** A folder shared whole: what is in it, and a way into each deck. */
export function SharedFolderView() {
  const shared = useShared()
  const { say } = useApp()
  const navigate = useNavigate()
  const { answer, decks, role } = shared
  const [dialog, setDialog] = useState(null)
  useDocumentTitle(`${answer.name} — shared`)

  const cards = decks.reduce((n, d) => n + d.cards.length, 0)
  const updated = decks.reduce((latest, d) => Math.max(latest, stamp(d.updatedAt) ?? 0), 0) || null
  const toCopy = decks.filter((d) => !shared.copyOf(d.id))

  const copy = () => {
    shared.addToMine(toCopy, answer.name)
    say(
      toCopy.length === 1
        ? `Added 1 deck to “${answer.name}” in My Gunit`
        : `Added ${toCopy.length} decks to “${answer.name}” in My Gunit`,
    )
    navigate('/decks')
  }
  const askCopy = () => (shared.signedIn || !shared.accounts ? copy() : setDialog('guest-copy'))

  return (
    <div className="rise-in mx-auto flex max-w-[1000px] flex-col gap-[30px]">
      <Link
        to={shared.signedIn ? '/shared' : '/'}
        className="self-start border-0 bg-transparent p-0 text-xs font-medium whitespace-nowrap text-ink-3 transition-colors hover:text-ink"
      >
        ← {shared.signedIn ? 'Shared with me' : 'Gunit'}
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-[22px] border-b border-line pb-[26px]">
        <div className="min-w-0 max-w-[560px]">
          <div className="kicker mb-3.5">Shared folder</div>
          <h1 className="m-0 mb-3 font-serif text-[32px] leading-[1.05] tracking-[-0.02em] text-pretty sm:text-[42px]">
            {answer.name}
          </h1>
          <Byline owner={answer.owner_name} role={role} />
        </div>
        <div className="flex flex-wrap gap-2">
          {shared.isOwner ? (
            <Button as={Link} to="/decks" variant="outline">
              Open in My decks
            </Button>
          ) : toCopy.length ? (
            <Button onClick={askCopy} disabled={!decks.length}>
              {toCopy.length === decks.length ? 'Add all to My Gunit' : `Add the ${toCopy.length} new to My Gunit`}
            </Button>
          ) : (
            <Button as={Link} to="/decks" variant="outline">
              All in My Gunit
            </Button>
          )}
          {shared.signedIn && !shared.isOwner && !shared.offline &&
            (shared.joined ? (
              <Button variant="ghost" onClick={() => shared.leave()}>
                Remove from Shared with me
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={async () => {
                  if (await shared.join()) say('Saved to Shared with me')
                }}
              >
                Save to Shared with me
              </Button>
            ))}
        </div>
      </header>

      <Notes shared={shared} noun="folder" />

      <Stats
        items={[
          { label: 'Decks', value: String(decks.length) },
          { label: 'Cards', value: String(cards) },
          { label: 'Updated', value: formatRelative(updated) },
        ]}
      />

      {decks.length ? (
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-4 p-0">
          {decks.map((deck) => {
            const accent = accentOf(deck)
            const pct = Math.round(deck.progress * 100)
            const due = dueCount(deck)
            return (
              <li key={deck.id}>
                <article className="relative flex h-full flex-col gap-4 overflow-hidden rounded-[14px] border border-line bg-surface p-[22px] text-ink shadow-sh1 transition-[border-color,box-shadow,background-color] duration-200 hover:border-ink-3 hover:bg-raised hover:shadow-sh2 has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-accent">
                  <div className="absolute top-0 right-0 left-0 h-[3px]" style={{ background: accent }} />
                  <div className="flex items-center gap-2 pt-0.5">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: accent }} />
                    <span className="kicker !tracking-[0.12em] truncate">{deck.subject}</span>
                    {shared.copyOf(deck.id) && <span className="kicker ml-auto shrink-0 !tracking-[0.1em]">Copied</span>}
                  </div>
                  <h2 className="m-0 font-serif text-[23px] leading-[1.2] font-normal text-pretty">
                    <Link
                      to={shared.deckPath(deck.id)}
                      className="cursor-pointer text-inherit no-underline after:absolute after:inset-0 after:content-['']"
                    >
                      {deck.title}
                    </Link>
                  </h2>
                  <div className="mt-auto flex flex-col gap-[9px]">
                    <div className="flex justify-between font-mono text-[10px] leading-none font-medium tracking-[0.06em] text-ink-3">
                      <span>{deck.cards.length ? `${deck.cards.length} cards` : 'No cards'}</span>
                      {!shared.isOwner && (
                        <span style={due ? { color: 'var(--color-accent)' } : undefined}>
                          {due ? `${due} due for you` : `${pct}% known`}
                        </span>
                      )}
                    </div>
                    {!shared.isOwner && (
                      <ProgressBar value={pct} accent={accent} label={`${deck.title}: your progress`} />
                    )}
                  </div>
                </article>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="flex flex-col items-center gap-3.5 rounded-[14px] border border-dashed border-line px-5 py-[70px] text-center">
          <Mascot pose="thinking" size={92} className="mb-1" />
          <div className="font-serif text-[24px] leading-[1.2]">No decks in this folder yet</div>
          <p className="m-0 max-w-[360px] text-sm text-ink-3 text-pretty">
            Decks the owner files here will appear for you too.
          </p>
        </div>
      )}

      {dialog === 'guest-copy' && (
        <GuestCopyModal
          title={answer.name}
          signInPath={shared.signInPath}
          onClose={() => setDialog(null)}
          onConfirm={copy}
        />
      )}
    </div>
  )
}
