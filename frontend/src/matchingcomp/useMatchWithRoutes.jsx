// hooks/useMatchWithRoutes.js
import { supabase } from "../server/supabase";
import { getDistance } from "geolib";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_GL_API;

function calculateTolerance(distanceKm) {
  return Math.min(3000, Math.max(500, distanceKm * 50));
}

async function getDriverRoute(start, end) {
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${start.lng},${start.lat};${end.lng},${end.lat}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;
  const res = await fetch(url);
  const data = await res.json();
  const route = data.routes?.[0];
  return {
    coordinates: route?.geometry?.coordinates || [],
    distanceKm: route?.distance ? route.distance / 1000 : 0,
  };
}

function findClosestIndex(route, point, tolerance) {
  let closestIndex = -1;
  let minDist = Infinity;

  for (let i = 0; i < route.length; i++) {
    const [lng, lat] = route[i];
    const dist = getDistance(
      { latitude: point.lat, longitude: point.lng },
      { latitude: lat, longitude: lng }
    );
    if (dist < minDist) {
      minDist = dist;
      closestIndex = i;
    }
  }

  return minDist <= tolerance ? closestIndex : -1;
}

export async function matchUsingRoutes(newUser) {
  const { user_id, user_type, start_lat, start_lng, end_lat, end_lng } = newUser;

  const riderStart = { lat: start_lat, lng: start_lng };
  const riderEnd = { lat: end_lat, lng: end_lng };

  const targetType = user_type === "rider" ? "driver" : "rider";

  const { data: candidates, error } = await supabase
    .from("route_req")
    .select("*")
    .eq("user_type", targetType);

  if (error || !candidates) return null;

  for (const driver of candidates) {
    const driverStart = { lat: driver.start_lat, lng: driver.start_lng };
    const driverEnd = { lat: driver.end_lat, lng: driver.end_lng };

    const { coordinates: route, distanceKm } = await getDriverRoute(driverStart, driverEnd);
    if (route.length === 0) continue;

    let startIndex, endIndex;
    const tolerance = distanceKm <= 50 ? calculateTolerance(distanceKm) : 30000;

    startIndex = findClosestIndex(route, riderStart, tolerance);
    endIndex = findClosestIndex(route, riderEnd, tolerance);

    if (startIndex !== -1 && endIndex !== -1 && startIndex < endIndex) {
      return { match: driver, route, distanceKm };
    }
  }

  return null;
}
