// public/fpsGame.js

// Global variables
let camera, scene, renderer, controls;
let objects = [];
let clock;
let socket, selfId;
let remotePlayers = {};  // Map: socket.id -> THREE.Mesh
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let canJump = false;
let velocity = new THREE.Vector3();
let direction = new THREE.Vector3();

// For networking: retrieve wallet address from localStorage (set by login.js)
let walletAddress = localStorage.getItem('walletAddress');
if (!walletAddress) {
  // Redirect to login if not set
  window.location.href = 'login.html';
}

init();
animate();
initNetworking();

function init() {
  clock = new THREE.Clock();

  // Create scene and camera
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xaaaaaa);
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 1000);

  // Setup renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  // Add light
  const light = new THREE.HemisphereLight(0xffffff, 0x444444);
  light.position.set(0, 200, 0);
  scene.add(light);
  const dirLight = new THREE.DirectionalLight(0xffffff);
  dirLight.position.set(0, 200, 100);
  scene.add(dirLight);

  // Create floor
  const floorGeometry = new THREE.PlaneGeometry(2000, 2000, 100, 100);
  floorGeometry.rotateX(- Math.PI / 2);
  const floorMaterial = new THREE.MeshBasicMaterial({ color: 0x555555 });
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  scene.add(floor);

  // Setup PointerLockControls
  controls = new THREE.PointerLockControls(camera, document.body);
  const blocker = document.getElementById('blocker');
  const instructions = document.getElementById('instructions');

  instructions.addEventListener('click', function () {
    controls.lock();
  });

  controls.addEventListener('lock', function () {
    blocker.style.display = 'none';
  });

  controls.addEventListener('unlock', function () {
    blocker.style.display = 'block';
  });

  scene.add(controls.getObject());

  // Add some sample objects to shoot at (for demo)
  const boxGeometry = new THREE.BoxGeometry(20, 20, 20);
  const boxMaterial = new THREE.MeshPhongMaterial({ color: 0xff0000 });
  for (let i = 0; i < 10; i++) {
    const box = new THREE.Mesh(boxGeometry, boxMaterial);
    box.position.set(Math.random() * 400 - 200, 10, Math.random() * 400 - 200);
    scene.add(box);
    objects.push(box);
  }

  // Handle key events
  const onKeyDown = function (event) {
    switch (event.code) {
      case 'ArrowUp':
      case 'KeyW':
        moveForward = true;
        break;
      case 'ArrowLeft':
      case 'KeyA':
        moveLeft = true;
        break;
      case 'ArrowDown':
      case 'KeyS':
        moveBackward = true;
        break;
      case 'ArrowRight':
      case 'KeyD':
        moveRight = true;
        break;
      case 'Space':
        if (canJump === true) velocity.y += 350;
        canJump = false;
        break;
    }
  };

  const onKeyUp = function (event) {
    switch (event.code) {
      case 'ArrowUp':
      case 'KeyW':
        moveForward = false;
        break;
      case 'ArrowLeft':
      case 'KeyA':
        moveLeft = false;
        break;
      case 'ArrowDown':
      case 'KeyS':
        moveBackward = false;
        break;
      case 'ArrowRight':
      case 'KeyD':
        moveRight = false;
        break;
    }
  };

  document.addEventListener('keydown', onKeyDown, false);
  document.addEventListener('keyup', onKeyUp, false);

  window.addEventListener('resize', onWindowResize, false);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
}

// --- Networking with Socket.IO ---
function initNetworking() {
  socket = io();
  
  socket.emit('login', walletAddress);
  
  socket.on('connect', () => {
    selfId = socket.id;
    console.log('Connected with socket id:', selfId);
  });
  
  socket.on('playerJoined', (data) => {
    if (data.id !== selfId) {
      // Create a simple box to represent a remote player
      const geometry = new THREE.BoxGeometry(20, 20, 20);
      const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
      const box = new THREE.Mesh(geometry, material);
      box.position.set(0, 10, 0);
      scene.add(box);
      remotePlayers[data.id] = box;
      console.log('Player joined:', data.id);
    }
  });
  
  socket.on('playerMoved', (data) => {
    if (remotePlayers[data.id]) {
      remotePlayers[data.id].position.set(data.x, 10, data.y);
    }
  });
  
  socket.on('playerLeft', (data) => {
    if (remotePlayers[data.id]) {
      scene.remove(remotePlayers[data.id]);
      delete remotePlayers[data.id];
    }
  });
}

// --- Animation and Game Loop ---
function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  
  if (controls.isLocked === true) {
    velocity.x -= velocity.x * 10.0 * delta;
    velocity.z -= velocity.z * 10.0 * delta;
    velocity.y -= 9.8 * 100.0 * delta; // gravity

    direction.z = Number(moveForward) - Number(moveBackward);
    direction.x = Number(moveRight) - Number(moveLeft);
    direction.normalize(); // ensure consistent movements in all directions

    if (moveForward || moveBackward) velocity.z -= direction.z * 400.0 * delta;
    if (moveLeft || moveRight) velocity.x -= direction.x * 400.0 * delta;

    controls.moveRight(- velocity.x * delta);
    controls.moveForward(- velocity.z * delta);

    // Prevent falling through floor
    if (controls.getObject().position.y < 10) {
      velocity.y = 0;
      controls.getObject().position.y = 10;
      canJump = true;
    }

    // Emit our current position (x,z) to the server
    socket.emit('move', { 
      x: controls.getObject().position.x, 
      y: controls.getObject().position.z 
    });
  }
  
  renderer.render(scene, camera);
}
