-- Run the Beloved Country (RTBC) — core schema
-- Shared Energy Lab Supabase project (lkazcbvczleavcwlosrx), same model as YNM.
-- DRAFT for Russell's approval. Nothing here touches existing Energy Lab / YNM data
-- except widening profiles.app_source to allow 'rtbc'.

-- 1. Let RTBC sign-ups be tagged as such ------------------------------------
alter table public.profiles drop constraint profiles_app_source_check;
alter table public.profiles add constraint profiles_app_source_check
  check (app_source = any (array['energylab','ynm','rtbc']));

-- handle_new_user whitelists app_source; add 'rtbc' to that whitelist.
-- Only that one line changes: the live definition is re-created with a single
-- text replacement, and the migration aborts if the line isn't found exactly once.
do $mig$
declare d text; n int;
begin
  d := pg_get_functiondef('public.handle_new_user'::regproc);
  n := (length(d) - length(replace(d, $q$not in ('energylab', 'ynm') then$q$, ''))) / length($q$not in ('energylab', 'ynm') then$q$);
  if n <> 1 then raise exception 'handle_new_user whitelist line found % times, expected 1', n; end if;
  execute replace(d, $q$not in ('energylab', 'ynm') then$q$, $q$not in ('energylab', 'ynm', 'rtbc') then$q$);
end
$mig$;

-- 2. Passports ----------------------------------------------------------------
create sequence if not exists public.rtbc_passport_no_seq start 1;

