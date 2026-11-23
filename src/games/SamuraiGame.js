import * as THREE from 'three';
import { audio } from '../audio/AudioEngine.js';
import {
  getGrassTexture,
  getBarkTexture,
  getStoneTileTexture,
  getConcreteTexture,
  getCrateTexture
} from '../engine/Textures.js';
import {
  createSamuraiMesh,
  createWolfMesh,
  createNpcMesh,
  createAstraCreatureMesh,
  createDragonEmperorMesh
} from '../engine/CharacterMesh.js';

const CHECKPOINT_STORAGE_KEY = 'ronin_wild_checkpoints_v2';

export const REALM_LABELS = {
  overworld: 'Ancient Wolf Forest & Imperial City',
  boat: 'Shipwreck Sea — Save Your Parents',
  astra_fire: 'Astra Realm — Fiery Land of No Return',
  atisashi_sky: 'Atisashi — City in the Sky'
};

export class SamuraiGame {
  constructor(container, callbacks) {
    this.container = container;
    this.callbacks = callbacks;
    // callbacks: { onHudUpdate, onCombo, onPrompt, onDamageFlash, onElderDialogue, onPauseChange, onGameOver }
    this.isPaused = false;
    this.isDisposed = false;
    this.victoryShown = false;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 420);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.container.appendChild(this.renderer.domElement);

    // Persistent Checkpoints & Progression
    this.savedData = this._loadCheckpoints();

    this.realm = 'overworld'; // 'overworld' | 'boat' | 'astra_fire' | 'atisashi_sky'
    this.portalAnim = {
      active: false,
      timer: 0,
      duration: 2.3,
      targetRealm: 'boat',
      color: 0x38bdf8,
      rings: []
    };

    // Player Ronin State
    this.samurai = {
      pos: new THREE.Vector3(0, 0.5, 74),
      vel: new THREE.Vector3(),
      yaw: 0,
      camYaw: 0,
      camPitch: 0.34,
      level: this.savedData.level || 1,
      xp: this.savedData.xp || 0,
      xpNext: (this.savedData.level || 1) * 120,
      gold: this.savedData.gold || 0,
      hp: 100 + ((this.savedData.level || 1) - 1) * 20,
      maxHp: 100 + ((this.savedData.level || 1) - 1) * 20,
      chi: 100,
      maxChi: 100,
      grounded: true,
      sliding: false,
      slideTimer: 0,
      slideDir: new THREE.Vector3(),
      comboStep: 0,
      comboWindow: 0,
      attackTimer: 0,
      attackDuration: 0,
      taiChiDeflectTimer: 0,
      hasDisguise: Boolean(this.savedData.hasDisguise),
      disguised: false,
      swordDrawn: true,
      hasEyeLaser: Boolean(this.savedData.hasEyeLaser),
      eyeLaserTimer: 0,
      eyeLaserCooldown: 0,
      parentsSaved: Boolean(this.savedData.parentsSaved),
      dragonDefeated: false,
      suspicion: 0,
      relicsFound: 0,
      totalRelics: 3,
      footstepTimer: 0,
      zone: 'Ancient Wolf Forest',
      activeCheckpoint: this.savedData.lastCheckpoint || { realm: 'overworld', x: 0, y: 0.8, z: 74, label: 'Wolf Forest Den' }
    };

    // Dynamic Random Mission State
    this.randomMission = null;

    // World & Entity Collections
    this.worldGroup = new THREE.Group();
    this.portalGroup = new THREE.Group();
    this.scene.add(this.worldGroup, this.portalGroup);

    this.keys = {};
    this.touchMoveX = 0;
    this.touchMoveY = 0;
    this.colliders = [];
    this.skyPlatforms = [];     // Static sky islands { minX, maxX, minZ, maxZ, topY }
    this.movingBlocks = [];     // Oscillating moving sky blocks!
    this.skyHazards = [];       // Rotating sweeper beams & sliding obstacles
    this.wolves = [];
    this.enemies = [];          // Bandits, Guards, Raiders, Astra Creatures, Mini-Bosses
    this.dragonBoss = null;     // Mighty Celestial Dragon Emperor!
    this.dragonFireballs = [];
    this.relics = [];
    this.spiritOrbs = [];       // Random mission collectibles
    this.chiWaves = [];
    this.particles = [];
    this.interactables = [];    // { pos, radius, label, action }

    // Player Mesh + Slash Arc + Eye Laser Beams
    this.samuraiMesh = createSamuraiMesh();
    this.scene.add(this.samuraiMesh);

    this.slashArc = new THREE.Mesh(
      new THREE.RingGeometry(0.95, 2.1, 18, 1, -Math.PI * 0.45, Math.PI * 0.9),
      new THREE.MeshBasicMaterial({ color: 0xe0f2fe, transparent: true, opacity: 0, side: THREE.DoubleSide })
    );
    this.slashArc.rotation.x = Math.PI / 2;
    this.scene.add(this.slashArc);

