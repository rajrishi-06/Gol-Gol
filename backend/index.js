
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
    console.log("📍 Location update for deliveryId:", deliveryId, "Coords:", coords);
    socket.to(deliveryId).emit("location-update", { coords });
  });


socket.on("ride_started", ({ toUserId }) => {
  console.log("📤 Notifying user:", toUserId);
  io.to(toUserId).emit("ride_started");
});

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });

 
});

server.listen(3001, () => console.log("Socket server on port 3001"));



