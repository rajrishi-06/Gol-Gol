/**
 * Mapbox REST helpers (geocoding + directions). Deliberately free of the
 * `mapbox-gl` library import so components that only need an address or ETA
 * (e.g. the landing ride list) don't pull the 1.8 MB GL bundle.
 */
export const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_GL_API;

const geocodeBase = "https://api.mapbox.com/geocoding/v5/mapbox.places";
const directionsBase = "https://api.mapbox.com/directions/v5/mapbox/driving";

/** Reverse-geocode `[lng, lat]` into a human-readable place name. */
export async function reverseGeocode(lng, lat, { types } = {}) {
  const params = new URLSearchParams({ access_token: MAPBOX_TOKEN, limit: "1" });
  if (types) params.set("types", types);
  const res = await fetch(`${geocodeBase}/${lng},${lat}.json?${params}`);
  if (!res.ok) throw new Error("Reverse geocoding failed");
  const data = await res.json();
  return data.features?.[0]?.place_name ?? null;
}

/**
 * Forward-geocode a query with strong locality bias. `proximity` (the current
 * map centre) is the key relevance lever — without it Mapbox returns globally
 * ranked, often-wrong matches. Also enables autocomplete and biases to India.
 */
export async function forwardGeocode(
  query,
  { proximity, bbox, limit = 7, country = "in", language = "en" } = {}
) {
  const params = new URLSearchParams({
    access_token: MAPBOX_TOKEN,
    limit: String(limit),
    autocomplete: "true",
    fuzzyMatch: "true",
    language,
    // Prefer specific, human places over broad regions.
    types: "poi,address,place,locality,neighborhood,postcode",
  });
  if (country) params.set("country", country);
  if (proximity) params.set("proximity", `${proximity.lng},${proximity.lat}`);
  if (bbox) params.set("bbox", bbox.join(","));
  const res = await fetch(`${geocodeBase}/${encodeURIComponent(query)}.json?${params}`);
  if (!res.ok) throw new Error("Geocoding failed");
  const data = await res.json();
  return data.features ?? [];
}

/** Fetch a driving route between `[lng,lat]` points with optional steps. */
export async function fetchRoute(coords, { steps = false, overview = "full" } = {}) {
  const path = coords.map((c) => `${c[0]},${c[1]}`).join(";");
  const params = new URLSearchParams({
    access_token: MAPBOX_TOKEN,
    geometries: "geojson",
    overview,
    steps: String(steps),
  });
  const res = await fetch(`${directionsBase}/${path}?${params}`);
  if (!res.ok) throw new Error("Directions request failed");
  const data = await res.json();
  return data.routes?.[0] ?? null;
}

/** Human "N min" ETA between two `[lng,lat]` points, or `null` on failure. */
export async function fetchEtaMinutes(from, to) {
  try {
    const route = await fetchRoute([from, to], { overview: "false" });
    return route ? Math.ceil(route.duration / 60) : null;
  } catch {
    return null;
  }
}
