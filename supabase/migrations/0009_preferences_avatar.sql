-- Gunit: the reader's language, text size and profile picture.
--
-- Run once in the Supabase SQL editor, after 0008. Safe to re-run.
--
-- Everything here extends what already exists rather than beside it: the two
-- preferences are columns on `profiles`, next to the theme and the rest of
-- the settings, under the same "own profile" policy from 0001 — a reader can
-- read and change their own row and nobody else's. No new table, and no new
-- grant.
--
-- The picture itself is a file in Supabase Storage, never in a table: a
-- private bucket, `avatars`, where each reader has a folder named after their
-- account id and can touch nothing outside it. `profiles.avatar_path` says
-- which file in that folder is the current one.
--
-- Private rather than public. Gunit only ever shows a reader their own
-- picture — nothing in sharing shows anyone else's — so there is no one a
-- public URL would serve, and a public bucket would put every picture on the
-- open web to anyone holding its address. The app downloads its own picture
-- with the reader's session and keeps a copy on the device for offline use.

begin;

-- ---------------------------------------------------------------------------
-- profiles: language, font_size, avatar_path.
--
-- All three may be null, and null means "not chosen on any device yet". A
-- new account gets nulls, so the first device to sign in keeps the language
-- and text size its reader had already picked as a guest, and sends them up,
-- instead of being reset to English and the default size by a row nobody
-- chose.
--
-- The language is checked for shape, not against a list: adding a language
-- to Gunit is a change to the app alone, with no migration to go with it. An
-- app that does not know a code a newer version wrote simply ignores it.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists language    text,
  add column if not exists font_size   text,
  add column if not exists avatar_path text;

alter table public.profiles drop constraint if exists language_is_a_code;
alter table public.profiles add constraint language_is_a_code
  check (language is null or language ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$');

alter table public.profiles drop constraint if exists font_size_is_known;
alter table public.profiles add constraint font_size_is_known
  check (font_size is null or font_size in ('small', 'default', 'large'));

-- A picture in the reader's own folder, and only there. Row level security on
-- storage already stops anyone reading another folder; this stops a profile
-- pointing at one, which would be a broken picture at best.
alter table public.profiles drop constraint if exists avatar_is_own;
alter table public.profiles add constraint avatar_is_own
  check (
    avatar_path is null
    or (avatar_path like id::text || '/%' and length(avatar_path) <= 200)
  );

-- ---------------------------------------------------------------------------
-- The avatars bucket.
--
-- Limits are enforced by Storage itself, whatever a browser sends: half a
-- megabyte, and only the three formats the app writes. The app sends a
-- 256-pixel square of a few kilobytes, so the limit is only ever met by
-- something that did not come from the app.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 524288, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Storage policies: your own folder, and nothing else.
--
-- The first segment of an object's name is the folder, and it has to be the
-- caller's own account id for every operation. Signed-out visitors get no
-- policy at all, so they can do nothing.
-- ---------------------------------------------------------------------------
drop policy if exists "avatars: read own" on storage.objects;
create policy "avatars: read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars: add own" on storage.objects;
create policy "avatars: add own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars: replace own" on storage.objects;
create policy "avatars: replace own" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars: remove own" on storage.objects;
create policy "avatars: remove own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

commit;
