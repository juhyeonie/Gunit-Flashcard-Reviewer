-- Notifications: telling a reader when a share reaches them or leaves them.
--
-- Written by the database, never by a browser. Triggers on the sharing tables
-- (0006) notice when someone is given a deck or folder, has their role
-- changed, or loses it, and write a row for that person. Nothing here asks
-- the sharing functions to change: whichever of them makes the change — and
-- any added later — the trigger sees it. There is no insert, update or delete
-- policy on the table, so a client cannot write a notification for anybody,
-- themselves included; reading is their own rows only.
--
-- What a row keeps is what the reader needs after the fact: who did it, what
-- it was called, and which share, so it can be opened again. The name and the
-- owner's display name are copied at the time, because a reader who has lost
-- access can no longer look either up. The link itself is not stored — it can
-- be reset — and is looked up fresh, and only while the reader still has
-- access, when notifications are listed.
--
-- Study reminders, sync and update notices are about one device, not an
-- account, and stay on the device. Only sharing is here.
--
-- Run once in the SQL Editor, after 0001-0006. Safe to re-run.

begin;

create table if not exists public.notifications (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users (id) on delete cascade,
  kind          text        not null,
  share_id      uuid        references public.shares (id) on delete set null,
  actor_id      uuid        references auth.users (id) on delete set null,
  actor_name    text,
  resource_kind text,
  resource_name text,
  role          text,
  -- The moment it was written, not the start of the transaction that wrote
  -- it: one change can write several, and they should keep their order.
  created_at    timestamptz not null default clock_timestamp(),
  read_at       timestamptz,

  constraint notification_kind_is_known
    check (kind in ('share_received', 'share_role_changed', 'share_removed', 'share_deleted')),
  constraint notification_resource_is_known check (resource_kind in ('deck', 'folder')),
  constraint notification_role_is_known check (role is null or role in ('viewer', 'editor'))
);

create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "read own notifications" on public.notifications;
create policy "read own notifications" on public.notifications
  for select to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Writing one. Security definer, and callable by nobody but the triggers.
