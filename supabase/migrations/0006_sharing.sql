-- Sharing: a deck or a folder, by link or by invitation.
--
-- What is shared is the content — titles, questions, answers, their order.
-- Never the owner's study history, and never anyone else's. That one rule
-- decides the shape of everything below.
--
-- The owner's review state lives on the card row (0001: due, interval, ease,
-- reps, lapses, last_grade; 0003: suspended). Row level security chooses rows,
-- not columns, so a policy letting a classmate read the owner's cards would
-- hand them the owner's schedule along with the questions. So the existing
-- tables and their policies are not touched at all: each stays readable and
-- writable by its owner alone, exactly as before. Shared content is read, and
-- edited by editors, only through the security definer functions here, which
-- return and write the content columns and check the caller's role
-- themselves. A recipient's own review state goes in `card_progress`, a row
-- per person per card, which only that person can see.
--
-- Run once in the SQL Editor, after 0001-0005. Safe to re-run.
--
-- Order against the app does not matter. The app without sharing never calls
-- any of this; the app with it reports sharing as unavailable until this has
-- run, and everything else carries on.

begin;

-- ---------------------------------------------------------------------------
-- shares: one per deck or folder that has ever been shared.
--
-- Private is the absence of an active share: no row, or a revoked one. Shared
-- is `access = 'invited'`, members only. Anyone-with-the-link is
-- `access = 'link'`. A discoverable public deck later is one more value here
-- and one more branch where access is decided, not a new table.
--
-- The token is what goes in the link. It is not the row's id and it is not the
-- deck's: 122 random bits, replaced whenever the owner resets the link, which
-- kills the old one without touching anyone's membership.
--
-- One share per deck and per folder, so "the link" means one thing. Deleting
-- the deck or folder deletes its share and every membership with it.
-- ---------------------------------------------------------------------------
create table if not exists public.shares (
  id         uuid        primary key default gen_random_uuid(),
  token      text        not null default replace(gen_random_uuid()::text, '-', ''),
  owner_id   uuid        not null references auth.users (id) on delete cascade,
  deck_id    uuid        references public.decks (id) on delete cascade,
  folder_id  uuid        references public.folders (id) on delete cascade,
  access     text        not null default 'link',
  role       text        not null default 'viewer',
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint shares_token_key unique (token),
  constraint shares_deck_key unique (deck_id),
  constraint shares_folder_key unique (folder_id),
  constraint share_is_one_thing check ((deck_id is null) <> (folder_id is null)),
  constraint share_access_is_known check (access in ('invited', 'link')),
  constraint share_role_is_known check (role in ('viewer', 'editor'))
);

create index if not exists shares_owner_idx on public.shares (owner_id);

drop trigger if exists shares_touch on public.shares;
create trigger shares_touch before update on public.shares
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- share_members: who a share has been given to.
--
-- Two ways in. An invitation names an email and a role; it waits with no user
-- until someone signed in under that address opens the link or their Shared
-- with me list, and is claimed then. Nobody is looked up by email to send it,
-- so inviting an address says nothing about whether it has an account.
--
-- A link member joined by opening an anyone-with-the-link share. They follow
-- the link: its role is theirs, and turning the link off to invited-only takes
-- their access with it — they were never invited. An invited member keeps the
-- role they were given whatever the link does.
-- ---------------------------------------------------------------------------
create table if not exists public.share_members (
  id         uuid        primary key default gen_random_uuid(),
  share_id   uuid        not null references public.shares (id) on delete cascade,
  user_id    uuid        references auth.users (id) on delete cascade,
  email      text,
  role       text,
  via        text        not null,
  created_at timestamptz not null default now(),
  joined_at  timestamptz,

  constraint share_members_user_key unique (share_id, user_id),
  constraint share_members_email_key unique (share_id, email),
  constraint member_via_is_known check (via in ('invite', 'link')),
  constraint member_role_is_known check (role is null or role in ('viewer', 'editor')),
  constraint invite_names_someone check (via <> 'invite' or (email is not null and role is not null)),
  constraint link_member_is_someone check (via <> 'link' or user_id is not null)
);

