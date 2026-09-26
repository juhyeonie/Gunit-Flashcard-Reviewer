-- Clearing notifications: a reader removing their own.
--
-- 0007 gave the browser no way to delete a notification, and on purpose — a
-- table anyone can write to is one anyone can empty for somebody else. This
-- is the one way in: a function that deletes the caller's own rows and
-- nobody else's, the given ones or all of them. An id that is somebody
-- else's, or already gone, does nothing.
--
-- Run once in the SQL Editor, after 0007. Safe to re-run. Until it has run,
-- clearing still works on the device it was done on, and the account keeps
-- the notifications.

begin;

create or replace function public.notifications_clear(p_ids uuid[] default null)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.notifications
  where user_id = auth.uid()
    and (p_ids is null or id = any (p_ids))
$$;

revoke all on function public.notifications_clear(uuid[]) from public, anon;
grant execute on function public.notifications_clear(uuid[]) to authenticated;

commit;
