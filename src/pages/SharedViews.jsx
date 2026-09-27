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
import useT from '../i18n/useT.js'

/** sharedViews.role.<role> in the dictionaries. */
const ROLES = ['owner', 'editor', 'viewer']

const stamp = (iso) => {
  const ms = iso ? Date.parse(iso) : NaN
  return Number.isNaN(ms) ? null : ms
}

/** Who shared it and what the reader may do with it, in one line. */
function Byline({ owner, role }) {
  const { t } = useT()
  return (
    <div className="flex flex-wrap items-center gap-2 fs-13 text-ink-2">
      <span>{role === 'owner' ? t('sharedViews.byYou') : t('sharedViews.by', { name: owner })}</span>
      <span
        className={`rounded-[5px] border px-2 py-[5px] font-mono fs-10 leading-none font-medium tracking-[0.06em] whitespace-nowrap uppercase ${
          role === 'viewer' ? 'border-line text-ink-3' : 'border-accent-line bg-accent-soft text-accent'
        }`}
      >
        {t(`sharedViews.role.${ROLES.includes(role) ? role : 'viewer'}`)}
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
            className="mb-[7px] font-serif fs-26 leading-none"
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
  const { t } = useT()
  return (
    <>
      {shared.isOwner && (
        <p className="m-0 rounded-[10px] border border-line bg-surface px-4 py-3 fs-13 text-ink-2 text-pretty">
          {t(`sharedViews.yours.${noun}`)}
        </p>
      )}
      {shared.offline && (
        <p
          role="status"
          className="m-0 rounded-[10px] border border-dashed border-line px-4 py-3 fs-13 text-ink-2"
        >
          {t('sharedViews.offline')}
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
  const { t } = useT()
  return (
    <Modal
      open
      onClose={onClose}
      kicker={t('sharedViews.addToMine')}
      title={t('sharedViews.guestTitle', { title })}
      body={t('sharedViews.guestBody')}
      confirmLabel={t('sharedViews.addHere')}
      cancelLabel={t('common.notNow')}
      onConfirm={() => {
        onClose()
        onConfirm()
      }}
      secondaryAction={
        <Button as={Link} to={signInPath} size="sm" variant="ghost">
          {t('common.signIn')}
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
  const { t } = useT()
  useDocumentTitle(deck ? t('sharedViews.docTitle', { title: deck.title }) : t('sharedArea.title.deck'))

  const [studyMenu, setStudyMenu] = useState(false)
  const [moreMenu, setMoreMenu] = useState(false)
  const [cardMenu, setCardMenu] = useState(null)
  const [dialog, setDialog] = useState(null)

  if (!deck) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center py-20 text-center">
        <Mascot pose="thinking" size={96} className="mb-5" />
        <div className="font-serif text-2xl">{t('sharedViews.goneTitle')}</div>
        <p className="mt-3 mb-0 text-sm text-ink-2">{t('sharedViews.goneBody')}</p>
        <Button as={Link} to={shared.base} className="mt-5">
          {answer?.kind === 'folder' ? t('sharedViews.backTo', { name: answer.name }) : t('sharedViews.backToShare')}
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
      say(t('sharedViews.noCardsYet'))
      return
    }
    if (mode === 'quiz' && !canQuiz(deck)) {
      say(t('deckDetail.quizNeeds', { min: MIN_QUIZ_CARDS, count: deck.cards.length }))
      return
    }
    shared.study(deck.id, mode)
  }

  const copy = () => {
    const [[, ownId]] = shared.addToMine([deck])
    say(t('sharedViews.added', { title: deck.title }))
    navigate(`/decks/${ownId}`)
  }
  const askCopy = () => (shared.signedIn || !shared.accounts ? copy() : setDialog({ kind: 'guest-copy' }))

  const saveCard = async (card, index) => {
    const existing = index == null ? null : deck.cards[index]
    const position = existing ? index : shared.nextPosition(deck.id)
    const ok = await shared.editCards(deck.id, [
      { id: existing?.id ?? globalThis.crypto.randomUUID(), front: card.front, back: card.back, position },
    ])
    if (ok) say(existing ? t('sharedViews.cardSaved') : t('sharedViews.cardAdded'))
  }

  return (
    <div className="rise-in mx-auto flex max-w-[1000px] flex-col gap-[30px]">
      <Link
        to={inFolder ? shared.base : shared.signedIn ? '/shared' : '/'}
        className="self-start border-0 bg-transparent p-0 text-xs font-medium whitespace-nowrap text-ink-3 transition-colors hover:text-ink"
      >
        ← {inFolder ? answer.name : shared.signedIn ? t('sharedWithMe.title') : 'Gunit'}
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-[22px] border-b border-line pb-[26px]">
        <div className="min-w-0 max-w-[560px]">
          <div className="kicker mb-3.5">{deck.subject}</div>
          <h1 className="m-0 mb-3 min-w-0 font-serif fs-32 leading-[1.05] tracking-[-0.02em] text-pretty sm:fs-42">
            {deck.title}
          </h1>
          <div className="mb-3">
            <Byline owner={answer.owner_name} role={role} />
          </div>
          {deck.desc && <p className="m-0 fs-15 text-ink-2 text-pretty">{deck.desc}</p>}
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Button
              variant={hasCards ? 'primary' : 'outline'}
              onClick={() => setStudyMenu((v) => !v)}
              aria-expanded={studyMenu}
              aria-haspopup="true"
            >
              <span>{t('sharedViews.study')}</span>
              <span className="fs-10 opacity-70">▾</span>
            </Button>
            <Menu open={studyMenu} onClose={() => setStudyMenu(false)} align="responsive">
              <MenuItem
                title={t('deckDetail.flashcards')}
                hint={t('sharedViews.flashcardsHint')}
                onClick={() => startStudy('review')}
              />
              <MenuItem title={t('deckDetail.quiz')} hint={t('deckDetail.quizHint')} onClick={() => startStudy('quiz')} />
            </Menu>
          </div>

          {shared.isOwner ? (
            <Button as={Link} to={`/decks/${deck.id}`} variant="outline">
              {t('sharedViews.openMine')}
            </Button>
          ) : mine ? (
            <Button as={Link} to={`/decks/${mine}`} variant="outline">
              {t('sharedViews.openCopy')}
            </Button>
          ) : (
            <Button variant="outline" onClick={askCopy}>
              {t('sharedViews.addToMine')}
            </Button>
          )}

          {(canEdit || mine || (shared.signedIn && !shared.isOwner && !inFolder && !shared.offline)) && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setMoreMenu((v) => !v)}
                title={t('sharedViews.more')}
                aria-label={t('sharedViews.moreOptions')}
                aria-expanded={moreMenu}
                aria-haspopup="true"
                className={`grid h-[42px] w-[42px] cursor-pointer place-items-center rounded-lg border bg-transparent p-0 fs-15 leading-none text-ink-3 transition-colors hover:border-ink-3 hover:bg-raised hover:text-ink ${
                  moreMenu ? 'border-ink-3 bg-raised' : 'border-line'
                }`}
              >
                ⋮
              </button>
              <Menu open={moreMenu} onClose={() => setMoreMenu(false)} align="right" width={250}>
                {canEdit && (
                  <MenuItem
                    title={t('deckDetail.addCard')}
                    hint={t('sharedViews.everyoneSees')}
                    onClick={() => {
                      setMoreMenu(false)
                      setDialog({ kind: 'card-new' })
                    }}
                  />
                )}
                {mine && (
                  <MenuItem
                    title={t('sharedViews.anotherCopy')}
                    hint={t('sharedViews.haveOne')}
                    onClick={() => {
                      setMoreMenu(false)
                      askCopy()
                    }}
                  />
                )}
                {shared.signedIn && !shared.isOwner && !inFolder && !shared.offline &&
                  (shared.joined ? (
                    <MenuItem
                      title={t('sharedViews.removeFromShared')}
                      hint={t('sharedViews.copyStays')}
                      danger
                      onClick={() => {
                        setMoreMenu(false)
                        shared.leave()
                      }}
                    />
                  ) : (
                    <MenuItem
                      title={t('sharedViews.saveToShared')}
                      hint={t('sharedViews.findAgain')}
                      onClick={async () => {
                        setMoreMenu(false)
                        if (await shared.join()) say(t('sharedViews.saved'))
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
          { label: t('summary.cards'), value: String(deck.cards.length) },
          // The owner's own schedule is on their own deck, not here: counting
          // theirs from this page's empty store would say every card is due.
          ...(shared.isOwner
            ? []
            : [
                { label: t('sharedViews.dueForYou'), value: String(due), accent: due > 0 },
                { label: t('sharedViews.youKnow'), value: `${Math.round(deck.progress * 100)}%` },
              ]),
          { label: t('sharedViews.updated'), value: formatRelative(stamp(deck.updatedAt)) },
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
                  <span className="w-[26px] shrink-0 pt-1 font-mono fs-11 leading-[1.5] font-medium tracking-[0.06em] text-ink-3">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div className={`min-w-0 flex-1 font-serif fs-19 leading-[1.32] text-pretty ${off ? 'text-ink-3' : ''}`}>
                    {card.front}
                  </div>
                  <div className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() => setCardMenu(cardMenu === i ? null : i)}
                      title={t('deckDetail.cardOptions')}
                      aria-label={t('deckDetail.cardOptions')}
                      className={`grid h-7 w-7 cursor-pointer place-items-center rounded-[5px] border bg-transparent text-sm leading-none font-medium text-ink-3 transition-colors hover:border-ink-3 hover:text-ink ${
                        cardMenu === i ? 'border-ink-3 bg-raised' : 'border-line'
                      }`}
                    >
                      ⋮
                    </button>
                    <Menu open={cardMenu === i} onClose={() => setCardMenu(null)} width={220}>
                      {canEdit && (
                        <MenuItem
                          title={t('cardModal.editKicker')}
                          hint={t('sharedViews.forEveryone')}
                          onClick={() => {
                            setCardMenu(null)
                            setDialog({ kind: 'card-edit', index: i, card })
                          }}
                        />
                      )}
                      <SuspendItem deck={deck} card={card} off={off} index={i} close={() => setCardMenu(null)} />
                      {canEdit && (
                        <MenuItem
                          title={t('deckDetail.deleteCard')}
                          hint={t('sharedViews.forEveryone')}
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
          <div className="font-serif fs-24 leading-[1.2]">{t('deckDetail.emptyTitle')}</div>
          <p className="m-0 max-w-[360px] text-sm text-ink-3 text-pretty">
            {canEdit ? t('sharedViews.addFirst') : t('sharedViews.ownerAdds')}
          </p>
          {canEdit && (
            <Button size="sm" onClick={() => setDialog({ kind: 'card-new' })}>
              {t('deckDetail.addCard')}
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
        kicker={t('deckDetail.deleteCard')}
        title={t('sharedViews.deleteTitle')}
        body={t('sharedViews.deleteBody')}
        confirmLabel={t('deckDetail.deleteCard')}
        onClose={() => setDialog(null)}
        onConfirm={async () => {
          if (await shared.editCards(deck.id, [], [dialog.card.id])) say(t('sharedViews.cardDeleted'))
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
  const { t } = useT()
  return (
    <MenuItem
      title={off ? t('sharedViews.unsuspend') : t('sharedViews.suspend')}
      hint={off ? t('sharedViews.unsuspendHint') : t('sharedViews.suspendHint')}
      onClick={() => {
        close()
        setCardSuspended(deck.id, card.id, !off)
        say(off ? t('sharedViews.unsuspended', { n: index + 1 }) : t('sharedViews.suspended', { n: index + 1 }))
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
  const { t } = useT()
  useDocumentTitle(t('sharedViews.docTitle', { title: answer.name }))

  const cards = decks.reduce((n, d) => n + d.cards.length, 0)
  const updated = decks.reduce((latest, d) => Math.max(latest, stamp(d.updatedAt) ?? 0), 0) || null
  const toCopy = decks.filter((d) => !shared.copyOf(d.id))

  const copy = () => {
    shared.addToMine(toCopy, answer.name)
    say(t('sharedViews.addedFolder', { count: toCopy.length, name: answer.name }))
    navigate('/decks')
  }
  const askCopy = () => (shared.signedIn || !shared.accounts ? copy() : setDialog('guest-copy'))

  return (
    <div className="rise-in mx-auto flex max-w-[1000px] flex-col gap-[30px]">
      <Link
        to={shared.signedIn ? '/shared' : '/'}
        className="self-start border-0 bg-transparent p-0 text-xs font-medium whitespace-nowrap text-ink-3 transition-colors hover:text-ink"
      >
        ← {shared.signedIn ? t('sharedWithMe.title') : 'Gunit'}
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-[22px] border-b border-line pb-[26px]">
        <div className="min-w-0 max-w-[560px]">
          <div className="kicker mb-3.5">{t('sharedArea.title.folder')}</div>
          <h1 className="m-0 mb-3 font-serif fs-32 leading-[1.05] tracking-[-0.02em] text-pretty sm:fs-42">
            {answer.name}
          </h1>
          <Byline owner={answer.owner_name} role={role} />
        </div>
        <div className="flex flex-wrap gap-2">
          {shared.isOwner ? (
            <Button as={Link} to="/decks" variant="outline">
              {t('sharedViews.openMine')}
            </Button>
          ) : toCopy.length ? (
            <Button onClick={askCopy} disabled={!decks.length}>
              {toCopy.length === decks.length ? t('sharedViews.addAll') : t('sharedViews.addNew', { count: toCopy.length })}
            </Button>
          ) : (
            <Button as={Link} to="/decks" variant="outline">
              {t('sharedViews.allInMine')}
            </Button>
          )}
          {shared.signedIn && !shared.isOwner && !shared.offline &&
            (shared.joined ? (
              <Button variant="ghost" onClick={() => shared.leave()}>
                {t('sharedViews.removeFromShared')}
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={async () => {
                  if (await shared.join()) say(t('sharedViews.saved'))
                }}
              >
                {t('sharedViews.saveToShared')}
              </Button>
            ))}
        </div>
      </header>

      <Notes shared={shared} noun="folder" />

      <Stats
        items={[
          { label: t('dashboard.stats.decks'), value: String(decks.length) },
          { label: t('summary.cards'), value: String(cards) },
          { label: t('sharedViews.updated'), value: formatRelative(updated) },
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
                    {shared.copyOf(deck.id) && <span className="kicker ml-auto shrink-0 !tracking-[0.1em]">{t('sharedViews.copied')}</span>}
                  </div>
                  <h2 className="m-0 font-serif fs-23 leading-[1.2] font-normal text-pretty">
                    <Link
                      to={shared.deckPath(deck.id)}
                      className="cursor-pointer text-inherit no-underline after:absolute after:inset-0 after:content-['']"
                    >
                      {deck.title}
                    </Link>
                  </h2>
                  <div className="mt-auto flex flex-col gap-[9px]">
                    <div className="flex justify-between font-mono fs-10 leading-none font-medium tracking-[0.06em] text-ink-3">
                      <span>{deck.cards.length ? t('deck.cardCount', { count: deck.cards.length }) : t('deck.noCards')}</span>
                      {!shared.isOwner && (
                        <span style={due ? { color: 'var(--color-accent)' } : undefined}>
                          {due ? t('sharedViews.dueCount', { count: due }) : t('deck.known', { pct })}
                        </span>
                      )}
                    </div>
                    {!shared.isOwner && (
                      <ProgressBar value={pct} accent={accent} label={t('sharedViews.progress', { title: deck.title })} />
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
          <div className="font-serif fs-24 leading-[1.2]">{t('sharedViews.emptyFolder')}</div>
          <p className="m-0 max-w-[360px] text-sm text-ink-3 text-pretty">
            {t('sharedViews.emptyFolderBody')}
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