create index if not exists share_members_user_idx on public.share_members (user_id);

-- ---------------------------------------------------------------------------
-- card_progress: a recipient's own review state for a shared card.
--
-- Twenty students studying one shared deck are twenty sets of rows here, each
-- visible to its own student and nobody else — the owner included. The owner's
-- own state stays on the card, where it has always been.
--
-- A card deleted takes everyone's progress on it with it: there is nothing
-- left to be due.
-- ---------------------------------------------------------------------------
create table if not exists public.card_progress (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  card_id    uuid        not null references public.cards (id) on delete cascade,
  due        timestamptz,
  "interval" integer     not null default 0,
  ease       real        not null default 2.5,
  reps       integer     not null default 0,
  lapses     integer     not null default 0,
  last_grade text,
  suspended  boolean     not null default false,
  updated_at timestamptz not null default now(),

  primary key (user_id, card_id),
  constraint progress_grade_is_known check (last_grade in ('again', 'good', 'easy'))
);

create index if not exists card_progress_card_idx on public.card_progress (card_id);

drop trigger if exists card_progress_touch on public.card_progress;
create trigger card_progress_touch before update on public.card_progress
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Who may do what. Every function here is security definer with its search
-- path pinned, reads only what its answer needs, and is granted to exactly the
-- roles that call it. Postgres grants execute to everyone by default, so each
-- is revoked from public first.
-- ---------------------------------------------------------------------------

