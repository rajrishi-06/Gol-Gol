# Implementation map

What was built, where it lives, and what to look at when something misbehaves.
Pairs with `docs/FEATURE_ANALYSIS.md` (the audit that motivated it).

---

## 1. Setup — read this before testing

Six SQL migrations must be applied on top of the existing schema:

```
supabase/migrations/0005_production_platform.sql
supabase/migrations/0006_tighten_driver_reads.sql
supabase/migrations/0007_pooling.sql
supabase/migrations/0008_seat_holds.sql
supabase/migrations/0009_roles_and_chaining.sql
supabase/migrations/0010_scoring_batch_and_gaps.sql
```

Either `supabase db push`, or paste each file into the Supabase SQL editor and
run it (in order). All six are idempotent — re-running them is safe. None of them
need extensions: the pooling geometry is plain trigonometry, so there is
nothing to enable on the project.

You can prove all three apply before touching the real project:

```
sudo ./supabase/tests/run.sh
```

That builds a throwaway local Postgres, applies every migration in order, and
runs 97 assertions over the pooling flow. It is what caught the fact that
`0005` used to change `nearby_pending_rides`'s return type without dropping it
first, which made a clean `0003 → 0005` chain fail outright.

Then, in `frontend/.env.local`:

```
VITE_SUPABASE_URL=…
VITE_SUPABASE_KEY=…            # anon/publishable key only
VITE_GOOGLE_MAPS_API_KEY=…     # Geocoding, Places (New), Routes, Maps JS
VITE_VAPID_PUBLIC_KEY=…        # optional — Web Push
```

**Make yourself an admin** (needed for `/admin/drivers`, which is how a driver
gets approved):

```sql
update public.users set is_admin = true where mobile = '<your 10-digit number>';
```

Optional, for background push:

```
supabase functions deploy send-push
supabase secrets set VAPID_PUBLIC_KEY=… VAPID_PRIVATE_KEY=… VAPID_SUBJECT=mailto:you@example.com
```

### End-to-end test path

1. Sign in with a phone number → land on the home screen.
2. Set pickup + drop, pick a ride class, confirm → the ride enters `pending`.
3. In another browser/profile, sign in as a second user → **Account → Drive with
   Gol·Gol** → submit the driver form (pick a **service class**, e.g. Mini).
4. As the admin, open **/admin/drivers** → approve that driver.
5. The driver goes to **Drive**, toggles online, and the request appears.
6. Accept → OTP → complete. Both sides get the rating sheet; the receipt shows
   up under **Activity**, and the payout under **Earnings**.

Things that only work with two real devices/browsers: live driver tracking,
chat typing indicators, and the shared-trip link.

---

## 2. Architecture

```
src/
  lib/
    auth.jsx           AuthProvider — session, profile, driver row, settings
    connection.jsx     ConnectionProvider — online/offline/reconnecting + re-sync
    activeRide.jsx     ActiveRideProvider — the in-flight ride, app-wide
    booking.jsx        BookingProvider — the trip being composed (survives reload)
    rides.js           every ride RPC, in one place
    rideStatus.js      the status machine: labels, copy, progress, tones
    useRideLive.js     one subscription for ride + events + chat
    useDriverPresence.js  GPS watch + throttled heartbeat
    useChatPresence.js    typing indicator + online dot (Realtime Presence)
    places.js safety.js payments.js  saved places, SOS/sharing, payment methods
  components/
    layout/            AppLayout, SideNav, BottomNav, TopBar, ActiveRideBar,
                       ConnectionBanner, Page, navItems
    ride/              RideStatusStepper, CancelRideDialog, RatingSheet,
                       SafetyPanel, PaymentMethodPicker, FareBreakdown
    ui/                primitives (+ new: Modal, StarRating, Switch)
  pages/               Account, Activity, TripDetail, Wallet, Earnings,
                       Settings, SavedPlaces, Safety, Help, AdminDrivers,
                       SharedTrip
```

Provider order in `main.jsx` is deliberate:
`Connection → Auth → ActiveRide → Booking`. Auth needs a socket to exist,
ActiveRide needs a user, Booking needs neither but sits innermost so it can be
reset from anywhere.

---

## 3. Navigation

| | |
|---|---|
| Shell | `components/layout/AppLayout.jsx` |
| Destinations | `components/layout/navItems.js` |
| Mobile | `BottomNav` — 4 tabs, safe-area aware, badge on Activity for unrated trips |
| Desktop | `SideNav` — same tabs plus secondary links, so nothing is buried |
| Header | one `TopBar` for the whole app (was a bespoke header per screen) |
| In-ride | `ActiveRideBar` — a live strip above the tab bar on every screen |

The tab set is chosen by route: `/driver/*` shows the driving set for an
approved driver, everything else shows riding. Approved drivers also get a
Ride/Drive switch in the header.

Full-screen map routes (`/rider/ride/:id`, `/driver/ride/:id`, `/t/:token`,
`/login`, `/book`) opt out of the chrome via `isImmersiveRoute`.

**Routes**

