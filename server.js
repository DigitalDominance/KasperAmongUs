// server.js
const express = require('express');
const http = require('http');
const socketio = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');
const cron = require('node-cron');
const Player = require('./models/Player');

const app = express();
const server = http.createServer(app);
const io = socketio(server);

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/kasper_game';

// Connect to MongoDB
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log("Connected to MongoDB"))
  .catch(err => console.error("MongoDB connection error:", err));

// Serve static files from the public folder
app.use(express.static(path.join(__dirname, 'public')));

// -----------------------
// GAME STATE & LOGIC
// -----------------------
const GAME_DURATION = 2 * 60 * 1000; // 2 minutes
let sabotageActive = false;
let game = {
  coin: { x: Math.random() * 800, y: Math.random() * 600 },
  startTime: Date.now(),
  duration: GAME_DURATION,
  players: {} // key: socket.id => { walletAddress, x, y, score, energy, sprite, baseSpeed }
};

function assignRandomSprite() {
  // For now, always use the example image.
  return 'assets/kasperexample.png';
}


function respawnCoin() {
  game.coin.x = Math.random() * 800;
  game.coin.y = Math.random() * 600;
}

function checkCollision(player, coin) {
  const dx = player.x - coin.x;
  const dy = player.y - coin.y;
  return Math.hypot(dx, dy) < 30;
}

// Sabotage: every 30 seconds trigger a 5-second slowdown
setInterval(() => {
  sabotageActive = true;
  io.emit('sabotage', { active: true, duration: 5000 });
  console.log('Sabotage event triggered!');
  setTimeout(() => {
    sabotageActive = false;
    io.emit('sabotage', { active: false });
    console.log('Sabotage event ended.');
  }, 5000);
}, 30000);

// Main game loop
setInterval(async () => {
  const timeLeft = game.duration - (Date.now() - game.startTime);
  if (timeLeft <= 0) {
    io.emit('gameOver', { players: game.players });
    // Save scores to MongoDB and update weeklyScore as well
    for (let socketId in game.players) {
      const { walletAddress, score } = game.players[socketId];
      await Player.findOneAndUpdate(
        { walletAddress },
        { 
          $inc: { weeklyScore: score },
          $set: { lastOnline: new Date() }
        },
        { upsert: true }
      );
    }
    console.log('Game over! Final scores sent.');
    setTimeout(() => {
      game = {
        coin: { x: Math.random() * 800, y: Math.random() * 600 },
        startTime: Date.now(),
        duration: GAME_DURATION,
        players: {}
      };
      io.emit('newGame', game);
    }, 10000);
  } else {
    for (let socketId in game.players) {
      const player = game.players[socketId];
      if (checkCollision(player, game.coin)) {
        player.score += 1;
        player.energy = Math.min(player.energy + 10, 100);
        respawnCoin();
        io.emit('coinRespawn', game.coin);
      }
      if (player.energy > 0) {
        player.energy -= 0.05;
      }
    }
    io.emit('gameState', { players: game.players, coin: game.coin, timeLeft });
  }
}, 100);

// -----------------------
// SOCKET.IO EVENTS
// -----------------------
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('login', async (walletAddress) => {
    socket.walletAddress = walletAddress;
    console.log(`Wallet ${walletAddress} logged in on socket ${socket.id}`);
    await Player.findOneAndUpdate(
      { walletAddress },
      { lastOnline: new Date() },
      { upsert: true, new: true }
    );
    const sprite = assignRandomSprite();
    game.players[socket.id] = {
      walletAddress,
      x: 400,
      y: 300,
      score: 0,
      energy: 100,
      sprite,
      baseSpeed: 5
    };
    io.emit('playerJoined', { id: socket.id, player: game.players[socket.id] });
  });
  
  socket.on('move', (data) => {
    if (game.players[socket.id]) {
      let speed = game.players[socket.id].baseSpeed;
      if (sabotageActive) speed *= 0.5;
      if (game.players[socket.id].energy < 20) speed *= 0.5;
      game.players[socket.id].x = data.x;
      game.players[socket.id].y = data.y;
      socket.broadcast.emit('playerMoved', { id: socket.id, x: data.x, y: data.y });
    }
  });
  
  socket.on('voiceSignal', (data) => {
    if (data.to) {
      io.to(data.to).emit('voiceSignal', { from: socket.id, signal: data.signal });
    }
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    delete game.players[socket.id];
    io.emit('playerLeft', { id: socket.id });
  });
});

// -----------------------
// LEADERBOARD API ENDPOINT
// -----------------------
app.get('/api/leaderboard', async (req, res) => {
  try {
    // Return top 20 players by weeklyScore (descending)
    const topPlayers = await Player.find().sort({ weeklyScore: -1 }).limit(20);
    res.json({ success: true, players: topPlayers });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -----------------------
// WEEKLY SCORE RESET CRON JOB
// -----------------------
// Reset weeklyScore every Sunday at midnight (server time)
cron.schedule('0 0 * * 0', async () => {
  try {
    await Player.updateMany({}, { $set: { weeklyScore: 0 } });
    console.log('Weekly scores have been reset.');
  } catch (err) {
    console.error('Error resetting weekly scores:', err);
  }
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
