/**
 * The migrations, run for real, against Postgres compiled to WebAssembly.
 *
 * Row level security, grants and security definer functions are the whole of
 * what keeps one reader out of another's library, and none of it can be
 * checked by reading the SQL or by a stand-in written in JavaScript. PGlite is
 * Postgres itself, so a policy that would let the wrong person through here
 * would let them through in Supabase.
 *
 * Supabase's own pieces are stubbed as thinly as possible: an `auth.users`
 * table, `auth.uid()` and `auth.jwt()` reading the request's claims the way
 * Supabase's do, and the `anon` and `authenticated` roles with the table
 * grants Supabase gives them. Everything under supabase/migrations runs
 * unchanged, in order.
 */
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const MIGRATIONS = fileURLToPath(new URL('../migrations/', import.meta.url))

export async function freshDatabase() {
  const db = new PGlite()
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
    create function auth.jwt() returns jsonb language sql stable as
      $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
    create role anon;
    create role authenticated;
    grant usage on schema public, auth to anon, authenticated;
    grant execute on function auth.uid(), auth.jwt() to anon, authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated;
  `)
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(`${MIGRATIONS}${file}`, 'utf8'))
  }
  return db
}

/** A signed-up account, with the profile row 0001's trigger makes for it. */
export async function addUser(db, id, email, name) {
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [
    id,
    email,
    JSON.stringify({ name }),
  ])
}

/**
 * Each test in a transaction that is rolled back after it, so every test
 * starts from the same seeded database without building another. Far cheaper
 * than a fresh instance, and nothing one test writes can reach the next.
 */
export async function beginTest(db) {
  await db.exec('begin')
  db.inTest = true
}

export async function endTest(db) {
  db.inTest = false
  await db.exec('rollback')
}

/**
 * Runs `fn` as a request would arrive from the browser: as `authenticated`
 * carrying this user's claims, or as `anon` for `null`.
 *
 * Inside a test each call is its own savepoint, as each request is its own
 * transaction in Supabase: a refused call is undone and the test carries on,
 * rather than leaving the whole transaction aborted.
 */
export async function as(db, user, fn) {
  const claims = user ? JSON.stringify({ sub: user.id, email: user.email, role: 'authenticated' }) : ''
  if (db.inTest) await db.exec('savepoint call')
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [claims])
  await db.exec(`set role ${user ? 'authenticated' : 'anon'}`)
  try {
    const result = await fn()
    if (db.inTest) await db.exec('release savepoint call')
    return result
  } catch (error) {
    if (db.inTest) await db.exec('rollback to savepoint call')
    throw error
  } finally {
    await db.exec('reset role')
    await db.query(`select set_config('request.jwt.claims', '', false)`)
  }
}

/** Calls a function the way `supabase.rpc` does, and returns its answer. */
export async function rpc(db, user, name, args = []) {
  const params = args.map((_, i) => `$${i + 1}`).join(', ')
  return as(db, user, async () => (await db.query(`select public.${name}(${params}) as r`, args)).rows[0].r)
}
