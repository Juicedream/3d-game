import * as THREE from 'three';
import { audio } from '../audio/AudioEngine.js';
import {
  getGrassTexture,
  getSandTexture,
  getConcreteTexture,
  getAsphaltTexture,
  getBuildingFacadeTexture,
  getBrickTexture,
  getCrateTexture,
  getBarkTexture,
  getBunkerFloorTexture
} from '../engine/Textures.js';
import {
  createOperatorMesh,
  animateOperator,
  createWeaponViewModel,
  createZombieMesh
} from '../engine/CharacterMesh.js';

const WEAPONS = {
  rifle: {
    name: 'M4 TAC-RIFLE',
    damage: 24,
    fireRate: 0.115,
    magSize: 30,
    reloadTime: 1.4,
    spread: 0.015,
    pellets: 1,
    range: 110,
    auto: true
  },
  shotgun: {
    name: 'BREACHER-12',
    damage: 16,
    fireRate: 0.72,
    magSize: 8,
    reloadTime: 1.8,
    spread: 0.068,
    pellets: 6,
    range: 42,
    auto: false
  },
  pistol: {
    name: 'RECON-9MM',
    damage: 32,
    fireRate: 0.24,
    magSize: 15,
    reloadTime: 1.0,
    spread: 0.01,
    pellets: 1,
    range: 85,
    auto: false
  }
};

const ARENA_SPAWNS = [
  new THREE.Vector3(-24, 0, -24),
  new THREE.Vector3(24, 0, 24),
  new THREE.Vector3(-24, 0, 24),
  new THREE.Vector3(24, 0, -24),
  new THREE.Vector3(0, 0, -28),
  new THREE.Vector3(0, 0, 28),
  new THREE.Vector3(-28, 0, 0),
  new THREE.Vector3(28, 0, 0)
];

const HIGH_SCORE_KEY = 'tactical_strike_apocalypse_highscore_v1';

export class ShooterGame {
  constructor(container, callbacks, mpClient) {
    this.container = container;
    this.callbacks = callbacks; // { onHudUpdate, onCombo, onKillFeed, onPauseChange, onGameOver }
    this.mp = mpClient;

    this.mode = 'arena'; // 'arena' | 'apocalypse'
    this.sceneName = 'forest'; // 'forest' | 'desert' | 'building' | 'city' | 'apocalypse'
    this.isPaused = false;
    this.isDisposed = false;
    this.thirdPerson = false;
    this.pointerLocked = false;

    // Three.js core
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 260);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.container.appendChild(this.renderer.domElement);

    // Player physics & state
    this.player = {
      pos: new THREE.Vector3(0, 0, 0),
      vel: new THREE.Vector3(),
      yaw: 0,
      pitch: 0,
      hp: 100,
      maxHp: 100,
      alive: true,
      respawnTimer: 0,
      grounded: true,
      sliding: false,
      slideTimer: 0,
      slideDir: new THREE.Vector3(),
      weaponKey: 'rifle',
      ammo: { rifle: 30, shotgun: 8, pistol: 15 },
      reloading: false,
      reloadTimer: 0,
      fireCooldown: 0,
      meleeCooldown: 0,
      grenades: 4,
      grenadeCooldown: 0,
      torchOn: false,
      aiming: false,
      kills: 0,
      deaths: 0,
      level: 1,
      lives: 3, // Used in Solo Apocalypse
      invulnTimer: 0,
      streakCount: 0,
      streakTimer: 0,
      footstepTimer: 0
    };

    // Match & apocalypse timers
    this.matchTimeLeft = 300;
    this.matchEnded = false;
    this.apocWaveRemaining = 0;
    this.apocSpawnQueue = 0;
    this.apocSpawnTimer = 0;
    this.highScore = this._loadHighScore();

    // World & entity collections
    this.worldGroup = new THREE.Group();
    this.scene.add(this.worldGroup);
    this.colliders = []; // { minX, maxX, minY, maxY, minZ, maxZ }
    this.bots = [];
    this.zombies = [];
    this.remotePlayers = new Map();
    this.grenades = [];
    this.tracers = [];
    this.particles = [];
    this.pickups = [];

    // Camera recoil & screen shake
    this.recoilPitch = 0;
    this.shakeTime = 0;
    this.shakeIntensity = 0;

    // Input state (Keyboard/Mouse + Mobile Touch Joystick/Look)
    this.keys = {};
    this.mouseDown = false;
    this.touchMoveX = 0;
    this.touchMoveY = 0;
    this.touchFire = false;
    this.lastNetSync = 0;

    // Local 3D player mesh (for TPS view) + FP weapon holder + Torch Spotlight
    this.localOperatorMesh = createOperatorMesh('ALPHA');
    this.localOperatorMesh.visible = false;
    this.scene.add(this.localOperatorMesh);

    this.fpHolder = new THREE.Group();
    this.camera.add(this.fpHolder);
    this.scene.add(this.camera);

    this.weaponModels = {
      rifle: createWeaponViewModel('rifle'),
      shotgun: createWeaponViewModel('shotgun'),
      pistol: createWeaponViewModel('pistol')
    };
    Object.values(this.weaponModels).forEach(m => {
      m.position.set(0.28, -0.26, -0.45);
      this.fpHolder.add(m);
    });
    this._selectWeapon('rifle', true);

    // Torch / Flashlight attached to camera
    this.torchLight = new THREE.SpotLight(0xfff4d6, 0, 44, Math.PI / 4.8, 0.45, 1.25);
    this.torchLight.position.set(0.18, -0.1, 0);
    this.torchTarget = new THREE.Object3D();
    this.torchTarget.position.set(0, 0, -10);
    this.camera.add(this.torchLight);
    this.camera.add(this.torchTarget);
    this.torchLight.target = this.torchTarget;

    // Subtle muzzle point light
    this.muzzleLight = new THREE.PointLight(0xffb84d, 0, 12);
    this.muzzleLight.position.set(0.25, -0.15, -1.2);
    this.camera.add(this.muzzleLight);

    this._bindEvents();
    this._bindMultiplayer();

