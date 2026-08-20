# Pooling, unified roles and adaptive capacity — architecture spec

**Status:** the whole build order — P0 through P5 — is **implemented** across
migrations `0007`–`0010` and the frontend. Batch matching ships **switched off**;
see §11 for why turning it on is a volume decision rather than a deploy.
**Companion:** a narrative version of this plan, with diagrams, is published as
an artifact for review.

Where the shipped implementation departs from the plan below, the plan text has
been corrected and the change noted inline. Three departures are worth reading
before the rest:

1. **No PostGIS.** The corridor test is plane trigonometry over the polyline of
   remaining stops (`path_locate`, `stop_progress`, `path_added_km`), so it runs
   on a stock Postgres and needs no extension enabled on the project. The whole
   thing is therefore testable outside Supabase — `supabase/tests/run.sh` applies
   every migration to a throwaway database and asserts the flow end to end.
   Swapping in `geography(LineString)` + GiST later touches only those three
   functions.
2. **Stops are ordered by progress along the route, not by an O(n²) insertion
   search.** Every stop projects onto the remaining path; sorting by that
   projection gives pickup-before-drop for free, guarantees no stop lands behind
   one already passed, and puts a second rider travelling further than the first
   after their drop — which is the case this feature exists for.
3. **Seats available is summed per booking**, not derived from the trip's two
   counters. See §4 — the counter form oversells the vehicle, and a real test
   caught it.

This spec covers three things the product wants to add on top of what exists
today:

1. **Unified roles** — one account that can both request and drive a ride, with
   mode switching instead of two apps.
2. **En-route pooling** — a driver may take a second booking when its pickup and
   drop both lie along the route they are already driving.
3. **Adaptive capacity** — seats available are a live number, driven by vehicle
   class *and* by how many people actually got in, not by what was booked.

---

## 0. What exists today

Facts this spec builds on, verified against the current tree:

| Thing | Where | Shape today |
|---|---|---|
| Ride record | `rides` (`0001`, extended in `0005`) | One row = one rider + one driver + one origin + one destination |
| Status machine | `rides.status` (`0005`) | `scheduled → pending → accepted → arrived → ongoing → completed`, plus `cancelled`, `expired` |
| Dispatch | `nearby_pending_rides()`, `accept_ride()` (`0005`, tightened in `0006`) | Radius search around the driver; first approved driver to call `accept_ride` wins |
| Driver duty | `active_drivers` (`0001`, heartbeat in `0005`) | `is_online`, `on_ride`, `current_ride_id`, live lat/lng + heartbeat |
| Vehicle class | `drivers.vehicle_class` (`0005`) | `bike`, `auto`, `mini`, `sedan`, `suv` |
| Seat counts | `frontend/src/lib/vehicles.js` | bike 1, auto 3, mini 4, sedan 4, suv 6 |
| Scheduled carpool | `published_rides` + `ride_requests` (`0001`) | A separate plan-ahead board, unrelated to live dispatch |
| Money | `payments`, `fare_config`, `complete_ride()` (`0003`, `0005`) | Fare computed server-side, one payment row per completed ride |

Two of those facts are the constraints that shape everything below:

- **`rides` fuses the passenger's contract with the vehicle's work order.**
  Pooling needs them to be separate rows, because one vehicle will serve several
  contracts, each with its own pickup, drop, fare, OTP, rating and cancellation.
- **Seat counts live only in the frontend.** They are presentational today.
  Capacity enforcement has to move into the database, because it becomes a
  correctness constraint under contention rather than a label on a card.

---

## 1. Decision record

### 1.1 Consent — the decision everything else depends on

