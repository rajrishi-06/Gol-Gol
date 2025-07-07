
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import cron from "node-cron"; // ensure correct path
dotenv.config();

const app = express();
app.use(cors());

const server = createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

function getDistance(lat1, lng1, lat2, lng2) {
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
    const distance = getDistance(coords.lat, coords.lng, drop_lat, drop_lng);

    console.log(`📏 Distance to drop: ${distance.toFixed(2)} meters`);

   if (distance < 50) {
  // 1. Emit ride completed to both user and driver
  io.to(user_id).emit("ride_completed");
  io.to(driver_id).emit("ride_completed");
  console.log("✅ Ride completed signal sent");

  // 2. Delete from progress_req
  const { error: progressError } = await supabase
    .from("progress_req")
    .delete()
    .eq("user_id", user_id);

  if (progressError) {
    console.error("❌ Error deleting from progress_req:", progressError.message);
  } else {
    console.log("🧹 Deleted progress_req row for", user_id);
  }

  // 3. Delete from pending_req if exists
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
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('route_req')
    .delete()
    .lt('time', now);

  if (error) console.error("❌ Error cleaning rides:", error.message);
  else console.log("✅ Cleaned up at:", now);
}


cron.schedule('*/5 * * * *', deleteExpiredRides);




// Start server
server.listen(3001, () => {
  console.log("🚀 Socket server running on http://localhost:3001");
});



