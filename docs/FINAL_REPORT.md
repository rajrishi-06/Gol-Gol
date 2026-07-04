# Gol·Gol — Production Transformation: Final Report

This documents the transformation of Gol·Gol from a functional MVP into a
production-grade, polished, modern web app. See
`ARCHITECTURE_AND_AUDIT.md` for the Phase 1–2 baseline.

## Headline results

| Metric | Before | After |
| --- | --- | --- |
| Initial JS (landing) | **~598 KB gzip** (one 2.1 MB bundle) | **~146 KB gzip** shell; Mapbox (510 KB gzip) deferred |
| Code splitting | None (single chunk) | Per-route `React.lazy` + isolated `mapbox`/`supabase`/`react` vendor chunks |
| npm dependencies | 379 packages | **184 packages** |
| npm vulnerabilities | **25** (1 low, 11 mod, 13 high) | **0** |
| Dark mode | None | Full, tokenised, no-flash |
| Icon libraries | 2 (`react-icons` + `lucide-react`) | 1 (`lucide-react`) |
| Lighthouse SEO/Best-practices (est.) | Low (no meta, mixed content, blocking CSS) | High (full meta/OG/JSON-LD, no blocking CSS) |

## UI improvements
- **Design system** (`index.css`): tokenised brand + semantic colour scales,
  type scale, elevation (`shadow-soft/elevated/floating/brand`), radii, motion
  and glassmorphism — driving every surface for one coherent look in light/dark.
- **Self-hosted variable font** (Inter) with sensible OpenType features.
- **Brand identity**: a self-contained SVG logo mark + favicon + a rendered
  1200×630 OG image, replacing the external globe asset and generic wordmark.
- **Brand aside** replaces the blank hot-linked Unsplash promo (and copied
  `#Ola…` hashtags) with an animated, theme-independent route illustration,
  value props and trust stats.
- Rebuilt hero/booking, ride cards (vehicle "sticker" tiles legible in both
  themes), segmented tabs, connected From→To route rail, premium map picker,
  multi-step auth, dashboard, driver flows, footer, loaders and empty states.

## UX improvements
- **Mobile map picking now works** — the picker is a full-screen overlay
  instead of `hidden sm:block` (it was impossible to set a location on a phone).
- Location rows are real, keyboard-operable buttons on a route rail.
- Multi-step login with a segmented OTP input (paste/backspace/arrow aware),
  inline validation, a resend cooldown, and progress indicator.
- Feedback moved from blocking `alert()`/`confirm()` to inline `Alert`s, live
  regions and considered empty/error states.
- Content-shaped skeletons and a branded route-level loader replace bare
  "Loading…" text; an `ErrorBoundary` replaces the white-screen-on-error.
- A real, branded 404 route (previously the router rendered nothing).

## Performance improvements
- Route-level `React.lazy` + `Suspense`; **Mapbox GL loads only when a map is
  actually opened** (landing/login never pay its 1.8 MB cost).
- REST geocoding helpers split from the Mapbox GL library so map-less views
  don't import it; manual vendor chunks (`mapbox`, `supabase`, `react-vendor`).
- Self-hosted font (no render-blocking Google Fonts); removed the globally
  render-blocking Mapbox Directions CSS that was never used.
- `preconnect`/`dns-prefetch` to the Mapbox API; lazy, dimensioned images;
  `text-wrap: balance/pretty`; `scrollbar-gutter: stable` to avoid layout shift.

## Accessibility improvements (toward WCAG AA)
- Semantic landmarks, real `<button>`/`<label>` controls, an ARIA `tablist`,
  and an accessible drawer (focus trap, `Esc`, scroll-lock, focus restore).
- Visible `:focus-visible` rings everywhere; associated labels/hints/errors via
  `aria-describedby`; `role="alert"`/`status` live regions.
- Full `prefers-reduced-motion` handling; `aria-checked` theme switch;
  larger touch targets; theme tokens chosen for readable contrast.

## SEO improvements
- Descriptive `<title>` + meta description, canonical, `theme-color`,
  `color-scheme`, Open Graph + Twitter cards with a real 1200×630 image, and
  `WebApplication` JSON-LD structured data.
- Semantic headings/landmarks, meaningful `alt`, and a `<noscript>` fallback.

## Security improvements
- **XSS fixed**: map popups now use `setText` instead of `setHTML` with
  unescaped rider/driver names.
- Removed server-only packages (`express`, `socket.io`, `cors`, …) from the
  client, cutting dependency-supply-chain risk to **0 vulnerabilities**.
- `.env.example` documents that only publishable/anon keys belong in `VITE_*`;
  `external` links use `rel="noopener noreferrer"`.

## Code-quality improvements
- Eliminated duplication: one Haversine (`lib/geo`) instead of six; shared
  `lib/{supabase,geocoding,mapbox,vehicles,format,theme,cn}`; a single vehicle
  catalogue; a reusable `ui/` primitive kit; a shared `Chatbox`.
- Removed dead code (`matchpath`, empty `App.css`, starter SVGs, committed
  `.DS_Store`) and debug `console.log`s; fixed misleading `src/server/` naming.
- Fixed real bugs: driver-dashboard distance (object passed as latitude),
  a Dashboard rating crash, and a conditional-hooks violation in
  `ProtectedDriverRoute`. Lint passes clean; production build is green.

## Verified
Build + lint green. Cross-viewport (desktop/tablet/mobile) and light/dark
screenshots captured via headless Chromium for landing, login, the nav drawer,
the map-picker overlay, driver onboarding and the 404 — no runtime page errors.

## Remaining / future enhancements
- **Server-authoritative ride OTP** (currently generated client-side) and
  move fare calculation server-side.
- **SSR/prerender** (e.g. migrate to a metaframework) for even faster first
  paint and richer crawlability.
- Automated **axe-core a11y** + **Lighthouse CI** and unit tests for `lib/`
  (the pure helpers are now trivially testable).
- **PWA**: manifest + offline shell + installability.
- **i18n** and an in-app toast system to fully retire the last `window.confirm`.
- Tighten Supabase **Row Level Security** review and add a Content-Security-Policy
  at the hosting layer.
