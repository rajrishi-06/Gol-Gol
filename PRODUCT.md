# Gol·Gol — PRODUCT.md

## Register
**product** — app UI. Design serves the task (booking a ride, driving, tracking). Not a marketing site.

## Product
A two-sided city ride-hailing + ride-sharing web app (PWA). Riders book an instant cab/bike/auto, share a commute to split fares, or track a driver live; drivers go online, accept nearby requests, and navigate turn-by-turn. React 19 + Vite + Tailwind v4, Supabase (auth/DB/realtime), Google Maps.

## Users
- **Riders** — commuters in Indian cities (primary market: Hyderabad), mostly on phones, often one-handed, sometimes on poor networks. Want to book fast and see the driver coming.
- **Drivers** — on a phone mounted while driving; glanceable, high-contrast, minimal taps.

## Purpose
Get from "where to?" to a confirmed, tracked ride in as few taps as possible, with upfront pricing and trust (verified drivers, live location, OTP start).

## Brand personality
Calm, trustworthy, quietly premium — "every ride, a little smoother." Confident single green accent, generous whitespace, soft depth. Not loud, not gamified, not startup-neon.

## Anti-references
- Ola/Uber clutter: stacked promos, surge-y urgency, dense option walls.
- SaaS-cream landing aesthetics, hero-metric templates, tracked uppercase eyebrows on every block.
- Bounce/elastic motion, gratuitous glassmorphism, gradient text.

## Strategic design principles
1. **Map-first, one primary action per screen.** Reduce cognitive load (the Ola-redesign lesson).
2. **Glanceable for drivers** — large targets, high contrast, legible while moving.
3. **Trust signals are quiet and constant** (encrypted, verified, live ETA) — never shouty.
4. **Motion is functional** — it shows state change (driver approaching, sheet snapping, request arriving), never decoration. Smooth exponential ease-out, reduced-motion aware.
5. **One green accent** on restrained tinted neutrals; light + dark parity.

## Existing design system
Tokenized in `frontend/src/index.css`: brand + semantic color scales (light/dark via `data-theme`), type scale, elevation (`shadow-soft/elevated/floating/brand`), radii, `--ease-out-quart`, `--animate-fade-in/up/scale-in/slide-in-right`. Reusable `ui/` primitives (Button, Card, Field, Badge, …). Sonner (toasts) + Vaul (bottom sheets) in use.