```
/                     book a ride                 /driver/activate     onboarding
/login                phone OTP                   /driver/dashboard    dispatch
/book                 confirm + search            /driver/trips        driven trips
/activity             trip history (both roles)   /driver/earnings     payouts
/activity/:rideId     detail + receipt            /driver/ride/:rideId navigation
/wallet               payments + method           /rider/ride/:rideId  live tracking
/account              profile                     /admin/drivers       verification
/account/settings     preferences                 /t/:token            shared trip
/account/places       saved places                /help                FAQ + support
/account/safety       contacts + SOS
```

`/dashboard` and `/rides` redirect to their new homes.

---

## 4. Real-time status

| Signal | Where | How |
|---|---|---|
| Connection state | `lib/connection.jsx` → `ConnectionBanner` | a health channel's subscribe state + `navigator.onLine`; exposes `subscribeToReconnect` |
| Re-sync after a drop | `useRideLive`, `activeRide`, `DriverDashboard` | re-fetch on reconnect and on tab re-focus |
| Ride status | `lib/rideStatus.js` → `RideStatusStepper` | server lifecycle timestamps, not local state |
| Driver liveness | `useDriverPresence` + `driver_heartbeat()` | 20 s heartbeat; the server treats >90 s as stale |
| ETA | `NavigationView.onEta` → `update_ride_eta()` | the driver's navigation publishes it; rider and shared-trip page read it |
| Arrival | `mark_driver_arrived()` + proximity prompt | new `arrived` state between `accepted` and `ongoing` |
| Chat | `useChatPresence` | Realtime Presence — typing dots and an online dot, no extra writes |
| Supply | `nearby_driver_summary()` | per-class count + nearest distance, server-side |

Dispatch realtime is now scoped by RLS (same class, on duty, within 8 km) rather
than streaming every ride event in the system to every driver.

---

## 5. Server-authoritative transitions

Clients no longer `update` `rides.status`. Each transition is a SECURITY DEFINER
RPC that checks the caller's role on the ride and writes a `ride_events` row:

| RPC | Guards |
|---|---|
| `accept_ride` | approved driver, ride still `pending`, not already on a job |
| `mark_driver_arrived` | assigned driver, status `accepted` |
| `start_ride` | assigned driver, OTP matches (the driver never reads it) |
| `complete_ride` | assigned driver, status `ongoing`; settles fare + writes `payments` |
| `cancel_ride` | rider or driver; computes the fee; frees the driver |
| `submit_rating` | participant, ride completed; a trigger recomputes the average |
| `accept_ride_request` / `reject_ride_request` / `remove_carpool_rider` | owning driver, row-locked seat accounting |
| `set_driver_verification` | admin only |

Read-side RPCs: `nearby_pending_rides`, `nearby_driver_summary`, `my_rides`,
`search_published_rides`, `driver_earnings_summary`, `driver_earnings_daily`,
`get_shared_trip`, `mobile_exists`, `admin_pending_drivers`.

---

## 6. Security changes

| Before | After |
|---|---|
| `grant select on users to anon` — anyone could enumerate registered phone numbers | revoked; login uses `mobile_exists()` |
| `users_select_all using (true)` | scoped to self, admins and actual counterparties |
| `drivers_select_auth using (true)` — every licence number and document URL readable by any signed-in user | scoped; carpool search moved to `search_published_rides()` returning safe columns |
| `active_select_auth using (true)` — every driver's live GPS | scoped to the driver and their current rider |
| `rides_update … with check (true)` — **any** user could edit **any** pending ride | own rides only; claiming goes through `accept_ride()` |
| `rides_select … or status = 'pending'` | own rides, plus a narrow dispatch window |
| a driver could `update` their own `verification_status = 'approved'` | blocked by `drivers_guard_verification()`; only `rejected → pending` (resubmission) is self-serve |
| ride UUID = permanent live-tracking capability | expiring, revocable `trip_shares` tokens for the public page |

---

## 7. Notable behaviour changes

- **Vehicle taxonomy.** Drivers pick a *service class* (`bike`/`auto`/`mini`/
  `sedan`/`suv`) constrained by their body type. Existing rows were backfilled
  (car→mini, van/truck→suv). This is what makes Mini/Sedan/SUV dispatchable.
- **Scheduling works.** A future pickup time parks the ride in `scheduled`; it
  enters dispatch ~10 minutes before departure (released by the driver
  dashboard's poll, or by pg_cron — see the notes at the end of 0005).
- **Searching gives up.** A pending request times out after 3 minutes with a
  "no drivers available" state instead of an endless spinner.
- **Cancelling is a state, not a delete.** Reason, actor and fee are recorded.
- **Ratings are real.** `users.user_rating` is recomputed by a trigger; it was
  previously displayed everywhere and written by nothing.
- **Offline.** The service worker caches the app shell and hashed assets
  (network-first for navigations, never for API/map traffic) and prompts to
  refresh when a new build lands.

---

## 8. Known gaps

- **Payment capture** is modelled but not charged — `payments.reference` is where
  a gateway id goes. Cash and UPI settle in person today.
- **KYC upload** still takes a document URL; Supabase Storage buckets need
  project-level configuration.
- **Carpool trips** are matched, notified and seat-accurate, but a matched
  carpool doesn't yet become a live tracked multi-stop trip.
- **No test suite** — no runner is configured in this repo.
- Hindi/Telugu language options are stored but the strings aren't translated yet.
