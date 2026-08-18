# Gol·Gol — Feature Analysis & Production Roadmap

A full audit of what the app does today, what is wrong or thin about each feature,
and what has to exist for this to be a production-grade ride-hailing platform.

Scope note: this document deliberately excludes CI/CD, deployment pipelines and
release tooling. It is about **product features and platform correctness**.

---

## 1. What is implemented today

### 1.1 Authentication
**Implemented** — Phone OTP via Supabase Auth (`+91` hardcoded). Three-step flow:
number → (new user) name/email → 6-digit OTP. Resend cooldown, step indicator,
existing-number check before sending an OTP. A DB trigger creates the
`public.users` profile from the auth identity.

**Problems**
- Identity is read from `localStorage.getItem("user_uuid")` in **16 places**. That is
  a client-writable value used as the primary key for every query. If localStorage
  is cleared (or diverges from the Supabase session) the app silently breaks —
  `Dashboard` bounces to `/`, `PublishRide` inserts `driver_id: null`, `Chatbox`
  refuses to send. It also invites tampering: the RLS policies save the DB, but the
  UI happily *tries* to act as another user, producing confusing failures.
- The existence check (`select id from users where mobile = …`) is granted to the
  **anon** role, so an unauthenticated visitor can enumerate which mobile numbers
  are registered, and `users_select_all` exposes every user's name/email/mobile.
- No session-expiry handling, no re-auth prompt, no "signed out elsewhere" state.
- `+91` only; no country selection.

### 1.2 Rider booking (instant hail)
**Implemented** — Map picker (Google Maps JS + Places autocomplete with lazy Place
Details resolution), From/To rail, five ride classes with per-class ETA from the
nearest matching online driver, fare estimate, confirm → insert `rides` row →
wait for a driver → realtime redirect to the tracking screen.

**Problems**
- **The "When" selector is decorative for instant rides.** `LocationInputs`
  computes `dateOfDeparture`, but `BookLeft` never reads it — picking "Schedule…"
  still books a *now* ride. Scheduled hailing does not exist.
- `AvailableRides` pulls **every online driver in the system** to the browser
  (`select current_lat, current_lng … from active_drivers`) and computes the
  nearest one client-side. That leaks live driver positions to any signed-in user
  and does not scale past a few hundred drivers.
- A pending ride has **no timeout**. If no driver accepts, the rider waits on a
  spinner forever. No radius expansion, no "no cabs nearby" resolution, no
  auto-expiry.
- Cancelling a pending request **hard-deletes the row** (`.delete()`), so there is
  no record that the rider ever tried to book — bad for support and analytics.
- No fare surge/night/waiting-charge model; no promo codes; no upfront tolls.
- No pickup-point refinement (the classic "move the pin" step), no pickup notes.

### 1.3 Driver dispatch
**Implemented** — Onboarding form (licence, expiry, registration, vehicle type,
document URL) → `pending` verification → an approved driver reaches the dashboard.
GPS is watched and written to `active_drivers`. Nearby pending rides come from a
server-side `nearby_pending_rides()` RPC (5 km, matching vehicle type). Accepting is
race-safe (`update … where status = 'pending'`). On/off duty toggle.

**Problems (this is the most broken area)**
- **The vehicle taxonomy does not match itself.** Drivers register one of
  `car | bike | auto | van | truck`. Riders book one of
  `auto | mini | bike | sedan | suv`. Matching compares them directly:
  ```
  nearby_pending_rides(p_vehicle := driver.vehicle_type)   -- 'car'
  rides.vehicle_type                                        -- 'mini' | 'sedan' | 'suv'
  ```
  So **a car driver never receives a Mini, Sedan or SUV request** — three of the
  five ride classes are undispatchable. Only `auto` and `bike` happen to match by
  coincidence. `fare_config` likewise has no row for `car`/`van`/`truck`.
  This single mismatch means the core product does not work for most vehicles.
- The realtime subscription is `channel("public:rides").on("*", { table: "rides" })`
  with **no filter**, so every ride event in the entire system is streamed to every
  online driver's browser and discarded client-side. It leaks other riders' pickup
  and drop coordinates and it will not survive any real traffic.
- **Stale drivers are never cleaned up.** Closing the tab leaves `is_online = true`
  forever, so riders see ETAs from drivers who went home hours ago, and the app
  will happily dispatch to a dead session.
- Ride cards show raw coordinates (`17.4239, 78.4738`) instead of addresses, and no
  rider name, rating, pickup distance or trip duration — the driver cannot judge
  whether a job is worth taking.
