# Run the Beloved Country — web app

- `/` — marketing landing page (`landing/`, static, Netlify form `rtbc-interest`)
- `/app/` — the RTBC web app (React + Vite PWA, `src/`)
- `netlify/functions/` — `rtbc-entry` (creates pending passport, signs PayFast form) and `rtbc-payfast-itn` (verifies ITN, records payment, activates passport)

Backend: the shared Energy Lab Supabase project (`lkazcbvczleavcwlosrx`), tables `rtbc_passports`, `rtbc_submissions`, bucket `rtbc-proofs` (migration `rtbc_core`, 12 Nov 2026).

Netlify env vars needed for entries: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYFAST_MERCHANT_ID`, `PAYFAST_MERCHANT_KEY`, `PAYFAST_PASSPHRASE`, `RTBC_ENTRY_FEE_CENTS`, optional `PAYFAST_SANDBOX=true`. Until the fee and PayFast keys are set, the entry form answers "Entries open soon".