    this.clock = new THREE.Clock();
    this._loop = this._loop.bind(this);
  }

  _loadHighScore() {
    try {
      const raw = localStorage.getItem(HIGH_SCORE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return { bestLevel: 1, bestKills: 0 };
  }

  _saveHighScore() {
    let changed = false;
    if (this.player.level > this.highScore.bestLevel) {
      this.highScore.bestLevel = this.player.level;
      changed = true;
    }
    if (this.player.kills > this.highScore.bestKills) {
      this.highScore.bestKills = this.player.kills;
      changed = true;
    }
    if (changed) {
      try {
        localStorage.setItem(HIGH_SCORE_KEY, JSON.stringify(this.highScore));
      } catch {}
    }
  }

  start({ mode = 'arena', sceneName = 'forest', spawn = null }) {
    this.mode = mode;
    this.sceneName = mode === 'apocalypse' ? 'apocalypse' : sceneName;
    this.isPaused = false;
    this.matchEnded = false;

    this._resetPlayerState(spawn);
    this._buildEnvironment(this.sceneName);

    if (this.mode === 'apocalypse') {
      this.player.torchOn = true;
      this.torchLight.intensity = 65;
      audio.playMusic('apocalypse');
      this._startApocalypseWave(1);
    } else {
      this.player.torchOn = false;
      this.torchLight.intensity = 0;
      audio.playMusic('shooter');
      this._spawnArenaBots();
    }

    this.clock.start();
    this._pushHud();
    requestAnimationFrame(this._loop);
  }

  _resetPlayerState(spawn = null) {
    const p = this.player;
    const sp = spawn
      ? new THREE.Vector3(spawn.x, 0, spawn.z)
      : this.mode === 'apocalypse'
        ? new THREE.Vector3(0, 0, 0)
        : ARENA_SPAWNS[Math.floor(Math.random() * ARENA_SPAWNS.length)].clone();
    p.pos.copy(sp);
    p.pos.y = this._getTerrainHeight(p.pos.x, p.pos.z);
    p.vel.set(0, 0, 0);
    p.yaw = 0;
    p.pitch = 0;
    p.hp = 100;
    p.alive = true;
    p.respawnTimer = 0;
    p.sliding = false;
    p.slideTimer = 0;
    p.ammo = { rifle: 30, shotgun: 8, pistol: 15 };
    p.reloading = false;
    p.grenades = 4;
    p.kills = 0;
    p.deaths = 0;
    p.level = 1;
    p.lives = 3;
    p.invulnTimer = 0;
    p.streakCount = 0;
    this.matchTimeLeft = 300;
    this._selectWeapon('rifle', true);
  }

  restart() {
    this.matchEnded = false;
    this.isPaused = false;
    this._clearEntities();
    this._resetPlayerState();
    if (this.mode === 'apocalypse') {
      this.player.torchOn = true;
      this.torchLight.intensity = 65;
      this._startApocalypseWave(1);
    } else {
      if (this.mp && this.mp.roomState) {
        this.mp.send({ type: 'restart_match' });
      }
      this._spawnArenaBots();
    }
    this._pushHud();
  }

  changeScene(sceneName) {
    if (this.mode === 'apocalypse') return;
    this.sceneName = sceneName;
    this._clearEntities();
    this._buildEnvironment(sceneName);
    this._resetPlayerState();
    this._spawnArenaBots();
    if (this.mp && this.mp.roomState) {
      this.mp.send({ type: 'change_scene', scene: sceneName });
    }
    this._pushHud();
  }

  toggleCameraView() {
    this.thirdPerson = !this.thirdPerson;
    this.fpHolder.visible = !this.thirdPerson;
    this.localOperatorMesh.visible = this.thirdPerson;
    this.callbacks.onCombo?.(this.thirdPerson ? 'CAMERA: THIRD-PERSON VIEW' : 'CAMERA: FIRST-PERSON VIEW');
    this._pushHud();
  }

  setPaused(paused) {
    this.isPaused = paused;
    if (paused && document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock();
    }
    this.callbacks.onPauseChange?.(paused);
  }

  requestPointerLock() {
    if ('ontouchstart' in window && navigator.maxTouchPoints > 0) return;
    if (!this.isPaused && !this.matchEnded && this.renderer?.domElement) {
      this.renderer.domElement.requestPointerLock?.();
    }
  }

  // --- MOBILE TOUCH CONTROL APIS ---

  setTouchMove(x, y) {
    this.touchMoveX = x;
    this.touchMoveY = y;
  }

  addTouchLook(dx, dy) {
    if (this.isPaused || this.matchEnded) return;
    const sens = this.player.aiming ? 0.0032 : 0.0052;
    this.player.yaw -= dx * sens;
    this.player.pitch = Math.max(-1.35, Math.min(1.35, this.player.pitch - dy * sens));
  }

  setTouchFire(down) {
    this.touchFire = down;
    if (down && !this.isPaused && !this.matchEnded) {
      audio.init();
      this._shoot();
    }
  }

  setTouchAim(down) {
    this.player.aiming = down;
  }

  triggerTouchAction(action) {
    if (this.isPaused || this.matchEnded) return;
    audio.init();
    const p = this.player;
    if (action === 'jump' && p.grounded && p.alive) {
      p.vel.y = 9.2;
      p.grounded = false;
    } else if (action === 'bomb') {
      this._throwGrenade();
    } else if (action === 'reload') {
      this._startReload();
    } else if (action === 'punch') {
      this._meleePunch();
    } else if (action === 'torch') {
      p.torchOn = !p.torchOn;
      this.torchLight.intensity = p.torchOn ? 65 : 0;
      audio.playFlashlightClick();
      this._pushHud();
    } else if (action === 'slide' && !p.sliding && p.grounded && p.alive) {
      const fwd = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw)).normalize();
      p.sliding = true;
      p.slideTimer = 0.55;
      p.slideDir.copy(fwd);
      audio.playSlide();
      this.callbacks.onCombo?.('COMBO: TACTICAL POWER SLIDE!');
    } else if (action === 'next_weapon') {
      const order = ['rifle', 'shotgun', 'pistol'];
      const next = order[(order.indexOf(p.weaponKey) + 1) % order.length];
      this._selectWeapon(next);
    }
  }

  // --- TERRAIN HEIGHT & REALISTIC ENVIRONMENTS ---

  _getTerrainHeight(x, z) {
    if (this.sceneName === 'desert') {
      // High rolling desert hills & dunes!
      const h1 = Math.sin(x * 0.08) * Math.cos(z * 0.08) * 3.4;
      const h2 = Math.sin((x + z) * 0.05) * 2.2;
      const bowl = Math.max(0, (Math.hypot(x, z) - 24) * 0.22);
      return Math.max(0, h1 + h2 + 2.8 + bowl * 0.6);
    }
    if (this.sceneName === 'forest') {
      return (Math.sin(x * 0.07) * Math.cos(z * 0.09) * 0.85) + 0.6;
    }
    return 0;
  }

  _clearEntities() {
    this.bots.forEach(b => this.scene.remove(b.mesh));
    this.bots = [];
    this.zombies.forEach(z => this.scene.remove(z.mesh));
    this.zombies = [];
    this.grenades.forEach(g => this.scene.remove(g.mesh));
    this.grenades = [];
    this.tracers.forEach(t => this.scene.remove(t.line));
    this.tracers = [];
    this.particles.forEach(p => this.scene.remove(p.mesh));
    this.particles = [];
    this.pickups.forEach(pk => this.scene.remove(pk.mesh));
    this.pickups = [];
  }

  _addBoxCollider(x, y, z, w, h, d, material, castShadow = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    this.worldGroup.add(mesh);
    this.colliders.push({
      minX: x - w / 2,
      maxX: x + w / 2,
      minY: y - h / 2,
      maxY: y + h / 2,
      minZ: z - d / 2,
      maxZ: z + d / 2
    });
    return mesh;
  }

  _buildEnvironment(name) {
    while (this.worldGroup.children.length > 0) {
      this.worldGroup.remove(this.worldGroup.children[0]);
    }
    this.colliders = [];

    // Common lighting reset
    const hemi = new THREE.HemisphereLight(0xffffff, 0x333333, 0.7);
    const sun = new THREE.DirectionalLight(0xfff5e4, 1.35);
    sun.position.set(38, 62, 28);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 160;
    const sc = 50;
    sun.shadow.camera.left = -sc;
    sun.shadow.camera.right = sc;
    sun.shadow.camera.top = sc;
    sun.shadow.camera.bottom = -sc;

    if (name === 'apocalypse') {
      // DARK ZOMBIE APOCALYPSE ENCLOSED BUNKER ROOM
      this.scene.background = new THREE.Color(0x060709);
      this.scene.fog = new THREE.FogExp2(0x06080a, 0.048);
      hemi.intensity = 0.16;
      hemi.color.setHex(0x3a4a55);
      hemi.groundColor.setHex(0x111214);
      sun.intensity = 0.12;
      this.worldGroup.add(hemi, sun);

      const floorMat = new THREE.MeshStandardMaterial({ map: getBunkerFloorTexture(10), roughness: 0.85, metalness: 0.1 });
      const wallMat = new THREE.MeshStandardMaterial({ map: getConcreteTexture(6, true), roughness: 0.9 });
      const crateMat = new THREE.MeshStandardMaterial({ map: getCrateTexture(), roughness: 0.8 });

      const floor = new THREE.Mesh(new THREE.PlaneGeometry(44, 44), floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      this.worldGroup.add(floor);

      const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(44, 44), wallMat);
      ceiling.rotation.x = Math.PI / 2;
      ceiling.position.y = 8.5;
      this.worldGroup.add(ceiling);

      // Perimeter walls with dark breach alcoves front (z=-20) and back (z=+20)
      this._addBoxCollider(-21, 4.25, 0, 2, 8.5, 44, wallMat, false);
      this._addBoxCollider(21, 4.25, 0, 2, 8.5, 44, wallMat, false);
      this._addBoxCollider(0, 4.25, -21, 44, 8.5, 2, wallMat, false);
      this._addBoxCollider(0, 4.25, 21, 44, 8.5, 2, wallMat, false);

      // Glowing red breach warning lights front & back so players know zombies flank from behind & front
      [
        [0, 5.5, -19.2],
        [0, 5.5, 19.2],
        [-18.8, 5.5, 0],
        [18.8, 5.5, 0]
      ].forEach(([x, y, z]) => {
        const bulb = new THREE.Mesh(
          new THREE.BoxGeometry(1.4, 0.25, 0.25),
          new THREE.MeshBasicMaterial({ color: 0xef4444 })
        );
        bulb.position.set(x, y, z);
        this.worldGroup.add(bulb);
        const pl = new THREE.PointLight(0xdc2626, 8, 16);
        pl.position.set(x, y - 0.5, z);
        this.worldGroup.add(pl);
      });

      // Structural columns & tactical cover crates inside the room
      const pillars = [[-9, -9], [9, -9], [-9, 9], [9, 9]];
      pillars.forEach(([px, pz]) => {
        this._addBoxCollider(px, 4.25, pz, 2.2, 8.5, 2.2, wallMat);
      });
      [[-4, -12], [5, 11], [-12, 3], [12, -4]].forEach(([cx, cz]) => {
        this._addBoxCollider(cx, 1.0, cz, 2.4, 2.0, 2.4, crateMat);
      });
      return;
    }

    // Outdoor/Urban Arenas
    this.worldGroup.add(hemi, sun);
    const size = 90;

    if (name === 'forest') {
      this.scene.background = new THREE.Color(0x6c8ca3);
      this.scene.fog = new THREE.FogExp2(0x6c8ca3, 0.012);
      hemi.color.setHex(0xb7d8e8);
      hemi.groundColor.setHex(0x283b22);
      sun.color.setHex(0xfff1d6);

      // Displaced forest ground
      const geo = new THREE.PlaneGeometry(size, size, 48, 48);
      geo.rotateX(-Math.PI / 2);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        pos.setY(i, this._getTerrainHeight(pos.getX(i), pos.getZ(i)));
      }
      geo.computeVertexNormals();
      const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: getGrassTexture(16), roughness: 0.95 }));
      ground.receiveShadow = true;
      this.worldGroup.add(ground);

      const barkMat = new THREE.MeshStandardMaterial({ map: getBarkTexture(), roughness: 0.9 });
      const leafMat = new THREE.MeshStandardMaterial({ color: 0x204722, roughness: 0.85 });
      const rockMat = new THREE.MeshStandardMaterial({ map: getConcreteTexture(2, true), color: 0x6b7068, roughness: 0.92 });
      const crateMat = new THREE.MeshStandardMaterial({ map: getCrateTexture(), roughness: 0.8 });

      // Dense pines & boulders
      for (let i = 0; i < 42; i++) {
        const angle = (i / 42) * Math.PI * 2 + (i % 3) * 0.4;
        const dist = 10 + ((i * 19) % 28);
        const tx = Math.cos(angle) * dist;
        const tz = Math.sin(angle) * dist;
        if (Math.hypot(tx, tz) < 7) continue;
        const ty = this._getTerrainHeight(tx, tz);
        const h = 6 + (i % 4) * 1.8;
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.48, h, 7), barkMat);
        trunk.position.set(tx, ty + h / 2, tz);
        trunk.castShadow = true;
        this.worldGroup.add(trunk);
        for (let k = 0; k < 3; k++) {
          const cone = new THREE.Mesh(new THREE.ConeGeometry(2.6 - k * 0.55, 3.8, 7), leafMat);
          cone.position.set(tx, ty + h * 0.52 + k * 2.0, tz);
          cone.castShadow = true;
          this.worldGroup.add(cone);
        }
        this.colliders.push({
          minX: tx - 0.6, maxX: tx + 0.6,
          minY: ty, maxY: ty + h,
          minZ: tz - 0.6, maxZ: tz + 0.6
        });
      }

      // Tactical rocks, bunkers & timber cover
      [
        [0, 0, 3.2, 2.2, 3.2],
        [-12, -8, 4.5, 2.0, 2.2],
        [14, 10, 3.8, 2.4, 2.6],
        [-14, 12, 2.8, 2.1, 4.5],
        [12, -14, 4.2, 2.2, 2.5]
      ].forEach(([x, z, w, h, d]) => {
        const y = this._getTerrainHeight(x, z);
        this._addBoxCollider(x, y + h / 2, z, w, h, d, rockMat);
      });
      [[-6, 8], [8, -6], [-8, -14], [16, 0]].forEach(([x, z]) => {
        const y = this._getTerrainHeight(x, z);
        this._addBoxCollider(x, y + 1.1, z, 2.4, 2.2, 2.4, crateMat);
      });
    } else if (name === 'desert') {
      // DESERT WITH HIGH HILLS & DUNES
      this.scene.background = new THREE.Color(0xe6be8a);
      this.scene.fog = new THREE.FogExp2(0xe2b882, 0.01);
      hemi.color.setHex(0xffe6ba);
      hemi.groundColor.setHex(0x8c6239);
      sun.color.setHex(0xffe4a8);
      sun.intensity = 1.6;

      const geo = new THREE.PlaneGeometry(size, size, 64, 64);
      geo.rotateX(-Math.PI / 2);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        pos.setY(i, this._getTerrainHeight(pos.getX(i), pos.getZ(i)));
      }
      geo.computeVertexNormals();
      const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: getSandTexture(16), roughness: 0.92 }));
      ground.receiveShadow = true;
      this.worldGroup.add(ground);

      const sandstoneMat = new THREE.MeshStandardMaterial({ map: getSandTexture(2), color: 0xb87b4b, roughness: 0.88 });
      const crateMat = new THREE.MeshStandardMaterial({ map: getCrateTexture(), roughness: 0.8 });

      // Towering desert mesas / rock outcrops & military outpost walls
      [
        [-16, -14, 7, 7.5, 6],
        [18, 12, 8, 9.0, 7],
        [-18, 16, 6, 6.2, 7],
        [16, -18, 7, 8.2, 6],
        [0, 14, 6, 3.0, 2.2],
        [0, -14, 6, 3.0, 2.2]
      ].forEach(([x, z, w, h, d]) => {
        const y = this._getTerrainHeight(x, z);
        this._addBoxCollider(x, y + h / 2 - 1, z, w, h, d, sandstoneMat);
      });

      [[-6, -4], [7, 5], [-8, 7], [9, -7], [0, 0]].forEach(([x, z]) => {
        const y = this._getTerrainHeight(x, z);
        this._addBoxCollider(x, y + 1.1, z, 2.6, 2.2, 2.6, crateMat);
      });
    } else if (name === 'building') {
      // UNCOMPLETED CONSTRUCTION BUILDING SITE
      this.scene.background = new THREE.Color(0x9bb2c9);
      this.scene.fog = new THREE.FogExp2(0x9bb2c9, 0.009);
      const floorMat = new THREE.MeshStandardMaterial({ map: getConcreteTexture(14, false), roughness: 0.9 });
      const rawConcMat = new THREE.MeshStandardMaterial({ map: getConcreteTexture(3, false), roughness: 0.88 });
      const brickMat = new THREE.MeshStandardMaterial({ map: getBrickTexture(2), roughness: 0.9 });
      const steelMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.5, metalness: 0.7 });
      const woodMat = new THREE.MeshStandardMaterial({ map: getCrateTexture(), roughness: 0.85 });

      const ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), floorMat);
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      this.worldGroup.add(ground);

      // Unfinished concrete structural grid pillars + exposed upper floor slabs
      for (let gx = -24; gx <= 24; gx += 12) {
        for (let gz = -24; gz <= 24; gz += 12) {
          if (gx === 0 && gz === 0) continue;
          this._addBoxCollider(gx, 5.5, gz, 1.3, 11, 1.3, rawConcMat);
          // Rebar steel rods sticking out the top
          for (let r = 0; r < 3; r++) {
            const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 5), steelMat);
            bar.position.set(gx + (r - 1) * 0.3, 12.0, gz);
            this.worldGroup.add(bar);
          }
        }
      }

      // Partial unplastered cinderblock/brick walls & construction scaffolding
      [
        [-12, 1.8, -6, 10, 3.6, 0.8],
        [12, 1.8, 6, 10, 3.6, 0.8],
        [6, 1.8, -12, 0.8, 3.6, 10],
        [-6, 1.8, 12, 0.8, 3.6, 10],
        [0, 1.4, -18, 12, 2.8, 0.9],
        [0, 1.4, 18, 12, 2.8, 0.9]
      ].forEach(([x, y, z, w, h, d]) => {
        this._addBoxCollider(x, y, z, w, h, d, brickMat);
      });

      // Overhead unfinished concrete ceiling deck slabs (open to sky in center!)
      [
        [-18, 9.5, -18, 14, 0.8, 14],
        [18, 9.5, 18, 14, 0.8, 14],
        [-18, 9.5, 18, 14, 0.8, 14],
        [18, 9.5, -18, 14, 0.8, 14]
      ].forEach(([x, y, z, w, h, d]) => {
        const slab = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), rawConcMat);
        slab.position.set(x, y, z);
        slab.castShadow = true;
        slab.receiveShadow = true;
        this.worldGroup.add(slab);
      });

      // Timber stacks & crates
      [[-4, 1, 0], [4, 1, 0], [0, 1, 6], [0, 1, -6]].forEach(([x, y, z]) => {
        this._addBoxCollider(x, y, z, 2.8, 2.0, 2.2, woodMat);
      });
    } else {
      // URBAN CITY ARENA
      this.scene.background = new THREE.Color(0x1f2b3d);
      this.scene.fog = new THREE.FogExp2(0x1f2b3d, 0.011);
      hemi.color.setHex(0x8aa8cc);
      hemi.groundColor.setHex(0x1d2026);
      sun.color.setHex(0xffd7a8);
      sun.intensity = 1.25;

      const road = new THREE.Mesh(
        new THREE.PlaneGeometry(size, size),
        new THREE.MeshStandardMaterial({ map: getAsphaltTexture(12), roughness: 0.85 })
      );
      road.rotation.x = -Math.PI / 2;
      road.receiveShadow = true;
      this.worldGroup.add(road);

      const facadeMat = new THREE.MeshStandardMaterial({ map: getBuildingFacadeTexture(2, 3), roughness: 0.6, metalness: 0.2 });
      const barrierMat = new THREE.MeshStandardMaterial({ map: getConcreteTexture(2, false), roughness: 0.85 });
      const carMat1 = new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.35, metalness: 0.65 });
      const carMat2 = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.35, metalness: 0.65 });

      // City tower blocks framing streets & alleyways
      [
        [-22, 11, -22, 13, 22, 13],
        [22, 14, -22, 13, 28, 13],
        [-22, 13, 22, 13, 26, 13],
        [22, 10, 22, 13, 20, 13],
        [-24, 8, 0, 10, 16, 11],
        [24, 9, 0, 10, 18, 11]
      ].forEach(([x, y, z, w, h, d]) => {
        this._addBoxCollider(x, y, z, w, h, d, facadeMat);
      });

      // Street jersey barriers & parked tactical vehicles
      [
        [-6, 0.9, -10, 5, 1.8, 1.0],
        [6, 0.9, 10, 5, 1.8, 1.0],
        [10, 0.9, -6, 1.0, 1.8, 5],
        [-10, 0.9, 6, 1.0, 1.8, 5]
      ].forEach(([x, y, z, w, h, d]) => {
        this._addBoxCollider(x, y, z, w, h, d, barrierMat);
      });

      // Cars for cover
      [[-4, 0, 2, carMat1], [6, 0, -4, carMat2], [0, 0, -18, carMat1]].forEach(([x, y, z, cm]) => {
        this._addBoxCollider(x, 0.85, z, 2.3, 1.7, 4.4, cm);
      });

      // Warm glowing streetlamps
      [[-12, -12], [12, -12], [-12, 12], [12, 12]].forEach(([lx, lz]) => {
        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.12, 0.16, 7.5, 6),
          new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.7 })
        );
        pole.position.set(lx, 3.75, lz);
        this.worldGroup.add(pole);
        const lamp = new THREE.PointLight(0xffb85c, 16, 22);
        lamp.position.set(lx, 7.3, lz);
        this.worldGroup.add(lamp);
      });
    }

    // Invisible outer arena boundary walls
    const boundMat = new THREE.MeshStandardMaterial({ color: 0x334155, transparent: true, opacity: 0.14 });
    const half = 41;
    this._addBoxCollider(0, 5, -half, 84, 10, 2, boundMat, false);
    this._addBoxCollider(0, 5, half, 84, 10, 2, boundMat, false);
    this._addBoxCollider(-half, 5, 0, 2, 10, 84, boundMat, false);
    this._addBoxCollider(half, 5, 0, 2, 10, 84, boundMat, false);
  }

  // --- ARENA BOTS & ZOMBIE APOCALYPSE WAVES ---

  _spawnArenaBots() {
    this.bots.forEach(b => this.scene.remove(b.mesh));
    this.bots = [];
    // If playing solo or fewer than 3 real players, spawn tactical AI enemies so arena is immediately exciting
    const humanCount = this.mp?.roomState?.players?.length || 1;
    const botCount = humanCount <= 1 ? 4 : Math.max(0, 4 - humanCount);

    for (let i = 0; i < botCount; i++) {
      const sp = ARENA_SPAWNS[(i + 2) % ARENA_SPAWNS.length].clone();
      sp.y = this._getTerrainHeight(sp.x, sp.z);
      const mesh = createOperatorMesh('BRAVO');
      mesh.position.copy(sp);
      this.scene.add(mesh);
      this.bots.push({
        id: `BOT-${i + 1}`,
        team: 'BRAVO',
        mesh,
        pos: sp,
        hp: 100,
        maxHp: 100,
        alive: true,
        respawnTimer: 0,
        fireTimer: 1 + Math.random() * 1.5,
        strafeDir: Math.random() > 0.5 ? 1 : -1,
        strafeTimer: 2 + Math.random() * 2
      });
    }
  }

  _startApocalypseWave(level) {
    this.player.level = level;
    const totalCount = 5 + level * 3;
    this.apocWaveRemaining = totalCount;
    this.apocSpawnQueue = totalCount;
    this.apocSpawnTimer = 0.6;
    this.player.grenades = Math.min(6, this.player.grenades + 1);
    this.callbacks.onCombo?.(`APOCALYPSE LEVEL ${level} — ${totalCount} ZOMBIES INCOMING!`);
    this._saveHighScore();
    this._pushHud();
  }

  _spawnZombie() {
    const level = this.player.level;
    // Zombies spawn from BOTH front and behind breach doors!
    const breachPoints = [
      new THREE.Vector3((Math.random() - 0.5) * 8, 0, -18.5), // Front corridor
      new THREE.Vector3((Math.random() - 0.5) * 8, 0, 18.5),  // Behind corridor
      new THREE.Vector3(-18.5, 0, (Math.random() - 0.5) * 8), // Left flank
      new THREE.Vector3(18.5, 0, (Math.random() - 0.5) * 8)   // Right flank
    ];
    const sp = breachPoints[Math.floor(Math.random() * breachPoints.length)];

    let variant = 'walker';
    const roll = Math.random();
    if (level >= 3 && roll > 0.78) variant = 'brute';
    else if (level >= 2 && roll > 0.48) variant = 'runner';

    const mesh = createZombieMesh(variant);
    mesh.position.copy(sp);
    this.scene.add(mesh);

    const hp = variant === 'brute' ? 145 + level * 22 : variant === 'runner' ? 55 + level * 8 : 75 + level * 12;
    const speed = variant === 'runner' ? 5.6 + level * 0.28 : variant === 'brute' ? 2.7 + level * 0.14 : 3.4 + level * 0.18;

    this.zombies.push({
      id: `Z-${Math.random().toString(36).slice(2, 7)}`,
      variant,
      mesh,
      pos: sp.clone(),
      hp,
      maxHp: hp,
      speed,
      attackCooldown: 0,
      growlTimer: 1.5 + Math.random() * 4
    });
  }

  // --- WEAPONS, GRENADES & COMBOS ---

  _selectWeapon(key, silent = false) {
    if (!WEAPONS[key]) return;
    this.player.weaponKey = key;
    this.player.reloading = false;
    Object.entries(this.weaponModels).forEach(([k, m]) => {
      m.visible = k === key;
    });
    if (!silent) {
      audio.playReload();
      this._pushHud();
    }
  }

  _startReload() {
    const p = this.player;
    const w = WEAPONS[p.weaponKey];
    if (p.reloading || p.ammo[p.weaponKey] >= w.magSize) return;
    p.reloading = true;
    p.reloadTimer = w.reloadTime;
    audio.playReload();
    this._pushHud();
  }

  _shoot() {
    const p = this.player;
    if (!p.alive || p.reloading || p.fireCooldown > 0) return;
    const w = WEAPONS[p.weaponKey];
    if (p.ammo[p.weaponKey] <= 0) {
      this._startReload();
      return;
    }

    p.ammo[p.weaponKey] -= 1;
    p.fireCooldown = w.fireRate;
    audio.playGunshot(p.weaponKey);

    // Muzzle flash & recoil
    this.recoilPitch += p.weaponKey === 'shotgun' ? 0.065 : p.weaponKey === 'pistol' ? 0.032 : 0.022;
    const vm = this.weaponModels[p.weaponKey];
    if (vm?.userData.flash) {
      vm.userData.flash.material.opacity = 1;
      vm.userData.flash.rotation.z = Math.random() * Math.PI;
    }
    this.muzzleLight.intensity = 10;

    // Slide-Shot combo bonus!
    const dmgMultiplier = p.sliding ? 1.45 : 1.0;

    const rayOrigin = this.camera.getWorldPosition(new THREE.Vector3());
    const baseDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();

    if (this.mp?.roomState && this.mode === 'arena') {
      this.mp.send({
        type: 'shoot',
        weapon: p.weaponKey,
        origin: { x: rayOrigin.x, y: rayOrigin.y, z: rayOrigin.z },
        dir: { x: baseDir.x, y: baseDir.y, z: baseDir.z }
      });
    }

    for (let i = 0; i < w.pellets; i++) {
      const spread = p.aiming ? w.spread * 0.45 : w.spread;
      const dir = baseDir.clone();
      dir.x += (Math.random() - 0.5) * spread;
      dir.y += (Math.random() - 0.5) * spread;
      dir.z += (Math.random() - 0.5) * spread;
      dir.normalize();

      this._fireBulletRay(rayOrigin, dir, w.damage * dmgMultiplier, w.range, p.sliding);
    }

    if (p.ammo[p.weaponKey] === 0) {
      this._startReload();
    }
    this._pushHud();
  }

  _fireBulletRay(origin, dir, damage, maxDist, wasSliding = false) {
    let bestDist = maxDist;
    let hitType = null;
    let hitTarget = null;
    let hitPoint = origin.clone().addScaledVector(dir, maxDist);

    // Check world obstacles first using simple ray-box test
    const ray = new THREE.Ray(origin, dir);
    const box = new THREE.Box3();
    const tmpPt = new THREE.Vector3();
    for (const c of this.colliders) {
      box.min.set(c.minX, c.minY, c.minZ);
      box.max.set(c.maxX, c.maxY, c.maxZ);
      if (ray.intersectBox(box, tmpPt)) {
        const d = origin.distanceTo(tmpPt);
        if (d < bestDist) {
          bestDist = d;
          hitPoint.copy(tmpPt);
          hitType = 'wall';
        }
      }
    }

    // Check zombies
    for (const z of this.zombies) {
      box.min.set(z.pos.x - 0.55, z.pos.y, z.pos.z - 0.55);
      box.max.set(z.pos.x + 0.55, z.pos.y + 1.95, z.pos.z + 0.55);
      if (ray.intersectBox(box, tmpPt)) {
        const d = origin.distanceTo(tmpPt);
        if (d < bestDist) {
          bestDist = d;
          hitPoint.copy(tmpPt);
          hitType = 'zombie';
          hitTarget = z;
        }
      }
    }

    // Check arena bots
    for (const b of this.bots) {
      if (!b.alive) continue;
      box.min.set(b.pos.x - 0.55, b.pos.y, b.pos.z - 0.55);
      box.max.set(b.pos.x + 0.55, b.pos.y + 1.95, b.pos.z + 0.55);
      if (ray.intersectBox(box, tmpPt)) {
        const d = origin.distanceTo(tmpPt);
        if (d < bestDist) {
          bestDist = d;
          hitPoint.copy(tmpPt);
          hitType = 'bot';
          hitTarget = b;
        }
      }
    }

    // Check remote multiplayer players
    for (const [rid, rp] of this.remotePlayers.entries()) {
      if (!rp.alive) continue;
      box.min.set(rp.mesh.position.x - 0.55, rp.mesh.position.y, rp.mesh.position.z - 0.55);
      box.max.set(rp.mesh.position.x + 0.55, rp.mesh.position.y + 1.95, rp.mesh.position.z + 0.55);
      if (ray.intersectBox(box, tmpPt)) {
        const d = origin.distanceTo(tmpPt);
        if (d < bestDist) {
          bestDist = d;
          hitPoint.copy(tmpPt);
          hitType = 'remote';
          hitTarget = rid;
        }
      }
    }

    // Bullet tracer line
    const startVisual = this.thirdPerson
      ? this.player.pos.clone().add(new THREE.Vector3(0, 1.4, 0))
      : origin.clone().add(new THREE.Vector3(0, -0.1, 0)).addScaledVector(dir, 0.7);
    this._spawnTracer(startVisual, hitPoint, 0xffe082);

    if (hitType === 'wall') {
      this._spawnSparks(hitPoint, 0xfbbf24, 5);
    } else if (hitType === 'zombie' && hitTarget) {
      this._spawnSparks(hitPoint, 0x84cc16, 7);
      this.callbacks.onHitMarker?.(false);
      this._damageZombie(hitTarget, damage, wasSliding ? 'SLIDE SHOT' : null);
    } else if (hitType === 'bot' && hitTarget) {
      this._spawnSparks(hitPoint, 0xef4444, 7);
      this.callbacks.onHitMarker?.(false);
      this._damageBot(hitTarget, damage, wasSliding ? 'SLIDE SHOT' : null);
    } else if (hitType === 'remote' && hitTarget) {
      this._spawnSparks(hitPoint, 0xef4444, 8);
      this.callbacks.onHitMarker?.(false);
      this.mp.send({
        type: 'hit_player',
        targetId: hitTarget,
        damage: Math.round(damage),
        weapon: this.player.weaponKey
      });
    }
  }

  _throwGrenade() {
    const p = this.player;
    if (!p.alive || p.grenades <= 0 || p.grenadeCooldown > 0) return;
    p.grenades -= 1;
    p.grenadeCooldown = 0.85;
    audio.playGrenadeThrow();

    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    const isAirBurst = !p.grounded;
    const speed = isAirBurst ? 24 : 17.5;
    if (isAirBurst) {
      audio.playComboChime();
      this.callbacks.onCombo?.('COMBO: AIR-BURST BOMB THROW!');
    }

    const origin = this.player.pos.clone().add(new THREE.Vector3(0, 1.55, 0)).addScaledVector(dir, 0.7);
    const vel = dir.multiplyScalar(speed).add(new THREE.Vector3(0, isAirBurst ? 6.5 : 4.8, 0));

    this._spawnGrenadeMesh(origin, vel, true);

    if (this.mp?.roomState && this.mode === 'arena') {
      this.mp.send({
        type: 'grenade',
        origin: { x: origin.x, y: origin.y, z: origin.z },
        vel: { x: vel.x, y: vel.y, z: vel.z }
      });
    }
    this._pushHud();
  }

  _spawnGrenadeMesh(origin, vel, ownedByLocal) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 10, 10),
      new THREE.MeshStandardMaterial({ color: 0x365314, roughness: 0.4, metalness: 0.6, emissive: 0xef4444, emissiveIntensity: 0.5 })
    );
    mesh.position.copy(origin);
    mesh.castShadow = true;
    this.scene.add(mesh);
    this.grenades.push({
      mesh,
      pos: origin.clone(),
      vel: vel.clone(),
      fuse: 2.0,
      ownedByLocal
    });
  }

  _explodeGrenade(g) {
    this.scene.remove(g.mesh);
    audio.playExplosion();
    this.shakeTime = 0.45;
    this.shakeIntensity = 0.35;

    // Explosion fireball & embers
    this._spawnSparks(g.pos, 0xff6b2b, 26, 12);
    const flashBall = new THREE.Mesh(
      new THREE.SphereGeometry(0.9, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xffa62b, transparent: true, opacity: 0.9 })
    );
    flashBall.position.copy(g.pos);
    this.scene.add(flashBall);
    this.particles.push({
      mesh: flashBall,
      vel: new THREE.Vector3(0, 0, 0),
      life: 0.35,
      maxLife: 0.35,
      expandRate: 18
    });

    const radius = 9.5;
    if (g.ownedByLocal) {
      // Damage zombies in blast radius
      for (let i = this.zombies.length - 1; i >= 0; i--) {
        const z = this.zombies[i];
        const d = z.pos.distanceTo(g.pos);
        if (d < radius) {
          this._damageZombie(z, (1 - d / radius) * 185, 'BOMB BLAST');
        }
      }
      // Damage bots
      for (const b of this.bots) {
        if (!b.alive) continue;
        const d = b.pos.distanceTo(g.pos);
        if (d < radius) {
          this._damageBot(b, (1 - d / radius) * 165, 'BOMB BLAST');
        }
      }
      // Damage remote players
      for (const [rid, rp] of this.remotePlayers.entries()) {
        if (!rp.alive) continue;
        const d = rp.mesh.position.distanceTo(g.pos);
        if (d < radius) {
          this.mp.send({
            type: 'hit_player',
            targetId: rid,
            damage: Math.round((1 - d / radius) * 130),
            weapon: 'bomb'
          });
        }
      }
    }
  }

  _meleePunch() {
    const p = this.player;
    if (!p.alive || p.meleeCooldown > 0) return;
    p.meleeCooldown = 0.52;
    audio.playPunch();
    this.recoilPitch += 0.04;

    const fwd = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw)).normalize();
    const isSlideBash = p.sliding;
    const dmg = isSlideBash ? 85 : 55;
    let landed = false;

    for (let i = this.zombies.length - 1; i >= 0; i--) {
      const z = this.zombies[i];
      const toZ = z.pos.clone().sub(p.pos);
      if (toZ.length() < 3.4 && toZ.normalize().dot(fwd) > 0.35) {
        z.pos.addScaledVector(fwd, 2.2);
        this._damageZombie(z, dmg, isSlideBash ? 'SLIDE BASH' : 'MELEE PUNCH');
        landed = true;
      }
    }
    for (const b of this.bots) {
      if (!b.alive) continue;
      const toB = b.pos.clone().sub(p.pos);
      if (toB.length() < 3.4 && toB.normalize().dot(fwd) > 0.35) {
        this._damageBot(b, dmg, isSlideBash ? 'SLIDE BASH' : 'MELEE PUNCH');
        landed = true;
      }
    }
    if (landed && isSlideBash) {
      audio.playComboChime();
      this.callbacks.onCombo?.('COMBO: TACTICAL SLIDE BASH!');
    }
  }

  _damageZombie(z, amount, tag = null) {
    z.hp -= amount;
    if (z.hp <= 0) {
      const idx = this.zombies.indexOf(z);
      if (idx !== -1) {
        this.zombies.splice(idx, 1);
        this.scene.remove(z.mesh);
        this._registerKill(`Zombie (${z.variant})`, tag);
        this.apocWaveRemaining = Math.max(0, this.apocWaveRemaining - 1);

        // Chance to drop medkit/ammo glow cube
        if (Math.random() < 0.25) {
          this._spawnPickup(z.pos.clone().add(new THREE.Vector3(0, 0.6, 0)));
        }
        if (this.apocWaveRemaining === 0 && this.apocSpawnQueue === 0) {
          setTimeout(() => {
            if (!this.isDisposed && this.mode === 'apocalypse' && !this.matchEnded) {
              this._startApocalypseWave(this.player.level + 1);
            }
          }, 1800);
        }
      }
    }
  }

  _damageBot(b, amount, tag = null) {
    if (!b.alive) return;
    b.hp -= amount;
    if (b.hp <= 0) {
      b.alive = false;
      b.mesh.visible = false;
      b.respawnTimer = 3.0;
      this._registerKill(b.id, tag);
    }
  }

  _registerKill(victimName, comboTag = null) {
    const p = this.player;
    p.kills += 1;
    p.streakCount += 1;
    p.streakTimer = 6.0;

    if (comboTag) {
      this.callbacks.onCombo?.(`${comboTag} ELIMINATION!`);
    } else if (p.streakCount >= 3) {
      audio.playComboChime();
      this.callbacks.onCombo?.(`${p.streakCount}x KILL STREAK!`);
    }

    this.callbacks.onKillFeed?.(`You eliminated ${victimName}`);

    if (this.mode === 'arena') {
      const newLevel = 1 + Math.floor(p.kills / 5);
      if (newLevel > p.level) {
        p.level = newLevel;
        p.grenades = Math.min(6, p.grenades + 2);
        audio.playPickup();
        this.callbacks.onCombo?.(`LEVEL UP! ARENA LEVEL ${p.level}`);
      }
    } else {
      this._saveHighScore();
    }
    this._pushHud();
  }

  _damagePlayer(amount) {
    const p = this.player;
    if (!p.alive || p.invulnTimer > 0 || this.matchEnded) return;
    p.hp = Math.max(0, p.hp - amount);
    audio.playPlayerHurt();
    this.callbacks.onDamageFlash?.();
    this.shakeTime = 0.2;
    this.shakeIntensity = 0.18;

    if (p.hp <= 0) {
      if (this.mode === 'apocalypse') {
        p.lives -= 1;
        this._saveHighScore();
        if (p.lives <= 0) {
          p.alive = false;
          this.matchEnded = true;
          if (document.pointerLockElement === this.renderer.domElement) {
            document.exitPointerLock();
          }
          this.callbacks.onGameOver?.({
            title: 'APOCALYPSE OVERRUN',
            subtitle: `All 3 lives exhausted on Level ${p.level}`,
            stats: [
              { label: 'Level Reached', value: p.level },
              { label: 'Zombies Eliminated', value: p.kills },
              { label: 'Best Level Record', value: this.highScore.bestLevel },
              { label: 'Best Kills Record', value: this.highScore.bestKills }
            ]
          });
        } else {
          // Second wind / respawn shockwave inside the room!
          p.hp = p.maxHp;
          p.invulnTimer = 2.6;
          p.pos.set((Math.random() - 0.5) * 14, 0, (Math.random() - 0.5) * 14);
          this.zombies.forEach(z => {
            const away = z.pos.clone().sub(p.pos);
            if (away.length() < 9) {
              z.pos.addScaledVector(away.normalize(), 7);
            }
          });
          this.callbacks.onCombo?.(`LIFE LOST! ${p.lives} ${p.lives === 1 ? 'LIFE' : 'LIVES'} REMAINING`);
        }
      } else {
        // Arena death -> respawn at a different location after 2.5s
        p.alive = false;
        p.deaths += 1;
        p.respawnTimer = 2.5;
        this.callbacks.onKillFeed?.('You were eliminated! Respawning at new sector...');
      }
    }
    this._pushHud();
  }

  _spawnPickup(pos) {
    const mesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.42, 0),
      new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x22c55e, emissiveIntensity: 0.7 })
    );
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.pickups.push({ mesh, pos, life: 16 });
  }

  _spawnTracer(start, end, color) {
    const geo = new THREE.BufferGeometry().setFromPoints([start, end]);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.tracers.push({ line, life: 0.065 });
  }

  _spawnSparks(pos, color, count = 6, speed = 5) {
    const geo = new THREE.BoxGeometry(0.11, 0.11, 0.11);
    const mat = new THREE.MeshBasicMaterial({ color });
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(pos);
      this.scene.add(m);
      this.particles.push({
        mesh: m,
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * speed,
          Math.random() * speed * 0.8 + 1,
          (Math.random() - 0.5) * speed
        ),
        life: 0.35 + Math.random() * 0.25,
        maxLife: 0.6,
        expandRate: 0
      });
    }
  }

  // --- IMPROVED 3D SWEPT, STEP-UP & ENTITY COLLISION ---

  _getSupportHeight(pos, radius = 0.52) {
    let supportY = this._getTerrainHeight(pos.x, pos.z);
    for (const c of this.colliders) {
      if (
        pos.x + radius > c.minX && pos.x - radius < c.maxX &&
        pos.z + radius > c.minZ && pos.z - radius < c.maxZ
      ) {
        // Standable if player's feet are near or above top surface (allows jumping on crates/cars/slabs!)
        if (pos.y >= c.maxY - 0.55 && c.maxY > supportY) {
          supportY = c.maxY;
        }
      }
    }
    return supportY;
  }

  _resolveHorizontalCollision(pos, radius = 0.56) {
    // Multi-pass resolution prevents corner tunneling during slides & sprints
    for (let pass = 0; pass < 2; pass++) {
      for (const c of this.colliders) {
        // Ignore obstacles we're standing on top of or well below
        if (pos.y >= c.maxY - 0.35 || pos.y + 1.85 <= c.minY) continue;
        const closestX = Math.max(c.minX, Math.min(pos.x, c.maxX));
        const closestZ = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
        const dx = pos.x - closestX;
        const dz = pos.z - closestZ;
        const distSq = dx * dx + dz * dz;
        if (distSq < radius * radius) {
          const dist = Math.sqrt(distSq);
          if (dist < 0.0001) {
            // Inside box fallback: push out along nearest face
            const penL = Math.abs(pos.x - c.minX);
            const penR = Math.abs(c.maxX - pos.x);
            const penB = Math.abs(pos.z - c.minZ);
            const penF = Math.abs(c.maxZ - pos.z);
            const m = Math.min(penL, penR, penB, penF);
            if (m === penL) pos.x = c.minX - radius;
            else if (m === penR) pos.x = c.maxX + radius;
            else if (m === penB) pos.z = c.minZ - radius;
            else pos.z = c.maxZ + radius;
          } else {
            const push = radius - dist;
            pos.x += (dx / dist) * push;
            pos.z += (dz / dist) * push;
          }
        }
      }
    }
  }

  _separateCircles(posA, posB, minDist, weightA = 0.5) {
    const dx = posA.x - posB.x;
    const dz = posA.z - posB.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < minDist * minDist && d2 > 0.0001) {
      const d = Math.sqrt(d2);
      const overlap = minDist - d;
      const nx = dx / d;
      const nz = dz / d;
      posA.x += nx * overlap * weightA;
      posA.z += nz * overlap * weightA;
      posB.x -= nx * overlap * (1 - weightA);
      posB.z -= nz * overlap * (1 - weightA);
    }
  }

  _clipCameraAgainstWalls(anchor, desiredCam) {
    const dir = desiredCam.clone().sub(anchor);
    const maxDist = dir.length();
    if (maxDist < 0.05) return desiredCam;
    dir.normalize();
    const ray = new THREE.Ray(anchor, dir);
    const box = new THREE.Box3();
    const hitPt = new THREE.Vector3();
    let bestDist = maxDist;
    for (const c of this.colliders) {
      box.min.set(c.minX, c.minY, c.minZ);
      box.max.set(c.maxX, c.maxY, c.maxZ);
      if (ray.intersectBox(box, hitPt)) {
        const d = anchor.distanceTo(hitPt) - 0.35;
        if (d < bestDist && d > 0.4) bestDist = d;
      }
    }
    return anchor.clone().addScaledVector(dir, bestDist);
  }

  // --- MAIN UPDATE LOOP ---

  _loop() {
    if (this.isDisposed) return;
    requestAnimationFrame(this._loop);

    const dt = Math.min(0.05, this.clock.getDelta());
    if (!this.isPaused && !this.matchEnded) {
      this._update(dt);
    }
    this.renderer.render(this.scene, this.camera);
  }

  _update(dt) {
    const p = this.player;

    // Timers
    if (p.fireCooldown > 0) p.fireCooldown -= dt;
    if (p.meleeCooldown > 0) p.meleeCooldown -= dt;
    if (p.grenadeCooldown > 0) p.grenadeCooldown -= dt;
    if (p.invulnTimer > 0) p.invulnTimer -= dt;
    if (p.streakTimer > 0) {
      p.streakTimer -= dt;
      if (p.streakTimer <= 0) p.streakCount = 0;
    }

    if (p.reloading) {
      p.reloadTimer -= dt;
      if (p.reloadTimer <= 0) {
        p.reloading = false;
        p.ammo[p.weaponKey] = WEAPONS[p.weaponKey].magSize;
        this._pushHud();
      }
    }

    // Arena match timer
    if (this.mode === 'arena') {
      this.matchTimeLeft = Math.max(0, this.matchTimeLeft - dt);
      if (this.matchTimeLeft <= 0) {
        this.matchEnded = true;
        if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock();
        this.callbacks.onGameOver?.({
          title: 'MATCH COMPLETE',
          subtitle: `Arena Level ${p.level} Finished`,
          stats: [
            { label: 'Eliminations', value: p.kills },
            { label: 'Deaths', value: p.deaths },
            { label: 'Arena Level', value: p.level }
          ]
        });
        return;
      }
    }

    // Player Respawn countdown (Arena)
    if (!p.alive && this.mode === 'arena') {
      p.respawnTimer -= dt;
      if (p.respawnTimer <= 0) {
        // Choose a DIFFERENT spawn location far from current spot
        const choices = ARENA_SPAWNS.filter(s => s.distanceTo(p.pos) > 12);
        const sp = choices[Math.floor(Math.random() * choices.length)] || ARENA_SPAWNS[0];
        p.pos.copy(sp);
        p.pos.y = this._getTerrainHeight(sp.x, sp.z);
        p.hp = p.maxHp;
        p.alive = true;
        p.invulnTimer = 1.5;
        this._pushHud();
      }
    }

    // Player Movement
    if (p.alive) {
      const fwd = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
      const right = new THREE.Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
      const move = new THREE.Vector3();
      if (this.keys['KeyW'] || this.keys['ArrowUp']) move.add(fwd);
      if (this.keys['KeyS'] || this.keys['ArrowDown']) move.sub(fwd);
      if (this.keys['KeyD'] || this.keys['ArrowRight']) move.add(right);
      if (this.keys['KeyA'] || this.keys['ArrowLeft']) move.sub(right);
      if (Math.abs(this.touchMoveX) > 0.08 || Math.abs(this.touchMoveY) > 0.08) {
        move.addScaledVector(fwd, this.touchMoveY);
        move.addScaledVector(right, this.touchMoveX);
      }
      if (move.lengthSq() > 1) move.normalize();

      const joySprint = Math.hypot(this.touchMoveX, this.touchMoveY) > 0.85;
      const sprinting = (this.keys['ShiftLeft'] || this.keys['ShiftRight'] || joySprint) && !p.aiming;

      if (p.sliding) {
        p.slideTimer -= dt;
        p.pos.addScaledVector(p.slideDir, 14.5 * dt);
        if (Math.random() < 0.45) {
          this._spawnSparks(p.pos.clone().add(new THREE.Vector3(0, 0.2, 0)), 0xd6d3d1, 1, 2.5);
        }
        if (p.slideTimer <= 0) p.sliding = false;
      } else {
        const speed = p.aiming ? 4.8 : sprinting ? 10.2 : 7.0;
        p.pos.addScaledVector(move, speed * dt);

        if (move.lengthSq() > 0.1 && p.grounded) {
          p.footstepTimer -= dt;
          if (p.footstepTimer <= 0) {
            const surf = this.sceneName === 'forest' ? 'grass' : this.sceneName === 'desert' ? 'sand' : 'concrete';
            audio.playFootstep(surf);
            p.footstepTimer = sprinting ? 0.3 : 0.44;
          }
        }
      }

      // Gravity, Standable Boxes & Bunker Ceiling Clamp
      p.vel.y -= 23 * dt;
      p.pos.y += p.vel.y * dt;
      const supportY = this._getSupportHeight(p.pos, 0.52);
      if (p.pos.y <= supportY) {
        p.pos.y = supportY;
        p.vel.y = 0;
        p.grounded = true;
      } else {
        p.grounded = false;
      }
      if (this.sceneName === 'apocalypse' && p.pos.y > 6.5) {
        p.pos.y = 6.5;
        if (p.vel.y > 0) p.vel.y = 0;
      }

      this._resolveHorizontalCollision(p.pos, 0.56);

      // Continuous fire if holding LMB or Mobile Fire button
      if ((this.mouseDown || this.touchFire) && WEAPONS[p.weaponKey].auto) {
        this._shoot();
      }
    }

    // Update Camera (First-Person or Third-Person!)
    this.recoilPitch = THREE.MathUtils.lerp(this.recoilPitch, 0, dt * 11);
    const eyeHeight = p.sliding ? 0.95 : 1.7;

    let shakeX = 0, shakeY = 0;
    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      shakeX = (Math.random() - 0.5) * this.shakeIntensity;
      shakeY = (Math.random() - 0.5) * this.shakeIntensity;
    }

    const totalPitch = Math.max(-1.4, Math.min(1.4, p.pitch + this.recoilPitch));
    const camEuler = new THREE.Euler(totalPitch, p.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(camEuler);

    // Sync local 3D character mesh
    this.localOperatorMesh.position.copy(p.pos);
    this.localOperatorMesh.rotation.y = p.yaw;
    const horizSpeed = (this.keys['KeyW'] || this.keys['KeyS'] || this.keys['KeyA'] || this.keys['KeyD']) ? 7 : 0;
    animateOperator(this.localOperatorMesh, dt, horizSpeed, p.sliding);

    if (this.thirdPerson) {
      // Smooth over-the-shoulder Third-Person camera with wall-clip raycast prevention!
      const anchor = p.pos.clone().add(new THREE.Vector3(0, eyeHeight + 0.35, 0));
      const back = new THREE.Vector3(0, 0, 4.4).applyEuler(new THREE.Euler(totalPitch * 0.5, p.yaw, 0, 'YXZ'));
      const rightOffset = new THREE.Vector3(0.68, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw);
      const rawTarget = anchor.clone().add(back).add(rightOffset);
      const safeTarget = this._clipCameraAgainstWalls(anchor, rawTarget);
      this.camera.position.lerp(safeTarget, Math.min(1, dt * 18));
      this.camera.position.x += shakeX;
      this.camera.position.y += shakeY;
    } else {
      this.camera.position.set(p.pos.x + shakeX, p.pos.y + eyeHeight + shakeY, p.pos.z);
    }

    // Smooth ADS FOV & weapon viewmodel animation
    const targetFov = p.aiming ? 52 : p.sliding ? 84 : 75;
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, dt * 12);
    this.camera.updateProjectionMatrix();

    const vm = this.weaponModels[p.weaponKey];
    if (vm) {
      const targetX = p.aiming ? 0.0 : 0.28;
      const targetY = p.reloading ? -0.52 : p.aiming ? -0.19 : -0.26;
      const bob = horizSpeed > 0 && p.grounded && !p.sliding ? Math.sin(performance.now() * 0.011) * 0.012 : 0;
      vm.position.x = THREE.MathUtils.lerp(vm.position.x, targetX, dt * 14);
      vm.position.y = THREE.MathUtils.lerp(vm.position.y, targetY + bob, dt * 14);
      if (vm.userData.flash && vm.userData.flash.material.opacity > 0) {
        vm.userData.flash.material.opacity = Math.max(0, vm.userData.flash.material.opacity - dt * 22);
      }
    }
    this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - dt * 95);

    // Update Grenades with Realistic Wall & Floor Ricochet Collision!
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      g.vel.y -= 20 * dt;
      const prevPos = g.pos.clone();
      g.pos.addScaledVector(g.vel, dt);

      // Wall & Crate bounce
      for (const c of this.colliders) {
        if (g.pos.y < c.minY || g.pos.y > c.maxY) continue;
        if (g.pos.x > c.minX - 0.22 && g.pos.x < c.maxX + 0.22 && g.pos.z > c.minZ - 0.22 && g.pos.z < c.maxZ + 0.22) {
          if (prevPos.x <= c.minX - 0.2 || prevPos.x >= c.maxX + 0.2) {
            g.vel.x = -g.vel.x * 0.55;
            g.pos.x = prevPos.x;
          } else {
            g.vel.z = -g.vel.z * 0.55;
            g.pos.z = prevPos.z;
          }
          break;
        }
      }

      const gy = this._getTerrainHeight(g.pos.x, g.pos.z) + 0.18;
      if (g.pos.y < gy) {
        g.pos.y = gy;
        g.vel.y = Math.abs(g.vel.y) * 0.45;
        g.vel.x *= 0.72;
        g.vel.z *= 0.72;
      }
      g.mesh.position.copy(g.pos);
      g.fuse -= dt;
      if (g.fuse <= 0) {
        this.grenades.splice(i, 1);
        this._explodeGrenade(g);
      }
    }

    // Update Arena Bots
    for (const b of this.bots) {
      if (!b.alive) {
        b.respawnTimer -= dt;
        if (b.respawnTimer <= 0) {
          const sp = ARENA_SPAWNS[Math.floor(Math.random() * ARENA_SPAWNS.length)];
          b.pos.set(sp.x, this._getTerrainHeight(sp.x, sp.z), sp.z);
          b.hp = b.maxHp;
          b.alive = true;
          b.mesh.visible = true;
        }
        continue;
      }

      const toPlayer = p.pos.clone().sub(b.pos);
      const dist = toPlayer.length();
      const yaw = Math.atan2(-toPlayer.x, -toPlayer.z);
      b.mesh.rotation.y = yaw;

      b.strafeTimer -= dt;
      if (b.strafeTimer <= 0) {
        b.strafeDir *= -1;
        b.strafeTimer = 1.6 + Math.random() * 2;
      }

      const dirXZ = new THREE.Vector3(toPlayer.x, 0, toPlayer.z).normalize();
      const strafe = new THREE.Vector3(-dirXZ.z, 0, dirXZ.x).multiplyScalar(b.strafeDir);
      const botSpeed = 4.2 + p.level * 0.25;
      if (dist > 14) {
        b.pos.addScaledVector(dirXZ, botSpeed * dt);
      } else {
        b.pos.addScaledVector(strafe, botSpeed * 0.7 * dt);
      }
      b.pos.y = this._getTerrainHeight(b.pos.x, b.pos.z);
      this._resolveHorizontalCollision(b.pos, 0.55);
      b.mesh.position.copy(b.pos);
      animateOperator(b.mesh, dt, botSpeed, false);

      // Bot shooting at player
      b.fireTimer -= dt;
      if (b.fireTimer <= 0 && dist < 44 && p.alive) {
        b.fireTimer = Math.max(0.65, 1.8 - p.level * 0.12) + Math.random() * 0.8;
        const start = b.pos.clone().add(new THREE.Vector3(0, 1.4, 0));
        const end = p.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.4, 1.3, (Math.random() - 0.5) * 1.4));
        this._spawnTracer(start, end, 0xff5555);
        if (Math.random() < 0.34 + p.level * 0.03) {
          this._damagePlayer(9 + p.level);
        }
      }
    }

    // Update Zombie Apocalypse Spawning & AI
    if (this.mode === 'apocalypse') {
      if (this.apocSpawnQueue > 0) {
        this.apocSpawnTimer -= dt;
        if (this.apocSpawnTimer <= 0 && this.zombies.length < 18) {
          this._spawnZombie();
          this.apocSpawnQueue -= 1;
          this.apocSpawnTimer = Math.max(0.45, 1.85 - p.level * 0.14);
        }
      }

      for (let zi = 0; zi < this.zombies.length; zi++) {
        const z = this.zombies[zi];
        const toP = p.pos.clone().sub(z.pos);
        const dist = toP.length();
        const yaw = Math.atan2(-toP.x, -toP.z);
        z.mesh.rotation.y = yaw;

        if (dist > 1.25) {
          const dir = new THREE.Vector3(toP.x, 0, toP.z).normalize();
          z.pos.addScaledVector(dir, z.speed * dt);
        } else {
          z.attackCooldown -= dt;
          if (z.attackCooldown <= 0) {
            z.attackCooldown = 0.85;
            this._damagePlayer(z.variant === 'brute' ? 28 : 16);
          }
        }
        // Solid Zombie-vs-Player & Zombie-vs-Zombie separation so they never stack!
        this._separateCircles(p.pos, z.pos, 1.15, 0.25);
        for (let zj = zi + 1; zj < this.zombies.length; zj++) {
          this._separateCircles(z.pos, this.zombies[zj].pos, 1.05, 0.5);
        }
        this._resolveHorizontalCollision(z.pos, 0.52);
        z.mesh.position.copy(z.pos);

        // Zombie shambling/clawing animation
        const u = z.mesh.userData;
        u.phase += dt * z.speed * 2.1;
        u.leftLeg.rotation.x = Math.sin(u.phase) * 0.65;
        u.rightLeg.rotation.x = -Math.sin(u.phase) * 0.65;
        u.body.rotation.z = Math.sin(u.phase) * 0.09;

        z.growlTimer -= dt;
        if (z.growlTimer <= 0 && dist < 14) {
          audio.playZombieGrowl();
          z.growlTimer = 4 + Math.random() * 6;
        }
      }
    }

    // Update Pickups
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pk = this.pickups[i];
      pk.mesh.rotation.y += dt * 2.8;
      pk.life -= dt;
      if (pk.pos.distanceTo(p.pos) < 1.8) {
        p.hp = Math.min(p.maxHp, p.hp + 30);
        p.grenades = Math.min(6, p.grenades + 1);
        audio.playPickup();
        this.callbacks.onCombo?.('+30 HEALTH & +1 BOMB PICKED UP!');
        this.scene.remove(pk.mesh);
        this.pickups.splice(i, 1);
        this._pushHud();
      } else if (pk.life <= 0) {
        this.scene.remove(pk.mesh);
        this.pickups.splice(i, 1);
      }
    }

    // Update Tracers & Particles
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      this.tracers[i].life -= dt;
      if (this.tracers[i].life <= 0) {
        this.scene.remove(this.tracers[i].line);
        this.tracers.splice(i, 1);
      }
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.life -= dt;
      if (pt.expandRate > 0) {
        pt.mesh.scale.addScalar(pt.expandRate * dt);
        pt.mesh.material.opacity = Math.max(0, pt.life / pt.maxLife);
      } else {
        pt.vel.y -= 15 * dt;
        pt.mesh.position.addScaledVector(pt.vel, dt);
      }
      if (pt.life <= 0) {
        this.scene.remove(pt.mesh);
        this.particles.splice(i, 1);
      }
    }

    // Smooth remote player interpolation
    for (const rp of this.remotePlayers.values()) {
      rp.mesh.position.lerp(rp.targetPos, Math.min(1, dt * 14));
      rp.mesh.rotation.y = rp.yaw;
      animateOperator(rp.mesh, dt, rp.speed, rp.sliding);
    }

    // Network state broadcast (~18Hz)
    const now = performance.now();
    if (this.mode === 'arena' && this.mp?.connected && this.mp.roomState && now - this.lastNetSync > 55) {
      this.lastNetSync = now;
      this.mp.send({
        type: 'state_update',
        x: p.pos.x,
        y: p.pos.y,
        z: p.pos.z,
        yaw: p.yaw,
        pitch: p.pitch,
        weapon: p.weaponKey,
        sliding: p.sliding
      });
    }

    // Periodic HUD refresh for timer
    if (Math.floor(now / 400) !== Math.floor((now - dt * 1000) / 400)) {
      this._pushHud();
    }
  }

  _pushHud() {
    const p = this.player;
    const w = WEAPONS[p.weaponKey];
    const mins = Math.floor(this.matchTimeLeft / 60);
    const secs = Math.floor(this.matchTimeLeft % 60);
    const timerStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    this.callbacks.onHudUpdate?.({
      game: 'shooter',
      mode: this.mode,
      sceneName: this.sceneName,
      hp: Math.ceil(p.hp),
      maxHp: p.maxHp,
      alive: p.alive,
      respawnTimer: Math.ceil(p.respawnTimer),
      weaponName: w.name,
      ammo: p.ammo[p.weaponKey],
      magSize: w.magSize,
      reloading: p.reloading,
      grenades: p.grenades,
      kills: p.kills,
      deaths: p.deaths,
      level: p.level,
      lives: p.lives,
      zombiesLeft: this.apocWaveRemaining,
      highScore: this.highScore,
      torchOn: p.torchOn,
      thirdPerson: this.thirdPerson,
      timerStr,
      roomState: this.mp?.roomState || null,
      playerId: this.mp?.playerId || 'LOCAL'
    });
  }

  // --- MULTIPLAYER HANDLERS ---

  _bindMultiplayer() {
    if (!this.mp) return;
    this._unsubs = [
      this.mp.on('room_state', (state) => {
        this._syncRemotePlayers(state);
        this._pushHud();
      }),
      this.mp.on('joined_room', ({ state }) => {
        this._syncRemotePlayers(state);
        this._pushHud();
      }),
      this.mp.on('player_moved', (d) => {
        let rp = this.remotePlayers.get(d.id);
        if (!rp) return;
        const dist = rp.targetPos.distanceTo(new THREE.Vector3(d.x, d.y, d.z));
        rp.speed = dist > 0.05 ? 7 : 0;
        rp.targetPos.set(d.x, d.y, d.z);
        rp.yaw = d.yaw;
        rp.sliding = d.sliding;
        rp.alive = d.alive;
        rp.mesh.visible = d.alive;
      }),
      this.mp.on('remote_shoot', (d) => {
        audio.playGunshot(d.weapon);
        const start = new THREE.Vector3(d.origin.x, d.origin.y, d.origin.z);
        const end = start.clone().addScaledVector(new THREE.Vector3(d.dir.x, d.dir.y, d.dir.z), 45);
        this._spawnTracer(start, end, 0x38bdf8);
      }),
      this.mp.on('remote_grenade', (d) => {
        this._spawnGrenadeMesh(
          new THREE.Vector3(d.origin.x, d.origin.y, d.origin.z),
          new THREE.Vector3(d.vel.x, d.vel.y, d.vel.z),
          false
        );
      }),
      this.mp.on('player_damaged', (d) => {
        if (d.targetId === this.mp.playerId) {
          this.player.hp = d.hp;
          audio.playPlayerHurt();
          this.shakeTime = 0.2;
          this.shakeIntensity = 0.2;
          this._pushHud();
        }
      }),
      this.mp.on('player_killed', (d) => {
        this._syncRemotePlayers(d.state);
        this.callbacks.onKillFeed?.(`${d.killerId} eliminated ${d.victimId} [${d.weapon}]`);
        if (d.victimId === this.mp.playerId) {
          this.player.alive = false;
          this.player.hp = 0;
          this.player.deaths += 1;
          this.player.respawnTimer = 2.5;
        }
        if (d.killerId === this.mp.playerId) {
          this.player.kills += 1;
        }
        this._pushHud();
      }),
      this.mp.on('player_respawn', (d) => {
        this._syncRemotePlayers(d.state);
        if (d.id === this.mp.playerId && d.spawn) {
          this.player.pos.set(d.spawn.x, this._getTerrainHeight(d.spawn.x, d.spawn.z), d.spawn.z);
          this.player.hp = this.player.maxHp;
          this.player.alive = true;
        }
        this._pushHud();
      }),
      this.mp.on('scene_changed', (d) => {
        if (this.mode === 'arena' && d.scene !== this.sceneName) {
          this.sceneName = d.scene;
          this._buildEnvironment(d.scene);
          this._pushHud();
        }
      })
    ];
  }

  _syncRemotePlayers(state) {
    if (!state || !state.players) return;
    const activeIds = new Set();
    for (const pl of state.players) {
      if (pl.id === this.mp.playerId) continue;
      activeIds.add(pl.id);
      if (!this.remotePlayers.has(pl.id)) {
        const mesh = createOperatorMesh(pl.team);
        mesh.position.set(pl.x, pl.y, pl.z);
        this.scene.add(mesh);
        this.remotePlayers.set(pl.id, {
          mesh,
          targetPos: new THREE.Vector3(pl.x, pl.y, pl.z),
          yaw: pl.yaw || 0,
          speed: 0,
          sliding: false,
          alive: pl.alive !== false
        });
      }
    }
    for (const [id, rp] of this.remotePlayers.entries()) {
      if (!activeIds.has(id)) {
        this.scene.remove(rp.mesh);
        this.remotePlayers.delete(id);
      }
    }
  }

  // --- INPUT & EVENTS ---

  _bindEvents() {
    this._onResize = () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    };

    this._onKeyDown = (e) => {
      if (e.code === 'KeyP') {
        this.setPaused(!this.isPaused);
        return;
      }
      if (this.isPaused || this.matchEnded) return;
      this.keys[e.code] = true;

      const p = this.player;
      if (e.code === 'Space' && p.grounded && p.alive) {
        p.vel.y = 9.2;
        p.grounded = false;
      } else if (e.code === 'Digit1') {
        this._selectWeapon('rifle');
      } else if (e.code === 'Digit2') {
        this._selectWeapon('shotgun');
      } else if (e.code === 'Digit3') {
        this._selectWeapon('pistol');
      } else if (e.code === 'KeyR') {
        this._startReload();
      } else if (e.code === 'KeyG') {
        this._throwGrenade();
      } else if (e.code === 'KeyE') {
        this._meleePunch();
      } else if (e.code === 'KeyF') {
        p.torchOn = !p.torchOn;
        this.torchLight.intensity = p.torchOn ? 65 : 0;
        audio.playFlashlightClick();
        this._pushHud();
      } else if (e.code === 'KeyV') {
        this.toggleCameraView();
      } else if ((e.code === 'KeyC' || e.code === 'ControlLeft') && !p.sliding && p.grounded && p.alive) {
        // Tactical Slide combo (especially powerful with Shift + C!)
        const fwd = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw)).normalize();
        p.sliding = true;
        p.slideTimer = 0.55;
        p.slideDir.copy(fwd);
        audio.playSlide();
        if (this.keys['ShiftLeft'] || this.keys['ShiftRight']) {
          audio.playComboChime();
          this.callbacks.onCombo?.('COMBO: TACTICAL POWER SLIDE!');
        }
      }
    };

    this._onKeyUp = (e) => {
      this.keys[e.code] = false;
    };

    this._onMouseMove = (e) => {
      if (this.isPaused || this.matchEnded) return;
      if (document.pointerLockElement !== this.renderer.domElement) return;
      const sens = this.player.aiming ? 0.0014 : 0.0022;
      this.player.yaw -= e.movementX * sens;
      this.player.pitch = Math.max(-1.35, Math.min(1.35, this.player.pitch - e.movementY * sens));
    };

    this._onMouseDown = (e) => {
      if (this.isPaused || this.matchEnded) return;
      audio.init();
      if (document.pointerLockElement !== this.renderer.domElement) {
        this.requestPointerLock();
        return;
      }
      if (e.button === 0) {
        this.mouseDown = true;
        this._shoot();
      } else if (e.button === 2) {
        this.player.aiming = true;
      }
    };

    this._onMouseUp = (e) => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.player.aiming = false;
    };

    this._onContextMenu = (e) => e.preventDefault();

    this._onPointerLockChange = () => {
      this.pointerLocked = document.pointerLockElement === this.renderer.domElement;
      if (!this.pointerLocked && !this.isPaused && !this.matchEnded) {
        this.setPaused(true);
      }
    };

    window.addEventListener('resize', this._onResize);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousemove', this._onMouseMove);
    this.renderer.domElement.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    this.renderer.domElement.addEventListener('contextmenu', this._onContextMenu);
    document.addEventListener('pointerlockchange', this._onPointerLockChange);
  }

  dispose() {
    this.isDisposed = true;
    audio.stopMusic();
    if (document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock();
    }
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mouseup', this._onMouseUp);
    document.removeEventListener('pointerlockchange', this._onPointerLockChange);
    if (this._unsubs) this._unsubs.forEach(fn => fn());
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
