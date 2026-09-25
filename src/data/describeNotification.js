import { sharePath } from './sharing.js'

const quoted = (name, fallback) => (name ? `“${name}”` : fallback)

/**
 * What a notification says, and what can be done about it.
 *
 * The account's notifications are stored as facts — who, what kind, what it
 * was called — and worded here, so the words can change without rewriting
 * anybody's history.
 */
export function describe(item) {
  if (item.source === 'device') {
    const { title, message, action } = item.data
    return { title, message, actions: action ? [action] : [] }
  }
  const n = item.data
  const noun = n.resource_kind === 'folder' ? 'folder' : 'deck'
  const who = n.actor_name ?? 'Someone'
  const open = n.token ? [{ type: 'share', label: `Open ${noun}`, to: sharePath(noun, n.token) }] : []
  switch (n.kind) {
    case 'share_received':
      return {
        title: `New shared ${noun}`,
        message: `${who} shared ${quoted(n.resource_name, `a ${noun}`)} with you.`,
        actions: n.token ? [...open, { type: 'decline', label: 'Decline' }] : [],
      }
    case 'share_role_changed':
      return {
        title: 'Access changed',
        message: `${who} changed your access to ${quoted(n.resource_name, `a shared ${noun}`)}. You can now ${
          n.role === 'editor' ? 'study and edit' : 'study'
        } it.`,
        actions: open,
      }
    case 'share_removed':
      return {
        title: 'Access removed',
        message: `${who} removed your access to ${quoted(n.resource_name, `a shared ${noun}`)}.`,
        actions: [],
      }
    case 'share_deleted':
      return {
        title: `Shared ${noun} deleted`,
        message: n.resource_name
          ? `${who} deleted ${quoted(n.resource_name)}.`
          : `${who} deleted a ${noun} they shared with you.`,
        actions: [],
      }
    default:
      return { title: 'Notification', message: '', actions: [] }
  }
}
