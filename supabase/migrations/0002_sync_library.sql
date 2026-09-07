-- One change set, applied atomically.
--
-- The client used to send five statements in sequence — decks, cards,
-- sessions, then the two deletions — and stop at the first error. A failure
-- part way left the account holding, say, decks whose cards had not arrived,
-- and the next sign-in read that back as the truth. Local storage still had
-- everything, but what the reader saw was wrong.
--
-- A function is one statement to Postgres, so either all of it happens or none
-- of it does.
--
-- security invoker, deliberately. The function runs as whoever called it, so
-- row level security still applies to every table it touches: a payload naming
-- another account's rows writes nothing. Making this security definer would
-- hand the browser a way straight past the policies.

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
    id, deck_id, user_id, front, back, "position", due, "interval", ease, reps, lapses, last_grade
  )
  select c.id, c.deck_id, c.user_id, c.front, c.back, c."position",
         c.due, c."interval", c.ease, c.reps, c.lapses, c.last_grade
  from jsonb_to_recordset(coalesce(payload -> 'cards_upsert', '[]'::jsonb)) as c(
    id uuid, deck_id uuid, user_id uuid, front text, back text, "position" integer,
    due timestamptz, "interval" integer, ease real, reps integer, lapses integer, last_grade text
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
    last_grade = excluded.last_grade;

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

-- Postgres grants EXECUTE on a new function to PUBLIC by default, which would
-- let a signed-out caller at least attempt this. Row level security would
-- refuse every row it touched, but there is no reason to offer the door.
revoke all on function public.sync_library(jsonb) from public, anon;
grant execute on function public.sync_library(jsonb) to authenticated;
