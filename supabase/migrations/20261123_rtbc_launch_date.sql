-- Early entries (Russell, 23 Nov 2026): entries open before launch, but every passport's
-- Challenge Window starts no earlier than launch day, 1 December 2026 (SAST).
-- issued_at drives everything else: the date shown on the identity page, expiry
-- (issued_at + 24 months), and the earliest race date the proof form accepts.
-- Passports already issued are unchanged.
create or replace function public.rtbc_activate_passport(p_passport_id uuid)
returns public.rtbc_passports
language plpgsql security definer set search_path = public as $$
declare
  v public.rtbc_passports;
  v_start timestamptz := greatest(now(), timestamptz '2026-12-01 00:00:00+02');
begin
  update public.rtbc_passports
     set status      = 'active',
         passport_no = coalesce(passport_no, nextval('public.rtbc_passport_no_seq')),
         issued_at   = coalesce(issued_at, v_start),
         expires_at  = coalesce(expires_at, v_start + interval '24 months')
   where id = p_passport_id and status = 'pending_payment'
  returning * into v;
  return v;   -- null if already active (ITN retries are harmless)
end $$;
revoke all on function public.rtbc_activate_passport(uuid) from public, anon, authenticated;
