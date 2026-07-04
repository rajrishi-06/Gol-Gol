/**
 * Pure geospatial math — no Mapbox dependency, so it stays tree-shakeable and
 * unit-testable. Replaces the copy of this Haversine formula that previously
 * lived in six components (and `geolib`).
 */

const EARTH_RADIUS_KM = 6371;
const toRad = (value) => (value * Math.PI) / 180;

/** Great-circle distance in kilometres between `{ lat, lng }` points. */
export function distanceKm(a, b) {
  if (!a || !b) return 0;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Same distance, expressed in metres. */
export function distanceMeters(a, b) {
  return distanceKm(a, b) * 1000;
}

/**
 * Square bounding box of `halfSideKm` around a centre, returned as Mapbox
 * `[lng, lat]` south-west / north-east corners.
 */
export function computeBounds(lat, lng, halfSideKm = 75) {
  const degLat = halfSideKm / 111;
  const degLng = halfSideKm / (111 * Math.cos((lat * Math.PI) / 180));
  return {
    sw: [lng - degLng, lat - degLat],
    ne: [lng + degLng, lat + degLat],
  };
}

/** True when coordinates are present and not the `0,0` placeholder. */
export function hasValidCoords(coords) {
  return Boolean(
    coords &&
      Number.isFinite(coords.lat) &&
      Number.isFinite(coords.lng) &&
      (coords.lat !== 0 || coords.lng !== 0)
  );
}
