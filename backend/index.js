
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
app.use(cors());
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join-room", (deliveryId) => {
    socket.join(deliveryId);
  });

  socket.on("location-update", ({ deliveryId, coords }) => {
    socket.to(deliveryId).emit("location-update", { coords });
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });

  socket.on("ride_accepted", ({ userId, accepted }) => {
    socket.to(userId).emit("ride_accepted", { accepted });
    console.log(`Ride accepted by user ${userId}: ${accepted}`);
  });

  socket.on("ride_accepted", ({ userId }) => {
    console.log(`🚖 Ride accepted by driver for user ${userId}`);
 
    io.to(userId).emit("driver_accepted", { accepted: true });
  });
});

server.listen(3001, () => console.log("Socket server on port 3001"));



