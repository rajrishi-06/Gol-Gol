import { getDistance } from "geolib";
import { supabase } from "../server/supabase"; // adjust path

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_GL_API;

// Calculate tolerance
function calculateTolerance(distanceKm) {
  return Math.min(3000, Math.max(500, distanceKm * 50));
}

// Get driver route from Mapbox
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

// Find closest point index
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

// Main matching function
export async function findMatchingRoutes(userType, userId) {
  let riders = [], drivers = [];
  const matchedPairs = [];

  if (userType === "rider") {
    const { data: singleRider } = await supabase
      .from("route_req")
      .select("*")
      .eq("user_id", userId)
      .limit(1);
    const { data: allDrivers } = await supabase
      .from("route_req")
      .select("*")
      .eq("user_type", "driver");

    if (!singleRider?.length || !allDrivers?.length) return [];
    riders = singleRider;
    drivers = allDrivers;
  } else {
    const { data: singleDriver } = await supabase
      .from("route_req")
      .select("*")
      .eq("user_id", userId)
      .limit(1);
    const { data: allRiders } = await supabase
      .from("route_req")
      .select("*")
      .eq("user_type", "rider");

    if (!singleDriver?.length || !allRiders?.length) return [];
    drivers = singleDriver;
    riders = allRiders;
  }

  for (const rider of riders) {
    const riderStart = { lat: rider.start_lat, lng: rider.start_lng };
    const riderEnd = { lat: rider.end_lat, lng: rider.end_lng };

    for (const driver of drivers) {
      const driverStart = { lat: driver.start_lat, lng: driver.start_lng };
      const driverEnd = { lat: driver.end_lat, lng: driver.end_lng };

      const { coordinates: route, distanceKm } = await getDriverRoute(driverStart, driverEnd);
      if (route.length === 0) continue;

      const tolerance = distanceKm <= 50
        ? calculateTolerance(distanceKm)
        : Math.min(30000, Math.max(500, distanceKm * 50));

      const startIndex = findClosestIndex(route, riderStart, tolerance);
      const endIndex = findClosestIndex(route, riderEnd, tolerance);

      if (startIndex !== -1 && endIndex !== -1 && startIndex < endIndex) {
        matchedPairs.push({ rider_id: rider.user_id, driver_id: driver.user_id });
      }
    }
  }

  return matchedPairs;
}
