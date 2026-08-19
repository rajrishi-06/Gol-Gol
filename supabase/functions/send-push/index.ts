// Supabase Edge Function: send-push
// Sends a Web Push to every device a user has subscribed. In-app notification
// rows are written client-side (RLS lets ride counterparties insert); this
// function only handles the encrypted push delivery, which needs the service
// role to read another user's subscriptions.
//
// Deploy:  supabase functions deploy send-push
// Secrets: supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... \
//            VAPID_SUBJECT=mailto:you@example.com
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@gol-gol.app";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const { user_id, title, body, url, type, data } = await req.json();
    if (!user_id || !title) return json({ error: "user_id and title are required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Respect the recipient's notification preferences. Only the service role
    // can read another user's settings, which is why this check lives here
    // rather than on the sending client. Safety alerts are never suppressed.
    if (type && type !== "sos") {
      const { data: settings } = await admin
        .from("user_settings")
        .select("notify_ride, notify_chat, notify_promos")
        .eq("user_id", user_id)
        .maybeSingle();
      if (settings) {
        const allowed =
          type === "chat"
            ? settings.notify_chat
            : type === "promo"
            ? settings.notify_promos
            : settings.notify_ride;
        if (allowed === false) return json({ ok: true, sent: 0, skipped: "muted" });
      }
    }

    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", user_id);

    const payload = JSON.stringify({
      title,
      body: body ?? "",
      tag: type ?? undefined,
      data: { url: url ?? "/", ...(data ?? {}) },
    });

    let sent = 0;
    const stale: string[] = [];
    await Promise.all(
      (subs ?? []).map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload
          );
          sent++;
        } catch (err) {
          const code = (err as { statusCode?: number })?.statusCode;
          if (code === 404 || code === 410) stale.push(s.endpoint); // expired
        }
      })
    );

    if (stale.length) await admin.from("push_subscriptions").delete().in("endpoint", stale);
    return json({ ok: true, sent, pruned: stale.length });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
