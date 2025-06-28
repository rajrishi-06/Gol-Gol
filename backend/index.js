const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*", // allow all origins in dev
    methods: ["GET", "POST"]
  },
});

io.on("connection", (socket) => {
  console.log("🟢 New user connected:", socket.id);

  socket.on("driverLocation", (data) => {
    console.log("📍 Driver Location Received:", data);
    io.emit("updateDriverLocation", data);
  });

  socket.on("riderLocation", (data) => {
    console.log("🚶 Rider Location Received:", data);
    io.emit("updateRiderLocation", data);
  });

  socket.on("disconnect", () => {
    console.log("🔴 User disconnected:", socket.id);
  });
});

server.listen(3001, () => {
  console.log("🚀 Backend running on http://localhost:3001");
});