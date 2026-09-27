/**
 * A stand-in for the slice of supabase-js the profile and the profile picture
 * use: the library tables (read-only, enough for a pull to settle), the
 * `profiles` row, `sync_library`, and Storage's `avatars` bucket.
 *
 * Every query builder is lazy, as PostgREST's is: nothing is recorded until
 * something awaits it. Updates are applied to the row, so a later read sees
 * them, and can be made to fail — with no connection, or as a project that
 * has not run migration 0009 and refuses its columns.
 */
export function fakeProfileClient({ userId, profile = {}, decks = [], avatars = {} } = {}) {
  const row = {
    id: userId,
    name: 'Olive Santos',
    goal_minutes: 20,
    cards_per: 20,
    auto_reveal: false,
    shuffle_first: false,
    theme: 'light',
    language: null,
    font_size: null,
    avatar_path: null,
    ...profile,
  }
  const tables = { decks, cards: [], sessions: [], folders: [] }
  const files = new Map(Object.entries(avatars))

  const client = {
    row,
    files,
    updates: [],
    uploads: [],
    removed: [],
    downloads: [],
    /** Reads fail, as with no connection. */
    failReads: false,
    /** Profile updates fail: 'offline', or 'legacy' for a project before 0009. */
    failUpdates: null,
    /** Uploads fail with this Storage error, if set. */
    failUploads: null,
    /** While set to a pending promise, profile reads wait on it. */
    gate: null,
    profileReads: 0,

    from(table) {
      return {
        select() {
          const query = {
            eq: () => query,
            order: () => query,
            gt: () => query,
            limit: () => query,
            // Read now, answered once the gate (if any) opens: a read in flight.
            maybeSingle: () => {
              if (table === 'profiles') client.profileReads += 1
              const answer = client.failReads
                ? { data: null, error: { message: 'Failed to fetch' } }
                : { data: table === 'profiles' ? { ...row } : null, error: null }
              return (client.gate ?? Promise.resolve()).then(() => answer)
            },
            then(resolve, reject) {
              const answer = client.failReads
                ? { data: null, count: null, error: { message: 'Failed to fetch' } }
                : { data: [...(tables[table] ?? [])], count: (tables[table] ?? []).length, error: null }
              return Promise.resolve(answer).then(resolve, reject)
            },
          }
          return query
        },
        update(values) {
          const builder = {
            eq: () => builder,
            then(resolve, reject) {
              let error = null
              if (client.failUpdates === 'offline') error = { message: 'TypeError: Failed to fetch' }
              else if (client.failUpdates === 'legacy' && ('language' in values || 'font_size' in values || 'avatar_path' in values)) {
                error = { code: 'PGRST204', message: "Could not find the 'font_size' column of 'profiles' in the schema cache" }
              }
              if (!error) {
                client.updates.push({ table, values })
                if (table === 'profiles') Object.assign(row, values)
              }
              return Promise.resolve({ data: null, error }).then(resolve, reject)
            },
          }
          return builder
        },
      }
    },

    async rpc() {
      return { data: { folders: [], decks: [], cards: [] }, error: null }
    },

    storage: {
      from(bucket) {
        return {
          async upload(path, blob, options) {
            if (client.failUploads) return { data: null, error: client.failUploads }
            client.uploads.push({ bucket, path, blob, options })
            files.set(path, blob)
            return { data: { path }, error: null }
          },
          async download(path) {
            client.downloads.push(path)
            const blob = files.get(path)
            return blob ? { data: blob, error: null } : { data: null, error: { message: 'Object not found' } }
          },
          async remove(paths) {
            client.removed.push(...paths)
            for (const path of paths) files.delete(path)
            return { data: [], error: null }
          },
        }
      },
    },
  }
  return client
}
