// Launch day (Russell, 23 Nov 2026): entries are open early, but passports bought before
// launch are dated 1 December 2026, so the 24 months and qualifying races start then.
// The database sets the real date (supabase/migrations/20261123_rtbc_launch_date.sql);
// this only drives the wording shown before launch.
export const LAUNCH_DATE = '2026-12-01'
export const LAUNCH_LABEL = '1 December 2026'
export const beforeLaunch = (now = new Date()) => now < new Date(`${LAUNCH_DATE}T00:00:00+02:00`)
