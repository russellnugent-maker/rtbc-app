-- DRAFT. NOT APPLIED. Not needed for the RTBC launch.
-- Run the World readiness: build spec §3 (docs/BUILD-SPEC-s2-s3.md), shape approved by Russell
-- on 13 Nov 2026. Additive: every existing RTBC row (RTBC 00001 and its approved submission) and
-- the live app keep working unchanged. Every new column defaults to 'rtbc', and slot_key is
-- filled in by a trigger, so the current app's inserts need no change.
--
-- Constraint names are the ones Postgres generated for migration rtbc_core (12 Nov 2026). Each
-- DROP is guarded: the migration aborts if the constraint is missing or isn't the one expected.
-- Claude Code does not query production; the Supabase chat runs the read-only checks at the end
-- before AND after applying.

-- 0. Guards ---------------------------------------------------------------------------------------
do $guard$
declare d text;
begin
  select pg_get_constraintdef(oid) into d from pg_constraint
   where conrelid = 'public.rtbc_passports'::regclass and conname = 'rtbc_passports_passport_no_key';
  if d is distinct from 'UNIQUE (passport_no)' then raise exception 'rtbc_passports_passport_no_key is %', d; end if;

  select pg_get_constraintdef(oid) into d from pg_constraint
   where conrelid = 'public.rtbc_passports'::regclass and conname = 'rtbc_passports_check';
  if d is null or d not like '%expires_at IS NOT NULL%' then raise exception 'rtbc_passports_check is %', d; end if;

  select pg_get_constraintdef(oid) into d from pg_constraint
   where conrelid = 'public.rtbc_submissions'::regclass and conname = 'rtbc_submissions_province_check';
  if d is null or d not like '%Western Cape%' then raise exception 'rtbc_submissions_province_check is %', d; end if;

  select pg_get_constraintdef(oid) into d from pg_constraint
   where conrelid = 'public.rtbc_submissions'::regclass and conname = 'rtbc_submissions_distance_m_check';
  if d is null or d not like '%21097%' then raise exception 'rtbc_submissions_distance_m_check is %', d; end if;

  if to_regclass('public.rtbc_passports_one_live_per_user') is null then raise exception 'rtbc_passports_one_live_per_user missing'; end if;
  if to_regclass('public.rtbc_submissions_one_approved_per_province') is null then raise exception 'rtbc_submissions_one_approved_per_province missing'; end if;
end
$guard$;

-- 1. Collections ----------------------------------------------------------------------------------
create table public.rtbc_collections (
  id                text primary key check (id ~ '^[a-z][a-z0-9_]{1,15}$'),
  name              text not null,
  number_prefix     text not null,                       -- 'RTBC' -> 'RTBC 00001'
  validity_months   integer check (validity_months > 0), -- null = the passport never expires
  verification_mode text not null default 'race_proof' check (verification_mode in ('race_proof', 'device_run')),
  is_open           boolean not null default false,
  created_at        timestamptz not null default now()
);
insert into public.rtbc_collections (id, name, number_prefix, validity_months, verification_mode, is_open)
values ('rtbc', 'Run the Beloved Country', 'RTBC', 24, 'race_proof', true);

alter table public.rtbc_collections enable row level security;
create policy rtbc_collections_read on public.rtbc_collections for select using (true);
-- No insert/update policy: collections are added by migration only.

-- 2. Passports ------------------------------------------------------------------------------------
alter table public.rtbc_passports
  add column collection text not null default 'rtbc' references public.rtbc_collections (id);

-- Passport numbers: unique per collection (each collection counts from 00001).
alter table public.rtbc_passports drop constraint rtbc_passports_passport_no_key;
alter table public.rtbc_passports add constraint rtbc_passports_passport_no_key unique (collection, passport_no);

-- One live passport per runner PER COLLECTION (a runner can hold RTBC and RTW at once).
drop index public.rtbc_passports_one_live_per_user;
create unique index rtbc_passports_one_live_per_user
  on public.rtbc_passports (user_id, collection) where status in ('pending_payment', 'active');

-- Issued passports need a number and an issue date; an expiry only in RTBC.
alter table public.rtbc_passports drop constraint rtbc_passports_check;
alter table public.rtbc_passports add constraint rtbc_passports_check check (
  status = 'pending_payment'
  or (issued_at is not null and passport_no is not null and (collection <> 'rtbc' or expires_at is not null))
);

-- Target for the submissions' composite foreign key (section 3).
alter table public.rtbc_passports add constraint rtbc_passports_id_collection_key unique (id, collection);

-- 3. Submissions ----------------------------------------------------------------------------------
-- The submission carries its passport's collection (enforced by the composite FK), so the
-- RTBC-only rules stay plain check constraints.
alter table public.rtbc_submissions add column collection text not null default 'rtbc';
alter table public.rtbc_submissions add constraint rtbc_submissions_passport_collection_fkey
  foreign key (passport_id, collection) references public.rtbc_passports (id, collection) on delete cascade;