-- A member's effective role on a share, or null. Not the owner's: callers ask
-- that first. Revoked shares give nobody anything.
create or replace function public.member_role(p_share uuid, p_user uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when m.via = 'invite' then m.role
              when s.access = 'link' then s.role
         end
  from public.share_members m
  join public.shares s on s.id = m.share_id
  where m.share_id = p_share
    and m.user_id = p_user
    and s.revoked_at is null
$$;

revoke all on function public.member_role(uuid, uuid) from public, anon, authenticated;

-- Invitations sent to the caller's address, claimed. A link membership the
-- same person already had gives way to the invitation, which carries a role
-- of its own. Called before any question about the caller's access, so an
-- invited reader never has to do anything to accept.
create or replace function public.claim_invitations()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid      uuid := auth.uid();
  my_email text := lower(nullif(btrim(auth.jwt() ->> 'email'), ''));
begin
  if uid is null or my_email is null then
    return;
  end if;

  delete from public.share_members l
  using public.share_members i
  where l.via = 'link'
    and l.user_id = uid
    and i.share_id = l.share_id
    and i.via = 'invite'
    and i.user_id is null
    and i.email = my_email;

  update public.share_members m
  set user_id = uid, joined_at = coalesce(m.joined_at, now())
  from public.shares s
  where s.id = m.share_id
    and m.via = 'invite'
    and m.user_id is null
    and m.email = my_email
    and s.owner_id <> uid;
end;
$$;

revoke all on function public.claim_invitations() from public, anon, authenticated;

-- The caller's role on a deck: 'owner', 'editor', 'viewer' or null. Through a
-- share of the deck itself or of the folder it is in now — so a deck moved out
-- of a shared folder stops being shared with it, and one moved in starts.
-- Membership only: this has no link token to go on, so a reader who opened a
-- link without joining is not counted. They join by studying or editing.
create or replace function public.deck_role(p_deck uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  uid   uuid := auth.uid();
  d     record;
  roles text[];
begin
  if uid is null then
    return null;
  end if;
  select id, user_id, folder_id into d from public.decks where id = p_deck;
  if not found then
    return null;
  end if;
  if d.user_id = uid then
    return 'owner';
  end if;

  select array_agg(public.member_role(s.id, uid)) into roles
  from public.shares s
  where s.owner_id = d.user_id
    and (s.deck_id = d.id or (d.folder_id is not null and s.folder_id = d.folder_id));

  if 'editor' = any (roles) then
    return 'editor';
  elsif 'viewer' = any (roles) then
    return 'viewer';
  end if;
  return null;
end;
$$;

revoke all on function public.deck_role(uuid) from public, anon;
grant execute on function public.deck_role(uuid) to authenticated;

-- For card_progress's policy: may the caller keep progress on this card?
create or replace function public.can_study_card(p_card uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.cards c
    where c.id = p_card
      and c.user_id <> auth.uid()
      and public.deck_role(c.deck_id) in ('viewer', 'editor')
  )
$$;

revoke all on function public.can_study_card(uuid) from public, anon;
grant execute on function public.can_study_card(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security.
--
-- Read-only through the API, all three. Every write to shares and members goes
-- through the functions below, which check ownership first; a table with no
-- insert, update or delete policy refuses all three outright, so there is
-- nothing to bypass them with.
-- ---------------------------------------------------------------------------
alter table public.shares        enable row level security;
alter table public.share_members enable row level security;
alter table public.card_progress enable row level security;

drop policy if exists "owner reads shares" on public.shares;
create policy "owner reads shares" on public.shares
  for select to authenticated
  using (auth.uid() = owner_id);

drop policy if exists "owner and member read members" on public.share_members;
create policy "owner and member read members" on public.share_members
  for select to authenticated
  using (
    auth.uid() = user_id
    or exists (select 1 from public.shares s where s.id = share_id and s.owner_id = auth.uid())
  );

-- Your own progress, on cards you can still study. Losing access leaves the
-- rows readable and removable, and stops them being written.
drop policy if exists "read own progress" on public.card_progress;
create policy "read own progress" on public.card_progress
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "write own progress" on public.card_progress;
create policy "write own progress" on public.card_progress
  for insert to authenticated
  with check (auth.uid() = user_id and public.can_study_card(card_id));

drop policy if exists "update own progress" on public.card_progress;
create policy "update own progress" on public.card_progress
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and public.can_study_card(card_id));

drop policy if exists "remove own progress" on public.card_progress;
create policy "remove own progress" on public.card_progress
  for delete to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- For the owner.
-- ---------------------------------------------------------------------------

-- A share as its owner sees it: settings, link token, and who it is with.
create or replace function public.share_settings_json(p_share uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', s.id,
    'token', s.token,
    'kind', case when s.deck_id is not null then 'deck' else 'folder' end,
    'access', s.access,
    'role', s.role,
    'active', s.revoked_at is null,
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id,
               'email', m.email,
               'name', p.name,
               'role', coalesce(m.role, s.role),
               'via', m.via,
               'joined', m.user_id is not null
             ) order by m.created_at)
      from public.share_members m
      left join public.profiles p on p.id = m.user_id
      where m.share_id = s.id
        -- A link member of a link that is off has no access; not listed.
        and (m.via = 'invite' or s.access = 'link')
    ), '[]'::jsonb)
  )
  from public.shares s
  where s.id = p_share
$$;

revoke all on function public.share_settings_json(uuid) from public, anon, authenticated;

-- The caller's own share row, by id, or an error.
create or replace function public.owned_share(p_share uuid)
returns public.shares
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  s public.shares;
begin
  select * into s from public.shares where id = p_share and owner_id = auth.uid();
  if not found then
    raise exception 'not your share' using errcode = '42501';
  end if;
  return s;
end;
$$;

revoke all on function public.owned_share(uuid) from public, anon, authenticated;