create table public.rtbc_passports (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  passport_no           integer unique,                 -- assigned on payment; shown as 'RTBC 00001'
  status                text not null default 'pending_payment'
                        check (status in ('pending_payment','active','completed','expired','cancelled','disqualified')),
  name_on_passport      text not null check (length(trim(name_on_passport)) between 2 and 80),
  date_of_birth         date not null,
  guardian_name         text,
  guardian_email        text,
  guardian_consent_at   timestamptz,
  terms_version         text not null,
  terms_accepted_at     timestamptz not null,
  entry_fee_cents       integer check (entry_fee_cents >= 0),
  referral_code         text,                           -- e.g. 'runningcalendar' (affiliate, #102/#107)
  leaderboard_consent   boolean not null default false,
  issued_at             timestamptz,
  expires_at            timestamptz,                    -- issued_at + 24 months (+ up to 6 on extension)
  extended_at           timestamptz,
  extension_reason      text check (extension_reason in ('medical','paid')),
  completed_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  -- 16–17 need guardian consent (T&Cs 2.1); age is checked at entry date in the entry function
  check (status = 'pending_payment' or (issued_at is not null and expires_at is not null and passport_no is not null)),
  check (extension_reason is null or extended_at is not null)
);

-- one live passport per runner (T&Cs 2.4)
create unique index rtbc_passports_one_live_per_user
  on public.rtbc_passports (user_id) where status in ('pending_payment','active');
create index rtbc_passports_status_idx on public.rtbc_passports (status);

-- 3. Province proof submissions --------------------------------------------------
create table public.rtbc_submissions (
  id              uuid primary key default gen_random_uuid(),
  passport_id     uuid not null references public.rtbc_passports(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  province        text not null check (province in (
                    'Western Cape','Eastern Cape','Northern Cape','Free State','Gauteng',
                    'KwaZulu-Natal','North West','Limpopo','Mpumalanga')),
  rc_event_id     bigint references public.rc_events(id) on delete set null,  -- null = race not on RunningCalendar
  race_name       text not null,
  race_date       date not null,
  distance_m      integer not null check (distance_m >= 21097),
  finish_seconds  integer not null check (finish_seconds > 0),
  proof_url       text,                                  -- official results link
  proof_file_path text,                                  -- certificate upload in storage bucket rtbc-proofs
  status          text not null default 'pending'
                  check (status in ('pending','flagged','auto_approved','approved','rejected','withdrawn')),
  check_results   jsonb,                                 -- what the automated check found
  flag_reasons    text[],
  reviewed_by     uuid references auth.users(id),
  reviewed_at     timestamptz,
  review_note     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (proof_url is not null or proof_file_path is not null)
);

-- each province counts once (T&Cs 3.4)
create unique index rtbc_submissions_one_approved_per_province
  on public.rtbc_submissions (passport_id, province) where status in ('auto_approved','approved');
create index rtbc_submissions_queue_idx on public.rtbc_submissions (status, created_at);

-- 4. updated_at -------------------------------------------------------------------
create or replace function public.rtbc_touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

create trigger rtbc_passports_touch before update on public.rtbc_passports
  for each row execute function public.rtbc_touch_updated_at();
create trigger rtbc_submissions_touch before update on public.rtbc_submissions
  for each row execute function public.rtbc_touch_updated_at();

-- 5. Activate a passport on payment (called by the PayFast ITN function, service role)
--    payfast_payments.source_key will be 'rtbc_entry:<passport id>'
create or replace function public.rtbc_activate_passport(p_passport_id uuid)
returns public.rtbc_passports
language plpgsql security definer set search_path = public as $$
declare v public.rtbc_passports;
begin
  update public.rtbc_passports
     set status      = 'active',
         passport_no = coalesce(passport_no, nextval('public.rtbc_passport_no_seq')),
         issued_at   = coalesce(issued_at, now()),
         expires_at  = coalesce(expires_at, now() + interval '24 months')
   where id = p_passport_id and status = 'pending_payment'
  returning * into v;
  return v;   -- null if already active (ITN retries are harmless)
end $$;
revoke all on function public.rtbc_activate_passport(uuid) from public, anon, authenticated;

-- 6. Mark complete when the ninth province is approved ---------------------------
create or replace function public.rtbc_check_completion() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('auto_approved','approved') then
    if (select count(distinct province) from public.rtbc_submissions
         where passport_id = new.passport_id and status in ('auto_approved','approved')) = 9 then
      update public.rtbc_passports
         set status = 'completed', completed_at = coalesce(completed_at, now())
       where id = new.passport_id and status = 'active';
    end if;
  end if;
  return new;
end $$;

create trigger rtbc_submissions_completion
  after insert or update of status on public.rtbc_submissions
  for each row execute function public.rtbc_check_completion();

-- 7. Row level security ------------------------------------------------------------
alter table public.rtbc_passports   enable row level security;
alter table public.rtbc_submissions enable row level security;

-- runners see their own; platform admins see all. Passports are created and
-- activated server-side only (entry function + PayFast ITN), so no client insert.
create policy rtbc_passports_select on public.rtbc_passports
  for select using (user_id = auth.uid() or public.is_platform_admin());
create policy rtbc_passports_admin_update on public.rtbc_passports
  for update using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy rtbc_submissions_select on public.rtbc_submissions
  for select using (user_id = auth.uid() or public.is_platform_admin());
-- runner submits proof for their own ACTIVE passport; always starts as 'pending'
create policy rtbc_submissions_insert on public.rtbc_submissions
  for insert with check (
    user_id = auth.uid()
    and status = 'pending'
    and reviewed_by is null
    and exists (select 1 from public.rtbc_passports p
                 where p.id = passport_id and p.user_id = auth.uid() and p.status = 'active')
  );
-- only admins approve / reject
create policy rtbc_submissions_admin_update on public.rtbc_submissions
  for update using (public.is_platform_admin()) with check (public.is_platform_admin());

-- 8. Private storage for certificate uploads -----------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('rtbc-proofs', 'rtbc-proofs', false, 10485760,
        array['image/jpeg','image/png','image/heic','application/pdf'])
on conflict (id) do nothing;

-- files live under <user id>/...
create policy rtbc_proofs_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'rtbc-proofs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy rtbc_proofs_read_own_or_admin on storage.objects for select to authenticated
  using (bucket_id = 'rtbc-proofs'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_platform_admin()));
