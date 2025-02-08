// public/index.js
const socket = io();
let walletAddress = null;
const loginModal = document.getElementById('loginModal');
const loginButton = document.getElementById('loginButton');
const scoreboardDiv = document.getElementById('scores');
const timeLeftDiv = document.getElementById('timeLeft');
const sabotageNoticeDiv = document.getElementById('sabotageNotice');
const gameOverOverlay = document.getElementById('gameOverOverlay');
const finalScoresDiv = document.getElementById('finalScores');
const restartButton = document.getElementById('restartButton');

// Kasware wallet login integration (replace with real API as needed)
loginButton.addEventListener('click', async () => {
  try {
    const accounts = await window.kasware.getAccounts();
    if (accounts && accounts.length > 0) {
      walletAddress = accounts[0];
      socket.emit('login', walletAddress);
      loginModal.style.display = 'none';
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
const players = {};  // key: socket id, value: { x, y, walletAddress, score, energy, sprite, baseSpeed }
let coin = { x: 0, y: 0 };
let gameTimeLeft = 0;
let sabotageActive = false;
const spriteCache = {};

// Socket.IO event handlers
socket.on('connect', () => { selfId = socket.id; });
socket.on('playerJoined', (data) => {
  players[data.id] = data.player;
  preloadSprite(data.player.sprite);
});
socket.on('playerMoved', (data) => {
  if (players[data.id]) {
    players[data.id].x = data.x;
    players[data.id].y = data.y;
  }
});
socket.on('playerLeft', (data) => { delete players[data.id]; });
socket.on('coinRespawn', (newCoin) => { coin = newCoin; });
socket.on('sabotage', (data) => {
  sabotageActive = data.active;
  sabotageNoticeDiv.textContent = sabotageActive ? "Sabotage Active!" : "";
});
socket.on('gameState', (state) => {
  coin = state.coin;
  gameTimeLeft = state.timeLeft;
  Object.keys(state.players).forEach(id => {
    players[id] = state.players[id];
    preloadSprite(players[id].sprite);
  });
});
socket.on('gameOver', (state) => {
  updateScoreboard(state.players, 0);
  showGameOver(state.players);
});
socket.on('newGame', (newGameState) => {
  Object.keys(players).forEach(id => delete players[id]);
  coin = newGameState.coin;
  gameTimeLeft = newGameState.duration;
  hideGameOver();
});

// Preload sprite images
function preloadSprite(url) {
  if (url && !spriteCache[url]) {
    const img = new Image();
    img.src = url;
    spriteCache[url] = img;
  }
}

// Movement controls
const keys = {};
document.addEventListener('keydown', (e) => { keys[e.code] = true; });
document.addEventListener('keyup', (e) => { keys[e.code] = false; });

function update() {
  if (players[selfId]) {
    let speed = players[selfId].baseSpeed;
    if (sabotageActive) speed *= 0.5;
    if (players[selfId].energy < 20) speed *= 0.5;
    if (keys['ArrowUp'] || keys['KeyW']) { players[selfId].y -= speed; }
    if (keys['ArrowDown'] || keys['KeyS']) { players[selfId].y += speed; }
    if (keys['ArrowLeft'] || keys['KeyA']) { players[selfId].x -= speed; }
    if (keys['ArrowRight'] || keys['KeyD']) { players[selfId].x += speed; }
    socket.emit('move', { x: players[selfId].x, y: players[selfId].y });
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Draw coin
  if (coinImg.complete) {
    ctx.drawImage(coinImg, coin.x - 15, coin.y - 15, 30, 30);
  } else {
    ctx.beginPath();
    ctx.arc(coin.x, coin.y, 15, 0, Math.PI * 2);
    ctx.fillStyle = 'gold';
    ctx.fill();
    ctx.closePath();
  }
  
  // Draw players
  for (let id in players) {
    const p = players[id];
    const spriteImg = spriteCache[p.sprite];
    if (spriteImg && spriteImg.complete) {
      ctx.drawImage(spriteImg, p.x - 20, p.y - 20, 40, 40);
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 20, 0, Math.PI * 2);
      ctx.fillStyle = (id === selfId) ? 'cyan' : 'magenta';
      ctx.fill();
      ctx.closePath();
    }
    ctx.fillStyle = '#fff';
    ctx.font = '12px monospace';
    ctx.fillText(p.walletAddress.substring(0,6), p.x - 20, p.y - 25);
    ctx.fillText(`Score: ${p.score}`, p.x - 20, p.y + 35);
  }
  updateScoreboard(players, gameTimeLeft);
}

function updateScoreboard(playersState, timeLeft) {
  const sorted = Object.values(playersState).sort((a, b) => b.score - a.score);
  let html = '<ul style="list-style:none; margin:0; padding:0;">';
  sorted.forEach(p => {
    html += `<li>${p.walletAddress.substring(0,6)}: ${p.score} pts</li>`;
  });
  html += '</ul>';
  scoreboardDiv.innerHTML = html;
  timeLeftDiv.textContent = `Time Left: ${Math.ceil(timeLeft / 1000)}s`;
}

function showGameOver(playersState) {
  let html = '<h2>Final Scores</h2><ul style="list-style:none; margin:0; padding:0;">';
  const sorted = Object.values(playersState).sort((a, b) => b.score - a.score);
  sorted.forEach(p => {
    html += `<li>${p.walletAddress.substring(0,6)}: ${p.score} pts</li>`;
  });
  html += '</ul>';
  finalScoresDiv.innerHTML = html;
  gameOverOverlay.classList.add('show');
}

function hideGameOver() {
  gameOverOverlay.classList.remove('show');
}

restartButton.addEventListener('click', () => {
  // Simply reload the page to start a new session
  window.location.reload();
});

function gameLoop() {
  update();
  draw();
  requestAnimationFrame(gameLoop);
}

gameLoop();
