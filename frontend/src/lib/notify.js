import { supabase } from "./supabase";

/**
 * Notify a user. Writes an in-app notification row (RLS lets ride
 * counterparties insert, so realtime delivers it to their open tabs) and fires
 * a background Web Push via the `send-push` Edge Function. The push is best
 * effort — if the function isn't deployed yet, the in-app notification still
 * lands, so callers never need to await or handle push failures.
 */
export async function notifyUser({ userId, title, body, url, type = "info", data = {} }) {
  if (!userId || !title) return;

  const { error } = await supabase
    .from("notifications")
    .insert({ user_id: userId, title, body, url, type, data });
  if (error) console.warn("notifyUser insert failed:", error.message);

  supabase.functions
    .invoke("send-push", { body: { user_id: userId, title, body, url, type, data } })
    .catch(() => {
      /* push is additive; in-app already delivered */
    });
}

/** Mark a single notification read. */
export async function markNotificationRead(id) {
  await supabase.from("notifications").update({ read: true }).eq("id", id);
}

/** Mark all of the current user's notifications read. */
export async function markAllNotificationsRead(userId) {
  await supabase.from("notifications").update({ read: true }).eq("user_id", userId).eq("read", false);
}