    // Twin Eye Laser Beams (Unlocked at Atisashi Solar Eye Shrine!)
    const laserMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.92 });
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
    this.eyeLaserGroup = new THREE.Group();
    const beamOuter = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.34, 48, 10), laserMat);
    beamOuter.rotation.x = Math.PI / 2;
    beamOuter.position.z = -24;
    const beamCore = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 48, 8), coreMat);
    beamCore.rotation.x = Math.PI / 2;
    beamCore.position.z = -24;
    this.eyeLaserGroup.add(beamOuter, beamCore);
    this.eyeLaserGroup.visible = false;
    this.scene.add(this.eyeLaserGroup);

    this._bindEvents();
    this.clock = new THREE.Clock();
    this._loop = this._loop.bind(this);
  }

  // --- CHECKPOINT PERSISTENCE ---

  _loadCheckpoints() {
    try {
      const raw = localStorage.getItem(CHECKPOINT_STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return {
      level: 1,
      xp: 0,
      gold: 0,
      hasDisguise: false,
      hasEyeLaser: false,
      parentsSaved: false,
      lastCheckpoint: { realm: 'overworld', x: 0, y: 0.8, z: 74, label: 'Wolf Forest Den' },
      unlockedCheckpoints: [
        { id: 'overworld_start', realm: 'overworld', x: 0, y: 0.8, z: 74, label: 'Wolf Forest Den' }
      ]
    };
  }

  _saveCheckpoint(id, realm, x, y, z, label) {
    const cp = { id, realm, x, y, z, label };
    this.samurai.activeCheckpoint = cp;
    this.savedData.lastCheckpoint = cp;
    this.savedData.level = this.samurai.level;
    this.savedData.xp = this.samurai.xp;
    this.savedData.gold = this.samurai.gold;
    this.savedData.hasDisguise = this.samurai.hasDisguise;
    this.savedData.hasEyeLaser = this.samurai.hasEyeLaser;
    this.savedData.parentsSaved = this.samurai.parentsSaved;

    if (!this.savedData.unlockedCheckpoints) this.savedData.unlockedCheckpoints = [];
    if (!this.savedData.unlockedCheckpoints.some(c => c.id === id)) {
      this.savedData.unlockedCheckpoints.push(cp);
    }
    try {
      localStorage.setItem(CHECKPOINT_STORAGE_KEY, JSON.stringify(this.savedData));
    } catch {}
    this.callbacks.onCombo?.(`💾 CHECKPOINT SAVED: ${label.toUpperCase()}`);
  }

  getUnlockedCheckpoints() {
    return this.savedData.unlockedCheckpoints || [];
  }

  teleportToCheckpoint(cpId) {
    const cp = this.getUnlockedCheckpoints().find(c => c.id === cpId) || this.samurai.activeCheckpoint;
    if (!cp) return;
    this.isPaused = false;
    this.victoryShown = false;
    this._loadRealm(cp.realm, new THREE.Vector3(cp.x, cp.y, cp.z));
    this.samurai.hp = this.samurai.maxHp;
    this.samurai.chi = this.samurai.maxChi;
    this.callbacks.onCombo?.(`🌀 RETURNED TO CHECKPOINT: ${cp.label.toUpperCase()}`);
    this._pushHud();
  }

  // --- START & PORTAL TRANSITIONS ---

  start() {
    this.isPaused = false;
    this.victoryShown = false;
    const cp = this.samurai.activeCheckpoint || { realm: 'overworld', x: 0, y: 0.8, z: 74 };
    this._loadRealm(cp.realm, new THREE.Vector3(cp.x, cp.y, cp.z));
    this._generateRandomMission();
    audio.playMusic('samurai');
    this.clock.start();
    this._pushHud();
    requestAnimationFrame(this._loop);
  }

  restart() {
    this.victoryShown = false;
    this.isPaused = false;
    const cp = this.samurai.activeCheckpoint;
    this.samurai.hp = this.samurai.maxHp;
    this.samurai.chi = this.samurai.maxChi;
    this._loadRealm(cp.realm, new THREE.Vector3(cp.x, cp.y, cp.z));
    this._pushHud();
  }

  // Called when player selects one of the TWO Elder Dialogue Choices!
  chooseElderPath(choice) {
    // choice: 'beginning' (Shipwreck Boat -> Save Parents -> Wolves -> Emperor) | 'astra' (Fiery Abyss -> Atisashi Sky City -> Eye Laser -> Dragon Emperor)
    this.isPaused = false;
    const targetRealm = choice === 'beginning' ? 'boat' : 'astra_fire';
    const portalColor = choice === 'beginning' ? 0x38bdf8 : 0xff4500;
    const label = choice === 'beginning'
      ? '🌀 FALLING THROUGH TIME PORTAL TO THE SHIPWRECK!'
      : '🔥 FALLING INTO THE ASTRA REALM PORTAL!';
    this._startPortalFallAnimation(targetRealm, portalColor, label);
    this.requestPointerLock();
  }

  _startPortalFallAnimation(targetRealm, colorHex, bannerMsg) {
    audio.playPortalFall();
    this.callbacks.onCombo?.(bannerMsg);
    while (this.portalGroup.children.length > 0) this.portalGroup.remove(this.portalGroup.children[0]);

    const rings = [];
    for (let i = 0; i < 16; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(2.6 + (i % 3) * 0.45, 0.16, 8, 28),
        new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? colorHex : 0xfef08a, transparent: true, opacity: 0.88 })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set(this.samurai.pos.x, this.samurai.pos.y - i * 2.8, this.samurai.pos.z);
      this.portalGroup.add(ring);
      rings.push(ring);
    }

    this.portalAnim = {
      active: true,
      timer: 0,
      duration: 2.2,
      targetRealm,
      color: colorHex,
      rings
    };
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
    if (!this.isPaused && !this.victoryShown && this.renderer?.domElement) {
      this.renderer.domElement.requestPointerLock?.();
    }
  }

  // --- MOBILE TOUCH CONTROL APIS ---

  setTouchMove(x, y) {
    this.touchMoveX = x;
    this.touchMoveY = y;
  }

  addTouchLook(dx, dy) {
    if (this.isPaused || this.victoryShown || this.portalAnim.active) return;
    this.samurai.camYaw -= dx * 0.0055;
    this.samurai.camPitch = THREE.MathUtils.clamp(this.samurai.camPitch + dy * 0.004, 0.06, 1.05);
  }

  triggerTouchAction(action) {
    if (this.isPaused || this.victoryShown || this.portalAnim.active) return;
    audio.init();
    const s = this.samurai;
    if (action === 'jump' && s.grounded) {
      s.vel.y = 11.2;
      s.grounded = false;
    } else if (action === 'slide' && !s.sliding && s.grounded) {
      const dir = new THREE.Vector3(-Math.sin(s.yaw), 0, -Math.cos(s.yaw)).normalize();
      s.sliding = true;
      s.slideTimer = 0.65;
      s.slideDir.copy(dir);
      audio.playSlide();
      this._advanceRandomMission('slides', 1);
      this.callbacks.onCombo?.('💨 3D WILD SLIDE!');
    } else if (action === 'slash') {
      this._katanaAttack();
    } else if (action === 'taichi') {
      this._taiChiPalmWave();
    } else if (action === 'deflect') {
      this._taiChiDeflect();
    } else if (action === 'disguise') {
      this._toggleDisguise();
    } else if (action === 'interact') {
      this._interact();
    } else if (action === 'laser') {
      this._fireEyeLaser();
    }
  }

  // --- LEVELING, XP & RANDOM MISSION GENERATOR ---

  _awardXpAndGold(xpAmt, goldAmt, reason = '') {
    const s = this.samurai;
    s.xp += xpAmt;
    s.gold += goldAmt;
    let leveledUp = false;
    while (s.xp >= s.xpNext) {
      s.xp -= s.xpNext;
      s.level += 1;
      s.xpNext = s.level * 120;
      s.maxHp = 100 + (s.level - 1) * 20;
      s.hp = s.maxHp;
      s.chi = s.maxChi;
      leveledUp = true;
    }
    if (leveledUp) {
      audio.playTrophyFanfare();
      this.callbacks.onCombo?.(`⭐ LEVEL UP! RONIN LEVEL ${s.level} — POWER & MAX HP INCREASED!`);
    } else if (reason) {
      this.callbacks.onCombo?.(`${reason} (+${xpAmt} XP • +${goldAmt} GOLD)`);
    }
    // Persist progress
    this.savedData.level = s.level;
    this.savedData.xp = s.xp;
    this.savedData.gold = s.gold;
    try { localStorage.setItem(CHECKPOINT_STORAGE_KEY, JSON.stringify(this.savedData)); } catch {}
    this._pushHud();
  }

  _generateRandomMission() {
    const pool = [
      { type: 'kills', title: 'Defeat 3 Enemies in Combat', target: 3, rewardXp: 90, rewardGold: 120 },
      { type: 'slides', title: 'Perform 3 Wild 3D Slides [C]', target: 3, rewardXp: 65, rewardGold: 80 },
      { type: 'taichi', title: 'Cast 2 Tai Chi Palm Waves [Q/RMB]', target: 2, rewardXp: 70, rewardGold: 95 },
      { type: 'orbs', title: 'Collect 3 Spirit Orbs', target: 3, rewardXp: 85, rewardGold: 110 },
      { type: 'boss', title: 'Defeat Any Realm Boss', target: 1, rewardXp: 160, rewardGold: 220 }
    ];
    if (this.samurai.hasEyeLaser) {
      pool.push({ type: 'laser', title: 'Fire Solar Eye Laser 2 Times [X]', target: 2, rewardXp: 100, rewardGold: 140 });
    }
    const pick = pool[Math.floor(Math.random() * pool.length)];
    this.randomMission = { ...pick, progress: 0 };
    this._pushHud();
  }

  _advanceRandomMission(type, amount = 1) {
    const m = this.randomMission;
    if (!m || m.type !== type) return;
    m.progress += amount;
    if (m.progress >= m.target) {
      audio.playPickup();
      this.samurai.hp = Math.min(this.samurai.maxHp, this.samurai.hp + 35);
      this._awardXpAndGold(m.rewardXp, m.rewardGold, `🎯 MISSION COMPLETE: ${m.title.toUpperCase()}`);
      this._generateRandomMission();
    } else {
      this._pushHud();
    }
  }

  // --- REALM BUILDER (4 DISTINCT 3D WORLDS!) ---

  _clearRealm() {
    while (this.worldGroup.children.length > 0) this.worldGroup.remove(this.worldGroup.children[0]);
    this.colliders = [];
    this.skyPlatforms = [];
    this.movingBlocks = [];
    this.skyHazards = [];
    this.wolves = [];
    this.enemies = [];
    this.dragonBoss = null;
    this.dragonFireballs.forEach(f => this.scene.remove(f.mesh));
    this.dragonFireballs = [];
    this.relics = [];
    this.spiritOrbs = [];
    this.chiWaves.forEach(w => this.scene.remove(w.mesh));
    this.chiWaves = [];
    this.interactables = [];
  }

  _addCollider(x, y, z, w, h, d, mesh = null) {
    if (mesh) this.worldGroup.add(mesh);
    this.colliders.push({
      minX: x - w / 2, maxX: x + w / 2,
      minY: y - h / 2, maxY: y + h / 2,
      minZ: z - d / 2, maxZ: z + d / 2
    });
  }

  _spawnSpiritOrbs(coords) {
    coords.forEach(([x, y, z]) => {
      const mesh = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.45, 0),
        new THREE.MeshStandardMaterial({ color: 0x2dd4bf, emissive: 0x2dd4bf, emissiveIntensity: 1.5 })
      );
      mesh.position.set(x, y, z);
      this.worldGroup.add(mesh);
      this.spiritOrbs.push({ mesh, pos: new THREE.Vector3(x, y, z), collected: false });
    });
  }

  _loadRealm(realmName, customSpawn = null) {
    this._clearRealm();
    this.realm = realmName;
    const s = this.samurai;
    s.vel.set(0, 0, 0);
    s.sliding = false;
    s.suspicion = 0;

    if (realmName === 'overworld') {
      this._buildOverworld();
      s.pos.copy(customSpawn || new THREE.Vector3(0, this._getGroundY(0, 74), 74));
      s.yaw = 0;
      s.camYaw = 0;
    } else if (realmName === 'boat') {
      this._buildShipwreckBoatRealm();
      s.pos.copy(customSpawn || new THREE.Vector3(0, 2.6, 15));
      s.yaw = 0;
      s.camYaw = 0;
      this._saveCheckpoint('boat_deck', 'boat', 0, 2.6, 15, 'Shipwreck Clan Vessel');
    } else if (realmName === 'astra_fire') {
      this._buildAstraFireRealm();
      s.pos.copy(customSpawn || new THREE.Vector3(0, 1.0, 56));
      s.yaw = 0;
      s.camYaw = 0;
      this._saveCheckpoint('astra_abyss', 'astra_fire', 0, 1.0, 56, 'Astra Fiery Abyss');
    } else if (realmName === 'atisashi_sky') {
      this._buildAtisashiSkyRealm();
      s.pos.copy(customSpawn || new THREE.Vector3(0, 2.0, 62));
      s.yaw = 0;
      s.camYaw = 0;
      this._saveCheckpoint('atisashi_start', 'atisashi_sky', 0, 2.0, 62, 'Atisashi Sky Gate');
    }

    this._syncDisguiseVisuals();
    this._generateRandomMission();
    this._pushHud();
  }

  _getGroundY(x, z) {
    if (this.realm === 'boat') {
      // Standing on the ship deck (-8..8, -22..22)
      if (Math.abs(x) <= 8.2 && Math.abs(z) <= 22.5) return 2.2;
      return -2.5;
    }
    if (this.realm === 'astra_fire') {
      // Volcanic islands & obsidian bridges
      const hill = Math.sin(x * 0.06) * Math.cos(z * 0.06) * 1.4;
      return Math.max(0.2, hill + 0.6);
    }
    if (this.realm === 'atisashi_sky') {
      // Sky City has NO continuous ground — only floating islands & moving blocks!
      let bestY = -100;
      for (const p of this.skyPlatforms) {
        if (x >= p.minX - 0.55 && x <= p.maxX + 0.55 && z >= p.minZ - 0.55 && z <= p.maxZ + 0.55) {
          if (this.samurai.pos.y >= p.topY - 1.2 && p.topY > bestY) bestY = p.topY;
        }
      }
      for (const mb of this.movingBlocks) {
        if (
          x >= mb.pos.x - mb.halfW - 0.55 && x <= mb.pos.x + mb.halfW + 0.55 &&
          z >= mb.pos.z - mb.halfD - 0.55 && z <= mb.pos.z + mb.halfD + 0.55
        ) {
          const topY = mb.pos.y + mb.halfH;
          if (this.samurai.pos.y >= topY - 1.3 && topY > bestY) bestY = topY;
        }
      }
      return bestY;
    }

    // Overworld terrain
    if (z < -26) return 0.5;
    if (z > -2 && z < 14 && Math.abs(x) > 5.2) {
      const t = 1 - Math.abs(z - 6) / 8;
      return -1.4 * t;
    }
    if (z >= -4 && z <= 16 && Math.abs(x) <= 5.2) {
      const t = Math.cos(((z - 6) / 10) * Math.PI * 0.5);
      return 0.6 + Math.max(0, t) * 1.1;
    }
    const hill = Math.sin(x * 0.045) * Math.cos(z * 0.045) * 2.6 + Math.sin((z - 30) * 0.07) * 1.3;
    const blend = THREE.MathUtils.clamp((z - 12) / 18, 0, 1);
    return Math.max(0.1, hill * blend + 0.5);
  }

  // --- REALM 1: OVERWORLD (WOLF FOREST + IMPERIAL CITY + ELDERS) ---
  _buildOverworld() {
    this.scene.background = new THREE.Color(0x95b8c7);
    this.scene.fog = new THREE.FogExp2(0x95b8c7, 0.008);

    const hemi = new THREE.HemisphereLight(0xcbe8ff, 0x2d4227, 0.9);
    const sun = new THREE.DirectionalLight(0xffe9c2, 1.45);
    sun.position.set(55, 80, 45);
    sun.castShadow = true;
    this.worldGroup.add(hemi, sun);

    const tGeo = new THREE.PlaneGeometry(220, 220, 84, 84);
    tGeo.rotateX(-Math.PI / 2);
    const pos = tGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, this._getGroundY(pos.getX(i), pos.getZ(i)));
    tGeo.computeVertexNormals();
    const terrain = new THREE.Mesh(tGeo, new THREE.MeshStandardMaterial({ map: getGrassTexture(28), roughness: 0.94 }));
    terrain.receiveShadow = true;
    this.worldGroup.add(terrain);

    const river = new THREE.Mesh(
      new THREE.PlaneGeometry(220, 14),
      new THREE.MeshStandardMaterial({ color: 0x2288a8, roughness: 0.18, metalness: 0.35, transparent: true, opacity: 0.86 })
    );
    river.rotation.x = -Math.PI / 2;
    river.position.set(0, -0.35, 6);
    this.worldGroup.add(river);

    const woodMat = new THREE.MeshStandardMaterial({ map: getCrateTexture(), color: 0x8b4513, roughness: 0.82 });
    const redLacquer = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.45 });
    const bridgeDeck = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.45, 20), woodMat);
    bridgeDeck.position.set(0, 1.35, 6);
    this.worldGroup.add(bridgeDeck);
    [-4.6, 4.6].forEach(bx => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.1, 20), redLacquer);
      rail.position.set(bx, 2.0, 6);
      this.worldGroup.add(rail);
    });

    // Crimson Torii Gates
    [42, -10, -32].forEach(tz => {
      const ty = this._getGroundY(0, tz);
      const pL = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 7.2, 8), redLacquer);
      pL.position.set(-4.2, ty + 3.6, tz);
      const pR = pL.clone(); pR.position.x = 4.2;
      const top = new THREE.Mesh(new THREE.BoxGeometry(11.4, 0.7, 0.9), redLacquer);
      top.position.set(0, ty + 7.2, tz);
      this.worldGroup.add(pL, pR, top);
    });

    // Pines
    const barkMat = new THREE.MeshStandardMaterial({ map: getBarkTexture(), roughness: 0.92 });
    const pineMat = new THREE.MeshStandardMaterial({ color: 0x1d4d27, roughness: 0.85 });
    for (let i = 0; i < 55; i++) {
      const tx = ((i * 37) % 140) - 70;
      const tz = 18 + ((i * 29) % 76);
      if (Math.abs(tx) < 8 && tz < 80) continue;
      if (Math.hypot(tx + 12, tz - 18) < 7) continue;
      const ty = this._getGroundY(tx, tz);
      const h = 7 + (i % 4) * 2;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.48, h, 7), barkMat);
      trunk.position.set(tx, ty + h / 2, tz);
      this.worldGroup.add(trunk);
      const foliage = new THREE.Mesh(new THREE.ConeGeometry(2.8, 5.2, 7), pineMat);
      foliage.position.set(tx, ty + h * 0.82, tz);
      this.worldGroup.add(foliage);
      this._addCollider(tx, ty + h / 2, tz, 1.1, h, 1.1);
    }

    // Friendly Wolves at the Forest Den
    [[-5, 72, true], [5.5, 76, false], [-3, 80, false]].forEach(([x, z, alpha], idx) => {
      const wMesh = createWolfMesh(alpha);
      const wy = this._getGroundY(x, z);
      wMesh.position.set(x, wy, z);
      this.worldGroup.add(wMesh);
      this.wolves.push({ mesh: wMesh, home: new THREE.Vector3(x, wy, z), angle: idx * 2.1 });
    });

    // 3 Clan Relics
    [[-22, 58, 'Wolf Crest'], [24, 46, 'Shipwreck Compass'], [16, 24, 'Father\'s Seal']].forEach(([x, z, label]) => {
      const y = this._getGroundY(x, z) + 1.2;
      const g = new THREE.Group();
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xf59e0b, emissiveIntensity: 1.2 }));
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 11, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xfde047, transparent: true, opacity: 0.16, side: THREE.DoubleSide }));
      beam.position.y = 5.2;
      g.add(gem, beam);
      g.position.set(x, y, z);
      this.worldGroup.add(g);
      this.relics.push({ mesh: g, pos: new THREE.Vector3(x, y, z), label, collected: false });
    });

    // River Disguise Shrine
    const dPos = new THREE.Vector3(-12, this._getGroundY(-12, 18), 18);
    const shrine = new THREE.Mesh(new THREE.ConeGeometry(3.8, 1.8, 4), redLacquer);
    shrine.rotation.y = Math.PI / 4;
    shrine.position.set(dPos.x, dPos.y + 4.0, dPos.z);
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 12, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.18, side: THREE.DoubleSide }));
    beacon.position.set(dPos.x, dPos.y + 6, dPos.z);
    this.worldGroup.add(shrine, beacon);

    this.interactables.push({
      pos: dPos,
      radius: 4.5,
      label: 'Press [F] to claim Traveler\'s Disguise Cloak & Hat',
      condition: () => !this.samurai.hasDisguise,
      action: () => {
        this.samurai.hasDisguise = true;
        audio.playPickup();
        this._awardXpAndGold(60, 75, 'DISGUISE CLAIMED — PRESS [R] IN THE CITY');
      }
    });

    // Imperial City Walls, Pagodas & Clan Elders
    const stoneMat = new THREE.MeshStandardMaterial({ map: getStoneTileTexture(14), roughness: 0.85 });
    const wallMat = new THREE.MeshStandardMaterial({ map: getConcreteTexture(4, false), color: 0xd6d3cb, roughness: 0.88 });
    const darkRoof = new THREE.MeshStandardMaterial({ color: 0x262933, roughness: 0.6 });

    const cityFloor = new THREE.Mesh(new THREE.PlaneGeometry(110, 74), stoneMat);
    cityFloor.rotation.x = -Math.PI / 2;
    cityFloor.position.set(0, 0.53, -63);
    this.worldGroup.add(cityFloor);

    [
      [-32, 4.5, -28, 48, 8.5, 2.6], [32, 4.5, -28, 48, 8.5, 2.6],
      [-55, 4.5, -63, 2.6, 8.5, 72], [55, 4.5, -63, 2.6, 8.5, 72],
      [0, 4.5, -98, 112, 8.5, 2.6]
    ].forEach(([x, y, z, w, h, d]) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
      m.position.set(x, y, z);
      this._addCollider(x, y, z, w, h, d, m);
    });

    [[-22, -44, 10, 8, 10], [22, -44, 10, 8, 10], [-24, -68, 12, 10, 12], [24, -68, 12, 10, 12]].forEach(([px, pz, w, h, d]) => {
      const base = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
      base.position.set(px, 0.5 + h / 2, pz);
      this._addCollider(px, 0.5 + h / 2, pz, w, h, d, base);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.85, 2.8, 4), darkRoof);
      roof.rotation.y = Math.PI / 4;
      roof.position.set(px, 0.5 + h + 1.3, pz);
      this.worldGroup.add(roof);
    });

    // Clan Elders at the Inner Sanctuary (OPENS DIALOGUE & TWO PORTAL PATHS!)
    const elderPos = new THREE.Vector3(0, 0.53, -84);
    const elder = createNpcMesh('elder');
    elder.position.copy(elderPos);
    const kinL = createNpcMesh('elder'); kinL.scale.setScalar(0.92); kinL.position.set(-2.4, 0.53, -85.5);
    const kinR = createNpcMesh('elder'); kinR.scale.setScalar(0.92); kinR.position.set(2.4, 0.53, -85.5);
    this.worldGroup.add(elder, kinL, kinR);

    this.interactables.push({
      pos: elderPos,
      radius: 5.2,
      label: 'Press [F] to speak with the Clan Elders (Choose Your Destiny!)',
      condition: () => true,
      action: () => {
        if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock();
        this.isPaused = true;
        this._saveCheckpoint('elder_sanctuary', 'overworld', 0, 0.8, -78, 'Imperial Clan Elders');
        this.callbacks.onElderDialogue?.({
          parentsSaved: this.samurai.parentsSaved,
          hasEyeLaser: this.samurai.hasEyeLaser
        });
      }
    });

    // Enemies: Forest Bandits + Iron Warlord Boss + Imperial City Guards
    this._spawnEnemies([
      { role: 'bandit', name: 'Forest Bandit', x: -15, z: 52, hp: 75, dmg: 12 },
      { role: 'bandit', name: 'Forest Bandit', x: 18, z: 42, hp: 75, dmg: 12 },
      { role: 'boss_warlord', name: 'IRON WARLORD (BOSS)', x: 0, z: 32, hp: 230, dmg: 20, isBoss: true },
      { role: 'guard', name: 'Imperial Guard', x: -4.5, z: -36, hp: 115, dmg: 16 },
      { role: 'guard', name: 'Imperial Guard', x: 5.5, z: -52, hp: 115, dmg: 16 },
      { role: 'guard', name: 'Imperial Guard', x: -5.5, z: -68, hp: 115, dmg: 16 }
    ]);

    this._spawnSpiritOrbs([[-8, 2.2, 62], [10, 2.0, 50], [0, 2.5, 6], [-12, 1.8, -48], [12, 1.8, -60]]);
  }

  // --- REALM 2: SHIPWRECK BOAT RESCUE ("START AT THE BEGINNING") ---
  _buildShipwreckBoatRealm() {
    this.scene.background = new THREE.Color(0x0b1628);
    this.scene.fog = new THREE.FogExp2(0x0b1628, 0.016);

    const hemi = new THREE.HemisphereLight(0x64748b, 0x082f49, 0.75);
    const lightning = new THREE.DirectionalLight(0xbae6fd, 1.4);
    lightning.position.set(25, 50, 15);
    this.worldGroup.add(hemi, lightning);

    // Churning dark ocean
    const ocean = new THREE.Mesh(
      new THREE.PlaneGeometry(340, 340),
      new THREE.MeshStandardMaterial({ color: 0x0c4a6e, roughness: 0.2, metalness: 0.45 })
    );
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.y = -0.5;
    this.worldGroup.add(ocean);

    // Sculpted Wooden Samurai Clan Galleon Ship Deck
    const woodMat = new THREE.MeshStandardMaterial({ map: getCrateTexture(), color: 0x6b4226, roughness: 0.85 });
    const darkWood = new THREE.MeshStandardMaterial({ color: 0x3b2313, roughness: 0.9 });

    const deck = new THREE.Mesh(new THREE.BoxGeometry(16, 2.4, 44), woodMat);
    deck.position.set(0, 1.0, 0);
    deck.receiveShadow = true;
    this.worldGroup.add(deck);

    // Side Ship Bulwarks (keep player on deck!)
    this._addCollider(-8.4, 3.0, 0, 1.0, 2.6, 45, new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.6, 45), darkWood));
    this._addCollider(8.4, 3.0, 0, 1.0, 2.6, 45, new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.6, 45), darkWood));
    this._addCollider(0, 3.0, 22.4, 17, 2.6, 1.0, new THREE.Mesh(new THREE.BoxGeometry(17, 2.6, 1.0), darkWood));
    this._addCollider(0, 3.0, -22.4, 17, 2.6, 1.0, new THREE.Mesh(new THREE.BoxGeometry(17, 2.6, 1.0), darkWood));

    // Broken Mast & Torn Sail
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 16, 8), darkWood);
    mast.position.set(0, 9.5, 2);
    mast.rotation.z = 0.14;
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(11, 8), new THREE.MeshStandardMaterial({ color: 0xe2e8f0, side: THREE.DoubleSide }));
    sail.position.set(0, 10.5, 1.4);
    this.worldGroup.add(mast, sail);

    // Deck Crates & Lanterns
    [[-5, 3.0, 8], [5, 3.0, -4]].forEach(([x, y, z]) => {
      this._addCollider(x, y, z, 2.2, 1.6, 2.2, new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 2.2), woodMat));
    });
    [[0, 5.2, -16], [0, 5.2, 12]].forEach(([lx, ly, lz]) => {
      const pl = new THREE.PointLight(0xffb703, 18, 28);
      pl.position.set(lx, ly, lz);
      this.worldGroup.add(pl);
    });

    // YOUR PARENTS trapped at the ship bow (z = -17)!
    const parentsPos = new THREE.Vector3(0, 2.2, -17);
    const mother = createNpcMesh('elder');
    mother.position.set(-1.3, 2.2, -17);
    const father = createNpcMesh('elder');
    father.position.set(1.3, 2.2, -17);
    this.worldGroup.add(mother, father);

    this.interactables.push({
      pos: parentsPos,
      radius: 4.6,
      label: 'Press [F] to FREE & SAVE YOUR PARENTS!',
      condition: () => true,
      action: () => {
        const raidersAlive = this.enemies.some(e => e.alive);
        if (raidersAlive) {
          this.callbacks.onCombo?.('⚔️ DEFEAT THE SHIPWRECK RAIDERS & CAPTAIN FIRST!');
          return;
        }
        this.samurai.parentsSaved = true;
        audio.playTrophyFanfare();
        this._awardXpAndGold(220, 300, '❤️ PARENTS SAVED! TIMELINE RESTORED!');
        this._saveCheckpoint('parents_saved', 'overworld', 0, 0.8, 74, 'Wolf Pack Rebellion');
        // Open portal forward to confront the Dragon Emperor in Atisashi OR return to Wolves!
        this._startPortalFallAnimation('atisashi_sky', 0xfbbf24, '✨ SAILING TO ATISASHI SKY CITADEL TO FACE THE EMPEROR!');
      }
    });

    // Sea Raiders + Corsair Captain Boss attacking the ship!
    this._spawnEnemies([
      { role: 'bandit', name: 'Imperial Sea Raider', x: -3.5, z: 4, hp: 85, dmg: 13 },
      { role: 'bandit', name: 'Imperial Sea Raider', x: 3.5, z: -2, hp: 85, dmg: 13 },
      { role: 'boss_captain', name: 'CORSAIR CAPTAIN (BOSS)', x: 0, z: -10, hp: 260, dmg: 22, isBoss: true }
    ]);

    this._spawnSpiritOrbs([[-4, 3.3, 10], [4, 3.3, 2], [0, 3.3, -6]]);
  }

  // --- REALM 3: ASTRA REALM — FIERY ABYSS & LAND OF NO RETURN ---
  _buildAstraFireRealm() {
    this.scene.background = new THREE.Color(0x260606);
    this.scene.fog = new THREE.FogExp2(0x3a0909, 0.013);

    const hemi = new THREE.HemisphereLight(0xff6b35, 0x1a0404, 0.85);
    const fireSun = new THREE.DirectionalLight(0xff5500, 1.6);
    fireSun.position.set(30, 60, 20);
    this.worldGroup.add(hemi, fireSun);

    // Scorched Obsidian Volcanic Ground
    const gGeo = new THREE.PlaneGeometry(180, 180, 56, 56);
    gGeo.rotateX(-Math.PI / 2);
    const pos = gGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, this._getGroundY(pos.getX(i), pos.getZ(i)));
    gGeo.computeVertexNormals();
    const ground = new THREE.Mesh(
      gGeo,
      new THREE.MeshStandardMaterial({ map: getConcreteTexture(14, true), color: 0x2b1515, roughness: 0.9 })
    );
    this.worldGroup.add(ground);

    // Glowing Molten Lava Rivers flanking the Land of No Return
    const lavaMat = new THREE.MeshBasicMaterial({ color: 0xff4500 });
    [-26, 26].forEach(lx => {
      const lava = new THREE.Mesh(new THREE.PlaneGeometry(18, 170), lavaMat);
      lava.rotation.x = -Math.PI / 2;
      lava.position.set(lx, 0.55, 0);
      this.worldGroup.add(lava);
    });

    // Jagged Volcanic Obsidian Spires
    const spireMat = new THREE.MeshStandardMaterial({ color: 0x1c1218, roughness: 0.55, metalness: 0.4 });
    for (let i = 0; i < 24; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const sx = side * (12 + (i % 4) * 4);
      const sz = -60 + i * 5.2;
      const spire = new THREE.Mesh(new THREE.ConeGeometry(2.2, 12 + (i % 4) * 4, 5), spireMat);
      spire.position.set(sx, 5, sz);
      this.worldGroup.add(spire);
      this._addCollider(sx, 5, sz, 2.8, 12, 2.8);
    }

    // Northern Ascension Gate to ATISASHI CITY IN THE SKY (z = -46)
    const gatePos = new THREE.Vector3(0, 1.0, -46);
    const gateRing = new THREE.Mesh(
      new THREE.TorusGeometry(3.8, 0.35, 10, 28),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
    );
    gateRing.position.set(0, 4.4, -46);
    const gateLight = new THREE.PointLight(0x38bdf8, 25, 32);
    gateLight.position.set(0, 4.5, -45);
    this.worldGroup.add(gateRing, gateLight);

    this.interactables.push({
      pos: gatePos,
      radius: 5.0,
      label: 'Press [F] to ESCAPE Land of No Return → ASCEND TO ATISASHI SKY CITY!',
      condition: () => true,
      action: () => {
        const bossAlive = this.enemies.some(e => e.isBoss && e.alive);
        if (bossAlive) {
          this.callbacks.onCombo?.('🔥 DEFEAT THE MAGMA WARDEN BOSS TO UNLOCK THE SKY PORTAL!');
          return;
        }
        this._startPortalFallAnimation('atisashi_sky', 0x38bdf8, '☁️ ASCENDING TO ATISASHI — CITY IN THE SKY!');
      }
    });

    // Strange Astra Creatures + Magma Warden Boss!
    this._spawnEnemies([
      { role: 'astra', name: 'Void Stalker', x: -8, z: 32, hp: 105, dmg: 15 },
      { role: 'astra', name: 'Inferno Wraith', x: 9, z: 16, hp: 105, dmg: 15 },
      { role: 'astra', name: 'Abyssal Fiend', x: -6, z: -2, hp: 120, dmg: 16 },
      { role: 'astra', name: 'Abyssal Fiend', x: 7, z: -16, hp: 120, dmg: 16 },
      { role: 'astra_boss', name: 'MAGMA WARDEN (BOSS)', x: 0, z: -32, hp: 320, dmg: 24, isBoss: true }
    ]);

    this._spawnSpiritOrbs([[0, 2.2, 42], [-9, 2.2, 22], [9, 2.2, 4], [0, 2.2, -18]]);
  }

  // --- REALM 4: ATISASHI CITY IN THE SKY (NO BRIDGES, MOVING BLOCKS, OBSTACLES, EYE LASER, DRAGON EMPEROR!) ---
  _buildAtisashiSkyRealm() {
    this.scene.background = new THREE.Color(0x63b3ed);
    this.scene.fog = new THREE.FogExp2(0x90cdf4, 0.0055);

    const hemi = new THREE.HemisphereLight(0xfef9c3, 0x38bdf8, 1.0);
    const sun = new THREE.DirectionalLight(0xfffbeb, 1.65);
    sun.position.set(45, 95, 35);
    sun.castShadow = true;
    this.worldGroup.add(hemi, sun);

    // Sea of Soft Clouds far below the sky road
    const cloudMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.95, transparent: true, opacity: 0.78 });
    for (let i = 0; i < 32; i++) {
      const cl = new THREE.Mesh(new THREE.SphereGeometry(12 + (i % 5) * 6, 10, 8), cloudMat);
      cl.scale.set(2.2, 0.45, 1.8);
      cl.position.set(((i * 47) % 240) - 120, -18 - (i % 4) * 4, ((i * 39) % 220) - 110);
      this.worldGroup.add(cl);
    }

    const marbleMat = new THREE.MeshStandardMaterial({ map: getStoneTileTexture(4), color: 0xf1f5f9, roughness: 0.45, metalness: 0.15 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.25, metalness: 0.85 });
    const jadeMat = new THREE.MeshStandardMaterial({ color: 0x10b981, emissive: 0x059669, emissiveIntensity: 0.55, roughness: 0.3 });
    const redRoof = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.45 });
    const hazardMat = new THREE.MeshStandardMaterial({ color: 0xf43f5e, emissive: 0xef4444, emissiveIntensity: 1.5 });

    const addIsland = (x, y, z, w, h, d, hasPagoda = false) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), marbleMat);
      m.position.set(x, y - h / 2, z);
      m.receiveShadow = true;
      const trim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.25, d + 0.3), goldMat);
      trim.position.set(x, y - 0.12, z);
      this.worldGroup.add(m, trim);
      this.skyPlatforms.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, topY: y });
      if (hasPagoda) {
        const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.48, 3.2, 4), redRoof);
        roof.rotation.y = Math.PI / 4;
        roof.position.set(x, y + 6.5, z);
        this.worldGroup.add(roof);
      }
    };

    // 1. Starting Floating Sky Landing Island (z = 62)
    addIsland(0, 1.5, 62, 16, 3, 14, true);

    // 2. Disconnected Sky Stepping Stones (Jump across — NO BRIDGES!)
    addIsland(0, 2.0, 48, 6.5, 2.2, 5.5);
    addIsland(-4.5, 2.6, 38, 6.0, 2.2, 5.5);
    addIsland(4.5, 3.2, 28, 6.0, 2.2, 5.5);

    // 3. MOVING SKY BLOCK #1 (Oscillates Left-Right across open chasm at z = 16)
    const addMovingBlock = (baseX, baseY, baseZ, w, h, d, axis, amp, speed, phase = 0) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), jadeMat);
      mesh.position.set(baseX, baseY, baseZ);
      this.worldGroup.add(mesh);
      this.movingBlocks.push({
        mesh,
        basePos: new THREE.Vector3(baseX, baseY, baseZ),
        pos: new THREE.Vector3(baseX, baseY, baseZ),
        prevPos: new THREE.Vector3(baseX, baseY, baseZ),
        halfW: w / 2, halfH: h / 2, halfD: d / 2,
        axis, amp, speed, phase
      });
    };

    addMovingBlock(0, 3.2, 16, 6.5, 1.2, 6.0, 'x', 7.5, 1.35, 0);
    // 4. Mid Sky Island with Rotating Energy Obstacle Bar to jump/slide over (z = 2)
    addIsland(0, 4.0, 2, 13, 2.5, 11);
    const spinner = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.65, 0.65), hazardMat);
    spinner.position.set(0, 4.9, 2);
    this.worldGroup.add(spinner);
    this.skyHazards.push({ mesh: spinner, center: new THREE.Vector3(0, 4.9, 2), radius: 5.8, speed: 1.7 });

    // 5. MOVING SKY BLOCK #2 (Glides Forward-Back across giant sky abyss z = -12)
    addMovingBlock(0, 4.4, -12, 6.8, 1.2, 6.2, 'z', 5.8, 1.25, 1.2);

    // 6. SOLAR EYE SHRINE ISLAND (z = -28) — UNLOCK THE POWERFUL EYE LASER [X] + SAVE CHECKPOINT!
    addIsland(0, 5.0, -28, 16, 3.0, 14, true);
    const eyeOrb = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.15, 1),
      new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x38bdf8, emissiveIntensity: 2.2 })
    );
    eyeOrb.position.set(0, 7.6, -28);
    const eyeBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.4, 18, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfef08a, transparent: true, opacity: 0.22, side: THREE.DoubleSide })
    );
    eyeBeam.position.set(0, 13, -28);
    this.worldGroup.add(eyeOrb, eyeBeam);

    this.interactables.push({
      pos: new THREE.Vector3(0, 5.0, -28),
      radius: 5.0,
      label: 'Press [F] to AWAKEN THE SOLAR EYE LASER [X] & Save Sky Checkpoint!',
      condition: () => !this.samurai.hasEyeLaser,
      action: () => {
        this.samurai.hasEyeLaser = true;
        audio.playTrophyFanfare();
        this._saveCheckpoint('solar_eye_shrine', 'atisashi_sky', 0, 5.5, -28, 'Atisashi Solar Eye Shrine');
        this._awardXpAndGold(180, 200, '👁️⚡ SOLAR EYE LASER AWAKENED! PRESS [X] TO BLAST THE DRAGON EMPEROR!');
      }
    });

    // 7. MOVING SKY BLOCK #3 leading into the DRAGON EMPEROR'S SKY ARENA (z = -44)
    addMovingBlock(0, 5.2, -44, 7.2, 1.2, 6.2, 'x', 6.5, 1.45, 2.0);

    // 8. GRAND DRAGON EMPEROR SKY ARENA (z = -68)
    addIsland(0, 6.0, -68, 36, 4.0, 32);

    // Spawn Sky Sentinel Guardian on Mid-Island + MIGHTY DRAGON EMPEROR on Grand Arena!
    this._spawnEnemies([
      { role: 'astra', name: 'Sky Sentinel', x: 0, z: -24, hp: 130, dmg: 16 }
    ]);

    const dragonMesh = createDragonEmperorMesh();
    dragonMesh.position.set(0, 7.5, -74);
    this.worldGroup.add(dragonMesh);
    this.dragonBoss = {
      name: 'EMPEROR RYU — CELESTIAL DRAGON',
      mesh: dragonMesh,
      pos: new THREE.Vector3(0, 7.5, -74),
      homeZ: -68,
      hp: 520 + (this.samurai.level - 1) * 60,
      maxHp: 520 + (this.samurai.level - 1) * 60,
      alive: true,
      angle: 0,
      fireCooldown: 2.2
    };

    this._spawnSpiritOrbs([[0, 3.5, 48], [0, 5.5, 2], [0, 6.6, -28], [-10, 7.5, -62], [10, 7.5, -62]]);
  }

  _spawnEnemies(configs) {
    const lvlScale = 1 + (this.samurai.level - 1) * 0.16;
    configs.forEach((cfg, idx) => {
      const y = this._getGroundY(cfg.x, cfg.z);
      let mesh;
      if (cfg.role === 'astra' || cfg.role === 'astra_boss') {
        mesh = createAstraCreatureMesh(Boolean(cfg.isBoss));
      } else {
        mesh = createNpcMesh(cfg.role === 'guard' ? 'guard' : 'bandit');
        if (cfg.isBoss) mesh.scale.setScalar(1.45);
      }
      mesh.position.set(cfg.x, Math.max(0.2, y), cfg.z);
      this.worldGroup.add(mesh);

      let ring = null;
      if (cfg.role === 'guard') {
        ring = new THREE.Mesh(
          new THREE.RingGeometry(0.9, 1.15, 20),
          new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.45, side: THREE.DoubleSide })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.08;
        mesh.add(ring);
      }

      const scaledHp = Math.round(cfg.hp * lvlScale);
      this.enemies.push({
        id: `${cfg.role}-${idx}`,
        role: cfg.role,
        name: cfg.name || 'Enemy',
        isBoss: Boolean(cfg.isBoss),
        mesh,
        ring,
        pos: new THREE.Vector3(cfg.x, Math.max(0.2, y), cfg.z),
        homePos: new THREE.Vector3(cfg.x, Math.max(0.2, y), cfg.z),
        patrolRadius: cfg.isBoss ? 5 : 7,
        patrolAngle: idx * 1.5,
        hp: scaledHp,
        maxHp: scaledHp,
        dmg: cfg.dmg || 14,
        alive: true,
        alerted: false,
        attackCooldown: 0,
        stunTimer: 0
      });
    });
  }

  // --- COMBAT: KATANA, TAI CHI, DISGUISE & POWERFUL EYE LASER [X] ---

  _syncDisguiseVisuals() {
    const s = this.samurai;
    const u = this.samuraiMesh.userData;
    u.disguiseGroup.visible = s.disguised;
    u.wolfMantle.visible = !s.disguised;
    u.katana.visible = s.swordDrawn && !s.disguised;
  }

  _toggleDisguise() {
    const s = this.samurai;
    if (!s.hasDisguise) {
      this.callbacks.onCombo?.('FIND THE DISGUISE AT THE RIVER SHRINE FIRST!');
      return;
    }
    s.disguised = !s.disguised;
    s.swordDrawn = !s.disguised;
    if (s.disguised) s.suspicion = Math.max(0, s.suspicion - 25);
    audio.playDisguise();
    this._syncDisguiseVisuals();
    this.callbacks.onCombo?.(s.disguised ? '🎭 DISGUISE EQUIPPED — BLEND IN' : '⚔️ KATANA DRAWN');
    this._pushHud();
  }

  _fireEyeLaser() {
    const s = this.samurai;
    if (!s.hasEyeLaser) {
      this.callbacks.onCombo?.('👁️ REACH ATISASHI SOLAR EYE SHRINE TO UNLOCK EYE LASER!');
      return;
    }
    if (s.eyeLaserCooldown > 0 || s.chi < 18) return;
    s.chi -= 18;
    s.eyeLaserTimer = 0.45;
    s.eyeLaserCooldown = 0.72;
    audio.playEyeLaser();
    this._advanceRandomMission('laser', 1);

    const origin = s.pos.clone().add(new THREE.Vector3(0, 1.62, 0));
    // Aim straight along camera look direction so player can blast the flying Dragon Emperor!
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    this.eyeLaserGroup.position.copy(origin);
    this.eyeLaserGroup.lookAt(origin.clone().add(dir));
    this.eyeLaserGroup.visible = true;

    const laserDmg = 68 + (s.level - 1) * 14;
    const ray = new THREE.Ray(origin, dir);
    const tmp = new THREE.Vector3();

    // Hit regular enemies & bosses
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const box = new THREE.Box3(
        e.pos.clone().add(new THREE.Vector3(-1.3, 0, -1.3)),
        e.pos.clone().add(new THREE.Vector3(1.3, 3.2, 1.3))
      );
      if (ray.intersectBox(box, tmp)) {
        this._damageEnemy(e, laserDmg, dir.clone().setY(0).normalize().multiplyScalar(3.2));
      }
    }

    // Hit the Mighty Celestial Dragon Emperor!
    if (this.dragonBoss && this.dragonBoss.alive) {
      const d = this.dragonBoss;
      const dBox = new THREE.Box3(
        d.pos.clone().add(new THREE.Vector3(-4.5, 0, -4.5)),
        d.pos.clone().add(new THREE.Vector3(4.5, 8.5, 4.5))
      );
      if (ray.intersectBox(dBox, tmp)) {
        this._damageDragonBoss(laserDmg * 1.35);
      }
    }
    this._pushHud();
  }

  _katanaAttack() {
    const s = this.samurai;
    if (s.attackTimer > 0) return;

    if (s.disguised) {
      s.disguised = false;
      s.swordDrawn = true;
      this._syncDisguiseVisuals();
      this.callbacks.onCombo?.('COVER BLOWN — BLADE DRAWN!');
    }

    s.comboStep = s.comboWindow > 0 ? (s.comboStep % 3) + 1 : 1;
    s.comboWindow = 0.85;
    s.attackDuration = s.comboStep === 3 ? 0.36 : 0.25;
    s.attackTimer = s.attackDuration;

    const isSlideStrike = s.sliding;
    audio.playSwordSlash(s.comboStep);

    const fwd = new THREE.Vector3(-Math.sin(s.yaw), 0, -Math.cos(s.yaw));
    this.slashArc.position.copy(s.pos).add(new THREE.Vector3(0, 1.15, 0)).addScaledVector(fwd, 0.85);
    this.slashArc.rotation.z = -s.yaw;
    this.slashArc.scale.setScalar(s.comboStep === 3 || isSlideStrike ? 1.5 : 1.05);
    this.slashArc.material.color.setHex(isSlideStrike ? 0x38bdf8 : s.comboStep === 3 ? 0xfbbf24 : 0xe0f2fe);
    this.slashArc.material.opacity = 0.92;

    if (isSlideStrike) {
      audio.playComboChime();
      this.callbacks.onCombo?.('COMBO: WILD FANG SLIDE SLASH!');
    } else if (s.comboStep === 3) {
      audio.playComboChime();
      this.callbacks.onCombo?.('COMBO: 3-HIT WHIRLWIND KATANA!');
    }

    const lvlBonus = (s.level - 1) * 7;
    const range = s.comboStep === 3 ? 4.4 : 3.5;
    const dmg = (isSlideStrike ? 58 : s.comboStep === 3 ? 52 : 30) + lvlBonus;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const toE = e.pos.clone().sub(s.pos);
      if (toE.length() < range && (s.comboStep === 3 || toE.normalize().dot(fwd) > 0.15)) {
        this._damageEnemy(e, dmg, fwd.clone().multiplyScalar(s.comboStep === 3 ? 3.5 : 1.5));
      }
    }

    if (this.dragonBoss && this.dragonBoss.alive && this.dragonBoss.pos.distanceTo(s.pos) < 8.5) {
      this._damageDragonBoss(dmg);
    }
  }

  _taiChiPalmWave() {
    const s = this.samurai;
    if (s.chi < 20) {
      this.callbacks.onCombo?.('NOT ENOUGH TAI CHI ENERGY!');
      return;
    }
    s.chi -= 20;
    audio.playTaiChi();
    this._advanceRandomMission('taichi', 1);
    this.callbacks.onCombo?.('☯️ TAI CHI: FLOWING PALM WAVE!');

    const fwd = new THREE.Vector3(-Math.sin(s.yaw), 0, -Math.cos(s.yaw)).normalize();
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.9, 0.13, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0x2dd4bf, transparent: true, opacity: 0.92 })
    );
    const startPos = s.pos.clone().add(new THREE.Vector3(0, 1.2, 0)).addScaledVector(fwd, 1.0);
    ring.position.copy(startPos);
    ring.rotation.y = s.yaw;
    this.scene.add(ring);

    this.chiWaves.push({ mesh: ring, pos: startPos, dir: fwd, life: 0.95, hitIds: new Set() });
    this._pushHud();
  }

  _taiChiDeflect() {
    const s = this.samurai;
    if (s.chi < 14) return;
    s.chi -= 14;
    s.taiChiDeflectTimer = 1.0;
    s.hp = Math.min(s.maxHp, s.hp + 10);
    audio.playTaiChi();
    this.callbacks.onCombo?.('☯️ TAI CHI: HARMONY DEFLECT STANCE');
    this._pushHud();
  }

  _interact() {
    const s = this.samurai;

    for (const r of this.relics) {
      if (!r.collected && s.pos.distanceTo(r.pos) < 3.8) {
        r.collected = true;
        r.mesh.visible = false;
        s.relicsFound += 1;
        audio.playPickup();
        this._awardXpAndGold(55, 60, `RELIC FOUND: ${r.label.toUpperCase()} (${s.relicsFound}/${s.totalRelics})`);
        return;
      }
    }

    for (const inter of this.interactables) {
      if (inter.condition() && s.pos.distanceTo(inter.pos) < inter.radius) {
        inter.action();
        return;
      }
    }
  }

  _damageEnemy(e, dmg, knockback) {
    e.hp -= dmg;
    e.alerted = true;
    e.pos.add(knockback);
    audio.playSwordHit();
    this._spawnHitSparks(e.pos.clone().add(new THREE.Vector3(0, 1.3, 0)), 0xfef08a);

    if (e.hp <= 0) {
      e.alive = false;
      e.mesh.visible = false;
      this._advanceRandomMission('kills', 1);
      if (e.isBoss) {
        this._advanceRandomMission('boss', 1);
        audio.playTrophyFanfare();
        this._awardXpAndGold(180, 240, `🏆 BOSS DEFEATED: ${e.name}`);
      } else {
        this._awardXpAndGold(45, 50, `⚔️ ${e.name.toUpperCase()} DEFEATED`);
      }
    }
  }

  _damageDragonBoss(dmg) {
    const d = this.dragonBoss;
    if (!d || !d.alive) return;
    d.hp = Math.max(0, d.hp - dmg);
    audio.playExplosion();
    this._spawnHitSparks(d.pos.clone().add(new THREE.Vector3(0, 4.0, 0)), 0x38bdf8);

    if (d.hp <= 0) {
      d.alive = false;
      d.mesh.visible = false;
      this.samurai.dragonDefeated = true;
      this.victoryShown = true;
      audio.playTrophyFanfare();
      this._awardXpAndGold(500, 1000, '🐉 MIGHTY DRAGON EMPEROR VANQUISHED!');
      if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock();
      this.callbacks.onGameOver?.({
        title: '🐉 CELESTIAL DRAGON EMPEROR DEFEATED!',
        subtitle: 'With Tai Chi, Katana mastery, and the Solar Eye Laser of Atisashi Sky City, you shattered the Dragon Emperor and brought peace to every realm!',
        stats: [
          { label: 'Ronin Level', value: `LV. ${this.samurai.level}` },
          { label: 'Spirit Gold', value: this.samurai.gold },
          { label: 'Parents Saved', value: this.samurai.parentsSaved ? 'Yes ❤️' : 'Astra Path 🔥' },
          { label: 'Eye Laser Awakened', value: this.samurai.hasEyeLaser ? 'Yes 👁️⚡' : 'Pure Blade' }
        ]
      });
    }
    this._pushHud();
  }

  _damagePlayer(amount, fallDeath = false) {
    const s = this.samurai;
    s.hp = fallDeath ? 0 : Math.max(0, s.hp - amount);
    audio.playPlayerHurt();
    this.callbacks.onDamageFlash?.();
    if (s.hp <= 0) {
      // Automatically respawn at the latest SAVED CHECKPOINT!
      const cp = s.activeCheckpoint || { realm: this.realm, x: 0, y: 2.0, z: 62, label: 'Checkpoint' };
      s.hp = s.maxHp;
      s.chi = s.maxChi;
      if (cp.realm !== this.realm) {
        this._loadRealm(cp.realm, new THREE.Vector3(cp.x, cp.y, cp.z));
      } else {
        s.pos.set(cp.x, cp.y, cp.z);
        s.vel.set(0, 0, 0);
      }
      this.callbacks.onCombo?.(
        fallDeath
          ? `☁️ FELL FROM THE SKY! RESPAWNED AT CHECKPOINT: ${cp.label.toUpperCase()}`
          : `💀 FALLEN! RETURNED TO CHECKPOINT: ${cp.label.toUpperCase()}`
      );
      this._pushHud();
    }
  }

  _spawnHitSparks(pos, color) {
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.14), new THREE.MeshBasicMaterial({ color }));
      m.position.copy(pos);
      this.scene.add(m);
      this.particles.push({
        mesh: m,
        vel: new THREE.Vector3((Math.random() - 0.5) * 7, Math.random() * 6 + 1, (Math.random() - 0.5) * 7),
        life: 0.38
      });
    }
  }

  _resolveHorizontalCollision(pos, radius = 0.6) {
    for (let pass = 0; pass < 2; pass++) {
      for (const c of this.colliders) {
        if (pos.y >= c.maxY - 0.35 || pos.y + 1.85 <= c.minY) continue;
        const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
        const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
        const dx = pos.x - cx;
        const dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < radius * radius) {
          const d = Math.sqrt(d2);
          if (d < 0.0001) {
            pos.x += radius;
          } else {
            pos.x += (dx / d) * (radius - d);
            pos.z += (dz / d) * (radius - d);
          }
        }
      }
    }
    if (this.realm !== 'atisashi_sky' && this.realm !== 'boat') {
      pos.x = THREE.MathUtils.clamp(pos.x, -95, 95);
      pos.z = THREE.MathUtils.clamp(pos.z, -95, 95);
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
        const d = anchor.distanceTo(hitPt) - 0.4;
        if (d < bestDist && d > 0.8) bestDist = d;
      }
    }
    return anchor.clone().addScaledVector(dir, bestDist);
  }

  // --- MAIN LOOP ---

  _loop() {
    if (this.isDisposed) return;
    requestAnimationFrame(this._loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    if (!this.isPaused && !this.victoryShown) {
      this._update(dt);
    }
    this.renderer.render(this.scene, this.camera);
  }

  _update(dt) {
    const s = this.samurai;

    // 1. CINEMATIC FALLING-INTO-PORTAL ANIMATION!
    if (this.portalAnim.active) {
      const pa = this.portalAnim;
      pa.timer += dt;
      // Plunge Ronin downward spinning gracefully through glowing energy rings!
      s.pos.y -= 14 * dt;
      this.samuraiMesh.position.copy(s.pos);
      this.samuraiMesh.rotation.y += dt * 7;
      this.samuraiMesh.rotation.x = 0.65;

      pa.rings.forEach((r, idx) => {
        r.rotation.z += dt * (idx % 2 === 0 ? 4 : -4);
        r.position.y += 9 * dt;
      });

      this.camera.position.set(s.pos.x + 2.5, s.pos.y + 4.8, s.pos.z + 4.2);
      this.camera.lookAt(s.pos.x, s.pos.y - 1.5, s.pos.z);

      if (pa.timer >= pa.duration) {
        pa.active = false;
        this.samuraiMesh.rotation.x = 0;
        while (this.portalGroup.children.length > 0) this.portalGroup.remove(this.portalGroup.children[0]);
        this._loadRealm(pa.targetRealm);
      }
      return;
    }

    s.chi = Math.min(s.maxChi, s.chi + 14 * dt);
    if (s.comboWindow > 0) s.comboWindow -= dt;
    if (s.attackTimer > 0) s.attackTimer -= dt;
    if (s.taiChiDeflectTimer > 0) s.taiChiDeflectTimer -= dt;
    if (s.eyeLaserCooldown > 0) s.eyeLaserCooldown -= dt;
    if (s.eyeLaserTimer > 0) {
      s.eyeLaserTimer -= dt;
      if (s.eyeLaserTimer <= 0) this.eyeLaserGroup.visible = false;
    }

    if (this.slashArc.material.opacity > 0) {
      this.slashArc.material.opacity = Math.max(0, this.slashArc.material.opacity - dt * 4.5);
    }

    // Update Moving Sky Blocks (Atisashi City in the Sky!)
    const tSec = performance.now() * 0.001;
    for (const mb of this.movingBlocks) {
      mb.prevPos.copy(mb.pos);
      const offset = Math.sin(tSec * mb.speed + mb.phase) * mb.amp;
      mb.pos.copy(mb.basePos);
      if (mb.axis === 'x') mb.pos.x += offset;
      else mb.pos.z += offset;
      mb.mesh.position.copy(mb.pos);

      // Carry player smoothly if standing on top of this moving sky block!
      const topY = mb.pos.y + mb.halfH;
      if (
        s.grounded &&
        Math.abs(s.pos.y - topY) < 0.45 &&
        s.pos.x >= mb.prevPos.x - mb.halfW - 0.55 && s.pos.x <= mb.prevPos.x + mb.halfW + 0.55 &&
        s.pos.z >= mb.prevPos.z - mb.halfD - 0.55 && s.pos.z <= mb.prevPos.z + mb.halfD + 0.55
      ) {
        s.pos.x += mb.pos.x - mb.prevPos.x;
        s.pos.z += mb.pos.z - mb.prevPos.z;
      }
    }

    // Update Rotating Sky Obstacles
    for (const hz of this.skyHazards) {
      hz.mesh.rotation.y += hz.speed * dt;
      const dist = Math.hypot(s.pos.x - hz.center.x, s.pos.z - hz.center.z);
      if (dist < hz.radius && Math.abs(s.pos.y - (hz.center.y - 0.9)) < 0.7 && !s.sliding) {
        // Player can JUMP over or 3D SLIDE under the spinning obstacle!
        const ang = hz.mesh.rotation.y;
        const barDir = new THREE.Vector3(Math.cos(ang), 0, -Math.sin(ang));
        const toP = new THREE.Vector3(s.pos.x - hz.center.x, 0, s.pos.z - hz.center.z);
        const perp = Math.abs(toP.x * barDir.z - toP.z * barDir.x);
        if (perp < 0.65) {
          this._damagePlayer(18);
          s.vel.y = 6.5;
        }
      }
    }

    // Zone Name
    if (this.realm === 'overworld') {
      s.zone = s.pos.z < -26 ? 'Imperial City' : s.pos.z < 18 ? 'Bamboo Pass & Great Bridge' : 'Ancient Wolf Forest';
    } else {
      s.zone = REALM_LABELS[this.realm] || this.realm;
    }

    // Camera-Relative Movement
    const camFwd = new THREE.Vector3(-Math.sin(s.camYaw), 0, -Math.cos(s.camYaw));
    const camRight = new THREE.Vector3(Math.cos(s.camYaw), 0, -Math.sin(s.camYaw));
    const move = new THREE.Vector3();
    if (this.keys['KeyW'] || this.keys['ArrowUp']) move.add(camFwd);
    if (this.keys['KeyS'] || this.keys['ArrowDown']) move.sub(camFwd);
    if (this.keys['KeyD'] || this.keys['ArrowRight']) move.add(camRight);
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) move.sub(camRight);
    if (Math.abs(this.touchMoveX) > 0.08 || Math.abs(this.touchMoveY) > 0.08) {
      move.addScaledVector(camFwd, this.touchMoveY);
      move.addScaledVector(camRight, this.touchMoveX);
    }
    if (move.lengthSq() > 1) move.normalize();

    const joySprint = Math.hypot(this.touchMoveX, this.touchMoveY) > 0.85;
    const sprinting = (this.keys['ShiftLeft'] || this.keys['ShiftRight'] || joySprint) && !s.disguised;
    let moveSpeed = 0;

    if (s.sliding) {
      s.slideTimer -= dt;
      moveSpeed = 14.8;
      s.pos.addScaledVector(s.slideDir, moveSpeed * dt);
      if (s.slideTimer <= 0) s.sliding = false;
    } else if (move.lengthSq() > 0.01) {
      moveSpeed = s.disguised ? 5.8 : sprinting ? 11.6 : 7.8;
      s.pos.addScaledVector(move, moveSpeed * dt);
      const targetYaw = Math.atan2(-move.x, -move.z);
      let diff = targetYaw - s.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      s.yaw += diff * Math.min(1, dt * 12);

      if (s.grounded) {
        s.footstepTimer -= dt;
        if (s.footstepTimer <= 0) {
          audio.playFootstep(this.realm === 'overworld' ? 'grass' : 'concrete');
          s.footstepTimer = sprinting ? 0.28 : 0.44;
        }
      }
    }

    // Gravity, Sky Island Landings & Sky Fall Death!
    s.vel.y -= 24 * dt;
    s.pos.y += s.vel.y * dt;
    const groundY = this._getGroundY(s.pos.x, s.pos.z);
    if (groundY > -50 && s.pos.y <= groundY && s.vel.y <= 0.1) {
      s.pos.y = groundY;
      s.vel.y = 0;
      s.grounded = true;
    } else if (s.pos.y > groundY + 0.15) {
      s.grounded = false;
    }

    // Fell off Atisashi City in the Sky!
    if (this.realm === 'atisashi_sky' && s.pos.y < -8) {
      this._damagePlayer(999, true);
      return;
    }

    this._resolveHorizontalCollision(s.pos, 0.6);

    // Animate Samurai Mesh
    this.samuraiMesh.position.copy(s.pos);
    this.samuraiMesh.rotation.y = s.yaw;
    const u = this.samuraiMesh.userData;
    if (s.sliding) {
      u.body.position.y = THREE.MathUtils.lerp(u.body.position.y, -0.52, dt * 14);
      u.body.rotation.x = THREE.MathUtils.lerp(u.body.rotation.x, -0.78, dt * 14);
    } else {
      u.body.position.y = THREE.MathUtils.lerp(u.body.position.y, 0, dt * 12);
      u.body.rotation.x = THREE.MathUtils.lerp(u.body.rotation.x, 0, dt * 12);
      if (moveSpeed > 0.5) {
        u.phase += dt * moveSpeed * 1.45;
        u.leftLeg.rotation.x = Math.sin(u.phase) * 0.68;
        u.rightLeg.rotation.x = -Math.sin(u.phase) * 0.68;
      } else {
        u.leftLeg.rotation.x = THREE.MathUtils.lerp(u.leftLeg.rotation.x, 0, dt * 10);
        u.rightLeg.rotation.x = THREE.MathUtils.lerp(u.rightLeg.rotation.x, 0, dt * 10);
      }
    }

    if (s.attackTimer > 0) {
      const t = 1 - s.attackTimer / s.attackDuration;
      u.rightArmPivot.rotation.x = -1.6 + t * 2.8;
      u.rightArmPivot.rotation.y = (s.comboStep % 2 === 0 ? 1 : -1) * (t * 1.4 - 0.7);
    } else {
      u.rightArmPivot.rotation.x = THREE.MathUtils.lerp(u.rightArmPivot.rotation.x, 0.2, dt * 10);
      u.rightArmPivot.rotation.y = THREE.MathUtils.lerp(u.rightArmPivot.rotation.y, 0, dt * 10);
    }
    u.chiRing.material.opacity = s.taiChiDeflectTimer > 0 ? 0.8 : 0;
    u.chiRing.rotation.z += dt * 5;

    // Smooth Orbit Camera + Wall-Clip Prevention
    const camDist = 6.8;
    const anchor = new THREE.Vector3(s.pos.x, s.pos.y + 1.65, s.pos.z);
    const camOffset = new THREE.Vector3(
      Math.sin(s.camYaw) * Math.cos(s.camPitch) * camDist,
      Math.sin(s.camPitch) * camDist + 0.3,
      Math.cos(s.camYaw) * Math.cos(s.camPitch) * camDist
    );
    const rawCam = anchor.clone().add(camOffset);
    const desiredCam = this._clipCameraAgainstWalls(anchor, rawCam);
    this.camera.position.lerp(desiredCam, Math.min(1, dt * 14));
    this.camera.lookAt(s.pos.x, s.pos.y + 1.5, s.pos.z);

    // Collect Floating Spirit Orbs (Random Mission)
    for (const orb of this.spiritOrbs) {
      if (orb.collected) continue;
      orb.mesh.rotation.y += dt * 2.5;
      if (orb.pos.distanceTo(s.pos) < 2.2) {
        orb.collected = true;
        orb.mesh.visible = false;
        audio.playPickup();
        this._advanceRandomMission('orbs', 1);
      }
    }

    // Animate Wolves & Relics
    for (const w of this.wolves) {
      w.angle += dt * 0.45;
      const wx = w.home.x + Math.cos(w.angle) * 3.5;
      const wz = w.home.z + Math.sin(w.angle) * 3.5;
      w.mesh.position.set(wx, this._getGroundY(wx, wz), wz);
      w.mesh.rotation.y = -w.angle;
    }
    this.relics.forEach(r => { if (!r.collected) r.mesh.rotation.y += dt * 2; });

    // Update Tai Chi Waves
    for (let i = this.chiWaves.length - 1; i >= 0; i--) {
      const cw = this.chiWaves[i];
      cw.life -= dt;
      cw.pos.addScaledVector(cw.dir, 19 * dt);
      cw.mesh.position.copy(cw.pos);
      cw.mesh.scale.addScalar(dt * 2.4);
      cw.mesh.material.opacity = Math.max(0, cw.life);
      for (const e of this.enemies) {
        if (!e.alive || cw.hitIds.has(e.id)) continue;
        if (e.pos.distanceTo(cw.pos) < 2.8) {
          cw.hitIds.add(e.id);
          e.stunTimer = 2.4;
          this._damageEnemy(e, 36 + (s.level - 1) * 6, cw.dir.clone().multiplyScalar(5.5));
        }
      }
      if (this.dragonBoss && this.dragonBoss.alive && !cw.hitIds.has('dragon') && this.dragonBoss.pos.distanceTo(cw.pos) < 6.5) {
        cw.hitIds.add('dragon');
        this._damageDragonBoss(42 + (s.level - 1) * 8);
      }
      if (cw.life <= 0) {
        this.scene.remove(cw.mesh);
        this.chiWaves.splice(i, 1);
      }
    }

    // Update Enemies (Bandits, Guards, Raiders, Strange Astra Creatures & Bosses)
    let nearSuspiciousGuard = false;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e.stunTimer > 0) { e.stunTimer -= dt; continue; }

      // Animate Astra Strange Creatures hovering & spinning!
      if (e.mesh.userData.halo) {
        e.mesh.userData.halo.rotation.z += dt * 3.2;
        e.mesh.userData.core.rotation.y += dt * 2.2;
      }

      const toP = s.pos.clone().sub(e.pos);
      const dist = toP.length();

      if (e.role === 'guard') {
        if (dist < 13 && !e.alerted) {
          if (!s.disguised) {
            nearSuspiciousGuard = true;
            s.suspicion = Math.min(100, s.suspicion + 48 * dt);
          } else if (dist < 3.2) {
            nearSuspiciousGuard = true;
            s.suspicion = Math.min(100, s.suspicion + 14 * dt);
          }
          if (s.suspicion >= 100) {
            e.alerted = true;
            this.callbacks.onCombo?.('ALERT! IMPERIAL GUARDS SPOTTED YOU!');
          }
        }
        if (e.ring) e.ring.material.color.setHex(e.alerted ? 0xef4444 : nearSuspiciousGuard ? 0xf97316 : 0x22c55e);
      } else if (dist < 18) {
        e.alerted = true;
      }

      if (e.alerted && dist < 28) {
        e.mesh.rotation.y = Math.atan2(-toP.x, -toP.z);
        if (dist > 2.1) {
          const dir = new THREE.Vector3(toP.x, 0, toP.z).normalize();
          e.pos.addScaledVector(dir, (e.isBoss ? 5.6 : 5.0) * dt);
          const gy = this._getGroundY(e.pos.x, e.pos.z);
          if (gy > -20) e.pos.y = gy;
          this._resolveHorizontalCollision(e.pos, 0.6);
        } else {
          e.attackCooldown -= dt;
          if (e.attackCooldown <= 0) {
            e.attackCooldown = 1.05;
            if (s.taiChiDeflectTimer > 0) {
              e.stunTimer = 2.0;
              audio.playSwordHit();
              this.callbacks.onCombo?.('☯️ PERFECT TAI CHI DEFLECT!');
            } else {
              this._damagePlayer(e.dmg);
            }
          }
        }
      } else {
        e.patrolAngle += dt * 0.45;
        const px = e.homePos.x + Math.cos(e.patrolAngle) * e.patrolRadius;
        const pz = e.homePos.z + Math.sin(e.patrolAngle) * (e.patrolRadius * 0.5);
        const dir = new THREE.Vector3(px - e.pos.x, 0, pz - e.pos.z);
        if (dir.length() > 0.2) {
          e.mesh.rotation.y = Math.atan2(-dir.x, -dir.z);
          dir.normalize();
          e.pos.addScaledVector(dir, 2.2 * dt);
        }
      }
      e.mesh.position.copy(e.pos);
    }

    if (!nearSuspiciousGuard && s.suspicion > 0) s.suspicion = Math.max(0, s.suspicion - 18 * dt);

    // Update MIGHTY DRAGON EMPEROR BOSS!
    if (this.dragonBoss && this.dragonBoss.alive) {
      const d = this.dragonBoss;
      d.angle += dt * 0.65;
      d.pos.x = Math.sin(d.angle) * 11;
      d.pos.z = d.homeZ + Math.cos(d.angle) * 7;
      d.pos.y = 7.2 + Math.sin(d.angle * 2.5) * 1.4;
      d.mesh.position.copy(d.pos);
      d.mesh.lookAt(s.pos.x, d.pos.y, s.pos.z);

      // Flap wings & undulate dragon spine
      const du = d.mesh.userData;
      du.phase += dt * 6;
      du.wingL.rotation.z = Math.sin(du.phase) * 0.45;
      du.wingR.rotation.z = -Math.sin(du.phase) * 0.45;

      // Shoot Fireballs when Ronin reaches the Sky Arena
      if (s.pos.distanceTo(d.pos) < 38) {
        d.fireCooldown -= dt;
        if (d.fireCooldown <= 0) {
          d.fireCooldown = 2.0;
          audio.playExplosion();
          const fb = new THREE.Mesh(
            new THREE.SphereGeometry(0.65, 10, 10),
            new THREE.MeshBasicMaterial({ color: 0xff5500 })
          );
          const start = d.pos.clone().add(new THREE.Vector3(0, 3.8, 0));
          fb.position.copy(start);
          this.scene.add(fb);
          const vel = s.pos.clone().add(new THREE.Vector3(0, 1.0, 0)).sub(start).normalize().multiplyScalar(22);
          this.dragonFireballs.push({ mesh: fb, pos: start, vel, life: 3.5 });
        }
      }
    }

    // Update Dragon Fireballs
    for (let i = this.dragonFireballs.length - 1; i >= 0; i--) {
      const fb = this.dragonFireballs[i];
      fb.life -= dt;
      fb.pos.addScaledVector(fb.vel, dt);
      fb.mesh.position.copy(fb.pos);
      if (fb.pos.distanceTo(s.pos.clone().add(new THREE.Vector3(0, 1.1, 0))) < 1.65) {
        if (s.taiChiDeflectTimer > 0) {
          this.callbacks.onCombo?.('☯️ DRAGON FIREBALL DEFLECTED!');
          this._damageDragonBoss(45);
        } else {
          this._damagePlayer(24);
        }
        fb.life = 0;
      }
      if (fb.life <= 0) {
        this.scene.remove(fb.mesh);
        this.dragonFireballs.splice(i, 1);
      }
    }

    // Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.life -= dt;
      pt.mesh.position.addScaledVector(pt.vel, dt);
      if (pt.life <= 0) {
        this.scene.remove(pt.mesh);
        this.particles.splice(i, 1);
      }
    }

    // Contextual Interact Prompts
    let prompt = '';
    for (const r of this.relics) {
      if (!r.collected && s.pos.distanceTo(r.pos) < 3.8) prompt = `Press [F] to collect ${r.label}`;
    }
    if (!prompt) {
      for (const inter of this.interactables) {
        if (inter.condition() && s.pos.distanceTo(inter.pos) < inter.radius) {
          prompt = inter.label;
          break;
        }
      }
    }
    this.callbacks.onPrompt?.(prompt);

    if (Math.floor(performance.now() / 180) !== Math.floor((performance.now() - dt * 1000) / 180)) {
      this._pushHud();
    }
  }

  _pushHud() {
    const s = this.samurai;
    let activeBoss = null;
    if (this.dragonBoss && this.dragonBoss.alive && s.pos.distanceTo(this.dragonBoss.pos) < 42) {
      activeBoss = { name: this.dragonBoss.name, hp: Math.ceil(this.dragonBoss.hp), maxHp: this.dragonBoss.maxHp };
    } else {
      const nearbyBoss = this.enemies.find(e => e.isBoss && e.alive && e.pos.distanceTo(s.pos) < 30);
      if (nearbyBoss) activeBoss = { name: nearbyBoss.name, hp: Math.ceil(nearbyBoss.hp), maxHp: nearbyBoss.maxHp };
    }

    let objective = 'Reach the Imperial City Elders (North Green Beacon) to unlock your destiny!';
    if (this.realm === 'boat') {
      objective = 'Defeat the Sea Raiders & Corsair Captain, then press [F] at the bow to SAVE YOUR PARENTS!';
    } else if (this.realm === 'astra_fire') {
      objective = 'Fight through Strange Creatures & defeat the Magma Warden Boss to escape into Atisashi Sky City!';
    } else if (this.realm === 'atisashi_sky') {
      objective = !s.hasEyeLaser
        ? 'Jump across the disconnected Sky Road & Moving Blocks (don\'t fall!) to unlock the SOLAR EYE LASER!'
        : 'Cross the final Moving Sky Block & defeat the MIGHTY DRAGON EMPEROR using your Eye Laser [X]!';
    }

    const mapEntities = [
      ...this.relics.filter(r => !r.collected).map(r => ({ x: r.pos.x, z: r.pos.z, color: '#fbbf24', type: 'relic' })),
      ...this.enemies.filter(e => e.alive).map(e => ({ x: e.pos.x, z: e.pos.z, color: e.isBoss ? '#f43f5e' : '#fb923c', type: 'enemy' })),
      ...this.interactables.filter(i => i.condition()).map(i => ({ x: i.pos.x, z: i.pos.z, color: '#22c55e', type: 'elder' }))
    ];

    this.callbacks.onHudUpdate?.({
      game: 'samurai',
      realm: this.realm,
      level: s.level,
      xp: s.xp,
      xpNext: s.xpNext,
      gold: s.gold,
      hp: Math.ceil(s.hp),
      maxHp: s.maxHp,
      chi: Math.ceil(s.chi),
      maxChi: s.maxChi,
      zone: s.zone,
      objective,
      activeBoss,
      randomMission: this.randomMission,
      checkpointLabel: s.activeCheckpoint?.label || 'Wolf Forest Den',
      unlockedCheckpoints: this.getUnlockedCheckpoints(),
      relicsFound: s.relicsFound,
      totalRelics: s.totalRelics,
      hasDisguise: s.hasDisguise,
      disguised: s.disguised,
      hasEyeLaser: s.hasEyeLaser,
      suspicion: Math.round(s.suspicion),
      playerPos: { x: s.pos.x, z: s.pos.z, yaw: s.yaw },
      mapEntities
    });
  }

  _bindEvents() {
    this._onResize = () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    };

    this._onKeyDown = (e) => {
      if (e.code === 'KeyP') { this.setPaused(!this.isPaused); return; }
      if (this.isPaused || this.victoryShown || this.portalAnim.active) return;
      this.keys[e.code] = true;

      const s = this.samurai;
      if (e.code === 'Space' && s.grounded) {
        s.vel.y = 11.2;
        s.grounded = false;
      } else if (e.code === 'KeyC' || e.code === 'ControlLeft') {
        if (!s.sliding && s.grounded) {
          const dir = new THREE.Vector3(-Math.sin(s.yaw), 0, -Math.cos(s.yaw)).normalize();
          s.sliding = true;
          s.slideTimer = 0.65;
          s.slideDir.copy(dir);
          audio.playSlide();
          this._advanceRandomMission('slides', 1);
          this.callbacks.onCombo?.('💨 3D WILD SLIDE!');
        }
      } else if (e.code === 'KeyQ') {
        this._taiChiPalmWave();
      } else if (e.code === 'KeyE') {
        this._taiChiDeflect();
      } else if (e.code === 'KeyR') {
        this._toggleDisguise();
      } else if (e.code === 'KeyF') {
        this._interact();
      } else if (e.code === 'KeyX') {
        this._fireEyeLaser();
      }
    };

    this._onKeyUp = (e) => { this.keys[e.code] = false; };

    this._onMouseMove = (e) => {
      if (this.isPaused || this.victoryShown || this.portalAnim.active) return;
      if (document.pointerLockElement !== this.renderer.domElement) return;
      this.samurai.camYaw -= e.movementX * 0.0028;
      this.samurai.camPitch = THREE.MathUtils.clamp(this.samurai.camPitch + e.movementY * 0.0022, 0.06, 1.05);
    };

    this._onMouseDown = (e) => {
      if (this.isPaused || this.victoryShown || this.portalAnim.active) return;
      audio.init();
      if (document.pointerLockElement !== this.renderer.domElement) {
        this.requestPointerLock();
        return;
      }
      if (e.button === 0) this._katanaAttack();
      else if (e.button === 2) this._taiChiPalmWave();
      else if (e.button === 1) this._fireEyeLaser();
    };

    this._onContextMenu = (e) => e.preventDefault();

    this._onPointerLockChange = () => {
      if (document.pointerLockElement !== this.renderer.domElement && !this.isPaused && !this.victoryShown && !this.portalAnim.active) {
        this.setPaused(true);
      }
    };

    window.addEventListener('resize', this._onResize);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousemove', this._onMouseMove);
    this.renderer.domElement.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', () => {});
    this.renderer.domElement.addEventListener('contextmenu', this._onContextMenu);
    document.addEventListener('pointerlockchange', this._onPointerLockChange);
  }

  dispose() {
    this.isDisposed = true;
    audio.stopMusic();
    if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock();
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('pointerlockchange', this._onPointerLockChange);
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
  }
}
