/**
 * Google Maps Platform REST helpers (geocoding + places + routes).
 *
 * Deliberately free of the Google Maps JS SDK so components that only need an
 * address or an ETA (e.g. the landing ride list) don't pull the map library.
 * Every endpoint here is verified to support browser CORS with a referrer-
 * restricted key:
 *   - Geocoding API           → reverse geocoding (address from lat/lng)
 *   - Places API (New)        → autocomplete suggestions + place details
 *   - Routes API              → driving route geometry, distance, duration, steps
 *
 * Return shapes are normalised to match what the app already consumed from the
 * previous Mapbox helpers, so callers changed as little as possible.
 */
export const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const PLACES_URL = "https://places.googleapis.com/v1";
const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";

/** Reverse-geocode `[lng, lat]` into a human-readable place name. */
export async function reverseGeocode(lng, lat, { language = "en", region = "in" } = {}) {
  const params = new URLSearchParams({
    latlng: `${lat},${lng}`,
    key: GOOGLE_MAPS_KEY,
    language,
    region,
  });
  const res = await fetch(`${GEOCODE_URL}?${params}`);
  if (!res.ok) throw new Error("Reverse geocoding failed");
  const data = await res.json();
  return data.results?.[0]?.formatted_address ?? null;
}

/**
 * Forward autocomplete with strong locality bias. Returns normalised
 * suggestions. Google's Autocomplete does not return coordinates, so each
 * suggestion carries `center: null` — call {@link resolvePlace} on selection to
 * get the coordinate (one billed Place Details request per confirmed pick,
 * instead of one per keystroke).
 */
export async function forwardGeocode(
  query,
  { proximity, limit = 7, country = "in", language = "en" } = {}
) {
  const body = { input: query, languageCode: language };
  if (country) body.includedRegionCodes = [country];
  if (proximity) {
    body.locationBias = {
      circle: {
        center: { latitude: proximity.lat, longitude: proximity.lng },
        radius: 30000,
      },
    };
  }
  const res = await fetch(`${PLACES_URL}/places:autocomplete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": GOOGLE_MAPS_KEY },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Geocoding failed");
  const data = await res.json();
  return (data.suggestions ?? [])
    .filter((s) => s.placePrediction)
    .slice(0, limit)
    .map((s) => {
      const p = s.placePrediction;
      return {
        id: p.placeId,
        text: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "",
        secondary: p.structuredFormat?.secondaryText?.text ?? "",
        place_name: p.text?.text ?? "",
        center: null, // resolved lazily via resolvePlace(id)
      };
    });
}

/** Resolve a Places `placeId` into `{ center: [lng, lat], place_name }`. */
export async function resolvePlace(placeId) {
  const res = await fetch(`${PLACES_URL}/places/${placeId}`, {
    headers: {
      "X-Goog-Api-Key": GOOGLE_MAPS_KEY,
      "X-Goog-FieldMask": "location,formattedAddress,displayName",
    },
  });
  if (!res.ok) throw new Error("Place details failed");
  const data = await res.json();
  if (!data.location) return null;
  return {
    center: [data.location.longitude, data.location.latitude],
    place_name: data.formattedAddress ?? data.displayName?.text ?? "",
  };
}

// Coarse maneuver buckets, so turn-by-turn proximity thresholds keep working.
function maneuverType(maneuver = "") {
  const m = maneuver.toUpperCase();
  if (m.includes("ROUNDABOUT") || m.includes("ROTARY")) return "roundabout";
  if (m.includes("RAMP") && m.includes("ON")) return "on ramp";
  if (m.includes("RAMP")) return "off ramp";
  if (m.includes("MERGE")) return "merge";
  if (m.includes("FORK")) return "fork";
  if (m.includes("TURN") || m.includes("LEFT") || m.includes("RIGHT")) return "turn";
  return "straight";
}

// Routes API durations come back like "2170s".
function parseDuration(d) {
  if (typeof d === "number") return d;
  return parseInt(String(d ?? "0").replace(/[^\d]/g, ""), 10) || 0;
}

function toWaypoint([lng, lat]) {
  return { location: { latLng: { latitude: lat, longitude: lng } } };
}

/**
 * Fetch a driving route between `[lng,lat]` points. Normalised to the previous
 * Mapbox shape: `{ geometry (GeoJSON LineString), distance (m), duration (s),
 * legs: [{ steps: [{ maneuver: { instruction, location:[lng,lat], type } }] }] }`.
 */
export async function fetchRoute(coords, { steps = false, geometry = true } = {}) {
  if (!coords || coords.length < 2) return null;
  const origin = toWaypoint(coords[0]);
  const destination = toWaypoint(coords[coords.length - 1]);
  const intermediates = coords.slice(1, -1).map(toWaypoint);

  const fields = ["routes.duration", "routes.distanceMeters"];
  if (geometry) fields.push("routes.polyline.geoJsonLinestring");
  if (steps) {
    fields.push("routes.legs.steps.navigationInstruction", "routes.legs.steps.startLocation");
  }

  const res = await fetch(ROUTES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_MAPS_KEY,
      "X-Goog-FieldMask": fields.join(","),
    },
    body: JSON.stringify({
      origin,
      destination,
      ...(intermediates.length ? { intermediates } : {}),
      travelMode: "DRIVE",
      polylineEncoding: "GEO_JSON_LINESTRING",
      languageCode: "en-US",
      regionCode: "IN",
    }),
  });
  if (!res.ok) throw new Error("Directions request failed");
  const data = await res.json();
  const route = data.routes?.[0];
  if (!route) return null;

  return {
    geometry: route.polyline?.geoJsonLinestring ?? null,
    distance: route.distanceMeters ?? 0,
    duration: parseDuration(route.duration),
    legs: (route.legs ?? []).map((leg) => ({
      steps: (leg.steps ?? []).map((s) => ({
        maneuver: {
          instruction: s.navigationInstruction?.instructions ?? "",
          location: s.startLocation?.latLng
            ? [s.startLocation.latLng.longitude, s.startLocation.latLng.latitude]
            : null,
          type: maneuverType(s.navigationInstruction?.maneuver),
        },
      })),
    })),
  };
}

/** Human "N min" ETA between two `[lng,lat]` points, or `null` on failure. */
export async function fetchEtaMinutes(from, to) {
  try {
    const route = await fetchRoute([from, to], { geometry: false });
    return route ? Math.ceil(route.duration / 60) : null;
  } catch {
    return null;
  }
}
