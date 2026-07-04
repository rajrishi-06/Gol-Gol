# Gol·Gol

A modern, two-sided ride platform — book an instant cab, share a commute to
split fares, or drive to earn. Built with React 19, Vite, Tailwind CSS v4,
Supabase (auth + realtime) and Mapbox GL.

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in your keys
npm run dev
```

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview the production build |
| `npm run lint` | Run ESLint |

## Environment

All config is via `VITE_*` variables (see `.env.example`). These are embedded in
the client bundle, so only ever use publishable/anon keys:

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY` — Supabase project (protected by RLS)
- `VITE_MAPBOX_GL_API` — Mapbox public token (restrict by URL in the dashboard)

## Architecture

```
src/
  lib/          Framework-agnostic helpers (supabase, geo, geocoding,
                mapbox, vehicles, format, theme, cn) — single source of truth
  components/
    ui/         Reusable, accessible design-system primitives
                (Button, Field, Card, Badge, Avatar, Skeleton, OtpInput, …)
    …           Feature components (rider + driver flows)
  index.css     Design tokens (light/dark), base styles, motion
  App.jsx       Routes with lazy-loaded pages + code splitting
```

**Design system.** Colours, typography, spacing, elevation and motion are
tokenised in `index.css` via Tailwind v4 `@theme`, with semantic light/dark
tokens. A pre-paint script applies the saved/OS theme to avoid a flash.

**Performance.** Route-level `React.lazy`, a dedicated `mapbox` vendor chunk
loaded only when a map renders, a self-hosted variable font, and REST geocoding
helpers kept separate from the Mapbox GL library.

See `../docs/ARCHITECTURE_AND_AUDIT.md` and `../docs/FINAL_REPORT.md`.
