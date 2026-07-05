# Auth setup (phone OTP)

## The situation

- `signInWithOtp` (send) returns **HTTP 200** — sending works.
- The console **403 is `otp_expired`** ("Token has expired or is invalid") on
  `verifyOtp` — that's a **wrong/expired code**, not a Twilio or network error.
  The login code in `Login.jsx` is correct (`+91` + 10 digits, `type: "sms"`).

## Why real SMS fails (India)

Twilio **cannot deliver SMS to Indian +91 numbers without DLT registration**
(an Indian TRAI requirement: registered entity + template + header). Without it
the message is rejected/never delivered, so no code ever arrives and every entry
fails. This is a Twilio/India problem, not the app.

## Dev fix — Supabase Test OTP (30 seconds)

Dashboard → **Authentication → Sign In / Providers → Phone → Test OTP**.

Enter one mapping per line, in **exact E.164** (must match what the app sends:
`+91` + the 10 digits) with a **future** "valid until" date:

```
+919515659818=123456
+919000000001=654321      # a second number for testing the driver side
```

Save, then log in with that phone + code. `verifyOtp` succeeds → the
`auth.users` row is created → the `handle_new_user` trigger fills `public.users`.

> The codes you'd tried (123456/111111/000000/654321) didn't match — so the
> saved value differed, the phone format didn't match `+91XXXXXXXXXX`, or the
> "valid until" date had passed.

### Verify from the CLI (optional)
```bash
SUPA=https://mavmgnvcfsvqajikcttf.supabase.co
ANON=<your anon key>
curl -s -X POST "$SUPA/auth/v1/otp"    -H "apikey: $ANON" -H "Content-Type: application/json" -d '{"phone":"+919515659818","create_user":true}'
curl -s -X POST "$SUPA/auth/v1/verify" -H "apikey: $ANON" -H "Content-Type: application/json" -d '{"phone":"+919515659818","token":"123456","type":"sms"}'
```
The second call returns a session (`access_token`) when Test OTP is set right.

## Production

Use DLT registration with Twilio, or an India-first SMS provider
(MSG91, Kaleyra, Gupshup), configured under the same Phone provider settings.
