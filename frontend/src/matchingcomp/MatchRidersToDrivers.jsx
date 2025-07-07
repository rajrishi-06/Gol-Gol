//original


import { useEffect } from "react";
import { supabase } from "../server/supabase";
import { getDistance } from "geolib";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_GL_API;

// 📏 Dynamic tolerance for short trips
function calculateTolerance(distanceKm) {
  return Math.min(3000, Math.max(500, distanceKm * 50)); // 500m to 3km
}

// 📍 Fetch driver's route from Mapbox Directions API
async function getDriverRoute(start, end) {
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${start.lng},${start.lat};${end.lng},${end.lat}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;
  const res = await fetch(url);
  const data = await res.json();
  const route = data.routes[0];
  return {
    coordinates: route?.geometry?.coordinates || [],
    distanceKm: route?.distance ? route.distance / 1000 : 0,
  };
}

// 📍 Find the index of the closest point within the route
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

export default function MatchRidersToDrivers() {
  useEffect(() => {
    async function matchAllRiders() {
      // 🧍‍♂️ Step 1: Fetch all riders
      const { data: riders, error: riderError } = await supabase
        .from("route_requests")
        .select("*")
        .eq("user_type", "rider");

      if (riderError || !riders || riders.length === 0) {
        console.log("⚠️ No riders found");
        return;
      }

      // 🚗 Step 2: Fetch all drivers
      const { data: drivers, error: driverError } = await supabase
        .from("route_requests")
        .select("*")
        .eq("user_type", "driver");

      if (driverError || !drivers || drivers.length === 0) {
        console.log("⚠️ No drivers found");
        return;
      }

      // 🔁 Step 3: Match each rider with each driver
      for (const rider of riders) {
        const riderStart = { lat: rider.start_lat, lng: rider.start_lng };
        const riderEnd = { lat: rider.end_lat, lng: rider.end_lng };

        for (const driver of drivers) {
          const driverStart = { lat: driver.start_lat, lng: driver.start_lng };
          const driverEnd = { lat: driver.end_lat, lng: driver.end_lng };

          const { coordinates: route, distanceKm } = await getDriverRoute(driverStart, driverEnd);
          if (route.length === 0) {
            console.log(`⚠️ Empty route for driver: ${driver.user_id}`);
            continue;
          }

          let startIndex, endIndex;

          if (distanceKm <= 50) {
            // 🧭 Short route: use small dynamic tolerance
            const tolerance = calculateTolerance(distanceKm);
            startIndex = findClosestIndex(route, riderStart, tolerance);
            endIndex = findClosestIndex(route, riderEnd, tolerance);

            if (startIndex !== -1 && endIndex !== -1 && startIndex < endIndex) {
              console.log(`✅ Match (Short GPS) - Rider: ${rider.user_id}, Driver: ${driver.user_id}`);
            } else {
              console.log(`❌ No Match (Short GPS) - Rider: ${rider.user_id}, Driver: ${driver.user_id}`);
            }
          } else {
            // 🌍 Long route: use extended GPS tolerance (30km)
            const EXTENDED_TOLERANCE = 30000;
            startIndex = findClosestIndex(route, riderStart, EXTENDED_TOLERANCE);
            endIndex = findClosestIndex(route, riderEnd, EXTENDED_TOLERANCE);

            if (startIndex !== -1 && endIndex !== -1 && startIndex < endIndex) {
              console.log(`✅ Match (Long GPS) - Rider: ${rider.user_id}, Driver: ${driver.user_id}`);
            } else {
              console.log(`❌ No Match (Long GPS) - Rider: ${rider.user_id}, Driver: ${driver.user_id}`);
            }
          }
        }
      }
    }

    matchAllRiders();
  }, []);

  return <div className="p-4 text-white">Matching all Riders with Drivers...</div>;
}
