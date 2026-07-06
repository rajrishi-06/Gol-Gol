<div align="center">

# 🟢 Gol·Gol

### A production-grade, two-sided ride-hailing & carpooling PWA built for Indian city commuters

*"Every ride, a little smoother."*

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white&style=flat-square)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white&style=flat-square)](https://vitejs.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-38BDF8?logo=tailwindcss&logoColor=white&style=flat-square)](https://tailwindcss.com)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%7C%20Auth%20%7C%20Realtime-3ECF8E?logo=supabase&logoColor=white&style=flat-square)](https://supabase.com)
[![PWA](https://img.shields.io/badge/PWA-Installable-5A0FC8?logo=pwa&logoColor=white&style=flat-square)](#)
[![0 Vulnerabilities](https://img.shields.io/badge/npm%20vulnerabilities-0-brightgreen?style=flat-square)](#)

</div>

---

## 🚀 What Is Gol·Gol?

Gol·Gol is a **full-stack, real-time ride-sharing platform** — think Ola/Uber meets BlaBlaCar — built as a Progressive Web App targeting Indian urban commuters. It connects **riders** who need a cab or carpool with **drivers** who are online and nearby, with live GPS tracking, in-ride chat, push notifications, and OTP-verified ride starts — all from a browser, no app store required.

---

## ⚡ Core Features

### 🧑‍💼 Rider Experience

#### 📍 Smart Location Booking
- Interactive **Mapbox GL** map with tap-to-pin location picking — works on mobile as a full-screen overlay
- **Google Places autocomplete** for address search with intelligent geocoding fallback
- Connected **From → To route rail** with auto-computed distance and upfront fare estimate

#### 🚗 Vehicle Selection
| Vehicle | Base Fare | Rate |
|---|---|---|
| Auto | ₹25 | ₹12/km |
| Bike | ₹15 | ₹8/km |
| Mini | ₹40 | ₹15/km |
| Prime Sedan | ₹60 | ₹18/km |
| Prime SUV | ₹80 | ₹22/km |

#### 🤝 Carpool / Find Match
- Browse **published carpool rides** that overlap with the rider's route
- Request to join with custom pickup/drop pins, seat count, and price preference
- **Real-time request status** — get notified the moment a driver accepts or rejects

#### 📡 Live Ride Tracking
- Rider's **active ride screen** streams the driver's GPS position in real-time via Supabase Realtime
- ETA updates as the driver moves; ride status transitions from `accepted → ongoing → completed`

#### 💬 In-Ride Chat
- Persistent in-ride messaging between rider and driver
- Messages stored in Postgres, delivered in real-time; both parties see the full chat history

#### 🔔 Push Notifications
- **In-app** toasts via Sonner when the tab is open
- **Background Web Push** (even with the tab closed) powered by a Supabase Edge Function + VAPID
- Events covered: ride accepted, ride started, ride cancelled, new chat message

---

### 🚦 Driver Experience

#### 🟢 Driver Activation & Onboarding
- Drivers register with their vehicle type, license, and registration details
- Admin-controlled **verification workflow** — only `approved` drivers can go online or publish carpools

#### 🗺️ Real-Time Dispatch Dashboard
- Driver goes online → GPS is watched via `navigator.geolocation.watchPosition` and written to Supabase every few seconds
- **Supabase Realtime** streams new `rides` inserts; the dashboard filters to show only:
  - Rides with **matching vehicle type**
  - Pickup within a **5 km radius** of the driver's current position
- Accepting a ride is **optimistic and race-safe** — the DB update only succeeds if the ride is still `pending`, preventing two drivers from accepting the same ride simultaneously

#### 🧭 Navigation View
- Dedicated in-ride navigation screen with route polyline, live GPS tracking, and turn-by-turn guidance
- Driver UI is designed for glanceability: large targets, high contrast, minimal taps — safe while driving

#### 🔑 OTP Ride Start
- Before departing, the driver verifies the rider with a **server-generated one-time pin** (set by a DB trigger, not the client)
- Prevents driver fraud and ensures the right rider boards

#### 📋 Carpool Publishing
- Drivers post a scheduled route with available seats, fare per seat, and departure time
- Distance auto-calculated via Haversine formula
- Incoming rider join-requests appear in real-time; driver can **accept, reject, or remove** riders
- Accepted riders stored as a **JSONB array** on the ride row, supporting multi-rider carpools

---

## 🏗️ Engineering Highlights

### Real-Time Architecture
- **Supabase Realtime** (`postgres_changes`) subscriptions on 6 tables: `rides`, `active_drivers`, `chat_messages`, `ride_requests`, `published_rides`, `notifications`
- Channels are scoped narrowly (e.g. `ride_requests:${rideId}`) and cleaned up on unmount — zero memory leaks

### Security
- **Row Level Security** on every Postgres table — riders only see their own rides, drivers only manage their own rows, chat is private to the two parties on the ride
- **XSS-safe** map popups — all user content uses `setText` not `setHTML`
- Zero server-only packages shipped to the browser (no `express`, `socket.io`, etc.)
- **0 npm vulnerabilities** (down from 25 in the initial MVP)
- Only anon/public keys in client env vars; secrets stay server-side in Edge Function environment

### Performance
| Metric | Result |
|---|---|
| Initial JS (landing + login) | ~146 KB gzip |
| Mapbox GL | Deferred — only loads when a map is opened |
| Code splitting | Per-route `React.lazy` + `Suspense` |
| Vendor chunks | `mapbox`, `supabase`, `react-vendor` isolated |
| npm packages | 184 (down from 379) |

### Database Design
- **4 sequential migrations** applied via Supabase CLI — fully reproducible schema from scratch
- DB triggers handle: user profile creation on signup (phone → 10-digit mobile extraction), fare computation, OTP generation — keeping business logic server-authoritative
- Optimised indexes on `rides(status)`, `active_drivers(is_online, on_ride)`, `chat_messages(ride_id, created_at)`

### Design System
- **Tokenised CSS** (`index.css`) — brand + semantic color scales, type scale, elevation levels (`shadow-soft/elevated/floating/brand`), motion tokens (`--ease-out-quart`, `--animate-fade-in/up/scale-in`)
- Full **light/dark mode** via `data-theme` attribute — no flash on load, persistent, respects `prefers-color-scheme`
- Full **`prefers-reduced-motion`** support throughout
- Reusable `ui/` primitive kit: `Button`, `Card`, `Field`, `Badge`, `Spinner`, `Skeleton`, `OtpInput`, `Alert`, `Avatar`, `EmptyState`

### Accessibility (toward WCAG AA)
- Semantic landmarks, real `<button>` controls, ARIA `tablist` with keyboard navigation
- Visible `:focus-visible` rings on all interactive elements
- `role="alert"` / `role="status"` live regions for async state changes
- Inline `Alert` components replace blocking `window.alert()` / `window.confirm()`
- Content-shaped **Skeleton** loaders replace bare "Loading…" text
- `ErrorBoundary` prevents a single thrown error from white-screening the app

### PWA
- Web App Manifest (`manifest.webmanifest`) with icon set (192px, 512px, maskable)
- Service Worker for offline shell and Web Push delivery
- Installable on Android/iOS — no app store required

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **UI** | React 19, Vite 6, Tailwind CSS v4 |
| **Routing** | React Router DOM v7 |
| **Backend / DB** | Supabase (Postgres, Phone OTP Auth, RLS, Realtime, Edge Functions) |
| **Maps** | Mapbox GL JS, Google Maps (Geocoding, Places, Routes APIs) |
| **Push** | Web Push API + VAPID + Deno Edge Function |
| **State** | React local state + Supabase Realtime (no external store) |
| **Icons** | Lucide React |
| **Notifications** | Sonner (toasts) |

---

## 📊 Before vs After (Production Transformation)

| Metric | MVP | Production |
|---|---|---|
| JS bundle (landing) | 598 KB gzip (2.1 MB raw) | **146 KB gzip** |
| npm vulnerabilities | **25** | **0** |
| Code splitting | None (single chunk) | Per-route lazy + vendor chunks |
| Dark mode | None | Full, tokenised, no-flash |
| Mobile map picking | Broken (`hidden sm:block`) | Full-screen overlay, works on phone |
| Error handling | White screen on throw | `ErrorBoundary` + inline alerts |
| Loading states | Bare "Loading…" text | Content-shaped skeletons |
| Map popup XSS | Unescaped `setHTML` | Safe `setText` |
| Distance filter bug | Object passed as latitude | Fixed — correct Haversine |
| 404 route | None (rendered nothing) | Branded `NotFound` page |

---

<div align="center">
  <sub>Built for Indian city commuters · Primary market: Hyderabad · React 19 + Supabase + Mapbox</sub>
</div>