The feature as described ("the driver can accept a ride if it is within the
vicinity of the current ride") applied to an unmodified solo booking sells a
service the rider did not buy: they booked a direct trip and discover mid-journey
that a stranger is getting in and their arrival slipped.

The conventional fix is a separate discounted ride class the rider opts into up
front. In a young marketplace that is a liquidity trap: only riders who
deliberately choose the niche class are poolable, so matches rarely land, so
nobody chooses the class.

**Decision (recommended, pending sign-off): a per-booking flag on every ride.**

- A checkbox at booking: *"Open to sharing — get up to 25% back if we match you."*
- The rider pays the normal fare and is rebated **only if a match actually
  lands**, at settlement.
- `rides.shareable boolean not null default false` is the gate.
- A trip may take a second booking only if **every** booking already aboard has
  `shareable = true`.

This keeps the product instinct — any ride can pool — while making consent
explicit, and it costs nothing on rides that never match.

### 1.2 Two mechanisms, not one

"Take another fare nearby" is two different features with very different risk:

| | Sequential chaining | Concurrent pooling |
|---|---|---|
| What | Accept the *next* fare before finishing the current one | Carry two contracts at once |
| Capacity maths | None | Required at every stop |
| Detour for riders aboard | None | The core risk |
| Works for bikes | **Yes** | Never |
| Ships in | Phase 3 | Phase 4 |

Keeping them separate is what lets bikes have the safe half, and lets the
"faster pickups" value ship a phase before the hard part.

### 1.3 Bikes are structurally excluded from concurrent pooling

A bike carries exactly one passenger. That is a property of the class, not an
arithmetic outcome, so it is a column (`vehicle_classes.allows_concurrent_pool`)
and not a `seat_capacity = 1` coincidence that some future code path could round
its way past.

---

## 2. Domain model

### 2.1 The split

```
today:     rides ──────────────────────────── one row is both contract and work order

proposed:  trips ── the vehicle's working session (driver, capacity, route)
             │
             ├── trip_stops ── the ordered schedule (pickup/drop per booking)
             │
             └── rides ─────── each rider's contract (fare, OTP, rating, status)
```

A booking's *span* is the stretch of the stop sequence between its pickup and
its drop. Pooling means spans overlap, which is why capacity has to be evaluated
at **every stop in the sequence**, not once at accept time.

### 2.2 DDL

```sql
-- ── The vehicle's working session ────────────────────────────────────────────
create table public.trips (
  id                uuid primary key default gen_random_uuid(),
  driver_id         uuid not null references public.users (id) on delete cascade,
  vehicle_class     text not null references public.vehicle_classes (id),
  seat_capacity     smallint not null,
  seats_booked      smallint not null default 0,
  seats_occupied    smallint not null default 0,
  pooling_enabled   boolean  not null default false,
  status            text not null default 'forming'
                      check (status in ('forming','active','completed','cancelled')),
  -- planned path over all remaining stops; `remaining_geog` is trimmed forward
  -- as the vehicle progresses and is what the corridor query searches.
  route_geom        geometry(LineString, 4326),
  remaining_geog    geography(LineString, 4326),
  destination_lat   double precision,   -- set when the driver is `heading_home`
  destination_lng   double precision,
  started_at        timestamptz,
  ended_at          timestamptz,
  created_at        timestamptz not null default now(),

  constraint trips_seats_sane check (
    seats_booked   between 0 and seat_capacity and
    seats_occupied between 0 and seat_capacity
  )
);

create index idx_trips_remaining on public.trips using gist (remaining_geog);
create index idx_trips_driver     on public.trips (driver_id, status);
create index idx_trips_open       on public.trips (status)
  where status = 'active' and pooling_enabled;

-- ── Vehicle class reference data (moves the seat table out of the frontend) ──
create table public.vehicle_classes (
  id                      text primary key,   -- bike|auto|mini|sedan|suv
  label                   text not null,
  seat_capacity           smallint not null,
  allows_concurrent_pool  boolean not null,
  allows_chaining         boolean not null default true
);

insert into public.vehicle_classes (id, label, seat_capacity, allows_concurrent_pool) values
  ('bike',  'Bike',        1, false),
  ('auto',  'Auto',        3, true),
  ('mini',  'Mini',        4, true),
  ('sedan', 'Prime Sedan', 4, true),
  ('suv',   'Prime SUV',   6, true);

-- ── Each rider's contract: today's `rides`, extended ─────────────────────────
alter table public.rides
  add column trip_id            uuid references public.trips (id),
  add column seats              smallint not null default 1 check (seats between 1 and 6),
  add column shareable          boolean  not null default false,
  add column solo_eta_min       integer,   -- baseline for the detour promise
  add column promised_detour_min integer,  -- cap quoted to this rider at booking
  add column actual_detour_min  integer,   -- filled at completion; drives the credit
  add column pool_rebate        numeric not null default 0;

create index idx_rides_trip on public.rides (trip_id);

-- `rides.driver_id` stays as a denormalised mirror of `trips.driver_id` so every
-- existing query, RLS policy and realtime filter keeps working untouched.
-- A trigger keeps it in sync; it is never written directly after Phase 2.

-- ── The schedule ─────────────────────────────────────────────────────────────
create table public.trip_stops (
  trip_id     uuid not null references public.trips (id) on delete cascade,
  seq         smallint not null,
  kind        text not null check (kind in ('pickup','drop')),
  booking_id  uuid not null references public.rides (id) on delete cascade,
  lat         double precision not null,
  lng         double precision not null,
  seat_delta  smallint not null,   -- +seats at a pickup, −seats at a drop
  eta         timestamptz,
  reached_at  timestamptz,
  primary key (trip_id, seq),
  unique (trip_id, booking_id, kind)
);

create index idx_trip_stops_booking on public.trip_stops (booking_id);

-- ── Seat holds: an outstanding offer consumes capacity ───────────────────────
create table public.seat_holds (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips (id) on delete cascade,
  booking_id  uuid not null references public.rides (id) on delete cascade,
  seats       smallint not null,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now(),
  unique (booking_id)
);

create index idx_seat_holds_live on public.seat_holds (trip_id) where expires_at > now();

-- ── Occupancy audit ──────────────────────────────────────────────────────────
create table public.occupancy_events (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips (id) on delete cascade,
  booking_id  uuid references public.rides (id) on delete set null,
  actor_id    uuid not null references public.users (id),
  actor_role  text not null check (actor_role in ('driver','rider','system')),
  seats_before smallint not null,
  seats_after  smallint not null,
  reason      text not null,   -- pickup_headcount|extra_occupant|drop|no_show|amend
  created_at  timestamptz not null default now()
);

-- ── Never match these two people again ───────────────────────────────────────
create table public.match_blocklist (
  user_id     uuid not null references public.users (id) on delete cascade,
  blocked_id  uuid not null references public.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, blocked_id)
);
```

### 2.3 Invariants enforced in the database, not the client

```sql
-- A booking's drop can never precede its pickup in the sequence.
create or replace function public.trip_stops_assert_order() returns trigger ...
-- Running seat total must never exceed capacity at any prefix of the sequence.
create or replace function public.trip_assert_capacity(p_trip uuid) returns void ...
-- `seats_booked` / `seats_occupied` are maintained by trigger, never by the client.
```

`trip_assert_capacity` walks the stop sequence accumulating `seat_delta` and
raises if any prefix exceeds `seat_capacity`. It is called inside every RPC that
mutates a sequence, under the trip's row lock.

### 2.4 Geometry, without PostGIS

**Shipped differently from the original plan.** The corridor test needs three
things — how far a point sits off a route, how far along it, and what inserting
two points costs — and all three are plane trigonometry at city scale:

| Function | Returns |
|---|---|
| `point_segment_km(p, a, b)` | distance from P to segment AB, and where along AB it lands |
| `path_locate(lats, lngs, p)` | `along_km`, `offset_km`, `total_km` against a polyline |
| `stop_progress(lats, lngs, p)` | `along_km`, plus the overshoot when a point lies past the route's end |
| `path_added_km(path, pickup, drop)` | how much longer the route becomes with both inserted |

`path_locate` clamps projections to the path, so every point *beyond* the end
returns the same `along_km` and would tie. `stop_progress` adds the straight-line
distance past the end in that case, which is what orders a second rider's drop
after the first's.

Straight-line distance under-estimates road distance, which would let a detour
slip past its cap, so every added-distance figure is scaled by
`pool_config.road_factor` (default 1.3) before it is compared against a limit.

The equirectangular projection this rests on is exact enough over a single
trip — a degree of longitude changes by well under a percent across any city —
and the error is in the conservative direction for the corridor test.

---

## 3. One account, two modes

`users` + a verified `drivers` row is already a capability model. What is missing
is **mode** — a session concept — and the invariant that nobody is dispatched as
a driver while sitting in someone else's back seat.

```sql
create table public.user_modes (
  user_id     uuid primary key references public.users (id) on delete cascade,
  mode        text not null default 'idle'
                check (mode in ('idle','seeking','riding','available','on_trip','heading_home')),
  trip_id     uuid references public.trips (id) on delete set null,
  booking_id  uuid references public.rides (id) on delete set null,
  changed_at  timestamptz not null default now()
);
```

| Mode | Meaning | Dispatchable? | Can book? |
|---|---|---|---|
| `idle` | Signed in, doing neither | no | yes |
| `seeking` | Requested a ride, waiting for a driver | no | already has one |
| `riding` | A passenger on someone's trip | no | no |
| `available` | On duty, empty vehicle | yes | no |
| `on_trip` | Driving; may still take pooled bookings | yes, if seats free | no |
| `heading_home` | Driving toward a declared destination | along the corridor only | no |

`heading_home` is what makes "anyone can drive" useful: someone commuting who
will take a passenger going roughly their way. It reuses the corridor machinery
with the driver's own destination pinned as the final stop.

Enforcement:

```sql
-- Refuses if the caller holds any booking in (accepted, arrived, ongoing).
create or replace function public.assert_can_drive(p_user uuid) returns void ...
-- Refuses if the caller is driving an active trip.
create or replace function public.assert_can_ride(p_user uuid) returns void ...
-- The single entry point; the UI switch calls this, not a route change.
create or replace function public.set_user_mode(p_mode text) returns public.user_modes ...
```

**Frontend touch points:** `src/lib/auth.jsx` gains `mode` and `setMode`;
`src/components/layout/TopBar.jsx` — the Ride/Drive switch calls `set_user_mode`
and surfaces a refusal instead of navigating; `src/components/layout/navItems.js`
selects its tab set from `mode` rather than from the route prefix.

---

## 4. Adaptive capacity

Booked seats and occupied seats diverge constantly: a rider books one and
arrives with a friend; a rider books three to have the auto to themselves and
travels alone; someone no-shows. Match against the conservative figure:

```
committed(booking) = greatest(booking.seats, coalesce(booking.seats_occupied, booking.seats))
seats_available    = seat_capacity − Σ committed(live bookings)
```

**Corrected from the original plan**, which said
`seat_capacity − greatest(seats_booked, seats_occupied)`. That form only holds
when every booking is in the same state: with one rider aboard occupying two
seats and another merely booked for one, it reads 2 where the true commitment is
3, and the vehicle gets oversold. A test caught it — see
`supabase/tests/02_pooling_flow.sql`.

The same correction applies to the capacity walk. `trip_assert_capacity` seeds
its running total with whoever is already aboard, because their pickup stop is
marked reached and contributes no `+delta` to the walk while their drop still
subtracts — starting from zero drives the total negative and hides a genuine
overflow mid-route.

| Class | Passenger seats | Concurrent pooling | Sequential chaining |
|---|---:|---|---|
| Bike | 1 | never | yes |
| Auto | 3 | yes | yes |
| Mini | 4 | yes | yes |
| Sedan | 4 | yes | yes |
| SUV | 6 | yes | yes |

### 4.1 The asymmetry

The two directions are **not** mirror images:

- **Occupied > booked** (a rider brought someone) consumes capacity immediately,
  requires re-checking every downstream stop for a violation, and adds a charge
  the rider confirms in-app before the trip continues.
- **Occupied < booked** (fewer people than paid for) frees **nothing**. Those
  seats are sold. Releasing them requires the rider to amend the booking, which
  triggers a partial refund. Silently reselling a paid seat is the bug that ends
  the feature.

### 4.2 Worked example — auto, capacity 3

| Event | Booked | Occupied | Offerable | Effect |
|---|---:|---:|---:|---|
| Booking A accepted, 1 seat | 1 | 0 | 2 | Matching may offer up to 2 seats |
| A picked up — driver confirms 2 got in | 1 | 2 | 1 | Extra seat charged to A on confirmation |
| Booking B requests 2 seats | 1 | 2 | 1 | Rejected — does not fit |
| Booking C requests 1 seat | 2 | 2 | 1 | Accepted, held under lock |
| C picked up, 1 aboard | 2 | 3 | 0 | Trip full; drops out of the candidate pool |
| A dropped (2 people out) | 1 | 1 | 2 | Re-enters the pool for the rest of the route |

### 4.3 RPCs

```sql
-- Driver confirms how many people actually got in at this pickup.
-- Writes an occupancy_event, recomputes seats_occupied, re-runs
-- trip_assert_capacity over the remaining sequence, and returns any booking
-- that no longer fits so the caller can trigger re-dispatch.
create or replace function public.confirm_pickup_headcount(
  p_booking_id uuid, p_headcount smallint
) returns table (displaced_booking_id uuid, extra_seats smallint) ...

-- Rider confirms (and pays for) an extra occupant.
create or replace function public.confirm_extra_occupant(
  p_booking_id uuid, p_extra_seats smallint
) returns public.rides ...

-- Rider releases seats they booked but do not need; issues a partial refund.
create or replace function public.amend_booking_seats(
  p_booking_id uuid, p_seats smallint
) returns public.rides ...
```

### 4.4 The failure this creates — build it in the same change

If occupancy grows and an already-accepted booking no longer fits, that rider
must be **proactively re-dispatched**, not left at a kerb waiting for a vehicle
that cannot take them:

1. `confirm_pickup_headcount` returns the displaced booking.
2. System-cancels it — `cancelled_by = null`, `cancellation_fee = 0`,
   `cancellation_reason = 'capacity_displaced'`.
3. Immediately re-queues it as `pending` with its original fare honoured.
4. Issues an apology credit through the existing `payments` path.
5. Notifies the rider through the existing notification pipeline before the
   driver's screen advances.

This is not an edge case. It will happen daily, and shipping the occupancy
feature without it produces stranded riders.

---

## 5. Matching

"Is the pickup within 2 km of the driver?" is the wrong question — a pickup
500 m *behind* the vehicle costs ten minutes of backtracking while one 2 km
ahead costs nothing. The right question is: **can this booking be inserted into
the existing stop sequence without breaking anything?**

### Stage 1 — corridor + direction, one index scan

```sql
-- Candidate trips: both new points inside the corridor around the remaining
-- route, drop downstream of pickup, seats free, class allows pooling, and every
-- rider already aboard consented to sharing.
select t.id
  from public.trips t
 where t.status = 'active'
   and t.pooling_enabled
   and public.seats_available(t.id) >= p_seats
   and ST_DWithin(t.remaining_geog, p_pickup::geography, p_corridor_m)
   and ST_DWithin(t.remaining_geog, p_drop::geography,   p_corridor_m)
   -- exact direction test, not a heuristic:
   and ST_LineLocatePoint(t.remaining_geog::geometry, p_drop)
     > ST_LineLocatePoint(t.remaining_geog::geometry, p_pickup)
   and not exists (
     select 1 from public.rides r
      where r.trip_id = t.id
        and r.status in ('accepted','arrived','ongoing')
        and not r.shareable
   )
   and not exists (
     select 1 from public.match_blocklist b
      join public.rides r on r.trip_id = t.id
     where (b.user_id = p_rider and b.blocked_id in (r.rider_id, t.driver_id))
        or (b.blocked_id = p_rider and b.user_id in (r.rider_id, t.driver_id))
   );
```

`ST_LineLocatePoint` returns each point's fraction along the route, so ordering
those two fractions is an **exact** direction test. Routes that double back on
themselves break that monotonicity — detect and exclude them from pooling at
route-build time (`trips.pooling_enabled = false`).

Default corridor: **1200 m**. Store it per city in a config table so it can be
retuned without a deploy.

### Stage 2 — insertion feasibility on a single routing call

For each surviving trip, try every legal position for the new pickup and drop,
keeping P before D. With *n* existing stops that is O(*n*²) sequences — at most
~21 for a realistic trip, trivial to evaluate.

**The cost trap:** do not price 21 sequences with 21 directions calls. Fetch one
**duration matrix** over the existing stop set plus the two new points — a single
`computeRouteMatrix` call, ≤ 8 × 8 cells — then evaluate every candidate sequence
as a sum of matrix cells in memory.

```
for i in 0..n:                     -- insert P after stop i
  for j in i..n:                   -- insert D after stop j
    seq = splice(stops, P@i, D@j)
    if capacity_exceeded_at_any_prefix(seq):        continue
    t = sum_of_matrix_legs(seq)
    if added_delay(each rider aboard, t) > promise: continue
    if wait(new_rider, t) > max_wait:               continue
    keep best by score(seq)
```

This is the difference between a design that ships and one that costs more in
routing API calls than it earns in fares.

### Stage 3 — score, offer, lock

```
score = w₁·(shared_km / new_booking_km)         -- overlap: the core signal
      − w₂·(added_minutes_for_riders_aboard)    -- the promise we protect
      − w₃·(minutes_to_reach_new_pickup)
      + w₄·(incremental_fare / incremental_minutes)
      − w₅·(new_rider_wait_minutes)
```

Weights live in `matching_weights`, keyed by city with a `default` row every
city falls back to, and `poolable_rides` orders by `pool_score(...)`.

**This was specified from the start and shipped late.** Until `0010` the funnel
ordered by added distance alone — one of the five signals — which prefers a match
that saves the driver a kilometre over one that shares fifteen.

The best match is offered to the driver with a countdown; the seat is held by a
`seat_holds` row with a TTL so no second dispatcher can sell it while they decide.

### Funnel budget

| Stage | Filter | Survivors | Budget |
|---|---|---:|---:|
| Corridor | GiST index; both points within 1.2 km, drop downstream, seats free, class allows, all aboard shareable, not blocklisted | ~5–30 | < 10 ms |
| Prune | Haversine detour proxy, keep best 8 | 8 | < 1 ms |
| Feasibility | Duration matrix + insertion search; capacity and detour caps | 0–8 | ~250 ms |
| Offer | Best score; seat held with TTL | 1 | 15 s window |

### Batch matching (Phase 6, not before)

Matching each request the instant it arrives is greedy. Holding new requests for
a 3–5 second window and solving the batch jointly is the single largest quality
lever in pooling — and it only pays off once there is enough concurrent demand
to batch. Doing it early optimises a market that does not exist yet.

---

## 6. The detour promise

"Neither party compromises on speed" cannot be delivered by a scoring function.
It has to be a hard constraint with a number attached, displayed to the rider,
and backed by money when it fails.

- At booking, store `rides.solo_eta_min` — what this trip would have taken alone.
  Without the baseline, nothing downstream is provable.
- At every insertion, cap added delay for each rider **already aboard** at
  `min(8 min, 40% of their solo ETA)`. A sequence that breaches it for anyone is
  not a candidate, regardless of score.
- Display it: *"Sharing — arrives up to 6 min later."* A promise you do not show
  is not a promise.
- On completion, `complete_ride` compares actual against baseline into
  `actual_detour_min`. Breach → automatic credit via the existing `payments`
  table, no support ticket.

Breach rate is the single most important health metric. Above ~2%, riders learn
not to trust the toggle, poolable supply collapses, and the feature is dead weight.

---

## 7. Money

| Case | Rider pays | Driver receives |
|---|---|---|
| Solo (today) | `base + per_km · km` | fare − commission |
| Shared, matched | solo fare, rebated 25% at settlement | Σ of all bookings' fares − commission |
| Shared, never matched | solo fare, no rebate | unchanged |
| Extra occupant beyond booked | +1 seat at the shared rate, confirmed in-app | included in the trip total |

Rebate-on-match means the discount is only ever paid on trips where pooling
actually created the value — the feature cannot lose money on unmatched supply.

`complete_ride()` becomes per-booking rather than per-ride: each booking settles
its own fare and rebate; the driver's payout is the sum across the trip minus
commission. The existing `payments` row shape already supports this (one row per
booking, `payee_id` = driver).

**Driver adoption depends on visible marginal value.** Put the arithmetic on the
offer card — **"+₹96 · +6 min · ₹16/min"** against their current rate — not just
the new fare.

### Regulatory flag (not legal advice)

"Anyone can drive" and "passengers pay a fare" are different things under Indian
law. A private (non-transport) vehicle carrying paying passengers is a commercial
operation requiring a transport permit and commercial licence; cost-sharing
carpooling sits on separate and narrower ground, and the 2020 aggregator
guidelines constrain both. Record licence class and vehicle permit class on the
`drivers` row and gate what a non-commercial driver may charge to cost recovery.
**Get this reviewed by someone qualified before launch** — it shapes the pricing
model, not just the paperwork.

---

## 8. Concurrency and failure

Pooling turns a two-party handshake into a contended resource. Each of these is
a real failure mode, not a theoretical one.

| Failure | Handling |
|---|---|
| Two dispatchers, one seat | `select … from trips where id = $1 for update` inside the accept RPC, then **recompute** capacity and detour under the lock. Never trust the numbers from the read that produced the offer. |
| Offer outstanding while state moves | `seat_holds` row with `expires_at`, counted against capacity while live, swept on expiry by the same pg_cron job that runs `expire_stale_rides()`. |
| Duplicate accepts | Idempotency key on the accept call; a retry returns the original result rather than booking twice. |
| New rider no-shows | Drop that booking from the sequence and continue the trip. **One booking failing must never cancel the others** — this is the largest structural departure from the current 1:1 model. |
| Driver cancels mid-pool | Every remaining booking is re-dispatched independently, each keeping its own fare and promise. |
| Stop-order corruption | `trip_stops_assert_order()` trigger rejects any sequence where a booking's drop precedes its pickup, so no code path can write an impossible schedule. |
| Occupancy invalidates an accepted booking | Proactive re-dispatch — see §4.4. |

The accept RPC, in full shape:

```sql
create or replace function public.accept_pooled_booking(
  p_trip_id uuid, p_booking_id uuid, p_idempotency_key text
) returns public.trips
language plpgsql security definer set search_path = public as $$
declare v_trip public.trips;
begin
  -- 1. idempotency: return the prior result if this key was already used
  -- 2. select … from trips where id = p_trip_id for update
  -- 3. recompute seats_available under the lock; raise if it no longer fits
  -- 4. re-run the insertion feasibility against the *current* stop sequence
  -- 5. splice the two stops in, renumber seq, call trip_assert_capacity
  -- 6. consume the seat_hold, bump seats_booked, write the ride_event
end;
$$;
```

---

## 9. Safety

Pooling puts strangers in a vehicle together. That changes the risk profile
enough to need deliberate handling rather than inheritance from the solo flow.

- **Per-booking OTP** — already built, and it matters more: each rider verifies
  at their own pickup, so a driver cannot start with the wrong passenger aboard.
- **Drop verification** on pooled trips, so a rider cannot be marked dropped
  somewhere they were not.
- **Co-passenger privacy** — first name and rating only. No number, no exact
  pickup address, no last name.
- **Opt-out that sticks** — a rider who reports a co-passenger is never matched
  with them again (`match_blocklist`, checked in the corridor query, §5).
- **Women-only pooling**, if offered, must be enforced in the candidate query,
  never filtered in the client.
- SOS, trip-sharing and emergency contacts (`0005`) need no change — they are
  per-user, not per-ride.

---

## 10. RLS

The schema sketches above are deliberately incomplete on RLS; it needs its own
pass once the shape is agreed. The rules it has to satisfy:

- A rider may read **their own booking** in full, and of the trip only what the
  ride view needs: driver identity, vehicle, live position, stop ETAs.
- A rider may read co-passengers' **first name and rating only** — never their
  addresses, phone, or booking rows. This means a `pooled_trip_view()` RPC
  returning a projection, not a policy on `rides`.
- A driver may read every booking on their own trip.
- `trip_stops` is readable by the driver and by riders **whose own stops are in
  it** — a rider seeing the full sequence learns other riders' addresses.
- `seat_holds` and `occupancy_events` are server-only: no client-side write path.
- The corridor query runs `security definer`, because it must read trips the
  caller has no business reading directly.

---

## 11. Build order

Ordered so the risky migration lands while nothing depends on it, and so
something useful ships at every step rather than after all of it.

### P0 — Unified role & mode ✅ shipped
One session state per user with the mutual-exclusion invariant in the database;
the header switch becomes a real transition. No pooling yet.
*De-risks: nothing else is safe to build until "driving while riding" is impossible.*
Touches: `user_modes` DDL, `set_user_mode`/`assert_can_*`, `src/lib/auth.jsx`,
`src/components/layout/TopBar.jsx`, `src/components/layout/navItems.js`.

### P1 — Trips, bookings, stops ✅ shipped
Introduce the model; backfill one trip and two stops per existing ride; route
everything through the stop sequence. Behaviour identical, capacity fixed at 1.
Keep `rides.driver_id` as a synced mirror so existing queries, RLS and realtime
filters keep working.
*De-risks: the whole refactor lands invisibly, with the existing flow as its test.*
Touches: `trips`/`trip_stops`/`vehicle_classes` DDL + backfill, `accept_ride`,
`start_ride`, `complete_ride`, `cancel_ride` rewritten against trips,
`src/lib/rides.js`, `src/lib/activeRide.jsx`, `src/lib/useRideLive.js`.

### P2 — Sequential chaining ✅ shipped
A driver accepts the *next* fare while finishing the current one. No concurrency,
no capacity maths, no detour. **Works for bikes.**
*Delivers the "faster pickups" value immediately and exercises the stop-sequence
code with almost none of the risk.*
Touches: `nearby_pending_rides` gains a "finishing soon" branch;
`src/components/Driver/*` offer card.

### P3 — Concurrent pooling ✅ shipped
PostGIS, the corridor index, insertion feasibility, the `shareable` flag, the
detour promise, the driver offer card. Auto, mini, sedan, SUV.
*The feature proper — but every dependency is already load-bearing by now.*
Touches: `postgis`, `find_pool_matches()`, `accept_pooled_booking()`,
`seat_holds`, booking UI in `src/components/AvailableRides.jsx` and
`src/lib/booking.jsx`, offer card in `src/components/Driver/`.

### P4 — Adaptive occupancy ✅ shipped
Headcount confirmation at each pickup, live seat availability, charging for extra
occupants, and the proactive re-dispatch of §4.4.
*Split from P3 deliberately so P3 can ship on booked seats alone.*
Touches: `occupancy_events`, `confirm_pickup_headcount`,
`confirm_extra_occupant`, `amend_booking_seats`, driver pickup screen.

### P5 — Batch matching & tuning ✅ shipped, switched off

`match_queue` holds shareable requests for `pool_config.batch_window_seconds`,
and `run_batch_match()` scores every (request, trip) pair that survives the same
gates as the per-arrival funnel. `apply_batch_match()` then assigns best-first
across the whole batch, so the strongest pairing is made first regardless of
which request arrived earliest — which is the entire difference from greedy.

Best-first over all pairs is **not** the optimal assignment; that is a transport
problem, and solving it exactly in plpgsql would be the wrong place and the wrong
cost. It captures most of the gain, and the ceiling is written down in the
function rather than implied.

**The window defaults to 0, which routes everything down the existing
per-arrival path.** With a handful of requests in flight, a 3–5 second hold costs
every rider that delay and produces the assignment greedy already would. Turning
it on is a decision to make when §12's match rate and concurrent volume say the
window would have something to choose between — not a deploy.

Per-city scoring weights ship with it; see §5.

---

## 12. Metrics

| Metric | Why it matters | Watch for |
|---|---|---|
| Match rate | Share of shareable bookings that actually pool | Below ~15%: corridor too tight or supply too thin |
| Detour promise breach | Whether the guarantee holds | Above 2%: tighten the caps, loosen nothing |
| Δ driver earnings/hour | Whether drivers keep opting in | Flat or negative means scoring favours the platform over them |
| Pool fill rate | Seats used ÷ capacity on pooled trips | Determines whether the 25% rebate pays for itself |
| Pooled vs solo cancellation | Canary for rider trust | Any gap that widens over time |
| Re-dispatch rate | How often occupancy invalidates a booking | Rising means drivers are mis-reporting headcount |

---

## 13. Open decisions

These need answers before any of the above is built. Recommendations are given,
but they are calls for the product owner, not for engineering.

1. **Consent model** — per-booking `shareable` flag with rebate, a separate
   discounted ride class, or applied to any ride without asking?
   → *Recommend the flag.* It preserves "any ride can pool" without selling a
   service that was not described.
2. **The existing carpool board** — `published_rides` / `ride_requests` is a
   scheduled, plan-ahead product. Merge into live pooling, or keep separate?
   → *Recommend keeping both products but moving both onto trips/bookings/stops,*
   so there is one execution engine rather than two.
3. **Bikes** — sequential chaining only, never concurrent. Confirm?
   → *Strongly recommend yes,* as a column on the class rather than a computed limit.
4. **Co-passenger visibility** — before the match is confirmed, or only after?
   → *After,* with the right to report and permanently block. Showing beforehand
   invites selection on the wrong criteria.
5. **Commission on pooled trips** — same 15%, or reduced to make pooling
   unambiguously better for the driver?
   → *Worth modelling both.* A lower rate on pooled legs is the cheapest way to
   buy driver adoption early.
6. **Launch geography** — one corridor in one city, or citywide?
   → *One high-density corridor first.* A citywide launch at low volume produces
   a match rate near zero and reads as a broken feature.


---

## 14. What shipped, and how to run it

```
supabase/migrations/0007_pooling.sql   trips, stops, matching, capacity
supabase/migrations/0008_seat_holds.sql seat holds + the detour audit
supabase/migrations/0009_roles_and_chaining.sql  mode + sequential chaining
supabase/migrations/0010_scoring_batch_and_gaps.sql  scoring, batching, the rest
supabase/tests/run.sh                  applies every migration, runs 97 assertions
frontend/src/lib/pooling.js            RPC wrappers + local previews of the arithmetic
frontend/src/components/ride/SeatPicker.jsx        seats + the sharing consent gate
frontend/src/components/ride/SharedRideBanner.jsx  what the rider is told
frontend/src/components/Driver/HeadcountDialog.jsx how many actually got in
frontend/src/components/Driver/PoolOfferCard.jsx   the marginal case, for the driver
frontend/src/components/Driver/TripStopList.jsx    the schedule, with running occupancy
```

Run the database suite with a local Postgres:

```
sudo ./supabase/tests/run.sh
```

It applies every migration to a throwaway database — one per test file, since
they are not written to tolerate each other's leftovers — and asserts: the
booking and accept path; the headcount repricing a fare; every refusal (wrong
way, off corridor, no consent, no seats, pickup too far ahead); a second rider
travelling past the first; the trip surviving the first drop; displacement when
occupancy grows; a two-session race for the last seat; that a hold reserves both
seat and request and nobody else can take either; that an expired hold frees them
again; that a growing headcount drops holds before bookings; and that a breached
detour promise is measured and credited.

### Configuration

Everything tunable lives in one row of `pool_config`, so a city can be retuned
without a deploy:

| Column | Default | What it does |
|---|---:|---|
| `corridor_km` | 1.2 | how far off-route a stop may sit |
| `max_extension_km` | 3.0 | how far past the last drop a new drop may go |
| `max_detour_min` | 8 | added-time cap for riders already aboard |
| `max_pickup_wait_min` | 12 | how long a new rider may wait for a pooled car |
| `avg_speed_kmh` | 22 | km → minutes |
| `road_factor` | 1.3 | straight-line → road distance |
| `extra_seat_pct` | 40 | each seat past the first, as a share of the one-seat fare |
| `pool_discount_pct` | 20 | rebate, paid only when a match lands |
| `hold_seconds` | 25 | how long an offer reserves its seat and request |
| `breach_rate_per_min` | 8 | credit per minute over the promised detour |
| `breach_cap_pct` | 25 | ceiling on that credit, as a share of the fare |
| `chain_lead_km` | 6 | how close to finishing before the next fare is offered |
| `chain_radius_km` | 4 | how far a chained pickup may be from where the driver finishes |
| `batch_window_seconds` | **0** | how long to hold requests before solving the batch; 0 disables batching |
| `city` | `default` | which `matching_weights` row applies |

### Seat holds — shipped in `0008`

An offer now reserves both the seat and the request for `pool_config.hold_seconds`
(default 25). `hold_pool_seat` re-runs every check the accept will run, under the
same row lock, so a card that reaches the driver's screen is one they can take.

- Held seats are netted out of `trip_seats_available`, with `p_except_ride` so a
  driver's own hold never locks them out of their own accept.
- `poolable_rides`, `nearby_pending_rides` and `accept_ride` all skip a request
  another driver is holding — otherwise a driver on the dashboard could take the
  ride out from under one mid-decision.
- Holds expire lazily on every read path as well as by `expire_seat_holds()`, so
  no caller has to reason about whether a sweeper has run.
- When a headcount fills the vehicle, **holds are dropped before bookings are
  displaced**: nobody has been promised anything by a hold, so withdrawing one
  costs a driver a decision, where displacing a booking costs a rider their ride.

The lock still does the real work. A hold makes failure rare; it does not make
the recheck optional, because occupancy can still grow underneath it.

### The detour promise — shipped in `0008`

`solo_eta_min` is stored at booking, and completion measures what the detour
actually cost. Over the promise, the rider is credited automatically — at
`breach_rate_per_min` (₹8) capped at `breach_cap_pct` (25%) of the fare — with a
notification and a `ride_events` entry. No support ticket: a guarantee that needs
chasing is not a guarantee.

**Measured from the stops actually driven, not from wall-clock time.** Wall-clock
would charge us for traffic we did not cause and would breach on nearly every
trip in a city, which makes the guarantee meaningless in the direction that costs
money. `ride_actual_detour_min` walks the stop sequence between the rider's
pickup and drop, subtracts their direct distance, and converts with the same
`road_factor` the promise was quoted with.

### Unified role and mode — shipped in `0009`

`users` plus a verified `drivers` row was always a capability model: it says what
you *may* do, never what you are doing. `user_modes` — one row per user, so the
invariant holds by construction — carries `idle | seeking | riding | available |
on_trip | heading_home`.

The mode is **maintained by the flow, not asserted by the client**. A mode nobody
updates goes stale and then gets trusted, so booking, accepting, boarding,
completing and cancelling all move it via triggers, and `set_user_mode` only
accepts the three modes a person can actually choose (`idle`, `available`,
`heading_home`) — the rest are consequences.

Two refusals do the real work:

- `assert_can_drive` — going on duty or accepting a ride is refused while you
  hold any booking in `accepted | arrived | ongoing`.
- `assert_can_ride` — booking a ride is refused while you are driving an active
  trip. This one is a trigger on `rides`, because bookings still insert straight
  through PostgREST.

The header switch calls `set_user_mode` and surfaces the refusal, rather than
routing to a driver screen that then fails confusingly. So does the Account
page's "Switch to driving" — that one matters more, because the header switch is
`hidden sm:flex` and Account is the only crossing on a phone.

`tabsFor` takes mode as a tiebreak alongside the route, so a driver mid-trip who
taps through to their account keeps the driving tabs instead of being dropped
back into rider navigation.

### Sequential chaining — shipped in `0009`

The other half of "take another fare nearby", and the half a bike can safely
have: accept the *next* booking while finishing the current one, with its pickup
strictly after every drop still to be made. No two contracts are aboard at once,
so there is no capacity overlap and nobody already riding loses a second.

That is why the gates in `chainable_rides` are so much shorter than
`poolable_rides` — no corridor, no detour cap, no consent gate, because nothing
about this affects the rider already aboard. What matters instead is that the
driver is nearly done (`chain_lead_km`, default 6) and the new pickup is close to
where they will end up (`chain_radius_km`, default 4).

Ordering stops by progress does the rest: a pickup beyond the final drop sorts
last on its own, and the capacity walk then sees every seat released before any
is taken again.

**One correction this forced.** `trip_recount` summed every live booking into
`seats_booked`, which is right when spans overlap — that is what pooling is.
Chained bookings never overlap, so a one-seat bike carrying one rider with one
queued summed to 2 and tripped the check constraint. The honest figure is peak
occupancy along the route: identical to the sum when spans overlap, and the
largest single booking when they do not.

### The specified pieces that shipped in `0010`

An audit of this document against the code turned up six things the design named
and the code never grew. All are now built:

| Section | What was missing |
|---|---|
| §5 | the five-term score and its per-city weights table |
| §8 | an idempotency key on accept, so a retry returns the original result |
| §8 | a trigger that **rejects** an impossible stop order rather than repairing it |
| §9 | drop verification on pooled trips |
| §9 | `block_co_passenger` had no caller — the rider projection returned a first name, and you cannot block a first name |
| §3 | `heading_home` was accepted and stored since `0009` but nothing matched against it |
| §12 | the metrics |

Two are worth reading about.

**Stop order.** `trip_fix_pair` quietly swaps a drop that sorted before its own
pickup. That is the right repair at insertion, but it meant a bug elsewhere could
write nonsense and have it tidied away. `trg_trip_stops_order` now raises. It is
a *deferred* constraint trigger, because `trip_place_stops` renumbers the whole
sequence in one statement and legitimately passes through intermediate states.

**Drop verification.** With one rider, "completed" is unambiguous. With three
aboard, a driver can close the wrong booking — ending someone's trip, and their
fare, at a place they never got out. A four-digit code from the rider closes
that, and it is issued only on pooled trips because a solo ride has nothing to
confuse.

### Still open

Nothing from the build order. What remains is a product decision, not an
engineering one: **women-only pooling** (§9) is specified as *"if you offer it,
enforce it in the candidate query rather than filtering in the client"* — the
enforcement point is ready, the decision to offer it is yours.