- No driver-side cancellation, no "arrived at pickup" state, no waiting timer.
- Off-duty state is not persisted across the accept path; the toggle writes
  `is_online` but `ProtectedDriverRoute` unconditionally upserts `is_online: true`
  on every entry, silently putting an off-duty driver back online.

### 1.4 Live tracking
**Implemented** — Driver publishes GPS over Supabase Realtime **Broadcast** keyed by
ride id (plus a throttled DB write every 12 s for last-known position). Rider's
map draws the driver marker, the live route and an ETA, re-routing when the driver
moves > 150 m. Recenter control, back button.

**Problems**
- The broadcast channel is **unauthenticated** — anyone who learns a ride UUID can
  subscribe to that driver's live position. The code comments admit this
  ("For production, promote this to an RLS-authorized private channel").
- The ETA is computed **only on the rider's device**. The driver sees a different
  number from their own navigation, and neither is stored, so nothing else in the
  app (notifications, the home screen, support) knows the ETA.
- No "driver has arrived" detection — the rider gets no signal when the car is
  outside.
- No trip progress on the map during the ride (no travelled-vs-remaining polyline).

### 1.5 Turn-by-turn navigation (driver)
**Implemented** — Full-screen `NavigationView` with a maneuver banner, step
advancement by proximity, spoken guidance, reroute on > 120 m drift, follow/recenter,
mute toggle, bottom trip bar with ETA/arrival time.

**Problems**
- Voice preference is a **module-level `let voicePref`** — it resets on reload and
  is not shared with anything else.
- No lane guidance, no speed limit, no next-next step preview, no north-up/heading-up
  toggle, no traffic-aware ETA refresh on a timer.
- The map is recreated by a `key={ride.status}` remount when the phase flips from
  pickup to dropoff, which throws away the map instance and re-downloads tiles.

### 1.6 Carpool (publish / find match)
**Implemented** — A driver publishes a route with seats, fare/seat and departure
time; riders search overlapping rides and send join requests with pickup/drop pins;
the driver accepts/rejects/removes riders; accepted riders live in a JSONB array.

**Problems**
- **`FindMatch` crashes on click.** It calls `setSelectedRide(...)` from both the
  card `onClick` and the "View on map" button, but `LeftPanel` never passes that
  prop — clicking a result throws `setSelectedRide is not a function`.
- `DriverRoute` (the multi-rider route preview this was meant to feed) is **dead
  code** — nothing renders it.
- Seat accounting is a client-side read-modify-write on `available_seats` and
  `accepted_riders`; two concurrent accepts will over-book.
- Riders are never notified when their join request is accepted or rejected.
- No carpool chat, no per-rider status, no carpool trip execution at all (there is
  no "start the carpool" flow — it is a matching board, not a ride).

### 1.7 In-ride chat
**Implemented** — Persistent messages in Postgres, realtime insert stream, RLS
scoped to the two parties, push notification on each message.

**Problems** — No typing indicator, no read receipts, no unread badge, no quick
replies ("I'm outside", "2 minutes"), no image/location share, no message
moderation, and the chat box is a fixed 224 px scroll area on mobile.

### 1.8 Notifications
**Implemented** — In-app `notifications` table with realtime feed, a bell with
unread count, app-wide Sonner toasts, and Web Push through a Deno Edge Function
with VAPID.

**Problems** — No per-category preferences, no mute, no notification history page,
no grouping/dedup, and the RLS insert policy lets *any* ride counterparty write an
arbitrary title/body to the other party (a spam vector).

### 1.9 Account
**Implemented** — Profile card (name, email, mobile, member since, star rating),
last 20 completed rides, "Drive with Gol·Gol" upsell, logout.

**Problems** — Profile is **read-only** (no name/email edit, no photo). `user_rating`
is displayed but **nothing ever writes it** — every user is permanently 5 stars.
History is rider-only (a driver cannot see the trips they drove), capped at 20 with
no pagination, no filters, no detail view, no receipt, no re-book.

### 1.10 Design system, PWA, accessibility
**Implemented** — Tokenised light/dark CSS, a small `ui/` primitive kit, reduced-motion
support, focus rings, ARIA tablists, skeletons, an error boundary, a web app manifest
and an installable service worker.

**Problems** — The service worker has an **empty fetch handler**: it satisfies the
installability requirement and does nothing else, so the app is completely dead
offline. There is no offline banner, no cached shell, no queued writes.

