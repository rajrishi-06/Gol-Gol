const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173", // Change to your frontend URL
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log("✅ User connected:", socket.id);

  socket.on("join", (userId) => {
    console.log("Joined room:", userId);
    socket.join(userId); // userId can be driver or passenger
  });

  socket.on("driverLocation", ({ passengerId, lat, lng }) => {
    console.log("Driver location update for passenger:", passengerId);
    io.to(passengerId).emit(`driverLocation:${passengerId}`, { lat, lng });
  });

  socket.on("disconnect", () => {
    console.log("❌ Disconnected:", socket.id);
  });
});

server.listen(3001, () => {
  console.log("🚀 Server running on http://localhost:3001");
});