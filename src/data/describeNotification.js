import { sharePath } from './sharing.js'
import { t as currentT } from '../i18n/index.js'

/**
 * What a notification says, and what can be done about it.
 *
 * The account's notifications are stored as facts — who, what kind, what it
 * was called — and worded here, so the words can change without rewriting
 * anybody's history. That is also what lets them follow the reader's
 * language: the same fact reads in English or Filipino, whichever is chosen
 * when it is looked at.
 *
 * This device's own notices work the same way when they carry `params`,
 * which every notice written since the language setting does: the kind and
 * its numbers are kept, and the words come from the dictionary under
 * `notices.<kind>`. One written before that, with only its words, is shown
 * as it was written.
 *
 * `t` is the component's, so the words change with the language.
 */
export function describe(item, t = currentT) {
  if (item.source === 'device') return describeDevice(item.data, t)

  const n = item.data
  const kind = n.resource_kind === 'folder' ? 'folder' : 'deck'
  const noun = t(`notices.noun.${kind}`)
  const who = n.actor_name ?? t('notices.someone')
  const named = (fallbackKey) => (n.resource_name ? `“${n.resource_name}”` : t(fallbackKey, { noun }))
  const open = n.token
    ? [{ type: 'share', label: t(`notices.open.${kind}`), to: sharePath(kind, n.token) }]
    : []
  switch (n.kind) {
    case 'share_received':
      return {
        title: t(`notices.received.title.${kind}`),
        message: t('notices.received.message', { who, name: named('notices.aNoun') }),
        actions: n.token ? [...open, { type: 'decline', label: t('notices.decline') }] : [],
      }
    case 'share_role_changed':
      return {
        title: t('notices.roleChanged.title'),
        message: t(n.role === 'editor' ? 'notices.roleChanged.editor' : 'notices.roleChanged.viewer', {
          who,
          name: named('notices.aSharedNoun'),
        }),
        actions: open,
      }
    case 'share_removed':
      return {
        title: t('notices.removed.title'),
        message: t('notices.removed.message', { who, name: named('notices.aSharedNoun') }),
        actions: [],
      }
    case 'share_deleted':
      return {
        title: t(`notices.deleted.title.${kind}`),
        message: n.resource_name
          ? t('notices.deleted.named', { who, name: `“${n.resource_name}”` })
          : t('notices.deleted.unnamed', { who, noun }),
        actions: [],
      }
    default:
      return { title: t('notices.fallback'), message: '', actions: [] }
  }
}

function describeDevice(data, t) {
  const { kind, params, title, message, action } = data
  if (!params) return { title, message, actions: action ? [action] : [] }
  const base = `notices.${kind}`
  return {
    title: t(`${base}.title`, params),
    message: t(`${base}.message`, params),
    actions: action ? [{ ...action, label: t(`${base}.action`, params) }] : [],
  }
}
