# RTBC account deletion: what the shared purge needs (draft, 17 Nov 2026)

Nothing here is applied or deployed. The SQL is for the Supabase chat; the purge change is a
proposal for **ynm-app** (`supabase/functions/ynm-delete-account/index.ts`), which this repo does
not change.

## How a deletion runs

RTBC, Energy Lab and YNM share one login, and the project already has one deletion path,
`ynm-delete-account`:

1. `request` sets `profiles.deletion_scheduled_for` to 7 days from now and records the request in `account_deletions`. It then signs the user out everywhere.
2. A nightly `purge`:
   - revokes device tokens and anonymises `orders` and `ynm_subscriptions` (tax records, kept 5 years);
   - releases the NO ACTION columns;
   - calls `auth.admin.deleteUser` and checks that the user is gone.

RTBC's `netlify/functions/rtbc-account` forwards `request` and `cancel` to that function with the
runner's own token. It does not delete the user itself (see `netlify/lib/rtbcAccount.mjs`).

## How RTBC data is tied to a user

| Data | Link | On delete | OK? |
|---|---|---|---|
| `rtbc_passports` | `user_id → auth.users` | CASCADE | yes |
| `rtbc_submissions` | `user_id → auth.users`, `passport_id → rtbc_passports` | CASCADE | yes |
| `rtbc_submissions.reviewed_by` | `→ auth.users` | **NO ACTION** | **blocks** the delete of anyone who reviewed a result. Fix: `20261117_rtbc_reviewed_by_set_null.sql` |
| `payfast_payments` (RTBC entry fees) | `source_key = 'rtbc_entry:<passport id>'`, no user column, no FK | untouched | yes. The payment stays as the tax record, with no personal data on it |
| Files in `rtbc-proofs` (certificates) | path `<user id>/…` | **not deleted** by the purge | **gap** |
| Files in `rtbc-photos` (passport and medal photos) | path `<user id>/…` | **not deleted** by the purge | **gap** |

Deleting the auth user does not delete storage objects. With the purge as it is, a deleted runner's
certificates and photos would stay in storage indefinitely. That contradicts what the delete
screen tells them, and the privacy policy's 30 days.

## Proposed purge step, for ynm-app (needs Russell's approval there)

In `purgeOne`, before step 6 (`deleteUser`). It goes before step 6 so that a failure stops the
purge while the account still exists, and the next run retries it:

```ts
// 5b. RTBC files: certificates (rtbc-proofs) and passport / medal photos (rtbc-photos), all
//     stored under `<user id>/`. Storage objects do not go with auth.users, so remove them here.
for (const bucket of ['rtbc-proofs', 'rtbc-photos']) {
  let removed = 0
  for (;;) {
    const { data: files, error: listErr } = await admin.storage.from(bucket).list(userId, { limit: 100 })
    if (listErr) throw new Error(`${bucket} list: ${listErr.message}`)
    if (!files?.length) break
    const { error: rmErr } = await admin.storage.from(bucket).remove(files.map((f) => `${userId}/${f.name}`))
    if (rmErr) throw new Error(`${bucket} remove: ${rmErr.message}`)
    removed += files.length
  }
  affected[`storage_${bucket}`] = removed
}
```

RTBC writes files only directly under `<user id>/` (`src/lib/photos.js`, `src/components/ResultForm.jsx`).
There are no sub-folders, so one level of listing is enough.

## Read-only checks for the Supabase chat (before applying anything)

```sql
-- 1. Every foreign key from the rtbc tables to auth.users, and what it does on delete
--    (a = no action, c = cascade, n = set null). Expect reviewed_by = 'a' until the draft is applied.
select c.conrelid::regclass as tbl, a.attname as col, c.conname, c.confdeltype
from pg_constraint c
join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
where c.contype = 'f' and c.confrelid = 'auth.users'::regclass
  and c.conrelid::regclass::text like '%rtbc_%';

-- 2. Does storage.objects hold a foreign key to auth.users? (Older storage schemas did, and it
--    would block the delete for anyone with an upload.) Expect no rows.
select conname from pg_constraint
where conrelid = 'storage.objects'::regclass and contype = 'f' and confrelid = 'auth.users'::regclass;

-- 3. How many RTBC files each user has (sizes the purge step; today only test data).
select bucket_id, split_part(name, '/', 1) as user_id, count(*)
from storage.objects where bucket_id in ('rtbc-proofs', 'rtbc-photos')
group by 1, 2 order by 1, 3 desc;

-- 4. Is the nightly purge scheduled? (ynm-app's SESSION-LOG has 20260803c_purge_cron.sql as
--    "drafted, not applied" on 3 Aug; a later entry speaks of a 03:00 purge.)
select jobname, schedule, active from cron.job where command ilike '%ynm-delete-account%';
```

## Also found (not RTBC's to fix, flagged for Russell)

- **YNM PayFast subscriptions keep billing after deletion.**
  - The purge deletes `ynm_subscriptions.payfast_token`, but it never calls PayFast to cancel the subscription.
  - YNM's own delete screen only warns about App Store and Google Play subscriptions, yet 25 of 25 live ones were PayFast at the time (`ynm-app/src/lib/api.js`).
  - The RTBC screen warns for every active YNM subscription, whatever the source.
- **YNM's app uses Capacitor 8.4.2.** That version has a critical advisory: remote content can be loaded at the app origin via the internal proxy (fixed in 8.4.3). RTBC pins 8.4.3.