-- Reads a deck's or folder's share settings, or null if it has never been
-- shared. Owner only.
create or replace function public.share_settings(p_kind text, p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  sid uuid;
begin
  if p_kind = 'deck' then
    perform 1 from public.decks where id = p_id and user_id = uid;
    if not found then raise exception 'not your deck' using errcode = '42501'; end if;
    select id into sid from public.shares where deck_id = p_id;
  elsif p_kind = 'folder' then
    perform 1 from public.folders where id = p_id and user_id = uid;
    if not found then raise exception 'not your folder' using errcode = '42501'; end if;
    select id into sid from public.shares where folder_id = p_id;
  else
    raise exception 'unknown kind %', p_kind;
  end if;
  if sid is null then
    return null;
  end if;
  return public.share_settings_json(sid);
end;
$$;

revoke all on function public.share_settings(text, uuid) from public, anon;
grant execute on function public.share_settings(text, uuid) to authenticated;

-- Shares a deck or folder, or changes how. A share turned off earlier comes
-- back with a new link and nobody on it: whoever it was given to before was
-- given it before, and turning it off was the owner saying so.
create or replace function public.share_set(p_kind text, p_id uuid, p_access text, p_role text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  s   public.shares;
begin
  if p_kind = 'deck' then
    perform 1 from public.decks where id = p_id and user_id = uid;
    if not found then raise exception 'not your deck' using errcode = '42501'; end if;
    select * into s from public.shares where deck_id = p_id;
  elsif p_kind = 'folder' then
    perform 1 from public.folders where id = p_id and user_id = uid;
    if not found then raise exception 'not your folder' using errcode = '42501'; end if;
    select * into s from public.shares where folder_id = p_id;
  else
    raise exception 'unknown kind %', p_kind;
  end if;

  if s.id is null then
    insert into public.shares (owner_id, deck_id, folder_id, access, role)
    values (
      uid,
      case when p_kind = 'deck' then p_id end,
      case when p_kind = 'folder' then p_id end,
      p_access,
      p_role
    )
    returning * into s;
  elsif s.revoked_at is not null then
    delete from public.share_members where share_id = s.id;
    update public.shares
    set access = p_access, role = p_role, revoked_at = null,
        token = replace(gen_random_uuid()::text, '-', '')
    where id = s.id
    returning * into s;
  else
    update public.shares set access = p_access, role = p_role where id = s.id returning * into s;
  end if;

  return public.share_settings_json(s.id);
end;
$$;

revoke all on function public.share_set(text, uuid, text, text) from public, anon;
grant execute on function public.share_set(text, uuid, text, text) to authenticated;

-- A new link. The old one stops working at once; members keep their access.
create or replace function public.share_reset_link(p_share uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  s public.shares := public.owned_share(p_share);
begin
  update public.shares set token = replace(gen_random_uuid()::text, '-', '') where id = s.id;
  return public.share_settings_json(s.id);
end;
$$;

revoke all on function public.share_reset_link(uuid) from public, anon;
grant execute on function public.share_reset_link(uuid) to authenticated;

-- Stops sharing. The link and every membership stop working; the row stays so
-- that the link can say it was turned off rather than that it never existed.
create or replace function public.share_stop(p_share uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  s public.shares := public.owned_share(p_share);
begin
  update public.shares set revoked_at = now() where id = s.id;
  return public.share_settings_json(s.id);
end;
$$;

revoke all on function public.share_stop(uuid) from public, anon;
grant execute on function public.share_stop(uuid) to authenticated;

-- Invites an address, or changes the role of one already invited — the same
-- address twice is one invitation. Not the owner's own.
create or replace function public.share_invite(p_share uuid, p_email text, p_role text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  s       public.shares := public.owned_share(p_share);
  v_email text := lower(btrim(p_email));
  mine    text;
begin
  if s.revoked_at is not null then
    raise exception 'share is off' using errcode = '22023';
  end if;
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then
    raise exception 'not an email address' using errcode = '22023';
  end if;
  select lower(u.email) into mine from auth.users u where u.id = auth.uid();
  if v_email = mine then
    raise exception 'that is you' using errcode = '22023';
  end if;
  if p_role not in ('viewer', 'editor') then
    raise exception 'unknown role %', p_role using errcode = '22023';
  end if;

  insert into public.share_members (share_id, email, role, via)
  values (s.id, v_email, p_role, 'invite')
  on conflict (share_id, email) do update set role = excluded.role;

  return public.share_settings_json(s.id);
end;
$$;

revoke all on function public.share_invite(uuid, text, text) from public, anon;
grant execute on function public.share_invite(uuid, text, text) to authenticated;

-- Changes a member's role. A link member given a role of their own becomes an
-- invited one, so the role sticks when the link changes.
create or replace function public.share_member_role(p_member uuid, p_role text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  m public.share_members;
  s public.shares;
begin
  select * into m from public.share_members where id = p_member;
  if not found then raise exception 'no such member' using errcode = '42501'; end if;
  s := public.owned_share(m.share_id);
  if p_role not in ('viewer', 'editor') then
    raise exception 'unknown role %', p_role using errcode = '22023';
  end if;
  update public.share_members
  set role = p_role,
      via = 'invite',
      email = coalesce(email, (select lower(u.email) from auth.users u where u.id = m.user_id))
  where id = m.id;
  return public.share_settings_json(s.id);
end;
$$;

revoke all on function public.share_member_role(uuid, text) from public, anon;
grant execute on function public.share_member_role(uuid, text) to authenticated;

-- Takes someone off a share. Their own progress stays theirs; it just stops
-- being writable, because they can no longer study the cards.
create or replace function public.share_member_remove(p_member uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  m public.share_members;
  s public.shares;
begin
  select * into m from public.share_members where id = p_member;
  if not found then raise exception 'no such member' using errcode = '42501'; end if;
  s := public.owned_share(m.share_id);
  delete from public.share_members where id = m.id;
  return public.share_settings_json(s.id);
end;
$$;

revoke all on function public.share_member_remove(uuid) from public, anon;
grant execute on function public.share_member_remove(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- For whoever has the link.
-- ---------------------------------------------------------------------------

-- The content of one deck, as a recipient may see it: no schedule in it.
-- Cards only if they belong to the deck's owner, so nothing anyone else
-- managed to point at the deck comes along.
create or replace function public.shared_deck_json(p_deck uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', d.id,
    'title', d.title,
    'subject', d.subject,
    'description', d.description,
    'updated_at', greatest(d.updated_at, (select max(c.updated_at) from public.cards c where c.deck_id = d.id)),
    'cards', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'front', c.front, 'back', c.back, 'position', c."position")
             order by c."position", c.created_at)
      from public.cards c
      where c.deck_id = d.id and c.user_id = d.user_id
    ), '[]'::jsonb)
  )
  from public.decks d
  where d.id = p_deck
$$;

revoke all on function public.shared_deck_json(uuid) from public, anon, authenticated;

-- The caller's role on a share: 'owner', a member's, the link's, or null.
create or replace function public.share_access(p_share uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  uid    uuid := auth.uid();
  s      public.shares;
  v_role text;
begin
  select * into s from public.shares where id = p_share;
  if not found then
    return null;
  end if;
  if uid is not null and s.owner_id = uid then
    return 'owner';
  end if;
  if s.revoked_at is not null then
    return null;
  end if;
  v_role := public.member_role(s.id, uid);
  if v_role is null and s.access = 'link' then
    v_role := s.role;
  end if;
  return v_role;
end;
$$;

revoke all on function public.share_access(uuid) from public, anon, authenticated;

-- Opens a link. Always answers, never raises: the status says what to show.
--
--   ok         content follows, with the caller's role
--   revoked    the owner turned sharing off
--   not_found  no such link — mistyped, reset, or the deck is gone
--   sign_in    invited-only, and nobody is signed in to be invited
--   no_access  invited-only, and the signed-in reader is not on it
--
-- A reader who is not signed in gets at most 'viewer' from a link that says
-- 'editor': editing is done as someone.
create or replace function public.share_open(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid        uuid := auth.uid();
  s          public.shares;
  v_role     text;
  owner_name text;
  body       jsonb;
begin
  perform public.claim_invitations();

  select * into s from public.shares where token = p_token;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if s.revoked_at is not null and s.owner_id is distinct from uid then
    return jsonb_build_object('status', 'revoked',
                              'kind', case when s.deck_id is not null then 'deck' else 'folder' end);
  end if;

  v_role := public.share_access(s.id);
  if v_role is null then
    return jsonb_build_object('status', case when uid is null then 'sign_in' else 'no_access' end,
                              'kind', case when s.deck_id is not null then 'deck' else 'folder' end);
  end if;
  if uid is null and v_role = 'editor' then
    v_role := 'viewer';
  end if;

  select p.name into owner_name from public.profiles p where p.id = s.owner_id;

  if s.deck_id is not null then
    body := jsonb_build_object(
      'kind', 'deck',
      'name', (select d.title from public.decks d where d.id = s.deck_id),
      'decks', jsonb_build_array(public.shared_deck_json(s.deck_id))
    );
  else
    body := jsonb_build_object(
      'kind', 'folder',
      'name', (select f.name from public.folders f where f.id = s.folder_id),
      'decks', coalesce((
        select jsonb_agg(public.shared_deck_json(d.id) order by d.created_at)
        from public.decks d
        where d.folder_id = s.folder_id and d.user_id = s.owner_id
      ), '[]'::jsonb)
    );
  end if;

  return body || jsonb_build_object(
    'status', 'ok',
    'token', s.token,
    'share_id', s.id,
    'role', v_role,
    'access', s.access,
    'owner_name', coalesce(owner_name, 'A Gunit reader'),
    'joined', uid is not null and exists (
      select 1 from public.share_members m where m.share_id = s.id and m.user_id = uid
    ),
    -- The owner's own deck or folder, for the owner opening their own link.
    'resource_id', coalesce(s.deck_id, s.folder_id)
  );
end;
$$;

revoke all on function public.share_open(text) from public;
grant execute on function public.share_open(text) to anon, authenticated;

-- Joins a link, so it is on the reader's Shared with me list and their
-- progress can be kept. Invited readers are already members; this claims
-- the invitation if it has not been. The owner joining their own is a no.
create or replace function public.share_join(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  s   public.shares;
begin
  if uid is null then
    return jsonb_build_object('status', 'sign_in');
  end if;
  perform public.claim_invitations();

  select * into s from public.shares where token = p_token;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if s.owner_id = uid then
    return jsonb_build_object('status', 'owner');
  end if;
  if s.revoked_at is not null then
    return jsonb_build_object('status', 'revoked');
  end if;
  if public.member_role(s.id, uid) is not null then
    return jsonb_build_object('status', 'ok', 'role', public.member_role(s.id, uid));
  end if;
  if s.access <> 'link' then
    return jsonb_build_object('status', 'no_access');
  end if;

  -- A link member whose link was off and is now back on is still here; this
  -- only adds one who is not.
  insert into public.share_members (share_id, user_id, via, joined_at)
  values (s.id, uid, 'link', now())
  on conflict (share_id, user_id) do nothing;

  return jsonb_build_object('status', 'ok', 'role', s.role);
end;
$$;

revoke all on function public.share_join(text) from public, anon;
grant execute on function public.share_join(text) to authenticated;

-- Leaves a share: off the list, and no longer studied as shared. An
-- invitation left is gone; the owner can send another.
create or replace function public.share_leave(p_share uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.share_members where share_id = p_share and user_id = auth.uid()
$$;

revoke all on function public.share_leave(uuid) from public, anon;
grant execute on function public.share_leave(uuid) to authenticated;

-- Everything shared with the caller that they can still open.
create or replace function public.shared_with_me()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    return '[]'::jsonb;
  end if;
  perform public.claim_invitations();

  return coalesce((
    select jsonb_agg(item order by (item ->> 'updated_at') desc)
    from (
      select jsonb_build_object(
        'share_id', s.id,
        'token', s.token,
        'kind', case when s.deck_id is not null then 'deck' else 'folder' end,
        'name', coalesce(d.title, f.name),
        'owner_name', coalesce(p.name, 'A Gunit reader'),
        'role', public.member_role(s.id, uid),
        'decks', case when s.deck_id is not null then 1
                      else (select count(*) from public.decks x where x.folder_id = s.folder_id and x.user_id = s.owner_id) end,
        'cards', (select count(*) from public.cards c
                  join public.decks x on x.id = c.deck_id
                  where c.user_id = s.owner_id
                    and (x.id = s.deck_id or (s.folder_id is not null and x.folder_id = s.folder_id))),
        'updated_at', greatest(
          s.updated_at,
          (select max(x.updated_at) from public.decks x
            where x.id = s.deck_id or (s.folder_id is not null and x.folder_id = s.folder_id)),
          (select max(c.updated_at) from public.cards c
            join public.decks x on x.id = c.deck_id
            where x.id = s.deck_id or (s.folder_id is not null and x.folder_id = s.folder_id))
        )
      ) as item
      from public.share_members m
      join public.shares s on s.id = m.share_id
      left join public.decks d on d.id = s.deck_id
      left join public.folders f on f.id = s.folder_id
      left join public.profiles p on p.id = s.owner_id
      where m.user_id = uid
        and s.owner_id <> uid
        and public.member_role(s.id, uid) is not null
    ) as listed
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.shared_with_me() from public, anon;
grant execute on function public.shared_with_me() to authenticated;

-- An editor's changes to a shared deck's cards: content only.
--
-- Cards are written as the deck owner's, because a card belongs to its deck's
-- owner — their schedule lives on it, and their devices sync it. Only front,
-- back and position are ever written: an edit here cannot touch the owner's
-- schedule, and a new card arrives new. A card id that is not already this
-- deck's owner's card in this deck is not updated; one the owner deleted is
-- refused, as sync_library refuses it. Removals are recorded under the owner
-- the same way, so the owner's devices take the card off rather than send it
-- back. The deck itself — title, deleting it — stays the owner's.
create or replace function public.share_edit_cards(
  p_token  text,
  p_deck   uuid,
  p_upsert jsonb,
  p_remove uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid     uuid := auth.uid();
  s       public.shares;
  v_owner uuid;
  refused uuid[];
begin
  if uid is null then
    raise exception 'sign in to edit' using errcode = '42501';
  end if;
  perform public.claim_invitations();

  select * into s from public.shares where token = p_token;
  -- coalesce: a stranger's role is null, and null not in (...) is null, not true.
  if not found or coalesce(public.share_access(s.id), '') not in ('editor', 'owner') then
    raise exception 'not an editor of this share' using errcode = '42501';
  end if;
  v_owner := s.owner_id;

  perform 1 from public.decks d
  where d.id = p_deck
    and d.user_id = v_owner
    and (d.id = s.deck_id or (s.folder_id is not null and d.folder_id = s.folder_id));
  if not found then
    raise exception 'deck is not in this share' using errcode = '42501';
  end if;

  select coalesce(array_agg(c.id), '{}') into refused
  from jsonb_to_recordset(coalesce(p_upsert, '[]'::jsonb)) as c(id uuid)
  where exists (select 1 from public.deleted_rows t where t.user_id = v_owner and t.id = c.id)
     or exists (select 1 from public.cards x where x.id = c.id and (x.deck_id <> p_deck or x.user_id <> v_owner));

  insert into public.cards (id, deck_id, user_id, front, back, "position")
  select c.id, p_deck, v_owner, c.front, c.back, coalesce(c."position", 0)
  from jsonb_to_recordset(coalesce(p_upsert, '[]'::jsonb)) as c(
    id uuid, front text, back text, "position" integer
  )
  where c.id <> all (refused)
  on conflict (id) do update set
    front      = excluded.front,
    back       = excluded.back,
    "position" = excluded."position";

  with gone as (
    delete from public.cards
    where id = any (coalesce(p_remove, '{}'))
      and deck_id = p_deck
      and user_id = v_owner
    returning id
  )
  insert into public.deleted_rows (user_id, id, kind)
  select v_owner, id, 'card' from gone
  on conflict do nothing;

  update public.decks set updated_at = now() where id = p_deck;

  return jsonb_build_object('refused', to_jsonb(refused));
end;
$$;

revoke all on function public.share_edit_cards(text, uuid, jsonb, uuid[]) from public, anon;
grant execute on function public.share_edit_cards(text, uuid, jsonb, uuid[]) to authenticated;

commit;
