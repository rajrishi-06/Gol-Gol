/**
 * Google Maps JS SDK loader + shared helpers.
 *
 * Kept in one place so every map in the app looks and behaves consistently.
 * The SDK is loaded lazily (only when a component actually renders a map), so
 * map-less routes never pay its cost. Geocoding / places / routes live in
 * `lib/geocoding.js` as REST calls and never touch this module.
 */
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";

setOptions({
  key: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
  v: "weekly",
  language: "en",
  region: "IN",
});

let libsPromise = null;

/** Load the Maps + Marker libraries once; resolves to the `google.maps` namespace. */
export async function loadGoogleMaps() {
  if (!libsPromise) {
    libsPromise = Promise.all([importLibrary("maps"), importLibrary("marker")]).then(
      () => window.google.maps
    );
  }
  return libsPromise;
}

// Road-first styling: emphasise roads and water, mute the landscape, and hide
// POI/transit clutter — the pattern ride-hailing maps use so pickups read
// clearly (per the Ola redesign study). Two variants track the app's theme.
const LIGHT_STYLE = [
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#e6f4ea" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#f6f7f9" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#f0f1f4" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#ffe6a7" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#6b7280" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#bfe0f5" }] },
];

const DARK_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#1b1f24" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#9aa2ad" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#14171b" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#1e2a22" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#20252b" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2c333b" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3a4048" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#14202b" }] },
];

/** Pick the map style for the current theme (`data-theme="dark"` on <html>). */
export function mapStyle() {
  const dark =
    typeof document !== "undefined" &&
    document.documentElement.getAttribute("data-theme") === "dark";
  return dark ? DARK_STYLE : LIGHT_STYLE;
}

/**
 * Create a themed map. Accepts a `{ lat, lng }` centre. `restriction` (from
 * `computeBounds`) keeps panning within a sane box, mirroring the old
 * `maxBounds`. No `mapId` is set, so the JSON `styles` above apply.
 */
export function createMap(
  container,
  {
    center,
    zoom = 13,
    restriction,
    strictBounds = false,
    minZoom,
    maxZoom,
    gestureHandling = "greedy",
    zoomControl = true,
  } = {}
) {
  const g = window.google.maps;
  return new g.Map(container, {
    center,
    zoom,
    styles: mapStyle(),
    disableDefaultUI: true,
    zoomControl,
    gestureHandling,
    clickableIcons: false,
    keyboardShortcuts: false,
    ...(minZoom != null ? { minZoom } : {}),
    ...(maxZoom != null ? { maxZoom } : {}),
    ...(restriction ? { restriction: { latLngBounds: restriction, strictBounds } } : {}),
  });
}

/**
 * Zoom around the map centre (where a fixed centre-pin sits) instead of around
 * the cursor. Google zooms toward the pointer by default; we disable that and
 * drive `setZoom`, which preserves the centre. Returns a cleanup function.
 */
export function attachCenterZoom(map, element, { minZoom = 3, maxZoom = 20, step = 1 } = {}) {
  map.setOptions({ scrollwheel: false });
  let last = 0;
  const onWheel = (e) => {
    e.preventDefault();
    const now = Date.now();
    if (now - last < 60) return; // throttle runaway trackpad deltas
    last = now;
    const dir = e.deltaY < 0 ? step : -step;
    const next = Math.min(maxZoom, Math.max(minZoom, (map.getZoom() ?? 15) + dir));
    map.setZoom(next); // keeps the centre fixed → zoom happens around the pin
  };
  element.addEventListener("wheel", onWheel, { passive: false });
  return () => element.removeEventListener("wheel", onWheel);
}

/** Minimum zoom so the viewport never shows more than ~`radiusKm` around centre. */
export function minZoomForRadius(lat, radiusKm = 100, viewportPx = 1024) {
  const metersPerPixel = (radiusKm * 2 * 1000) / viewportPx;
  const z = Math.log2((156543.03392 * Math.cos((lat * Math.PI) / 180)) / metersPerPixel);
  return Math.max(3, Math.floor(z));
}

/**
 * Marker backed by an image (vehicle icon, pin, etc.). Uses the classic
 * `Marker` with a `title` tooltip rather than an InfoWindow with HTML, so
 * user-supplied names can never inject markup (closes the old XSS hole).
 */
export function createImageMarker({ iconPath, position, map, size = 40, title }) {
  const g = window.google.maps;
  return new g.Marker({
    position,
    map,
    title: title || undefined,
    icon: {
      url: iconPath,
      scaledSize: new g.Size(size, size),
      anchor: new g.Point(size / 2, size),
    },
  });
}

/** Marker for a driver's vehicle, resolved from its `vehicleType`. */
export function createVehicleMarker({ vehicleType, position, map, title }) {
  return createImageMarker({
    iconPath: `/icons/${vehicleType}.svg`,
    position,
    map,
    size: 42,
    title,
  });
}

/** Convert a GeoJSON `[lng,lat]` coordinate list into Google `{lat,lng}` path points. */
export function toPath(coordinates = []) {
  return coordinates.map(([lng, lat]) => ({ lat, lng }));
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Draw a route polyline from GeoJSON coordinates. With `animate: true` the line
 * draws itself in (~600ms, ease-out-quint) — a functional cue that the route was
 * just computed. Falls back to an instant path under reduced-motion.
 */
export function drawRoutePolyline(map, coordinates, { color = "#0f9b7f", width = 6, opacity = 0.9, animate = false } = {}) {
  const g = window.google.maps;
  const full = toPath(coordinates);
  const shouldAnimate = animate && full.length > 2 && !prefersReducedMotion();
  const line = new g.Polyline({
    path: shouldAnimate ? [full[0]] : full,
    map,
    strokeColor: color,
    strokeWeight: width,
    strokeOpacity: opacity,
    geodesic: false,
  });

  if (shouldAnimate) {
    const duration = Math.min(900, 260 + full.length * 4);
    const start = performance.now();
    const tick = (now) => {
      if (!line.getMap()) return; // removed mid-animation
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 5); // ease-out-quint
      line.setPath(full.slice(0, Math.max(2, Math.round(eased * full.length))));
      if (t < 1) requestAnimationFrame(tick);
      else line.setPath(full);
    };
    requestAnimationFrame(tick);
  }
  return line;
}

/** Build a LatLngBounds from `{lat,lng}` points. */
export function boundsFrom(points = []) {
  const g = window.google.maps;
  const b = new g.LatLngBounds();
  points.forEach((p) => p && b.extend(p));
  return b;
}

/** A Google-friendly restriction box (`{north,south,east,west}`) around a centre. */
export function restrictionAround(lat, lng, halfSideKm = 75) {
  const degLat = halfSideKm / 111;
  const degLng = halfSideKm / (111 * Math.cos((lat * Math.PI) / 180));
  return {
    north: lat + degLat,
    south: lat - degLat,
    east: lng + degLng,
    west: lng - degLng,
  };
}
