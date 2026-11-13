# RTBC build spec, §2–3 revised to match the existing app

Draft for Russell's approval, 13 Nov 2026. It replaces §2 (Architecture) and §3 (Data model) of
"RTBC: web + app build spec" v1. Read from the repo at 7066449 (russellnugent-maker/rtbc-app) and
from its two migrations, not from production.

## 2. Architecture

- **Repo:** russellnugent-maker/rtbc-app, cloned to `~/dev/rtbc-app`. It uses React 19, Vite 8,
  React Router 7 and supabase-js, on the shared Supabase project `lkazcbvczleavcwlosrx`. It stays
  **JavaScript**, so the spec's `platform.ts` becomes `src/lib/platform.js`.
- **Web build (unchanged):** `vite build --outDir dist/app` builds the app, then `landing/` is
  copied into `dist/`. The static landing page and its Netlify form `rtbc-interest` therefore stay
  at `/`, and the app is served at `/app/` (Vite `base: '/app/'`, router `basename="/app"`).
  Netlify functions: `rtbc-entry`, which creates the pending passport and signs the PayFast form,
  and `rtbc-payfast-itn`, which verifies the payment and activates the passport.
- **Native build (new):** a separate `npm run build:native` produces `dist-native/`, which is
  Capacitor's `webDir`.
  - **Base path:** it builds with `base: '/'` and router basename `''`, because Capacitor serves
    the bundle from the root of `capacitor://localhost` (iOS) and `https://localhost` (Android),
    not from `/app/`.
  - **The landing page is not bundled.**
  - **Absolute URLs:** asset paths already go through `import.meta.env.BASE_URL`. The two
    hard-coded `/app/` URLs (the auth email redirect in `Auth.jsx`; `return_url`/`cancel_url` in
    `rtbc-entry`, which is web-only) move into one config module. On native, the auth redirect
    must be the **web** address, `https://runthebelovedcountry.netlify.app/app/auth/callback`,
    because `window.location.origin` there is `capacitor://localhost`.
  - **No remote URL:** the app is the bundled assets, never `server.url`.
  - The Capacitor shell itself is phase 5. Phase 1 only makes the build ready for it.
- **`isNative()`:** in `src/lib/platform.js`, wrapping `Capacitor.isNativePlatform()`. This adds
  `@capacitor/core` as the only new dependency in phase 1. It is the one place that decides which
  routes, links and tabs exist.
- **Login:** shared with Energy Lab and YNM. There is no Google sign-in.
  - **Web:** email + password (as today) and a **magic link** (new). "Create account" stays on
    the web sign-in page. Entry is a two-step flow (create an account, then `/enter` → PayFast);
    the ITN does not create the account. The spec said it did; this keeps how the app works today.
  - **Native:** email + password, or a **6-digit email code** (`signInWithOtp` with
    `shouldCreateUser: false`, then `verifyOtp({ email, token, type: 'email' })`). There is no
    magic link in the app until universal links land in phase 5. Sign-in only: the native build
    has no account creation. Below the form: "No passport yet? Enter at
    runthebelovedcountry.netlify.app", which opens the system browser.
  - **The Supabase email template** must show `{{ .Token }}` for the code to reach the runner.
    It is shared with Energy Lab and YNM, so it is checked before phase 5 (Supabase chat).
- **Offline:** there is no service worker today; the app ships only a manifest. Caching the
  passport offline is a phase 5 job, done with local storage in the app, not a service worker.
- **Deploys:** the Netlify site `188faa4d…` (runthebelovedcountry) was deployed by upload, not
  linked to Git. Russell is linking it to GitHub. A clean build of 7066449 reproduces the live
  deploy byte for byte (40 of 40 files).
- **Supabase redirect allow-list:** Russell is checking it for
  `https://runthebelovedcountry.netlify.app/app/**`. The new `/app/auth/callback` is covered by
  that wildcard.

### Route map (paths are under `/app` on the web; under `/` in the native bundle)

| Spec route | In this app | Web | App | Change |
|---|---|---|---|---|
| `/` landing | `landing/index.html` (static) | ✅ | ❌ | none; not in the native bundle |
| `/rules`, `/terms`, `/privacy` | none yet | ✅ | links out | new static pages in `landing/` once the legal drafts are approved (needed before store submission) |
| `/enter` → PayFast → success | `/enter` → PayFast → `/?paid=1` | ✅ | ❌ | native: route removed; "Enter" buttons become an external link to the website |
| `/extend` | none yet | ✅ | ❌ | later, web only; the app shows "Manage it on the website" |
| `/ynm-offer` | an external link (`yournextmove.run/#/rtbc`) from the Home perk card and the passport back cover | ✅ | ❌ | native: perk card and back-cover YNM card are not rendered (both platforms, simplest) |
| `/login` | `Auth` (shown for any path while signed out) | ✅ | ✅ | native: sign-in only, with the "Enter at…" link |
| `/auth/callback` | none (the redirect lands on `/`) | ✅ | ✅ | new route, so universal links have a fixed path to open |
| `/passport` | `/` (Home + PassportBook) | ✅ | ✅ | keep at `/`, no rename |
| `/passport/submit` | `/submit` | ✅ | ✅ | none |
| `/races` | `/races` | ✅ | ✅ | none |
| (not in spec) | `/results` | ✅ | ✅ | none |
| `/account` | none | ✅ | ✅ | new: profile; delete account follows in phase 5 (Netlify function, service role) |
| `/admin/flags` | `/admin` (is_platform_admin) | ✅ | ❌ | native: route and tab removed |

