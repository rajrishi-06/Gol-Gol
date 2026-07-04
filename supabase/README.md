# Supabase setup

The app talks to Supabase for phone-OTP auth, Postgres and realtime. After
migrating to a new project you only need to (1) apply the schema and (2) point
the app at the project.

## 1. Apply the schema

**Option A — SQL Editor (fastest).** Open your project → SQL Editor → paste the
contents of `migrations/0001_initial_schema.sql` → Run. It's idempotent, so it's
safe to re-run.

**Option B — Supabase CLI.**

```bash
supabase link --project-ref iucykbklhaaekwvmlvyr
supabase db push
```

This creates every table, index, RLS policy, realtime channel and the
`auth.users → public.users` trigger the app expects.

## 2. Point the app at the project

Set these in `frontend/.env.local` (local) and in your host's env (deploy):

```
VITE_SUPABASE_URL=https://iucykbklhaaekwvmlvyr.supabase.co
VITE_SUPABASE_KEY=<your anon / publishable key>
```

## 3. Enable phone auth

Authentication → Providers → **Phone**: enable it and configure an SMS provider
(Twilio/MessageBird/etc.), since login sends a 6-digit OTP over SMS.

## 4. Approve a driver

Drivers self-register (Drive with Gol·Gol) with `verification_status = 'pending'`.
To let a driver go online, approve them:

```sql
update public.drivers set verification_status = 'approved' where user_id = '<uuid>';
```

## MCP access (optional, for AI tooling)

`.mcp.json` already registers the Supabase MCP server. To use it, authenticate
in a normal terminal (not the IDE extension):

```bash
claude /mcp   # select "supabase" → Authenticate
```

Once authenticated, tools can read the schema and run migrations directly.