-- RTBC province name -> slot key, in passport order.
create or replace function public.rtbc_province_slot(p text) returns text
language sql immutable as $$
  select case p
    when 'Western Cape' then 'WC'  when 'Eastern Cape' then 'EC'  when 'Northern Cape' then 'NC'
    when 'Free State'   then 'FS'  when 'Gauteng'      then 'GP'  when 'KwaZulu-Natal' then 'KZN'
    when 'North West'   then 'NW'  when 'Limpopo'      then 'LP'  when 'Mpumalanga'    then 'MP'
  end
$$;

-- province: required and one of the nine in RTBC only. (A bare "province in (...)" would let a
-- null through, so RTBC rows also need it not null.)
alter table public.rtbc_submissions alter column province drop not null;
alter table public.rtbc_submissions drop constraint rtbc_submissions_province_check;
alter table public.rtbc_submissions add constraint rtbc_submissions_province_check check (
  collection <> 'rtbc' or (province is not null and province in (
    'Western Cape', 'Eastern Cape', 'Northern Cape', 'Free State', 'Gauteng',
    'KwaZulu-Natal', 'North West', 'Limpopo', 'Mpumalanga'))
);

-- 21.1 km minimum in RTBC only. distance_m stays not null everywhere.
alter table public.rtbc_submissions drop constraint rtbc_submissions_distance_m_check;
alter table public.rtbc_submissions add constraint rtbc_submissions_distance_m_check check (
  collection <> 'rtbc' or distance_m >= 21097
);

-- slot_key: 'WC'... in RTBC (must match the province), ISO country code (optionally -CITY) elsewhere.
alter table public.rtbc_submissions add column slot_key text;
update public.rtbc_submissions set slot_key = public.rtbc_province_slot(province) where slot_key is null;

-- The current app doesn't send slot_key: fill it in from the province for RTBC rows.
create or replace function public.rtbc_submissions_fill_slot() returns trigger
language plpgsql as $$
begin
  if new.slot_key is null and new.collection = 'rtbc' then
    new.slot_key := public.rtbc_province_slot(new.province);
  end if;
  return new;
end $$;
create trigger rtbc_submissions_fill_slot before insert or update of province, slot_key on public.rtbc_submissions
  for each row execute function public.rtbc_submissions_fill_slot();

alter table public.rtbc_submissions alter column slot_key set not null;
alter table public.rtbc_submissions add constraint rtbc_submissions_slot_key_check check (
  slot_key ~ '^[A-Z]{2,3}(-[A-Z0-9]{1,8})?$'
  and (collection <> 'rtbc' or slot_key = public.rtbc_province_slot(province))
);

-- One stamp per slot (was: per province).
drop index public.rtbc_submissions_one_approved_per_province;
create unique index rtbc_submissions_one_approved_per_slot
  on public.rtbc_submissions (passport_id, slot_key) where status in ('auto_approved', 'approved');

-- 4. Activation: number from the collection's own sequence, expiry from its validity ---------------
create or replace function public.rtbc_next_passport_no(p_collection text) returns integer
language plpgsql security definer set search_path = public as $$
begin
  if p_collection = 'rtbc' then return nextval('public.rtbc_passport_no_seq'); end if;
  -- A new collection is added with its own sequence: rtbc_passport_no_seq_<id>.
  return nextval(format('public.rtbc_passport_no_seq_%s', p_collection)::regclass);
end $$;
revoke all on function public.rtbc_next_passport_no(text) from public, anon, authenticated;

create or replace function public.rtbc_activate_passport(p_passport_id uuid)
returns public.rtbc_passports
language plpgsql security definer set search_path = public as $$
declare v public.rtbc_passports;
begin
  update public.rtbc_passports p
     set status      = 'active',
         passport_no = coalesce(p.passport_no, public.rtbc_next_passport_no(p.collection)),
         issued_at   = coalesce(p.issued_at, now()),
         expires_at  = coalesce(p.expires_at,
                         case when c.validity_months is null then null
                              else now() + make_interval(months => c.validity_months) end)
    from public.rtbc_collections c
   where p.id = p_passport_id and p.status = 'pending_payment' and c.id = p.collection
  returning p.* into v;
  return v;   -- null if already active (ITN retries are harmless)
end $$;
revoke all on function public.rtbc_activate_passport(uuid) from public, anon, authenticated;

-- 5. Completion: RTBC only (9 provinces). Other collections never "complete". -----------------------
create or replace function public.rtbc_check_completion() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.collection = 'rtbc' and new.status in ('auto_approved', 'approved') then
    if (select count(distinct slot_key) from public.rtbc_submissions
         where passport_id = new.passport_id and status in ('auto_approved', 'approved')) = 9 then
      update public.rtbc_passports
         set status = 'completed', completed_at = coalesce(completed_at, now())
       where id = new.passport_id and status = 'active';
    end if;
  end if;
  return new;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- Read-only checks for the Supabase chat, before AND after (the counts must not change):
--   select collection, status, passport_no, expires_at is not null as has_expiry from rtbc_passports;
--   select collection, province, slot_key, status from rtbc_submissions;
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid in ('public.rtbc_passports'::regclass, 'public.rtbc_submissions'::regclass) order by 1;
-- Expected after: RTBC 00001 is collection 'rtbc' with an expiry; its submission has the slot_key
-- matching its province.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────
