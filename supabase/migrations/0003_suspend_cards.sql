-- Suspending a card: taking it out of the rotation without deleting it.
--
-- The alternative a reader has otherwise is deleting the card, which throws
-- away its review history and the fact they ever knew it along with it. One
-- column keeps both.
--
-- Not null with a default, so every row that already exists answers the
-- question rather than answering null — the client reads this as a plain
-- boolean and a three-valued one would need handling everywhere it is touched.

alter table public.cards
  add column if not exists suspended boolean not null default false;

-- Only the cards a reader is still studying are worth an index. Suspended
-- rows are read when the deck is listed and never when the queue is built,
-- and leaving them out keeps the index the size of the working set.
create index if not exists cards_due_idx
  on public.cards (user_id, due)
  where not suspended;

-- The change-set function has to carry the new column, or every push would
-- quietly reset it: `on conflict do update` writes the columns it names, and a
-- suspended card graded on another device would come back unsuspended.
--
-- Replaced whole rather than patched, because a function is defined by its
-- body and half of one is not a thing Postgres can hold. Everything else here
-- is unchanged from 0002, including security invoker — the function runs as
-- whoever called it, so row level security still applies to every table it
-- touches.

create or replace function public.sync_library(payload jsonb)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  -- Decks before the cards that reference them.
  insert into public.decks (id, user_id, title, subject, description, studied_at)
  select d.id, d.user_id, d.title, d.subject, d.description, d.studied_at
  from jsonb_to_recordset(coalesce(payload -> 'decks_upsert', '[]'::jsonb)) as d(
    id uuid, user_id uuid, title text, subject text, description text, studied_at timestamptz
  )
  on conflict (id) do update set
    title       = excluded.title,
    subject     = excluded.subject,
    description = excluded.description,
    studied_at  = excluded.studied_at;

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
end;
$$;

-- `create or replace` keeps the existing grants, but re-stating them costs
-- nothing and means this file is correct run on its own.
revoke all on function public.sync_library(jsonb) from public, anon;
grant execute on function public.sync_library(jsonb) to authenticated;
