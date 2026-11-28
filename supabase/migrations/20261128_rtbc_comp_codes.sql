-- RTBC comp (free-entry) codes. Applied to lkazcbvczleavcwlosrx on 28 Nov 2026.
-- A code is redeemed server-side by netlify/functions/rtbc-entry (service role):
-- it sets the entry fee to R0, records the redemption and activates the passport.
-- Comp entries have entry_fee_cents = 0, so they're excluded from the per-paid-entry
-- charity donation and from income in the RunningCalendar statement.

create table if not exists public.rtbc_comp_codes (
  code text primary key check (code = upper(code)),
  label text not null,                       -- who/what it's for
  max_uses integer not null default 1 check (max_uses > 0),
  uses integer not null default 0,
  expires_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.rtbc_comp_redemptions (
  id uuid primary key default gen_random_uuid(),
  code text not null references public.rtbc_comp_codes(code),
  user_id uuid not null,
  passport_id uuid not null unique references public.rtbc_passports(id),
  redeemed_at timestamptz not null default now()
);
alter table public.rtbc_comp_codes enable row level security;
alter table public.rtbc_comp_redemptions enable row level security;

create or replace function public.rtbc_redeem_comp_code(p_code text, p_passport_id uuid, p_user uuid)
returns public.rtbc_passports
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_code public.rtbc_comp_codes;
  v public.rtbc_passports;
begin
  select * into v_code from rtbc_comp_codes where code = upper(trim(p_code)) for update;
  if not found or not v_code.active then raise exception 'invalid_code'; end if;
  if v_code.expires_at is not null and v_code.expires_at < now() then raise exception 'code_expired'; end if;
  if v_code.uses >= v_code.max_uses then raise exception 'code_used'; end if;
  if not exists (select 1 from rtbc_passports where id = p_passport_id and user_id = p_user and status = 'pending_payment') then
    raise exception 'no_pending_entry';
  end if;
  update rtbc_passports set entry_fee_cents = 0, referral_code = v_code.code where id = p_passport_id;
  insert into rtbc_comp_redemptions (code, user_id, passport_id) values (v_code.code, p_user, p_passport_id);
  update rtbc_comp_codes set uses = uses + 1 where code = v_code.code;
  v := public.rtbc_activate_passport(p_passport_id);
  return v;
end $$;
revoke all on function public.rtbc_redeem_comp_code(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.rtbc_redeem_comp_code(text, uuid, uuid) to service_role;

-- To add a code:
-- insert into rtbc_comp_codes (code, label, max_uses, expires_at)
-- values ('RUNNINGMANN', 'Stuart Mann (The Running Mann), ambassador', 1, '2027-03-01 00:00+02');
