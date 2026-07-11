const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

// Configure CORS for your frontend application
const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';
// Support multiple origins if provided as comma-separated list
const allowedOrigins = corsOrigin.split(',').map(o => o.trim());

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes('*')) {
        callback(null, true);
      } else {
        console.warn(`[CORS] Blocked request from origin: ${origin}`);
        callback(null, false); // Don't throw error, just reject
      }
    },
    methods: ["GET", "POST"],
    credentials: true,
    allowEIO3: true
  },
  transports: ['websocket', 'polling']
});

console.log(`[Zolos Server] CORS enabled for: ${corsOrigin}`);

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      playerCount: players.size,
      uptime: process.uptime()
    });
});

const players = new Map(); // Store connected players by userId

io.on("connection", (socket) => {
  console.log(`[Socket.io] Player connected: ${socket.id}`);

  socket.on("joinGame", (playerData) => {
    const { userId, username, level, x, y, z, rY, state } = playerData;
    if (!userId) {
      console.warn('[Socket.io] joinGame: Missing userId');
      return;
    }
    players.set(userId, {
      socketId: socket.id,
      userId,
      username: username || 'Adventurer',
      level: level || 1,
      x: x || 0,
      y: y || 1.2,
      z: z || 10,
      rY: rY || 0,
      state: state || 'idle',
      appearance: playerData.appearance || {}
    });
    console.log(`[Socket.io] ${username} (${userId}) joined. Total players: ${players.size}`);
    // Send current player list to the new player
    socket.emit("playersUpdate", Array.from(players.values()));
    // Broadcast the new player to all other clients
    socket.broadcast.emit("playerJoined", players.get(userId));
  });

  socket.on("playerUpdate", (playerData) => {
    const { userId } = playerData;
    const player = players.get(userId);
    if (player) {
      player.x = playerData.x !== undefined ? playerData.x : player.x;
      player.y = playerData.y !== undefined ? playerData.y : player.y;
      player.z = playerData.z !== undefined ? playerData.z : player.z;
      player.rY = playerData.rY !== undefined ? playerData.rY : player.rY;
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
    const { toUserId } = payload;
    const targetPlayer = players.get(toUserId);
    if (targetPlayer) {
      io.to(targetPlayer.socketId).emit("tradeRequest", payload);
    }
  });

  socket.on("tradeResponse", (payload) => {
    // Emit trade response to the target user
    const { toUserId } = payload;
    const targetPlayer = players.get(toUserId);
    if (targetPlayer) {
      io.to(targetPlayer.socketId).emit("tradeResponse", payload);
    }
  });

  socket.on("tradeCancel", (payload) => {
    // Emit trade cancel to the target user
    const { toUserId } = payload;
    const targetPlayer = players.get(toUserId);
    if (targetPlayer) {
      io.to(targetPlayer.socketId).emit("tradeCancel", payload);
    }
  });

  socket.on("friendRequest", (payload) => {
    // Emit friend request to the target user
    const { toUserId } = payload;
    const targetPlayer = players.get(toUserId);
    if (targetPlayer) {
      io.to(targetPlayer.socketId).emit("friendRequest", payload);
    }
  });

  socket.on("friendResponse", (payload) => {
    // Emit friend response to the target user
    const { toUserId } = payload;
    const targetPlayer = players.get(toUserId);
    if (targetPlayer) {
      io.to(targetPlayer.socketId).emit("friendResponse", payload);
    }
  });

  socket.on("disconnect", () => {
    // Find and remove the player by socketId
    let disconnectedUserId = null;
    for (const [userId, player] of players.entries()) {
      if (player.socketId === socket.id) {
        disconnectedUserId = userId;
        console.log(`[Socket.io] ${player.username} disconnected. Total players: ${players.size - 1}`);
        players.delete(userId);
        break;
      }
    }
    if (disconnectedUserId) {
      // Broadcast player left to all clients
      io.emit("playerLeft", { userId: disconnectedUserId });
    }
  });

  socket.on("connect_error", (err) => {
    console.error(`[Socket.io] Connection error: ${err.message}`);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`[Zolos Server] Listening on port ${PORT}`);
  console.log(`[Zolos Server] Health check: http://localhost:${PORT}/health`);
});
