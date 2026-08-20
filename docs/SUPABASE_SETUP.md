# Supabase setup — getting a project fully running

Follow top to bottom for a fresh project. Your current project ref is
`xrgmxebfvpaonbcvrczd` (URL `https://xrgmxebfvpaonbcvrczd.supabase.co`).

## 0. Database schema

`supabase link` + `supabase db push` applied migrations `0001`–`0004`. The
`pg-delta` "failed to cache migrations catalog" warning is **non-fatal** — every
`Applying migration ...` line succeeded.

### ⚠️ Five newer migrations must be applied

```
supabase/migrations/0005_production_platform.sql
supabase/migrations/0006_tighten_driver_reads.sql
supabase/migrations/0007_pooling.sql
supabase/migrations/0008_seat_holds.sql
supabase/migrations/0009_roles_and_chaining.sql
```

Run `supabase db push` again, or paste each file into the SQL editor **in
order**. All five are idempotent, so re-running them is safe. No extensions are
required — the pooling geometry is plain SQL rather than PostGIS.
Between them they:

- fix the vehicle taxonomy so Mini/Sedan/SUV rides can be dispatched at all;
- close the RLS holes (anonymous phone-number enumeration, world-readable driver
  licence numbers and live GPS, "any user can edit any pending ride");
- add ratings, payments/receipts, cancellations, scheduling, saved places,
  emergency contacts, SOS, trip sharing, settings and an event timeline;
- move every ride state transition into a server-side RPC.

The app will not work correctly against `0001`–`0004` alone.

### Make yourself an admin

Driver applications are approved from `/admin/drivers`, which is gated on
`users.is_admin`. After signing in once, run:

```sql
update public.users set is_admin = true where mobile = '<your 10-digit number>';
```

### Optional: scheduled maintenance

Ride expiry and scheduled-ride release are called by the app itself, so nothing
is required. For a busy deployment, enable `pg_cron` (Database → Extensions) and
uncomment the block at the end of `0005_production_platform.sql`.

## 1. Get the new project's API keys

Dashboard → **Project Settings → API**. Copy:

- **Project URL** → `https://xrgmxebfvpaonbcvrczd.supabase.co`
- **`anon` `public`** key → goes in the frontend (safe to expose; RLS-protected).
- **`service_role`** key → secret; only used server-side (Edge Functions get it
  injected automatically — you don't paste it anywhere in the app).

## 2. Point the frontend at the new project

Edit `frontend/.env.local`:

```
VITE_SUPABASE_URL=https://xrgmxebfvpaonbcvrczd.supabase.co
VITE_SUPABASE_KEY=<paste the new anon public key>
# leave these as-is:
VITE_GOOGLE_MAPS_API_KEY=<your-google-maps-browser-key>
VITE_VAPID_PUBLIC_KEY=BKtXMsDh4zX-TaKwy2asV9ZOKVfWirZLXes1bFMhMDJwHUf8mKsv4bGD2wwZfmzQKzGZI8ZvWJ517sUNkMT8Xqs
```

Then **restart the dev server** (`npm run dev` in `frontend/`) so it re-reads env.

## 3. Deploy the Web Push function (CLI — already linked)

```bash
supabase functions deploy send-push

supabase secrets set \
  VAPID_PUBLIC_KEY="BKtXMsDh4zX-TaKwy2asV9ZOKVfWirZLXes1bFMhMDJwHUf8mKsv4bGD2wwZfmzQKzGZI8ZvWJ517sUNkMT8Xqs" \
  VAPID_PRIVATE_KEY="<your-vapid-private-key-keep-secret>" \
  VAPID_SUBJECT="mailto:you@example.com"
```

(In-app notifications work without this; only *background* push needs it.)

## 4. Enable phone login (+ Test OTP for India)

Dashboard → **Authentication → Sign In / Providers → Phone**:

1. **Enable** the Phone provider. Supabase wants an SMS provider to save it —
   enter your Twilio **Account SID**, **Auth Token**, and **Message Service SID**
   (or Twilio Verify service). It's fine if Twilio can't actually deliver to
   India (DLT) — Test OTP below bypasses delivery.
2. Scroll to **Test OTP** (a.k.a. test phone numbers) and add one line per test
   user, in **exact E.164** matching what the app sends (`+91` + 10 digits),
   with a **future** "valid until" date:
   ```
   +919515659818=123456
   +919000000001=654321
   ```
3. Log in with that phone + code. `verifyOtp` succeeds → `auth.users` row →
   `handle_new_user` trigger fills `public.users`. (Fresh project = no users yet;
   they're created on first login.)

> Production India SMS needs Twilio **DLT** registration, or an India-first
> provider (MSG91 / Kaleyra / Gupshup). Dev uses Test OTP.

## 5. Realtime (verify)

Dashboard → **Database → Publications → `supabase_realtime`**. The migrations
already add `rides, chat_messages, ride_requests, active_drivers,
published_rides, notifications`. Confirm they're listed (they should be).

## 6. Google Maps key

Already in `.env.local`. For dev it can stay unrestricted; before prod, restrict
it to your HTTP referrer(s) and to the Geocoding, Places (New), Routes, and Maps
JavaScript APIs. Requires billing enabled on the GCP project.

## 7. Smoke test

- `npm run dev`, open the app, log in with a Test OTP number.
- Set a pickup + drop → you should see the route + fare (server-computed).
- Book → a `rides` row is created (fare/OTP set by triggers).
- Bell → "Turn on push alerts" for background notifications.

### Quick CLI verification (optional)
```bash
SUPA=https://xrgmxebfvpaonbcvrczd.supabase.co
ANON=<new anon key>
# send OTP (200 = provider/test-OTP ok):
curl -s -X POST "$SUPA/auth/v1/otp" -H "apikey: $ANON" -H "Content-Type: application/json" -d '{"phone":"+919515659818","create_user":true}'
# verify with your Test OTP code (returns a session):
curl -s -X POST "$SUPA/auth/v1/verify" -H "apikey: $ANON" -H "Content-Type: application/json" -d '{"phone":"+919515659818","token":"123456","type":"sms"}'
```