### 1.11 Navigation (the app's information architecture)
**This is the weakest part of the product.** There is no persistent navigation.
Each screen is a bespoke full-height two-column layout that re-implements its own
header. The only way to move around is:
- a hamburger drawer with **two links** (`/` and `/driver/activate`) plus a `mailto:`,
- a "Dashboard"/"Log in" button,
- and `navigate(-1)` / hard-coded `navigate("/")` calls scattered through the flows.

There is no tab bar, no back-stack discipline, no route for trips, payments,
settings, saved places, safety or help — because **those screens do not exist**.

---

## 2. Cross-cutting defects

| # | Defect | Impact |
|---|---|---|
| 1 | `rides_update` policy is `using (… or status = 'pending') with check (true)` | **Any authenticated user can update any pending ride** — rewrite its destination, fare, or assign themselves as driver on someone else's request |
| 2 | `grant select on public.users to anon` + `users_select_all` | Anonymous phone-number and email enumeration of the whole user base |
| 3 | `active_select_auth` (select-all on `active_drivers`) | Every signed-in user can read every driver's live GPS |
| 4 | Vehicle taxonomy mismatch | 3 of 5 ride classes are undispatchable |
| 5 | `localStorage.user_uuid` as identity | Silent breakage, tamperable UI state |
| 6 | Unfiltered `rides` realtime subscription | Broadcast of all pickups to all drivers; will not scale |
| 7 | No driver heartbeat/staleness | Phantom drivers, phantom ETAs, dispatch to dead sessions |
| 8 | Unauthenticated location broadcast channel | Ride UUID = live-tracking capability token |
| 9 | Client-side seat accounting | Carpool over-booking under concurrency |
| 10 | Ride cancel = row delete | No audit trail, no cancellation analytics, no fee logic |
| 11 | No automated tests anywhere | Every change is a regression risk |

---

## 3. What a production-grade version needs

### 3.1 Navigation & information architecture
A persistent, role-aware shell — a bottom tab bar on phones, a side rail on desktop —
with real destinations: **Home, Activity, Notifications (badged), Account** for riders
and **Dashboard, Earnings, Trips, Account** for drivers, plus a live "ride in progress"
strip that follows the user across every screen. Every surface reachable in ≤ 2 taps,
proper document titles, and route-level back behaviour that never dead-ends.

### 3.2 Real-time status
- A single **connection state** (`connected / connecting / offline`) surfaced in the
  UI, with automatic re-subscribe and a re-sync fetch on reconnect.
- A **ride status machine** shared by both sides — `pending → accepted → arriving →
  arrived → ongoing → completed`, plus terminal `cancelled` / `expired` — rendered as
  a live stepper so nobody has to guess what is happening.
- **Driver presence heartbeats** with server-side staleness, so "online" means online.
- **Server-shared ETA** so rider, driver and notifications all quote the same number.
- **Arrival detection** with a push ("your driver is outside").
- Chat **typing indicators** and unread counts over Realtime Presence.

### 3.3 Trust, safety and money
- Two-way **ratings** with a tip, aggregated into `user_rating` by a trigger.
- **Payment methods** (cash / UPI / card / wallet), payment status on the ride, and a
  real **receipt** with a fare breakdown.
- **Driver earnings** — daily/weekly totals, per-trip payouts, commission.
- **SOS**, **emergency contacts**, and a **shareable live-trip link**.
- **Cancellation** as a first-class state with a reason, an actor and a fee policy.

### 3.4 Platform correctness
Unified vehicle taxonomy, tightened RLS, scoped realtime subscriptions, server-side
matching/ETA, an admin console for driver verification, and an offline-capable
service worker.

---

## 4. What this change set implements

Everything in §3 is built here. See `docs/IMPLEMENTATION.md` for the per-feature
map of files, routes, tables and RPCs.

---

## 5. Deliberately left for later

- **Payment gateway integration** (Razorpay/Stripe). The data model, method
  selection, status machine and receipts are complete; the actual charge call is
  stubbed at the `payments` row so a gateway can be dropped in without a migration.
- **KYC document upload to Supabase Storage** — the driver form still takes a
  document URL; Storage buckets need project-level configuration.
- **SMS/e-mail delivery** for receipts (needs a provider).
- **Automated test suite** — no test runner is configured in this repo; adding one
  is a tooling change, and the request explicitly excluded pipeline work.
- **Carpool trip execution** (turning an accepted carpool match into a live tracked
  multi-stop trip) — a large feature in its own right; matching, notification and
  seat integrity are fixed here.
