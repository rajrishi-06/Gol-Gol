
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import cron from "node-cron"; 


import { getDistance } from "geolib";
dotenv.config();

const app = express();
app.use(cors());

const server = createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
  },
});



const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

function getDistance2(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371e3; // Earth radius in meters
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Socket.io
io.on("connection", (socket) => {
  console.log("✅ User connected:", socket.id);

  // Join room (based on deliveryId)
  socket.on("join-room", (deliveryId) => {
    socket.join(deliveryId);
    console.log(`📥 Joined room: ${deliveryId}`);
  });

  // Live location updates
 socket.on("location-update", async ({ deliveryId, coords }) => {
    console.log(`📍 Location update for ${deliveryId}:`, coords);
    socket.to(deliveryId).emit("location-update", { coords });

    // 1. Fetch drop location from Supabase
    const { data, error } = await supabase
      .from("progress_req")
      .select("drop_lat, drop_lng, user_id, driver_id")
      .eq("user_id", deliveryId)
      .maybeSingle();

    if (error || !data) {
      console.error("❌ Error fetching drop location:", error?.message);
      return;
    }

    const { drop_lat, drop_lng, user_id, driver_id } = data;
    const distance = getDistance2(coords.lat, coords.lng, drop_lat, drop_lng);

    console.log(`📏 Distance to drop: ${distance.toFixed(2)} meters`);

   if (distance < 50) {

  
  io.to(user_id).emit("ride_completed");
  io.to(driver_id).emit("ride_completed");
  console.log("✅ Ride completed signal sent");

 
  const { error: progressError } = await supabase
    .from("progress_req")
    .delete()
    .eq("user_id", user_id);

  if (progressError) {
    console.error("❌ Error deleting from progress_req:", progressError.message);
  } else {
    console.log("🧹 Deleted progress_req row for", user_id);
  }

  
  const { error: pendingError } = await supabase
    .from("pending_req")
    .delete()
    .eq("user_id", user_id);

  if (pendingError) {
    console.error("❌ Error deleting from pending_req:", pendingError.message);
  } else {
    console.log("🧹 Deleted pending_req row for", user_id);
  }
}

  });

  // Ride started
  socket.on("ride_started", ({ toUserId }) => {
    console.log(`🚀 Ride started for user: ${toUserId}`);
    io.to(toUserId).emit("ride_started");
  });

 

  // Chat message send
  socket.on("send-message", ({ from, to, text }) => {
    console.log(`💬 Message from ${from} to ${to}: ${text}`);
    io.to(to).emit("receive-message", { from, text });
  });

  // Disconnect
  socket.on("disconnect", () => {
    console.log("🔌 User disconnected:", socket.id);
  });
});

async function deleteExpiredRides() {
  const now = new Date();
console.log("checked");
  const { data, error, count } = await supabase
    .from("route_req")
    .delete({ count: "exact" }) // get number of rows deleted
    .lt("time", now.toISOString());

  if (error) {
    console.error("❌ Error cleaning expired rides:", error.message);
  } else {
    console.log(`🧹 Deleted ${count} expired route_req entries at ${now.toISOString()}`);
  }
}


cron.schedule("* * * * *", deleteExpiredRides); 

// Check Supabase connection





const MAPBOX_TOKEN = process.env.VITE_MAPBOX_GL_AP;

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

// 🧠 Main backend function

 async function findMatchingRoutes(userType, userId) {
  let riders = [], drivers = [];
  const matchedPairs = [];

  if (userType === "rider") {
    const { data: singleRider, error: riderError } = await supabase
      .from("route_req")
      .select("*")
      .eq("user_id", userId)
      .limit(1);

    const { data: allDrivers, error: driverError } = await supabase
      .from("route_req")
      .select("*")
      .eq("user_type", "driver");

    if (!singleRider?.length || riderError || !allDrivers?.length || driverError) {
      console.log("⚠️ Missing data");
      return [];
    }

    riders = singleRider;
    drivers = allDrivers;
  } else {
    const { data: singleDriver, error: driverError } = await supabase
      .from("route_req")
      .select("*")
      .eq("user_id", userId)
      .limit(1);

    const { data: allRiders, error: riderError } = await supabase
      .from("route_req")
      .select("*")
      .eq("user_type", "rider");

    if (!singleDriver?.length || driverError || !allRiders?.length || riderError) {
      console.log("⚠️ Missing data");
      return [];
    }

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

      const tolerance = distanceKm <= 50 ? calculateTolerance(distanceKm) : Math.min(30000, Math.max(500, distanceKm * 50)); 
      const startIndex = findClosestIndex(route, riderStart, tolerance);
      const endIndex = findClosestIndex(route, riderEnd, tolerance);

      if (startIndex !== -1 && endIndex !== -1 && startIndex < endIndex) {
        matchedPairs.push({
          rider_id: rider.user_id,
          driver_id: driver.user_id,
          
        });
      }
    }
  }

  return matchedPairs;
}

app.get("/api/match", async (req, res) => {
  try {
    const { userType, userId } = req.query;
    const matches = await findMatchingRoutes(userType, userId);
    res.json(matches);
    console.log("✅ Match results sent:", matches);
  } catch (err) {
    console.error("❌ Error in /api/match:", err.message, err.stack);
    res.status(500).json({ error: err.message });
  }
});




server.listen(3001, () => {
  console.log("🚀 Socket server running on http://localhost:3001");
});



