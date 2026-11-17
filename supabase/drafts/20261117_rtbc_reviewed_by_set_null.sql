-- DRAFT, NOT APPLIED. Claude Code does not run SQL on production; Russell or the Supabase chat
-- applies it, after the read-only checks in 20261117_rtbc_account_deletion.md.
--
-- Account deletion (phase 5). How the rtbc_* rows are tied to a user, from
-- supabase/migrations/20261112_rtbc_core.sql (not read back from production):
--   rtbc_passports.user_id    → auth.users  ON DELETE CASCADE   fine: goes with the account
--   rtbc_submissions.user_id  → auth.users  ON DELETE CASCADE   fine
--   rtbc_submissions.passport_id → rtbc_passports ON DELETE CASCADE  fine
--   rtbc_submissions.reviewed_by → auth.users  (no ON DELETE = NO ACTION)   ← BLOCKS
--
-- reviewed_by is the ADMIN who approved or rejected a result. With NO ACTION, deleting any
-- account that has ever reviewed a submission (today: Russell's, which approved the one test
-- submission) makes the shared purge's auth.users delete fail with a foreign-key violation. The
-- purge then records purge_error and retries, and the account is never deleted.
--
-- Fix: keep the review, forget the reviewer, which is what an audit row about SOMEONE ELSE's
-- result should do. reviewed_by is already nullable (pending rows have it null), so SET NULL
-- cannot hit a NOT NULL column (the routes.submitted_by trap in ynm-app's 20260803 migration).
--
-- The constraint name is looked up rather than assumed (Postgres named it at create time).

do $$
declare
  v_name text;
begin
  select c.conname into v_name
  from pg_constraint c
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
  where c.conrelid = 'public.rtbc_submissions'::regclass
    and c.contype = 'f'
    and c.confrelid = 'auth.users'::regclass
    and a.attname = 'reviewed_by';

  if v_name is null then
    raise exception 'rtbc_submissions.reviewed_by has no foreign key to auth.users; nothing to change';
  end if;

  execute format('alter table public.rtbc_submissions drop constraint %I', v_name);
  alter table public.rtbc_submissions
    add constraint rtbc_submissions_reviewed_by_fkey
    foreign key (reviewed_by) references auth.users (id) on delete set null;
end $$;

-- Check (read-only), expect one row with confdeltype = 'n' (SET NULL):
--   select conname, confdeltype from pg_constraint
--    where conrelid = 'public.rtbc_submissions'::regclass and conname = 'rtbc_submissions_reviewed_by_fkey';
--
-- Rollback:
--   alter table public.rtbc_submissions drop constraint rtbc_submissions_reviewed_by_fkey;
--   alter table public.rtbc_submissions add constraint rtbc_submissions_reviewed_by_fkey
--     foreign key (reviewed_by) references auth.users (id);
