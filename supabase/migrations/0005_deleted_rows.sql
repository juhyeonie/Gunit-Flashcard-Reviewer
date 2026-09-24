-- Deletions the account remembers, so another device cannot undo them.
--
-- A device that is open and already synced holds its own copy of every deck.
-- Delete one on the phone, edit it here, and the push that follows is an
-- upsert: `on conflict (id) do update` finds no row to update and inserts one.
-- The deck is back, on every device, and the phone's reader deleted it for
-- nothing. The browser cannot tell — the deck was in the account the last
-- time the two agreed, and nothing since has said otherwise.
--
-- So the account says otherwise. Every row `sync_library` deletes leaves its
-- id here, and an upsert naming one of those ids is refused rather than
-- written. The function answers with what it refused, and the app takes those
-- rows off the device that still had them.
--
-- An id never comes back legitimately. Ids are random uuids minted in the
-- browser, nothing undoes a deletion, and importing or restoring a backup
-- mints fresh ids. A refused upsert is only ever a deleted row returning.
--
-- Run once in the SQL Editor, after 0001-0004. Safe to re-run.
--
-- Order does not matter against the app. The version before this expects
-- nothing back from `sync_library` and ignores the answer; the version with it
-- reads no answer from the function as nothing refused, which is how things
-- were before.

begin;

-- ---------------------------------------------------------------------------
-- deleted_rows
--
-- Keyed by (user_id, id), not id alone. Row level security keeps a reader from
-- seeing anybody else's entries, but not from occupying their key: with id
-- alone, an entry written first under one account would stop the owner's own
-- deletion being recorded.
--
-- A row is about eighty bytes and one is written per deleted card, deck or
-- folder. A reader deleting a hundred cards a week for a year writes 400 KB.
-- ---------------------------------------------------------------------------
create table if not exists public.deleted_rows (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  id         uuid        not null,
  kind       text        not null,
  deleted_at timestamptz not null default now(),

  primary key (user_id, id),
  constraint deleted_kind_is_known check (kind in ('folder', 'deck', 'card'))
);

alter table public.deleted_rows enable row level security;

-- Read and written, never changed or removed. There is no policy for update or
-- delete, so nothing the browser sends can take an entry back out — which
-- would be a deletion undone by another route.
drop policy if exists "read own deletions" on public.deleted_rows;
create policy "read own deletions" on public.deleted_rows
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "record own deletions" on public.deleted_rows;
create policy "record own deletions" on public.deleted_rows
  for insert to authenticated
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- sync_library, replaced whole to refuse deleted rows and say which.
--
-- Unchanged from 0004 apart from what is marked DELETED. Still security
-- invoker, so row level security applies to every table it touches, this
-- one included.
--
-- Dropped first because it now returns something, and `create or replace`
-- cannot change what a function returns. Inside the transaction above, so no
-- request ever finds it missing.
-- ---------------------------------------------------------------------------
drop function if exists public.sync_library(jsonb);

