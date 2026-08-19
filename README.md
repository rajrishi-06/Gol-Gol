<div align="center">

# 🟢 Gol·Gol

### A production-grade, two-sided ride-hailing & carpooling PWA built for Indian city commuters

*"Every ride, a little smoother."*

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white&style=flat-square)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white&style=flat-square)](https://vitejs.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-38BDF8?logo=tailwindcss&logoColor=white&style=flat-square)](https://tailwindcss.com)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%7C%20Auth%20%7C%20Realtime-3ECF8E?logo=supabase&logoColor=white&style=flat-square)](https://supabase.com)
[![PWA](https://img.shields.io/badge/PWA-Offline%20capable-5A0FC8?logo=pwa&logoColor=white&style=flat-square)](#)

</div>

---

## 🚀 What is Gol·Gol?

A full-stack, real-time ride-sharing platform — think Ola/Uber meets BlaBlaCar —
built as a Progressive Web App for Indian urban commuters. It connects **riders**
who need a cab with **drivers** who are online and nearby, with live GPS
tracking, turn-by-turn navigation, in-ride chat, OTP-verified boarding, two-way
ratings, receipts, driver earnings and a safety toolkit — all from a browser.

> **Setting it up?** `docs/IMPLEMENTATION.md` has the migration order, the admin
> bootstrap and an end-to-end test path. `docs/FEATURE_ANALYSIS.md` is the audit
> behind the current design.
>
> **Sharing rides?** `docs/POOLING_ARCHITECTURE.md` covers en-route pooling,
> adaptive seat capacity and seat holds — all built. `sudo ./supabase/tests/run.sh`
> applies every migration to a throwaway Postgres and asserts the whole flow.
>
> **The globe on the home screen** is documented in `docs/HOME_GLOBE.md`. Rebuild
> its texture from coastline data with `npm run bake:earth`.

---

## 🧭 How you move around

One shell, everywhere: a **side rail on desktop**, a **tab bar on phones**, and a
persistent **"ride in progress" strip** that keeps the live map one tap away from
any screen.

| Riding | Driving |
|---|---|
| **Ride** — map, saved places, ride classes | **Drive** — duty switch, live dispatch |
| **Activity** — trips, receipts, ratings | **Trips** — everything you've driven |
| **Wallet** — payments and method | **Earnings** — payouts, tips, daily chart |
| **Account** — profile, places, safety, settings, help | **Account** — same |

Approved drivers get a Ride/Drive switch in the header. Admins get a driver
verification console.

---

## ⚡ Features

### 🧑‍💼 Riders

- **Book in a few taps** — Places autocomplete, drop-a-pin map picker, saved
  Home/Work, recent destinations, swap pickup/drop.
- **Live supply** — nearby driver count and arrival estimate per ride class,
  computed server-side (no driver positions leave the database).
- **Upfront pricing** — fare breakdown before you confirm; the server recomputes
  it on booking, so the app can't invent a price.
- **Schedule ahead** — a future pickup time parks the ride until ~10 minutes
  before departure.
- **Live tracking** — the driver's marker moves in real time, the route redraws,
  and the ETA is the same number the driver's own navigation is quoting.
- **OTP boarding** — a server-generated code only you can see; the driver enters
  it without ever reading it.
- **Safety** — expiring share-a-trip links, emergency contacts, one-tap
  helplines and an SOS that records your position and alerts your ride partner.
- **After the trip** — receipt, two-way rating with tags and an optional tip,
  and one-tap re-book.

### 🚦 Drivers

- **Onboarding** with a real verification workflow — licence, registration,
  vehicle details and the **service class** you'll serve.
- **Dispatch that works** — requests matched on service class, within 5 km, with
  the rider's name, rating, both addresses and the pickup distance on the card.
- **Race-safe accepting** — an atomic claim; the loser is told immediately.
- **On/off duty** without logging out, with heartbeats so "online" means online.
- **Turn-by-turn navigation** — maneuver banner, spoken guidance, rerouting,
  follow mode, arrival detection.
- **Earnings** — payout after platform fee, tips, distance, and a daily chart.

### 🤝 Carpool

Publish a route with seats, fare and departure time; riders search overlapping
routes sorted by detour and request a seat. Accept/decline/remove are row-locked
so a car can't be overbooked, and every decision notifies the rider.

---

## 🏗️ Engineering notes

**Real-time.** A single connection provider surfaces `online / connecting /
offline` and hands screens a re-sync hook, so a backgrounded phone catches up
instead of silently going stale. Ride row, event timeline and chat share one
subscription. Driver GPS streams over Realtime **Broadcast** (with a throttled DB
write for last-known position); chat typing indicators use **Presence**, so
neither costs a database write.

**Server-authoritative.** Distance, fare, the start-OTP and every state
transition live in Postgres. Clients call RPCs — `accept_ride`,
`mark_driver_arrived`, `start_ride`, `complete_ride`, `cancel_ride`,
`submit_rating` — each of which checks the caller's role and writes an
append-only `ride_events` row.

**Security.** RLS is scoped to actual counterparties: anonymous users can't
enumerate phone numbers, signed-in users can't read other drivers' licence
numbers or live GPS, and nobody can edit a ride that isn't theirs. Dispatch
visibility is narrowed to on-duty drivers of the right class within 8 km, so
realtime doesn't broadcast every pickup in the city.

**Offline.** The service worker keeps the app shell and hashed assets available
without a network (never API or map traffic), and prompts to refresh when a new
build lands.

**Accessibility.** Semantic landmarks, real buttons, ARIA tab lists and
comboboxes, focus-trapped dialogs, live regions for async state, visible focus
rings, and full `prefers-reduced-motion` support.

---

## 🛠️ Tech stack

| Layer | Technology |
|---|---|
| **UI** | React 19, Vite 6, Tailwind CSS v4 |
| **Routing** | React Router DOM v7 |
| **Backend / DB** | Supabase — Postgres, Phone OTP auth, RLS, Realtime, Edge Functions |
| **Maps** | Google Maps JS + Geocoding, Places (New) and Routes APIs |
| **Push** | Web Push + VAPID + a Deno Edge Function |
| **State** | React context + Supabase Realtime (no external store) |
| **Icons / toasts / sheets** | Lucide, Sonner, Vaul |

---

## 🏁 Getting started

```bash
cd frontend
npm install
cp .env.example .env.local     # fill in your keys
npm run dev
```

Apply `supabase/migrations/0005_*.sql` and `0006_*.sql` to your project first —
see `docs/IMPLEMENTATION.md` §1.

---

<div align="center">
  <sub>Built for Indian city commuters · Primary market: Hyderabad · React 19 + Supabase + Google Maps</sub>
</div>
