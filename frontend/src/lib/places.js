import { supabase } from "./supabase";

/** Saved places (Home / Work / custom) — the "two taps to book" shortcut. */

export async function listSavedPlaces(userId) {
  if (!userId) return { data: [], error: null };
  const { data, error } = await supabase
    .from("saved_places")
    .select("*")
    .eq("user_id", userId)
    .order("kind", { ascending: true })
    .order("created_at", { ascending: true });
  return { data: data ?? [], error };
}

export async function upsertSavedPlace({ id, userId, kind = "custom", label, address, lat, lng }) {
  const row = {
    user_id: userId,
    kind,
    label: label || (kind === "home" ? "Home" : kind === "work" ? "Work" : "Saved place"),
    address,
    lat,
    lng,
  };
  if (id) {
    return supabase.from("saved_places").update(row).eq("id", id).select().maybeSingle();
  }

  // Home and Work are one-per-user (enforced by a unique index on the generated
  // `slot` column). Look the existing row up and update it rather than relying
  // on ON CONFLICT inference over a generated column.
  if (kind === "home" || kind === "work") {
    const { data: existing } = await supabase
      .from("saved_places")
      .select("id")
      .eq("user_id", userId)
      .eq("kind", kind)
      .maybeSingle();
    if (existing) {
      return supabase.from("saved_places").update(row).eq("id", existing.id).select().maybeSingle();
    }
  }
  return supabase.from("saved_places").insert(row).select().maybeSingle();
}

export const deleteSavedPlace = (id) => supabase.from("saved_places").delete().eq("id", id);

/** Recent distinct destinations, so the home screen can offer one-tap re-book. */
export async function recentDestinations(userId, limit = 5) {
  if (!userId) return [];
  const { data } = await supabase
    .from("rides")
    .select("to_address, to_lat, to_lng, created_at")
    .eq("rider_id", userId)
    .not("to_address", "is", null)
    .order("created_at", { ascending: false })
    .limit(30);

  const seen = new Set();
  const out = [];
  for (const r of data ?? []) {
    const key = r.to_address?.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ address: r.to_address, lat: r.to_lat, lng: r.to_lng });
    if (out.length >= limit) break;
  }
  return out;
}
