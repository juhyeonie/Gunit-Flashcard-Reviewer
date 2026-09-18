-- Folders: one level of organisation for decks.
--
-- Folder -> decks -> cards, and nothing deeper. A deck is in one folder or in
-- none. The folder does not hold its decks; each deck names its folder, which
-- is what makes a deck impossible to duplicate by filing it, and what lets a
-- rename be one row.
--
-- Run once in the SQL Editor, after 0001-0003. Safe to re-run.
--
-- ORDER MATTERS: run this before deploying the app version that has folders.
-- That version reads `public.folders` when you sign in, and until this has run
-- the read fails — the app then keeps the library on the device and stops
-- syncing (nothing is lost; it all goes up once this is in place), but every
-- sign-in says the library could not be refreshed.

-- ---------------------------------------------------------------------------
-- folders
-- ---------------------------------------------------------------------------
create table if not exists public.folders (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users (id) on delete cascade,
  name       text        not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint folder_name_not_blank check (length(btrim(name)) > 0),
  -- The app trims names to 80 characters; the database holds the same line.
  constraint folder_name_length check (char_length(name) <= 80),
  -- Target of the composite key on decks below: a deck may only point at a
  -- folder its own user owns.
  constraint folders_id_user_key unique (id, user_id)
);

create index if not exists folders_user_idx on public.folders (user_id);

alter table public.folders enable row level security;

-- Same shape as every other table: you see and write exactly your own rows.
-- `with check` as well as `using`, or an insert could carry someone else's id.
drop policy if exists "own folders" on public.folders;
create policy "own folders" on public.folders
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists folders_touch on public.folders;
create trigger folders_touch before update on public.folders
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- decks.folder_id
--
-- Nullable: null is "ungrouped", which is every deck that exists today.
--
-- The key is (folder_id, user_id) -> folders (id, user_id), not folder_id
-- alone. Foreign keys are checked without row level security, so a plain key
-- would accept any folder's uuid — somebody else's included. The pair only
-- matches a folder belonging to the deck's own user.
--
-- ON DELETE SET NULL (folder_id): deleting a folder clears the folder column on
-- its decks and nothing else. The decks, their cards and their schedules stay
-- exactly where they are, now ungrouped. The column list matters — without it
-- Postgres would null user_id too, which is NOT NULL, and the delete would fail.
-- (Column lists on SET NULL need Postgres 15 or later, which every Supabase
-- project created in the last few years runs.)
-- ---------------------------------------------------------------------------
alter table public.decks
  add column if not exists folder_id uuid;

alter table public.decks
  drop constraint if exists decks_folder_fkey;

alter table public.decks
  add constraint decks_folder_fkey
  foreign key (folder_id, user_id)
  references public.folders (id, user_id)
  on delete set null (folder_id);

create index if not exists decks_folder_idx on public.decks (folder_id);

-- ---------------------------------------------------------------------------
-- sync_library, replaced whole to carry folders.
--
-- Unchanged from 0003 apart from what is marked FOLDERS. Still security
-- invoker, so row level security applies to every table it touches.
-- ---------------------------------------------------------------------------
create or replace function public.sync_library(payload jsonb)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  -- FOLDERS: first, so a deck filed in a folder made in this same change set
  -- finds it there.
  insert into public.folders (id, user_id, name)
  select f.id, f.user_id, f.name
  from jsonb_to_recordset(coalesce(payload -> 'folders_upsert', '[]'::jsonb)) as f(
    id uuid, user_id uuid, name text
  )
  on conflict (id) do update set
    name = excluded.name;

  -- Decks before the cards that reference them.
  --
  -- FOLDERS: folder_id is only taken from a deck that says where it is filed.
  -- A browser tab still running the version before folders sends decks with no
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
  insert into public.sessions (id, user_id, deck_id, at, reviewed, seconds)
  select s.id, s.user_id, s.deck_id, s.at, s.reviewed, s.seconds
  from jsonb_to_recordset(coalesce(payload -> 'sessions_insert', '[]'::jsonb)) as s(
    id uuid, user_id uuid, deck_id uuid, at timestamptz, reviewed integer, seconds integer
  )
  on conflict (id) do nothing;

  -- Deletions last, so nothing is removed before its replacement exists.
  delete from public.cards
  where id in (
    select value::uuid
    from jsonb_array_elements_text(coalesce(payload -> 'cards_remove', '[]'::jsonb))
  );

  delete from public.decks
  where id in (
    select value::uuid
    from jsonb_array_elements_text(coalesce(payload -> 'decks_remove', '[]'::jsonb))
  );

  -- FOLDERS: last of all. The key above sets each remaining deck's folder_id
  -- to null; no deck is deleted by this.
  delete from public.folders
  where id in (
    select value::uuid
    from jsonb_array_elements_text(coalesce(payload -> 'folders_remove', '[]'::jsonb))
  );
end;
$$;

revoke all on function public.sync_library(jsonb) from public, anon;
grant execute on function public.sync_library(jsonb) to authenticated;
