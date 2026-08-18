import { supabase } from "./supabase";

/** Emergency contacts, SOS and shareable live-trip links. */

// ── emergency contacts ──────────────────────────────────────────────────────

export async function listEmergencyContacts(userId) {
  if (!userId) return { data: [], error: null };
  const { data, error } = await supabase
    .from("emergency_contacts")
    .select("*")
    .eq("user_id", userId)
    .order("created_at");
  return { data: data ?? [], error };
}

export const addEmergencyContact = ({ userId, name, mobile, relation, notifyOnRide = false }) =>
  supabase
    .from("emergency_contacts")
    .insert({ user_id: userId, name, mobile, relation, notify_on_ride: notifyOnRide })
    .select()
    .maybeSingle();

export const updateEmergencyContact = (id, patch) =>
  supabase.from("emergency_contacts").update(patch).eq("id", id).select().maybeSingle();

export const deleteEmergencyContact = (id) =>
  supabase.from("emergency_contacts").delete().eq("id", id);

// ── SOS ─────────────────────────────────────────────────────────────────────

/**
 * Raise an alert. Records it server-side (with the caller's position) and
 * notifies the other person on the ride so the situation is visible in-app.
 */
export async function raiseSos({ rideId = null, lat = null, lng = null, note = null } = {}) {
  const { data, error } = await supabase.rpc("raise_sos", {
    p_ride_id: rideId,
    p_lat: lat,
    p_lng: lng,
    p_note: note,
  });
  return { data, error };
}

/** India-wide emergency numbers, surfaced in the safety panel. */
export const EMERGENCY_NUMBERS = [
  { label: "Police", number: "100" },
  { label: "Ambulance", number: "108" },
  { label: "Women's helpline", number: "1091" },
  { label: "National emergency", number: "112" },
];

// ── trip sharing ────────────────────────────────────────────────────────────

export async function createTripShare(rideId) {
  const { data, error } = await supabase.rpc("create_trip_share", { p_ride_id: rideId });
  if (error || !data) return { url: null, token: null, error };
  return { token: data, url: `${window.location.origin}/t/${data}`, error: null };
}

export const revokeTripShare = (rideId) => supabase.rpc("revoke_trip_share", { p_ride_id: rideId });

export async function fetchSharedTrip(token) {
  const { data, error } = await supabase.rpc("get_shared_trip", { p_token: token });
  return { trip: Array.isArray(data) ? data[0] ?? null : data ?? null, error };
}

/**
 * Hand the link to the OS share sheet when available, else the clipboard.
 * Returns how it was shared so the caller can show the right confirmation.
 */
export async function shareTripLink(url, text = "Follow my Gol·Gol ride live") {
  if (navigator.share) {
    try {
      await navigator.share({ title: "My Gol·Gol ride", text, url });
      return "shared";
    } catch (err) {
      if (err?.name === "AbortError") return "cancelled";
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}