create function public.sync_library(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  refused_folders uuid[];
  refused_decks   uuid[];
  refused_cards   uuid[];
  removed_decks   uuid[];
begin
  -- DELETED: a folder deleted elsewhere is not made again. A deck filed in it
  -- below finds no folder and lands ungrouped, as the folder's deletion left
  -- every other deck.
  select coalesce(array_agg(f.id), '{}') into refused_folders
  from jsonb_to_recordset(coalesce(payload -> 'folders_upsert', '[]'::jsonb)) as f(id uuid, user_id uuid)
  where exists (select 1 from public.deleted_rows t where t.user_id = f.user_id and t.id = f.id);

  -- Folders first, so a deck filed in a folder made in this same change set
  -- finds it there.
  insert into public.folders (id, user_id, name)
  select f.id, f.user_id, f.name
  from jsonb_to_recordset(coalesce(payload -> 'folders_upsert', '[]'::jsonb)) as f(
    id uuid, user_id uuid, name text
  )
  where f.id <> all (refused_folders)
  on conflict (id) do update set
    name = excluded.name;

  -- DELETED: likewise a deck.
  select coalesce(array_agg((e ->> 'id')::uuid), '{}') into refused_decks
  from jsonb_array_elements(coalesce(payload -> 'decks_upsert', '[]'::jsonb)) as e
  where exists (
    select 1 from public.deleted_rows t
    where t.user_id = (e ->> 'user_id')::uuid and t.id = (e ->> 'id')::uuid
  );

  -- Decks before the cards that reference them.
  --
  -- folder_id is only taken from a deck that says where it is filed. A browser
  -- tab still running the version before folders sends decks with no
  -- folder_id key at all; reading that as null would take every deck it
  -- touches out of its folder. So new rows take what they were given, and
  -- existing rows are only re-filed by the statement below, and only when the
  -- key is present.
  --
  -- And only into a folder that exists. One deleted on another device while
  -- this one was offline would otherwise fail the key above and, with it, the
  -- whole change set — every push after it too. The deck lands ungrouped
  -- instead, which is where a deck with no folder belongs.
  insert into public.decks (id, user_id, title, subject, description, studied_at, folder_id)
  select (e ->> 'id')::uuid,
         (e ->> 'user_id')::uuid,
         e ->> 'title',
         e ->> 'subject',
         e ->> 'description',
         (e ->> 'studied_at')::timestamptz,
         (select f.id from public.folders f
           where f.id = nullif(e ->> 'folder_id', '')::uuid
             and f.user_id = (e ->> 'user_id')::uuid)
  from jsonb_array_elements(coalesce(payload -> 'decks_upsert', '[]'::jsonb)) as e
  where (e ->> 'id')::uuid <> all (refused_decks)
  on conflict (id) do update set
    title       = excluded.title,
    subject     = excluded.subject,
    description = excluded.description,
    studied_at  = excluded.studied_at;

  update public.decks d
  set folder_id = (
    select f.id from public.folders f
    where f.id = nullif(e ->> 'folder_id', '')::uuid
      and f.user_id = d.user_id
  )
  from jsonb_array_elements(coalesce(payload -> 'decks_upsert', '[]'::jsonb)) as e
  where d.id = (e ->> 'id')::uuid
    and e ? 'folder_id';

  -- DELETED: a card deleted elsewhere, or one whose deck is no longer here.
  --
  -- The second is the deck's deletion reaching its cards. Editing a card in a
  -- deck the phone deleted sends the card alone and, until now, failed the
  -- deck key — and a failed change set fails every push after it, because the
  -- next one retries it. The deck goes into the answer as well, so the device
  -- drops the whole deck and not only the card it happened to touch.
  select coalesce(array_agg(c.id), '{}') into refused_cards
  from jsonb_to_recordset(coalesce(payload -> 'cards_upsert', '[]'::jsonb)) as c(
    id uuid, deck_id uuid, user_id uuid
  )
  where exists (select 1 from public.deleted_rows t where t.user_id = c.user_id and t.id = c.id)
     or not exists (select 1 from public.decks d where d.id = c.deck_id);

  select coalesce(array_agg(distinct x), '{}') into refused_decks
  from (
    select unnest(refused_decks) as x
    union
    select c.deck_id
    from jsonb_to_recordset(coalesce(payload -> 'cards_upsert', '[]'::jsonb)) as c(deck_id uuid)
    where not exists (select 1 from public.decks d where d.id = c.deck_id)
  ) as gone;

  insert into public.cards (
    id, deck_id, user_id, front, back, "position",
    due, "interval", ease, reps, lapses, last_grade, suspended
  )
  select c.id, c.deck_id, c.user_id, c.front, c.back, c."position",
         c.due, c."interval", c.ease, c.reps, c.lapses, c.last_grade,
         coalesce(c.suspended, false)
  from jsonb_to_recordset(coalesce(payload -> 'cards_upsert', '[]'::jsonb)) as c(
    id uuid, deck_id uuid, user_id uuid, front text, back text, "position" integer,
    due timestamptz, "interval" integer, ease real, reps integer, lapses integer,
    last_grade text, suspended boolean
  )
  where c.id <> all (refused_cards)
  on conflict (id) do update set
    deck_id    = excluded.deck_id,
    front      = excluded.front,
    back       = excluded.back,
    "position" = excluded."position",
    due        = excluded.due,
    "interval" = excluded."interval",
    ease       = excluded.ease,
    reps       = excluded.reps,
    lapses     = excluded.lapses,
    last_grade = excluded.last_grade,
    suspended  = excluded.suspended;

  -- The log is append-only, and a retry of a failed change set will offer the
  -- same rows again — so an id already present is left alone rather than
  -- raising and blocking every sync after it.
  --
  -- DELETED: a session studied against a deck that is no longer here keeps its
  -- place in the streak with no deck, as the deck's own deletion would have
  -- left it. Named as it was, it failed the deck key and the change set.
  insert into public.sessions (id, user_id, deck_id, at, reviewed, seconds)
  select s.id, s.user_id,
         (select d.id from public.decks d where d.id = s.deck_id),
         s.at, s.reviewed, s.seconds
  from jsonb_to_recordset(coalesce(payload -> 'sessions_insert', '[]'::jsonb)) as s(
    id uuid, user_id uuid, deck_id uuid, at timestamptz, reviewed integer, seconds integer
  )
  on conflict (id) do nothing;

  -- Deletions last, so nothing is removed before its replacement exists.
  --
  -- DELETED: each one recorded, from what was actually removed rather than
  -- from what was asked for. An id that was already gone is somebody else's
  -- deletion, and already recorded.
  with gone as (
    delete from public.cards
    where id in (
      select value::uuid
      from jsonb_array_elements_text(coalesce(payload -> 'cards_remove', '[]'::jsonb))
    )
    returning id, user_id
  )
  insert into public.deleted_rows (user_id, id, kind)
  select user_id, id, 'card' from gone
  on conflict do nothing;

  select coalesce(array_agg(value::uuid), '{}') into removed_decks
  from jsonb_array_elements_text(coalesce(payload -> 'decks_remove', '[]'::jsonb));

  -- DELETED: a deck's cards go with it by cascade, which returns nothing, so
  -- they are recorded before the deck is removed. Otherwise a card moved
  -- elsewhere on a device that missed the deletion would come back alone.
  insert into public.deleted_rows (user_id, id, kind)
  select c.user_id, c.id, 'card'
  from public.cards c
  where c.deck_id = any (removed_decks)
  on conflict do nothing;

  with gone as (
    delete from public.decks
    where id = any (removed_decks)
    returning id, user_id
  )
  insert into public.deleted_rows (user_id, id, kind)
  select user_id, id, 'deck' from gone
  on conflict do nothing;

  -- Last of all. The key on decks sets each remaining deck's folder_id to
  -- null; no deck is deleted by this.
  with gone as (
    delete from public.folders
    where id in (
      select value::uuid
      from jsonb_array_elements_text(coalesce(payload -> 'folders_remove', '[]'::jsonb))
    )
    returning id, user_id
  )
  insert into public.deleted_rows (user_id, id, kind)
  select user_id, id, 'folder' from gone
  on conflict do nothing;

  -- DELETED: what was refused, for the device that sent it to take off itself.
  return jsonb_build_object(
    'folders', to_jsonb(refused_folders),
    'decks',   to_jsonb(refused_decks),
    'cards',   to_jsonb(refused_cards)
  );
end;
$$;

revoke all on function public.sync_library(jsonb) from public, anon;
grant execute on function public.sync_library(jsonb) to authenticated;

commit;
