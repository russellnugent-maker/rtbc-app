-- RTBC: passport photo + finisher medal photos
alter table public.rtbc_passports   add column if not exists photo_path text;
alter table public.rtbc_submissions add column if not exists medal_photo_path text;

-- Private bucket for runner photos (passport photo, medal photos). Files under <user id>/...
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('rtbc-photos', 'rtbc-photos', false, 8388608, array['image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do nothing;

create policy rtbc_photos_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'rtbc-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy rtbc_photos_read_own_or_admin on storage.objects for select to authenticated
  using (bucket_id = 'rtbc-photos'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_platform_admin()));

-- Runners can't update their passport or submissions directly (admin-only RLS),
-- so these two narrow functions set ONLY the photo field, only on their own rows,
-- and only to a file inside their own folder.
create or replace function public.rtbc_set_passport_photo(p_path text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or p_path is null or p_path not like auth.uid()::text || '/%' then
    raise exception 'invalid photo path';
  end if;
  update public.rtbc_passports set photo_path = p_path
   where user_id = auth.uid() and status in ('active','completed','expired');
end $$;

create or replace function public.rtbc_set_medal_photo(p_submission_id uuid, p_path text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or p_path is null or p_path not like auth.uid()::text || '/%' then
    raise exception 'invalid photo path';
  end if;
  update public.rtbc_submissions set medal_photo_path = p_path
   where id = p_submission_id and user_id = auth.uid() and status not in ('rejected','withdrawn');
end $$;

revoke all on function public.rtbc_set_passport_photo(text) from public, anon;
revoke all on function public.rtbc_set_medal_photo(uuid, text) from public, anon;
grant execute on function public.rtbc_set_passport_photo(text) to authenticated;
grant execute on function public.rtbc_set_medal_photo(uuid, text) to authenticated;