-- ---------------------------------------------------------------------------
create or replace function public.notify_share(p_user uuid, p_kind text, p_share public.shares, p_role text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_user is null or p_user = p_share.owner_id then
    return;
  end if;
  -- The same news twice is noise: one unread "shared with you" per share.
  if p_kind = 'share_received' and exists (
    select 1 from public.notifications n
    where n.user_id = p_user and n.share_id = p_share.id and n.kind = 'share_received' and n.read_at is null
  ) then
    return;
  end if;

  insert into public.notifications (user_id, kind, share_id, actor_id, actor_name, resource_kind, resource_name, role)
  values (
    p_user,
    p_kind,
    case when p_kind = 'share_deleted' then null else p_share.id end,
    p_share.owner_id,
    coalesce((select p.name from public.profiles p where p.id = p_share.owner_id), 'A Gunit reader'),
    case when p_share.deck_id is not null then 'deck' else 'folder' end,
    coalesce(
      (select d.title from public.decks d where d.id = p_share.deck_id),
      (select f.name from public.folders f where f.id = p_share.folder_id)
    ),
    p_role
  );
end;
$$;

revoke all on function public.notify_share(uuid, text, public.shares, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Memberships: given, changed, taken away.
--
-- Only for changes the owner makes. A reader leaving a share does not need
-- telling, and an account being deleted — nobody signed in doing it — is not
-- news to deliver to it.
-- ---------------------------------------------------------------------------
create or replace function public.share_members_notify()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  s        public.shares;
  invitee  uuid;
  was_role text;
begin
  select * into s from public.shares where id = coalesce(new.share_id, old.share_id);
  if not found or s.revoked_at is not null then
    return null;
  end if;

  if tg_op = 'INSERT' then
    -- An invitation, by the owner. If the address already has an account,
    -- that account hears now; if not, it hears when it claims the invitation.
    if new.via = 'invite' and auth.uid() = s.owner_id then
      invitee := coalesce(new.user_id, (select u.id from auth.users u where lower(u.email) = new.email));
      perform public.notify_share(invitee, 'share_received', s, new.role);
    end if;

  elsif tg_op = 'UPDATE' then
    if old.user_id is null and new.user_id is not null and new.via = 'invite' then
      -- Claimed: news only if the invitation found nobody when it was sent.
      perform public.notify_share(new.user_id, 'share_received', s, new.role);
    elsif new.user_id is not null and auth.uid() = s.owner_id then
      was_role := case when old.via = 'invite' then old.role when s.access = 'link' then s.role end;
      if was_role is distinct from new.role and new.role is not null then
        perform public.notify_share(new.user_id, 'share_role_changed', s, new.role);
      end if;
    end if;

  elsif tg_op = 'DELETE' then
    -- Only when it is access lost. Off the list of a share anyone with the
    -- link can open, they can still open it, and "removed your access" would
    -- be untrue.
    if old.user_id is not null and auth.uid() = s.owner_id and s.access = 'invited' then
      perform public.notify_share(old.user_id, 'share_removed', s, null);
    end if;
  end if;

  return null;
end;
$$;

revoke all on function public.share_members_notify() from public, anon, authenticated;

drop trigger if exists share_members_notify on public.share_members;
create trigger share_members_notify
  after insert or update or delete on public.share_members
  for each row execute function public.share_members_notify();

-- ---------------------------------------------------------------------------
-- The share itself: turned off, narrowed to invited-only, its link role
-- changed, or gone with its deck or folder.
-- ---------------------------------------------------------------------------
create or replace function public.shares_notify()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  m record;
begin
  if auth.uid() is distinct from coalesce(new.owner_id, old.owner_id) then
    return coalesce(new, old);
  end if;

  if tg_op = 'UPDATE' then
    if old.revoked_at is null and new.revoked_at is not null then
      -- Stopped: everyone who could open it, can't.
      for m in
        select user_id from public.share_members
        where share_id = new.id and user_id is not null and (via = 'invite' or old.access = 'link')
      loop
        perform public.notify_share(m.user_id, 'share_removed', old, null);
      end loop;
    elsif new.revoked_at is null and old.access = 'link' and new.access = 'invited' then
      -- Narrowed: those who came by the link are not on the list.
      for m in
        select user_id from public.share_members where share_id = new.id and via = 'link'
      loop
        perform public.notify_share(m.user_id, 'share_removed', new, null);
      end loop;
    elsif new.revoked_at is null and new.access = 'link' and old.access = 'link' and old.role <> new.role then
      -- The link's role is its members' role.
      for m in
        select user_id from public.share_members where share_id = new.id and via = 'link'
      loop
        perform public.notify_share(m.user_id, 'share_role_changed', new, new.role);
      end loop;
    end if;
    return new;
  end if;

  -- DELETE: the deck or folder was deleted, and the share with it. Before the
  -- members go, so there is still someone to tell.
  if old.revoked_at is null then
    for m in
      select user_id from public.share_members
      where share_id = old.id and user_id is not null and (via = 'invite' or old.access = 'link')
    loop
      perform public.notify_share(m.user_id, 'share_deleted', old, null);
    end loop;
  end if;
  return old;
end;
$$;

revoke all on function public.shares_notify() from public, anon, authenticated;

drop trigger if exists shares_notify_update on public.shares;
create trigger shares_notify_update
  after update on public.shares
  for each row execute function public.shares_notify();

drop trigger if exists shares_notify_delete on public.shares;
create trigger shares_notify_delete
  before delete on public.shares
  for each row execute function public.shares_notify();

-- ---------------------------------------------------------------------------
-- Reading and marking.
-- ---------------------------------------------------------------------------

-- The caller's notifications, newest first, each with the link to open it
-- again while — and only while — they still have access.
create or replace function public.notifications_list(p_limit integer default 50)
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
    select jsonb_agg(jsonb_build_object(
             'id', n.id,
             'kind', n.kind,
             'share_id', n.share_id,
             'actor_name', n.actor_name,
             'resource_kind', n.resource_kind,
             'resource_name', n.resource_name,
             'role', n.role,
             'created_at', n.created_at,
             'read_at', n.read_at,
             'token', case when n.kind in ('share_received', 'share_role_changed')
                                and public.share_access(n.share_id) is not null
                           then (select s.token from public.shares s where s.id = n.share_id) end
           ) order by n.created_at desc)
    from (
      select * from public.notifications
      where user_id = uid
      order by created_at desc
      limit greatest(1, least(coalesce(p_limit, 50), 200))
    ) n
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.notifications_list(integer) from public, anon;
grant execute on function public.notifications_list(integer) to authenticated;

-- Marks the given notifications read, or all of them with null. Only ever
-- the caller's own; an id that is somebody else's does nothing.
create or replace function public.notifications_mark_read(p_ids uuid[] default null)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.notifications
  set read_at = now()
  where user_id = auth.uid()
    and read_at is null
    and (p_ids is null or id = any (p_ids))
$$;

revoke all on function public.notifications_mark_read(uuid[]) from public, anon;
grant execute on function public.notifications_mark_read(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: a notification written while its reader has Gunit open reaches
-- them without a reload. Supabase's publication, where there is one; row
-- level security still decides who is sent which row.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
     ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;

commit;
