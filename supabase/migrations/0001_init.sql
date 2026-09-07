-- Gunit: schema and row level security.
--
-- Run this once, in the Supabase dashboard under SQL Editor, against a new
-- project. It is written to be safe to re-run.
--
-- Every table here is per-user. There is no shared or public data in Gunit, so
-- every policy is the same shape: you may see and write exactly the rows whose
-- user_id is yours, and nothing else.

-- ---------------------------------------------------------------------------
-- profiles: one row per account, holding the settings the app already has.
--
-- Kept as columns rather than a jsonb blob so a bad write cannot silently
-- reshape someone's preferences, and so defaults live in one place.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  name          text        not null default 'Student',
  goal_minutes  integer     not null default 20,
  cards_per     integer     not null default 20,
  auto_reveal   boolean     not null default false,
  shuffle_first boolean     not null default false,
  theme         text        not null default 'light',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint theme_is_known check (theme in ('light', 'dark')),
  constraint goal_is_sane check (goal_minutes between 1 and 600),
  constraint cards_per_is_sane check (cards_per between 1 and 500)
);

-- ---------------------------------------------------------------------------
-- decks
--
-- `progress` is deliberately absent. It is derived from the cards' schedules
-- on read, exactly as it is in the app today; storing it would only give it a
-- chance to disagree with them.
-- ---------------------------------------------------------------------------
create table if not exists public.decks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users (id) on delete cascade,
  title       text        not null default 'Untitled deck',
  subject     text        not null default 'General',
  description text        not null default '',
  studied_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists decks_user_idx on public.decks (user_id);

-- ---------------------------------------------------------------------------
-- cards
--
-- Scheduling lives on the card rather than in a table beside it: it is
-- strictly one-to-one, it halves the row count, and it is already the shape
-- the app's own export format uses.
--
-- user_id is denormalised even though it is reachable through deck_id. Without
-- it, every row-level check on a card becomes a join.
-- ---------------------------------------------------------------------------
create table if not exists public.cards (
  id         uuid primary key default gen_random_uuid(),
  deck_id    uuid    not null references public.decks (id) on delete cascade,
  user_id    uuid    not null references auth.users (id) on delete cascade,
  front      text    not null,
  back       text    not null,
  position   integer not null default 0,

  -- The scheduler's entry, spread out. All null for a card never graded, which
  -- is what `isNew` in scheduler.js already tests for.
  due        timestamptz,
  interval   integer not null default 0,   -- minutes, as in scheduler.js
  ease       real    not null default 2.5,
  reps       integer not null default 0,
  lapses     integer not null default 0,
  last_grade text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint front_not_blank check (length(btrim(front)) > 0),
  constraint back_not_blank check (length(btrim(back)) > 0),
  constraint last_grade_is_known check (last_grade in ('again', 'good', 'easy'))
);

create index if not exists cards_deck_idx on public.cards (deck_id);
create index if not exists cards_user_idx on public.cards (user_id);
-- Building a session queue asks for this reader's due cards, soonest first.
create index if not exists cards_due_idx on public.cards (user_id, due);

-- ---------------------------------------------------------------------------
-- sessions: the study log the streak and the weekly chart are derived from.
--
-- deck_id is set null rather than cascaded on purpose. Deleting a deck should
-- not erase the streak someone earned studying it.
-- ---------------------------------------------------------------------------
create table if not exists public.sessions (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid        not null references auth.users (id) on delete cascade,
  deck_id   uuid        references public.decks (id) on delete set null,
  at        timestamptz not null default now(),
  reviewed  integer     not null,
  seconds   integer     not null default 0,

  constraint reviewed_is_positive check (reviewed > 0),
  constraint seconds_not_negative check (seconds >= 0)
);

create index if not exists sessions_user_at_idx on public.sessions (user_id, at desc);

-- ---------------------------------------------------------------------------
-- Row level security.
--
-- `using` decides which rows you can see. `with check` decides which rows you
-- may write. Both are needed: `using` on its own still lets someone insert a
-- row carrying another account's user_id.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.decks    enable row level security;
alter table public.cards    enable row level security;
alter table public.sessions enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "own decks" on public.decks;
create policy "own decks" on public.decks
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own cards" on public.cards;
create policy "own cards" on public.cards
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own sessions" on public.sessions;
create policy "own sessions" on public.sessions
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- A profile row for every new account.
--
-- Done here rather than from the browser so that signing up cannot leave an
-- account without settings if the tab is closed at the wrong moment.
--
-- security definer is required — the trigger runs before the new user has a
-- session, so auth.uid() is null and the policy above would refuse the insert.
-- The search_path is pinned because a security definer function that resolves
-- names loosely is how privilege escalation gets in.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- updated_at, maintained by the database rather than by every caller.
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists decks_touch on public.decks;
create trigger decks_touch before update on public.decks
  for each row execute function public.touch_updated_at();

drop trigger if exists cards_touch on public.cards;
create trigger cards_touch before update on public.cards
  for each row execute function public.touch_updated_at();
