// public/game.js

// --- Socket and Wallet Setup ---
const socket = io();
let walletAddress = localStorage.getItem('walletAddress'); // Set in login.js
if (!walletAddress) {
  window.location.href = 'login.html';
}
let localVoiceStream = null;
const voicePeers = {}; // For voice chat

// --- DOM Elements ---
const scoreboardDiv = document.getElementById('scores');
const timeLeftDiv = document.getElementById('timeLeft');
const sabotageNoticeDiv = document.getElementById('sabotageNotice');
const gameOverOverlay = document.getElementById('gameOverOverlay');
const finalScoresDiv = document.getElementById('finalScores');
const restartButton = document.getElementById('restartButton');
const pttIndicator = document.getElementById('pttIndicator');
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- Fullscreen Canvas Setup ---
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// --- Asset Loading ---
const coinImg = new Image();
coinImg.src = 'assets/coin.png';
const defaultSprite = 'assets/kasperexample.png'; // Single example image for all players

// --- Game State Variables ---
let selfId = null;
const players = {};  // key: socket.id, value: { x, y, walletAddress, score, energy, sprite, baseSpeed }
let coin = { x: 0, y: 0 };
let gameTimeLeft = 0;
let sabotageActive = false;
const spriteCache = {};

// --- Voice Chat Initialization ---
async function initVoiceChat() {
  try {
    localVoiceStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    localVoiceStream.getAudioTracks().forEach(track => track.enabled = false);
    console.log("Voice stream obtained");
  } catch (err) {
    console.error("Failed to get voice stream", err);
  }
}
initVoiceChat();

// --- Create Voice Peer Connection ---
function createVoicePeer(peerId, initiator) {
  if (!localVoiceStream) return;
  const peer = new SimplePeer({
    initiator: initiator,
    trickle: true,
    stream: localVoiceStream
  });
  peer.on('signal', (signalData) => {
    socket.emit('voiceSignal', { to: peerId, signal: signalData });
  });
  peer.on('connect', () => { console.log(`Voice connection established with ${peerId}`); });
  peer.on('error', (err) => { console.error(`Voice peer error with ${peerId}:`, err); });
  peer.on('close', () => {
    console.log(`Voice connection closed with ${peerId}`);
    if (voicePeers[peerId]) delete voicePeers[peerId];
  });
  peer.on('stream', (remoteStream) => {
    const audioElem = document.createElement('audio');
    audioElem.srcObject = remoteStream;
    audioElem.autoplay = true;
    audioElem.controls = false;
    document.body.appendChild(audioElem);
  });
  voicePeers[peerId] = peer;
}

// --- Push-to-Talk Implementation ---
document.addEventListener('keydown', (e) => {
  if (e.code === "Space" && localVoiceStream) {
    localVoiceStream.getAudioTracks().forEach(track => track.enabled = true);
    pttIndicator.style.display = 'block';
  }
});
document.addEventListener('keyup', (e) => {
  if (e.code === "Space" && localVoiceStream) {
    localVoiceStream.getAudioTracks().forEach(track => track.enabled = false);
    pttIndicator.style.display = 'none';
  }
});

// --- Socket.IO Event Handlers ---
socket.on('connect', () => {
  selfId = socket.id;
});
socket.on('voiceSignal', (data) => {
  const fromId = data.from;
  if (!voicePeers[fromId]) {
    createVoicePeer(fromId, false);
  }
  voicePeers[fromId].signal(data.signal);
});
socket.on('playerJoined', (data) => {
  players[data.id] = data.player;
  preloadSprite(data.player.sprite || defaultSprite);
  if (localVoiceStream && data.id !== selfId) {
    const initiator = selfId < data.id;
    createVoicePeer(data.id, initiator);
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
  if (voicePeers[data.id]) {
    voicePeers[data.id].destroy();
    delete voicePeers[data.id];
  }
});
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
    preloadSprite(players[id].sprite || defaultSprite);
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

// --- Preload Sprite Images ---
function preloadSprite(url) {
  if (url && !spriteCache[url]) {
    const img = new Image();
    img.src = url;
    spriteCache[url] = img;
  }
}

// --- Movement Controls ---
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
    const spriteImg = spriteCache[p.sprite] || spriteCache[defaultSprite];
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
  window.location.reload();
});

// --- Main Game Loop ---
function gameLoop() {
  update();
  draw();
  requestAnimationFrame(gameLoop);
}

gameLoop();
