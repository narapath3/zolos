const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

// Configure CORS for your frontend application
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins for now, but in production, specify your frontend URL
    methods: ["GET", "POST"],
  },
});

const players = new Map(); // Store connected players

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on("joinGame", (playerData) => {
    players.set(socket.id, { ...playerData, socketId: socket.id });
    console.log(`Player ${playerData.username} joined. Total players: ${players.size}`);
    // Broadcast updated player list to all clients
    io.emit("playersUpdate", Array.from(players.values()));
  });

  socket.on("playerUpdate", (playerData) => {
    if (players.has(socket.id)) {
      players.set(socket.id, { ...players.get(socket.id), ...playerData });
      // Broadcast player position to all other clients
      socket.broadcast.emit("playerUpdate", playerData);
    }
  });

  socket.on("chatMessage", (messageData) => {
    // Broadcast chat message to all clients
    io.emit("chatMessage", messageData);
  });

  socket.on("tradeRequest", (tradeRequestData) => {
    // Emit trade request to the target user
    const targetPlayer = Array.from(players.values()).find(p => p.userId === tradeRequestData.targetUserId);
    if (targetPlayer) {
      io.to(targetPlayer.socketId).emit("tradeRequest", tradeRequestData);
    }
  });

  socket.on("tradeResponse", (tradeResponseData) => {
    // Emit trade response to the target user
    const targetPlayer = Array.from(players.values()).find(p => p.userId === tradeResponseData.targetUserId);
    if (targetPlayer) {
      io.to(targetPlayer.socketId).emit("tradeResponse", tradeResponseData);
    }
  });

  socket.on("tradeCancel", (tradeCancelData) => {
    // Emit trade cancel to the target user
    const targetPlayer = Array.from(players.values()).find(p => p.userId === tradeCancelData.targetUserId);
    if (targetPlayer) {
      io.to(targetPlayer.socketId).emit("tradeCancel", tradeCancelData);
    }
  });

  socket.on("friendRequest", (friendRequestData) => {
    // Emit friend request to the target user
    const targetPlayer = Array.from(players.values()).find(p => p.userId === friendRequestData.targetUserId);
    if (targetPlayer) {
      io.to(targetPlayer.socketId).emit("friendRequest", friendRequestData);
    }
  });

  socket.on("friendResponse", (friendResponseData) => {
    // Emit friend response to the target user
    const targetPlayer = Array.from(players.values()).find(p => p.userId === friendResponseData.targetUserId);
    if (targetPlayer) {
      io.to(targetPlayer.socketId).emit("friendResponse", friendResponseData);
    }
  });

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
    players.delete(socket.id);
    // Broadcast updated player list to all clients
    io.emit("playersUpdate", Array.from(players.values()));
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Socket.io server listening on port ${PORT}`);
});