## 3. Data model (as built, migrations `rtbc_core` + `rtbc_photos`, 12 Nov 2026)

No parallel tables. The spec's `passports`, `stamp_submissions` and `stamps` are these:

| Table | What it holds | Maps from the spec |
|---|---|---|
| `rtbc_passports` | One per runner per entry: `passport_no` int (sequence, shown `RTBC 00001`), `status`, `name_on_passport`, `date_of_birth`, guardian fields (16–17), `terms_version`/`terms_accepted_at`, `entry_fee_cents`, `referral_code`, `leaderboard_consent`, `issued_at`, `expires_at` (issue + 24 months), `extended_at` + `extension_reason` (`medical`/`paid`), `completed_at`, `photo_path` | `passports`. `ref_code` → `referral_code`. One extension = `extended_at` set (no counter). `refunded` → `cancelled` (also `disqualified`). The payment is in `payfast_payments` with `source_key = 'rtbc_entry:<passport id>'` |
| `rtbc_submissions` | `passport_id`, `user_id`, `province` (full name, check list of 9), `rc_event_id`, `race_name`, `race_date`, `distance_m` (≥ 21 097), `finish_seconds`, `proof_url` / `proof_file_path` (one required), `status` (`pending`/`flagged`/`auto_approved`/`approved`/`rejected`/`withdrawn`), `check_results`, `flag_reasons`, review fields, `medal_photo_path` | `stamp_submissions`. `slot_key` → `province` |
| (no table) | **A stamp = an `approved` or `auto_approved` submission.** A unique index allows one per passport per province | `stamps` |

**Rules held in the database today:**
- One live (`pending_payment`/`active`) passport per runner.
- `rtbc_activate_passport()` is service role only and safe to retry. It assigns the number and
  sets the issue and expiry dates.
- A trigger marks the passport `completed` when the 9th province is approved.
- RLS on both tables:
  - Runners read their own rows; platform admins read all.
  - Runners can insert `pending` submissions only, and only for their own active passport.
  - Only admins update rows.
  - Photo paths are set through two narrow RPCs (`rtbc_set_passport_photo`, `rtbc_set_medal_photo`).

**Storage:** `rtbc-proofs` (private, 10 MB; jpeg, png, heic, pdf) and `rtbc-photos` (private, 8 MB;
jpeg, png, webp, heic). Files go under `<user id>/…`, with insert and read for the owner and read
for admins.

**Not built yet (each one is an additive migration for approval, in its phase):**
- the automated check on a new submission and the email to the runner (phase 4, pg_net, same
  pattern as `fire_coach_feedback`);
- `rtbc_finisher_print_requests`, created on the 9th stamp (#100).

**Test data stays in place:** Russell's passport RTBC 00001 and one approved submission.

### Run the World: additive draft, not applied, not needed for launch

File: `supabase/drafts/20261113_rtw_collections.sql`. All RTBC rows keep working unchanged.

1. **`rtbc_collections`** (`id` text pk, `name`, `number_prefix`, `validity_months`, where null =
   never expires, `verification_mode` = `race_proof` | `device_run`, `is_open`). Seeded with
   `('rtbc', 'Run the Beloved Country', 'RTBC', 24, 'race_proof', true)`.
2. **`rtbc_passports.collection`** text not null default `'rtbc'`, references `rtbc_collections`.
   - `rtbc_passports_passport_no_key` (unique `passport_no`) becomes unique
     `(collection, passport_no)`. RTBC keeps `rtbc_passport_no_seq`; each new collection gets its
     own sequence.
   - `rtbc_passports_one_live_per_user` becomes unique `(user_id, collection)` where the status is
     live, so a runner can hold RTBC and RTW at once.
   - `rtbc_passports_check` (issued rows need `issued_at`, `expires_at` and `passport_no`) applies
     only when `collection = 'rtbc'`. Other collections still need `issued_at` and `passport_no`;
     `expires_at` may be null.
3. **`rtbc_submissions.collection`** text not null default `'rtbc'`, tied to the passport's own
   value by a composite foreign key `(passport_id, collection)` →
   `rtbc_passports (id, collection)` (needs a new unique `(id, collection)` on passports). The
   collection checks then stay plain check constraints, with no trigger.
   - `rtbc_submissions_province_check` and `rtbc_submissions_distance_m_check` (≥ 21 097 m)
     apply only when `collection = 'rtbc'`. `province` becomes nullable for other collections.
   - **`slot_key`** text: `WC`/`EC`/… for RTBC (backfilled from `province`), ISO country codes for
     RTW. For RTBC it must match the province.
   - The one-stamp-per-slot index moves from `(passport_id, province)` to `(passport_id, slot_key)`.
4. **`rtbc_activate_passport()`:** expiry = issue + the collection's `validity_months`; null
   when unset.
5. **`rtbc_check_completion()`:** fires only for RTBC (9 provinces). RTW never "completes".

Table names keep the `rtbc_` prefix. Renaming them is not worth breaking the live app.
