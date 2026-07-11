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

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', players: players.size });
});

const players = new Map(); // Store connected players

io.on("connection", (socket) => {
  console.log(`[Socket.io] Player connected: ${socket.id}`);

  socket.on("joinGame", (playerData) => {
    const { userId, username, level, x, y, z, rY, state } = playerData;
    players.set(socket.id, {
      socketId: socket.id,
      userId,
      username,
      level,
      x: x || 0,
      y: y || 0,
      z: z || 0,
      rY: rY || 0,
      state: state || 'idle',
      appearance: playerData.appearance || {}
    });
    console.log(`[Socket.io] ${username} (${userId}) joined. Total players: ${players.size}`);
    // Broadcast updated player list to all clients
    io.emit("playersUpdate", Array.from(players.values()));
  });

  socket.on("playerUpdate", (playerData) => {
    const player = players.get(socket.id);
    if (player) {
      player.x = playerData.x || player.x;
      player.y = playerData.y || player.y;
      player.z = playerData.z || player.z;
      player.rY = playerData.rY || player.rY;
      player.state = playerData.state || player.state;
      if (playerData.appearance) player.appearance = playerData.appearance;
      if (playerData.level !== undefined) player.level = playerData.level;
      if (playerData.username !== undefined) player.username = playerData.username;
      // Broadcast player position to all other clients
      socket.broadcast.emit("playerUpdate", player);
    }
  });

  socket.on("chatMessage", (messageData) => {
    // Broadcast chat message to all clients
    io.emit("chatMessage", messageData);
  });

  socket.on("tradeRequest", (payload) => {
    // Emit trade request to the target user
    const targetPlayer = Array.from(players.values()).find(p => p.userId === payload.targetUserId);
    if (targetPlayer) {
      io.to(targetPlayer.socketId).emit("tradeRequest", payload);
    }
  });

  socket.on("tradeResponse", (payload) => {
    // Emit trade response to the target user
    const targetPlayer = Array.from(players.values()).find(p => p.userId === payload.targetUserId);
    if (targetPlayer) {
      io.to(targetPlayer.socketId).emit("tradeResponse", payload);
    }
  });

  socket.on("tradeCancel", (payload) => {
    // Emit trade cancel to the target user
    const targetPlayer = Array.from(players.values()).find(p => p.userId === payload.targetUserId);
    if (targetPlayer) {
      io.to(targetPlayer.socketId).emit("tradeCancel", payload);
    }
  });

  socket.on("friendRequest", (payload) => {
    // Emit friend request to the target user
    const targetPlayer = Array.from(players.values()).find(p => p.userId === payload.targetUserId);
    if (targetPlayer) {
      io.to(targetPlayer.socketId).emit("friendRequest", payload);
    }
  });

  socket.on("friendResponse", (payload) => {
    // Emit friend response to the target user
    const targetPlayer = Array.from(players.values()).find(p => p.userId === payload.targetUserId);
    if (targetPlayer) {
      io.to(targetPlayer.socketId).emit("friendResponse", payload);
    }
  });

  socket.on("disconnect", () => {
    const player = players.get(socket.id);
    if (player) {
      console.log(`[Socket.io] ${player.username} disconnected. Total players: ${players.size - 1}`);
      players.delete(socket.id);
      // Broadcast updated player list to all clients
      io.emit("playersUpdate", Array.from(players.values()));
    }
  });

  socket.on("connect_error", (err) => {
    console.error(`[Socket.io] Connection error: ${err.message}`);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`[Zolos Server] Listening on port ${PORT}`);
});
