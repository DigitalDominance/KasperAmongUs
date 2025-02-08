// public/index.js
const socket = io();
let walletAddress = null;
const loginButton = document.getElementById('loginButton');
const walletSpan = document.getElementById('walletAddress');
const scoreboardDiv = document.getElementById('scores');
const timeLeftDiv = document.getElementById('timeLeft');
const sabotageNoticeDiv = document.getElementById('sabotageNotice');

// Kasware wallet login integration
loginButton.addEventListener('click', async () => {
  try {
    // Assumes Kasware wallet API is available as window.kasware
    const accounts = await window.kasware.getAccounts();
    if (accounts && accounts.length > 0) {
      walletAddress = accounts[0];
      walletSpan.textContent = walletAddress;
      socket.emit('login', walletAddress);
      loginButton.disabled = true;
      loginButton.textContent = "Connected";
    }
  } catch (err) {
    console.error("Kasware wallet connection failed", err);
  }
});

// Setup canvas and context
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Load coin image
const coinImg = new Image();
coinImg.src = 'assets/coin.png';

// Game state variables
let selfId = null;
const players = {};  // key: socket id, value: { x, y, walletAddress, score, energy, sprite }
let coin = { x: 0, y: 0 };
let gameTimeLeft = 0;
let sabotageActive = false;

// Preload a cache for player sprites (so that images load faster)
const spriteCache = {};

// Socket.IO event handlers
socket.on('connect', () => {
  selfId = socket.id;
});

socket.on('playerJoined', (data) => {
  players[data.id] = data.player;
  // Preload the sprite image if not already cached.
  if (data.player.sprite && !spriteCache[data.player.sprite]) {
    const img = new Image();
    img.src = data.player.sprite;
    spriteCache[data.player.sprite] = img;
  }
});

socket.on('playerMoved', (data) => {
  if (players[data.id]) {
    players[data.id].x = data.x;
    players[data.id].y = data.y;
  }
});

socket.on('playerLeft', (data) => {
  delete players[data.id];
});

socket.on('coinRespawn', (newCoin) => {
  coin = newCoin;
});

socket.on('sabotage', (data) => {
  sabotageActive = data.active;
  if (sabotageActive) {
    sabotageNoticeDiv.textContent = "Sabotage Active!";
  } else {
    sabotageNoticeDiv.textContent = "";
  }
});

socket.on('gameState', (state) => {
  coin = state.coin;
  gameTimeLeft = state.timeLeft;
  Object.keys(state.players).forEach(id => {
    players[id] = state.players[id];
    if (players[id].sprite && !spriteCache[players[id].sprite]) {
      const img = new Image();
      img.src = players[id].sprite;
      spriteCache[players[id].sprite] = img;
    }
  });
});

socket.on('gameOver', (state) => {
  updateScoreboard(state.players, 0);
  alert("Game Over! Check your final scores on the scoreboard.");
});

socket.on('newGame', (newGameState) => {
  Object.keys(players).forEach(id => delete players[id]);
  coin = newGameState.coin;
  gameTimeLeft = newGameState.duration;
});

// Movement controls using keyboard
const keys = {};
document.addEventListener('keydown', (e) => { keys[e.code] = true; });
document.addEventListener('keyup', (e) => { keys[e.code] = false; });

function update() {
  if (players[selfId]) {
    // Calculate effective speed
    let speed = players[selfId].baseSpeed;
    if (sabotageActive) speed *= 0.5;
    if (players[selfId].energy < 20) speed *= 0.5;
    // Update position based on key presses.
    if (keys['ArrowUp'] || keys['KeyW']) { players[selfId].y -= speed; }
    if (keys['ArrowDown'] || keys['KeyS']) { players[selfId].y += speed; }
    if (keys['ArrowLeft'] || keys['KeyA']) { players[selfId].x -= speed; }
    if (keys['ArrowRight'] || keys['KeyD']) { players[selfId].x += speed; }
    socket.emit('move', { x: players[selfId].x, y: players[selfId].y });
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Draw coin using image if loaded.
  if (coinImg.complete) {
    ctx.drawImage(coinImg, coin.x - 15, coin.y - 15, 30, 30);
  } else {
    ctx.beginPath();
    ctx.arc(coin.x, coin.y, 15, 0, Math.PI * 2);
    ctx.fillStyle = 'gold';
    ctx.fill();
    ctx.closePath();
  }
  
  // Draw players using their sprite images.
  for (let id in players) {
    const p = players[id];
    let spriteImg = spriteCache[p.sprite];
    if (spriteImg && spriteImg.complete) {
      ctx.drawImage(spriteImg, p.x - 20, p.y - 20, 40, 40);
    } else {
      // Fallback to drawing a circle if image not loaded.
      ctx.beginPath();
      ctx.arc(p.x, p.y, 20, 0, Math.PI * 2);
      ctx.fillStyle = (id === selfId) ? 'cyan' : 'magenta';
      ctx.fill();
      ctx.closePath();
    }
    // Draw wallet short ID and score above the sprite.
    ctx.fillStyle = '#fff';
    ctx.font = '12px monospace';
    ctx.fillText(p.walletAddress.substring(0,6), p.x - 20, p.y - 25);
    ctx.fillText(`Score: ${p.score}`, p.x - 20, p.y + 35);
  }
  
  updateScoreboard(players, gameTimeLeft);
}

function updateScoreboard(playersState, timeLeft) {
  const sorted = Object.values(playersState).sort((a, b) => b.score - a.score);
  let html = '<ul style="list-style:none; padding:0; margin:0;">';
  sorted.forEach(p => {
    html += `<li>${p.walletAddress.substring(0,6)}: ${p.score} pts</li>`;
  });
  html += '</ul>';
  scoreboardDiv.innerHTML = html;
  timeLeftDiv.textContent = `Time Left: ${Math.ceil(timeLeft / 1000)}s`;
}

function gameLoop() {
  update();
  draw();
  requestAnimationFrame(gameLoop);
}

gameLoop();
