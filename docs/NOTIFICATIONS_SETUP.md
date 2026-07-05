# Notifications setup (Phase 3)

Gol·Gol notifications have two layers:

1. **In-app** — a `notifications` table + Supabase Realtime. Works with no server
   code: ride events insert a row (RLS lets the ride counterparty insert), and
   the recipient's open tabs get a Sonner toast + a bell badge.
2. **Web Push** — background notifications (tab closed) via the service worker,
   delivered by the `send-push` Edge Function using VAPID.

## 1. Apply the database migration

Adds `notifications` + `push_subscriptions` (+ RLS + realtime).

**Option A — Studio (simplest):** open your project's SQL Editor and paste the
contents of [`supabase/migrations/0002_notifications.sql`](../supabase/migrations/0002_notifications.sql), then Run.

**Option B — CLI (if the project is linked):**
```bash
supabase link --project-ref mavmgnvcfsvqajikcttf   # one-time; needs the DB password
supabase db push
```

## 2. Deploy the Web Push function

The VAPID keypair is already generated. The **public** key is in
`frontend/.env.local` as `VITE_VAPID_PUBLIC_KEY`. Keep the **private** key
server-side only:

```bash
# from the repo root (you're already `supabase login`-ed)
supabase functions deploy send-push --project-ref mavmgnvcfsvqajikcttf

supabase secrets set --project-ref mavmgnvcfsvqajikcttf \
  VAPID_PUBLIC_KEY="BKtXMsDh4zX-TaKwy2asV9ZOKVfWirZLXes1bFMhMDJwHUf8mKsv4bGD2wwZfmzQKzGZI8ZvWJ517sUNkMT8Xqs" \
  VAPID_PRIVATE_KEY="<your-vapid-private-key-keep-secret>" \
  VAPID_SUBJECT="mailto:you@example.com"
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected into Edge Functions
automatically — you don't set those.

> ⚠️ Rotate this VAPID keypair before production (it's in the repo for dev). Run
> `npx web-push generate-vapid-keys --json`, update `VITE_VAPID_PUBLIC_KEY` and
> the two secrets.

## 3. Try it

- In-app works immediately after step 1: accept a ride / send a chat message and
  the other party gets a toast + bell badge (both tabs open).
- For push: open the app while signed in, click the bell → **Turn on push
  alerts**, accept the OS prompt. Then trigger an event with that tab
  backgrounded/closed — the OS notification appears. Tapping it deep-links to the
  ride.

## Events currently wired

| Event | Who gets notified | Type |
| --- | --- | --- |
| Driver accepts a ride | Rider | `ride_accepted` |
| Driver starts the ride (OTP) | Rider | `ride_started` |
| Rider cancels | Driver | `ride_cancelled` |
| New chat message | The other party | `chat` |

Add more by calling `notifyUser({ userId, title, body, url, type })` from
`frontend/src/lib/notify.js` at the relevant point.
