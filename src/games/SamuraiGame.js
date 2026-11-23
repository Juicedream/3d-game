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
  createNpcMesh
} from '../engine/CharacterMesh.js';

export class SamuraiGame {
  constructor(container, callbacks) {
    this.container = container;
    this.callbacks = callbacks; // { onHudUpdate, onCombo, onPrompt, onPauseChange, onGameOver }
    this.isPaused = false;
    this.isDisposed = false;
    this.missionCompleted = false;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x95b8c7);
    this.scene.fog = new THREE.FogExp2(0x95b8c7, 0.0085);

    this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 320);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.container.appendChild(this.renderer.domElement);

    // Player Samurai state
    this.samurai = {
      pos: new THREE.Vector3(0, 0, 74), // Starts in the Ancient Wolf Forest!
      vel: new THREE.Vector3(),
      yaw: 0, // Facing north (-Z) toward the river & Imperial City
      camYaw: 0,
      camPitch: 0.34,
      hp: 100,
      maxHp: 100,
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
      hasDisguise: false,
      disguised: false,
      swordDrawn: true,
      suspicion: 0, // 0..100 inside Imperial City
      relicsFound: 0,
      totalRelics: 3,
      footstepTimer: 0,
      zone: 'Ancient Wolf Forest'
    };

    this.keys = {};
    this.colliders = [];
    this.wolves = [];
    this.enemies = []; // Forest bandits + Imperial city guards
    this.relics = [];
    this.chiWaves = [];
    this.particles = [];
    this.disguiseShrinePos = new THREE.Vector3(-12, 0, 18);
    this.elderPos = new THREE.Vector3(0, 0, -84);
    this.disguisePickupMesh = null;

    this.samuraiMesh = createSamuraiMesh();
    this.scene.add(this.samuraiMesh);

    // Sword slash visual arc
    this.slashArc = new THREE.Mesh(
      new THREE.RingGeometry(0.95, 2.05, 18, 1, -Math.PI * 0.45, Math.PI * 0.9),
      new THREE.MeshBasicMaterial({ color: 0xe0f2fe, transparent: true, opacity: 0, side: THREE.DoubleSide })
    );
    this.slashArc.rotation.x = Math.PI / 2;
    this.scene.add(this.slashArc);

    this._buildOpenWorld();
    this._bindEvents();

    this.clock = new THREE.Clock();
    this._loop = this._loop.bind(this);
  }

  start() {
    this.isPaused = false;
    this.missionCompleted = false;
    this._resetState();
    audio.playMusic('samurai');
    this.clock.start();
    this._pushHud();
    requestAnimationFrame(this._loop);
  }

  _resetState() {
    const s = this.samurai;
    s.pos.set(0, this._getTerrainHeight(0, 74), 74);
    s.vel.set(0, 0, 0);
    s.yaw = 0;
    s.camYaw = 0;
    s.camPitch = 0.34;
    s.hp = 100;
    s.chi = 100;
    s.sliding = false;
    s.slideTimer = 0;
    s.hasDisguise = false;
    s.disguised = false;
    s.swordDrawn = true;
    s.suspicion = 0;
    s.relicsFound = 0;

    this._syncDisguiseVisuals();
    this.relics.forEach(r => {
      r.collected = false;
      r.mesh.visible = true;
    });
    if (this.disguisePickupMesh) this.disguisePickupMesh.visible = true;
    this.enemies.forEach(e => {
      e.hp = e.maxHp;
      e.alive = true;
      e.alerted = false;
      e.stunTimer = 0;
      e.mesh.visible = true;
      e.pos.copy(e.homePos);
    });
  }

  restart() {
    this.missionCompleted = false;
    this.isPaused = false;
    this._resetState();
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
    if (!this.isPaused && !this.missionCompleted && this.renderer?.domElement) {
      this.renderer.domElement.requestPointerLock?.();
    }
  }

  // --- OPEN 3D WORLD HEIGHT & CONSTRUCTION ---

  _getTerrainHeight(x, z) {
    // Imperial City plateau (flat stone floor)
    if (z < -26) return 0.5;
    // River valley around z = 6
    if (z > -2 && z < 14 && Math.abs(x) > 5.2) {
      const t = 1 - Math.abs(z - 6) / 8;
      return -1.4 * t;
    }
    // Bridge deck stays smooth
    if (z >= -4 && z <= 16 && Math.abs(x) <= 5.2) {
      const t = Math.cos(((z - 6) / 10) * Math.PI * 0.5);
      return 0.6 + Math.max(0, t) * 1.1;
    }
    // Rolling Ancient Forest hills & sliding slopes!
    const hill = Math.sin(x * 0.045) * Math.cos(z * 0.045) * 2.6 + Math.sin((z - 30) * 0.07) * 1.3;
    const blend = THREE.MathUtils.clamp((z - 12) / 18, 0, 1);
    return Math.max(0.1, hill * blend + 0.5);
  }

  _addCollider(x, y, z, w, h, d, mesh = null) {
    if (mesh) this.scene.add(mesh);
    this.colliders.push({
      minX: x - w / 2, maxX: x + w / 2,
      minY: y - h / 2, maxY: y + h / 2,
      minZ: z - d / 2, maxZ: z + d / 2
    });
  }

  _buildOpenWorld() {
    // Golden sunrise lighting
    const hemi = new THREE.HemisphereLight(0xcbe8ff, 0x2d4227, 0.85);
    const sun = new THREE.DirectionalLight(0xffe9c2, 1.45);
    sun.position.set(55, 80, 45);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = 85;
    sun.shadow.camera.left = -sc;
    sun.shadow.camera.right = sc;
    sun.shadow.camera.top = sc;
    sun.shadow.camera.bottom = -sc;
    sun.shadow.camera.far = 220;
    this.scene.add(hemi, sun);

    // Continuous 220x220 terrain mesh
    const tGeo = new THREE.PlaneGeometry(220, 220, 88, 88);
    tGeo.rotateX(-Math.PI / 2);
    const pos = tGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, this._getTerrainHeight(pos.getX(i), pos.getZ(i)));
    }
    tGeo.computeVertexNormals();
    const terrain = new THREE.Mesh(
      tGeo,
      new THREE.MeshStandardMaterial({ map: getGrassTexture(28), roughness: 0.94 })
    );
    terrain.receiveShadow = true;
    this.scene.add(terrain);

    // Sparkling River running East-West at z = 6
    const river = new THREE.Mesh(
      new THREE.PlaneGeometry(220, 14),
      new THREE.MeshStandardMaterial({
        color: 0x2288a8,
        roughness: 0.18,
        metalness: 0.35,
        transparent: true,
        opacity: 0.86
      })
    );
    river.rotation.x = -Math.PI / 2;
    river.position.set(0, -0.35, 6);
    this.scene.add(river);

    // Red Arched Timber Bridge over the river
    const woodMat = new THREE.MeshStandardMaterial({ map: getCrateTexture(), color: 0x8b4513, roughness: 0.82 });
    const redLacquer = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.45 });
    const bridgeDeck = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.45, 20), woodMat);
    bridgeDeck.position.set(0, 1.35, 6);
    bridgeDeck.receiveShadow = true;
    this.scene.add(bridgeDeck);
    [-4.6, 4.6].forEach(bx => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.1, 20), redLacquer);
      rail.position.set(bx, 2.0, 6);
      this.scene.add(rail);
    });

    // Crimson Torii Gates guiding the Samurai north from Forest -> Bridge -> Imperial City
    [42, -10, -32].forEach(tz => {
      const ty = this._getTerrainHeight(0, tz);
      const pillarL = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 7.2, 8), redLacquer);
      pillarL.position.set(-4.2, ty + 3.6, tz);
      const pillarR = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 7.2, 8), redLacquer);
      pillarR.position.set(4.2, ty + 3.6, tz);
      const topBeam = new THREE.Mesh(new THREE.BoxGeometry(11.4, 0.7, 0.9), redLacquer);
      topBeam.position.set(0, ty + 7.2, tz);
      const subBeam = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.45, 0.55), new THREE.MeshStandardMaterial({ color: 0x1e1b18 }));
      subBeam.position.set(0, ty + 6.1, tz);
      this.scene.add(pillarL, pillarR, topBeam, subBeam);
    });

    // --- ZONE 1: ANCIENT WOLF FOREST (z: 18 to 95) ---
    const barkMat = new THREE.MeshStandardMaterial({ map: getBarkTexture(), roughness: 0.92 });
    const pineMat = new THREE.MeshStandardMaterial({ color: 0x1d4d27, roughness: 0.85 });
    const bambooMat = new THREE.MeshStandardMaterial({ color: 0x4d7c2b, roughness: 0.6 });

    for (let i = 0; i < 65; i++) {
      const tx = ((i * 37) % 140) - 70;
      const tz = 18 + ((i * 29) % 76);
      if (Math.abs(tx) < 7 && tz < 80) continue; // Keep forest trail open
      if (Math.hypot(tx - this.disguiseShrinePos.x, tz - this.disguiseShrinePos.z) < 7) continue;
      const ty = this._getTerrainHeight(tx, tz);
      const h = 7 + (i % 5) * 1.8;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.48, h, 7), barkMat);
      trunk.position.set(tx, ty + h / 2, tz);
      trunk.castShadow = true;
      this.scene.add(trunk);
      for (let k = 0; k < 3; k++) {
        const foliage = new THREE.Mesh(new THREE.ConeGeometry(2.8 - k * 0.55, 4.2, 7), pineMat);
        foliage.position.set(tx, ty + h * 0.52 + k * 2.1, tz);
        foliage.castShadow = true;
        this.scene.add(foliage);
      }
      this._addCollider(tx, ty + h / 2, tz, 1.1, h, 1.1);
    }

    // Bamboo grove near the mountain pass (z: -20 to -4)
    for (let i = 0; i < 36; i++) {
      const bx = (i % 2 === 0 ? -1 : 1) * (10 + (i % 15) * 2.4);
      const bz = -22 + (i % 14) * 1.4;
      const by = this._getTerrainHeight(bx, bz);
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 11, 6), bambooMat);
      stalk.position.set(bx, by + 5.5, bz);
      this.scene.add(stalk);
    }

    // Friendly Wolf Pack near the Ronin's Childhood Forest Den (z ~ 72)
    [
      { x: -5, z: 72, alpha: true },
      { x: 5.5, z: 76, alpha: false },
      { x: -3, z: 80, alpha: false }
    ].forEach((wInfo, idx) => {
      const wMesh = createWolfMesh(wInfo.alpha);
      const wy = this._getTerrainHeight(wInfo.x, wInfo.z);
      wMesh.position.set(wInfo.x, wy, wInfo.z);
      this.scene.add(wMesh);
      this.wolves.push({
        mesh: wMesh,
        home: new THREE.Vector3(wInfo.x, wy, wInfo.z),
        angle: idx * 2.1
      });
    });

    // 3 Collectible Clan Relics in the Forest (glowing golden medallions)
    const relicCoords = [
      { x: -24, z: 58, label: 'Wolf Crest Medallion' },
      { x: 26, z: 46, label: 'Shipwreck Compass' },
      { x: 18, z: 24, label: 'Father\'s Seal' }
    ];
    relicCoords.forEach((rc) => {
      const ry = this._getTerrainHeight(rc.x, rc.z) + 1.2;
      const group = new THREE.Group();
      const gem = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.55, 0),
        new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xf59e0b, emissiveIntensity: 1.2, metalness: 0.7 })
      );
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.25, 11, 8, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xfde047, transparent: true, opacity: 0.16, side: THREE.DoubleSide })
      );
      beam.position.y = 5.2;
      group.add(gem, beam);
      group.position.set(rc.x, ry, rc.z);
      this.scene.add(group);
      this.relics.push({
        mesh: group,
        pos: new THREE.Vector3(rc.x, ry, rc.z),
        label: rc.label,
        collected: false
      });
    });

    // River Shrine with the Traveler's Disguise Cloak & Straw Hat!
    const sy = this._getTerrainHeight(this.disguiseShrinePos.x, this.disguiseShrinePos.z);
    this.disguiseShrinePos.y = sy;
    const shrineBase = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.6, 4.4), new THREE.MeshStandardMaterial({ map: getStoneTileTexture(2) }));
    shrineBase.position.set(this.disguiseShrinePos.x, sy + 0.3, this.disguiseShrinePos.z);
    this.scene.add(shrineBase);
    const shrineRoof = new THREE.Mesh(new THREE.ConeGeometry(3.8, 1.8, 4), redLacquer);
    shrineRoof.rotation.y = Math.PI / 4;
    shrineRoof.position.set(this.disguiseShrinePos.x, sy + 4.2, this.disguiseShrinePos.z);
    this.scene.add(shrineRoof);
    [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]].forEach(([ox, oz]) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 3.6, 6), woodMat);
      post.position.set(this.disguiseShrinePos.x + ox, sy + 2.1, this.disguiseShrinePos.z + oz);
      this.scene.add(post);
    });

    // Floating Glowing Straw Hat Disguise Pickup inside the River Shrine
    const hatGroup = new THREE.Group();
    const hatMesh = new THREE.Mesh(
      new THREE.ConeGeometry(0.75, 0.35, 16),
      new THREE.MeshStandardMaterial({ color: 0xe6c88a, emissive: 0x38bdf8, emissiveIntensity: 0.45 })
    );
    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.35, 12, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.16, side: THREE.DoubleSide })
    );
    beacon.position.y = 5.5;
    hatGroup.add(hatMesh, beacon);
    hatGroup.position.set(this.disguiseShrinePos.x, sy + 1.5, this.disguiseShrinePos.z);
    this.scene.add(hatGroup);
    this.disguisePickupMesh = hatGroup;

    // --- ZONE 3: THE IMPERIAL CITY (z: -98 to -26) ---
    const stoneMat = new THREE.MeshStandardMaterial({ map: getStoneTileTexture(14), roughness: 0.85 });
    const wallMat = new THREE.MeshStandardMaterial({ map: getConcreteTexture(4, false), color: 0xd6d3cb, roughness: 0.88 });
    const darkRoof = new THREE.MeshStandardMaterial({ color: 0x262933, roughness: 0.6 });

    const cityFloor = new THREE.Mesh(new THREE.PlaneGeometry(110, 74), stoneMat);
    cityFloor.rotation.x = -Math.PI / 2;
    cityFloor.position.set(0, 0.53, -63);
    cityFloor.receiveShadow = true;
    this.scene.add(cityFloor);

    // Fortress outer walls with Grand Open Gate at x=0, z=-28
    const wallSegments = [
      [-32, 4.5, -28, 48, 8.5, 2.6],
      [32, 4.5, -28, 48, 8.5, 2.6],
      [-55, 4.5, -63, 2.6, 8.5, 72],
      [55, 4.5, -63, 2.6, 8.5, 72],
      [0, 4.5, -98, 112, 8.5, 2.6]
    ];
    wallSegments.forEach(([x, y, z, w, h, d]) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      this._addCollider(x, y, z, w, h, d, m);
    });

    // Multi-tiered Japanese Pagoda Buildings lining the city streets
    const pagodas = [
      [-22, -44, 10, 8, 10],
      [22, -44, 10, 8, 10],
      [-24, -68, 12, 10, 12],
      [24, -68, 12, 10, 12],
      [-14, -84, 8, 7, 8],
      [14, -84, 8, 7, 8]
    ];
    pagodas.forEach(([px, pz, w, h, d]) => {
      const base = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
      base.position.set(px, 0.5 + h / 2, pz);
      base.castShadow = true;
      base.receiveShadow = true;
      this._addCollider(px, 0.5 + h / 2, pz, w, h, d, base);

      const eave1 = new THREE.Mesh(new THREE.ConeGeometry(w * 0.85, 2.6, 4), darkRoof);
      eave1.rotation.y = Math.PI / 4;
      eave1.position.set(px, 0.5 + h + 1.2, pz);
      const upper = new THREE.Mesh(new THREE.BoxGeometry(w * 0.65, h * 0.45, d * 0.65), redLacquer);
      upper.position.set(px, 0.5 + h + 2.6, pz);
      const eave2 = new THREE.Mesh(new THREE.ConeGeometry(w * 0.62, 2.4, 4), darkRoof);
      eave2.rotation.y = Math.PI / 4;
      eave2.position.set(px, 0.5 + h + 4.8, pz);
      this.scene.add(eave1, upper, eave2);
    });

    // Glowing Street Lanterns in the Imperial City
    [[-10, -36], [10, -36], [-10, -56], [10, -56], [-10, -76], [10, -76]].forEach(([lx, lz]) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 3.6, 0.35), woodMat);
      post.position.set(lx, 2.3, lz);
      const paper = new THREE.Mesh(
        new THREE.BoxGeometry(0.65, 0.85, 0.65),
        new THREE.MeshBasicMaterial({ color: 0xffd166 })
      );
      paper.position.set(lx, 4.3, lz);
      const pl = new THREE.PointLight(0xffb703, 12, 16);
      pl.position.set(lx, 4.4, lz);
      this.scene.add(post, paper, pl);
    });

    // Hidden Clan Elder & Your True People at the Inner Sanctuary (z = -84)
    this.elderMesh = createNpcMesh('elder');
    this.elderMesh.position.set(0, 0.53, -84);
    this.scene.add(this.elderMesh);

    // Clan family members standing beside the Elder
    [[-2.2, -85.5], [2.2, -85.5]].forEach(([cx, cz]) => {
      const kin = createNpcMesh('elder');
      kin.scale.setScalar(0.92);
      kin.position.set(cx, 0.53, cz);
      this.scene.add(kin);
    });

    // --- ENEMIES: FOREST BANDITS + PATROLLING IMPERIAL CITY GUARDS ---
    const enemyConfigs = [
      // Forest Bandits
      { role: 'bandit', x: -16, z: 54, patrolRadius: 7 },
      { role: 'bandit', x: 18, z: 42, patrolRadius: 7 },
      { role: 'bandit', x: 4, z: 26, patrolRadius: 6 },
      // Imperial City Guards
      { role: 'guard', x: -4.5, z: -34, patrolRadius: 8 },
      { role: 'guard', x: 5.5, z: -48, patrolRadius: 10 },
      { role: 'guard', x: -6.5, z: -62, patrolRadius: 10 },
      { role: 'guard', x: 4.5, z: -72, patrolRadius: 9 }
    ];
    enemyConfigs.forEach((cfg, idx) => {
      const y = this._getTerrainHeight(cfg.x, cfg.z);
      const mesh = createNpcMesh(cfg.role);
      mesh.position.set(cfg.x, y, cfg.z);
      this.scene.add(mesh);

      // Subtle alert ring beneath city guards so player sees stealth awareness range
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

      this.enemies.push({
        id: `${cfg.role}-${idx}`,
        role: cfg.role,
        mesh,
        ring,
        pos: new THREE.Vector3(cfg.x, y, cfg.z),
        homePos: new THREE.Vector3(cfg.x, y, cfg.z),
        patrolRadius: cfg.patrolRadius,
        patrolAngle: idx * 1.5,
        hp: cfg.role === 'guard' ? 115 : 75,
        maxHp: cfg.role === 'guard' ? 115 : 75,
        alive: true,
        alerted: false,
        attackCooldown: 0,
        stunTimer: 0
      });
    });
  }

  // --- COMBAT, TAI CHI, SLIDING & DISGUISE ---

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
    if (s.disguised) {
      s.suspicion = Math.max(0, s.suspicion - 25);
    }
    audio.playDisguise();
    this._syncDisguiseVisuals();
    this.callbacks.onCombo?.(s.disguised ? 'DISGUISE EQUIPPED — BLEND IN WITH THE CITY' : 'DISGUISE REMOVED — KATANA DRAWN');
    this._pushHud();
  }

  _katanaAttack() {
    const s = this.samurai;
    if (s.attackTimer > 0) return;

    // Attacking reveals your sword & drops disguise!
    if (s.disguised) {
      s.disguised = false;
      s.swordDrawn = true;
      this._syncDisguiseVisuals();
      this.callbacks.onCombo?.('COVER BLOWN — BLADE DRAWN!');
    }

    s.comboStep = s.comboWindow > 0 ? (s.comboStep % 3) + 1 : 1;
    s.comboWindow = 0.85;
    s.attackDuration = s.comboStep === 3 ? 0.36 : 0.26;
    s.attackTimer = s.attackDuration;

    const isSlideStrike = s.sliding;
    audio.playSwordSlash(s.comboStep);

    // Show sword slash arc in front of Ronin
    const fwd = new THREE.Vector3(-Math.sin(s.yaw), 0, -Math.cos(s.yaw));
    this.slashArc.position.copy(s.pos).add(new THREE.Vector3(0, 1.15, 0)).addScaledVector(fwd, 0.8);
    this.slashArc.rotation.z = -s.yaw;
    this.slashArc.scale.setScalar(s.comboStep === 3 || isSlideStrike ? 1.45 : 1.0);
    this.slashArc.material.color.setHex(isSlideStrike ? 0x38bdf8 : s.comboStep === 3 ? 0xfbbf24 : 0xe0f2fe);
    this.slashArc.material.opacity = 0.9;

    if (isSlideStrike) {
      audio.playComboChime();
      this.callbacks.onCombo?.('COMBO: WILD FANG SLIDE SLASH!');
    } else if (s.comboStep === 3) {
      audio.playComboChime();
      this.callbacks.onCombo?.('COMBO: 3-HIT WHIRLWIND KATANA!');
    }

    const range = s.comboStep === 3 ? 4.2 : 3.4;
    const dmg = isSlideStrike ? 58 : s.comboStep === 3 ? 52 : 30;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const toE = e.pos.clone().sub(s.pos);
      if (toE.length() < range && (s.comboStep === 3 || toE.normalize().dot(fwd) > 0.2)) {
        this._damageEnemy(e, dmg, fwd.clone().multiplyScalar(s.comboStep === 3 ? 3.5 : 1.5));
      }
    }
  }

  _taiChiPalmWave() {
    const s = this.samurai;
    if (s.chi < 22) {
      this.callbacks.onCombo?.('NOT ENOUGH TAI CHI ENERGY!');
      return;
    }
    s.chi -= 22;
    audio.playTaiChi();
    this.callbacks.onCombo?.('TAI CHI: FLOWING PALM WAVE!');

    const fwd = new THREE.Vector3(-Math.sin(s.yaw), 0, -Math.cos(s.yaw)).normalize();
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.85, 0.12, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0x2dd4bf, transparent: true, opacity: 0.9 })
    );
    const startPos = s.pos.clone().add(new THREE.Vector3(0, 1.2, 0)).addScaledVector(fwd, 1.0);
    ring.position.copy(startPos);
    ring.rotation.y = s.yaw;
    this.scene.add(ring);

    this.chiWaves.push({
      mesh: ring,
      pos: startPos,
      dir: fwd,
      life: 0.9,
      hitIds: new Set()
    });
    this._pushHud();
  }

  _taiChiDeflect() {
    const s = this.samurai;
    if (s.chi < 15) return;
    s.chi -= 15;
    s.taiChiDeflectTimer = 1.0;
    s.hp = Math.min(s.maxHp, s.hp + 8);
    audio.playTaiChi();
    this.callbacks.onCombo?.('TAI CHI: HARMONY DEFLECT STANCE');
    this._pushHud();
  }

  _interact() {
    const s = this.samurai;

    // 1. Check Clan Relics
    for (const r of this.relics) {
      if (!r.collected && s.pos.distanceTo(r.pos) < 3.6) {
        r.collected = true;
        r.mesh.visible = false;
        s.relicsFound += 1;
        audio.playPickup();
        this.callbacks.onCombo?.(`CLAN RELIC FOUND: ${r.label.toUpperCase()} (${s.relicsFound}/${s.totalRelics})`);
        this._pushHud();
        return;
      }
    }

    // 2. Check Disguise Shrine
    if (!s.hasDisguise && s.pos.distanceTo(this.disguiseShrinePos) < 4.5) {
      s.hasDisguise = true;
      if (this.disguisePickupMesh) this.disguisePickupMesh.visible = false;
      audio.playPickup();
      this.callbacks.onCombo?.('ACQUIRED TRAVELER\'S DISGUISE! PRESS [R] BEFORE ENTERING THE CITY');
      this._pushHud();
      return;
    }

    // 3. Check Clan Elder inside Imperial City
    if (s.pos.distanceTo(this.elderPos) < 5.0) {
      this.missionCompleted = true;
      audio.playPickup();
      if (document.pointerLockElement === this.renderer.domElement) {
        document.exitPointerLock();
      }
      this.callbacks.onGameOver?.({
        title: 'REUNITED WITH YOUR CLAN!',
        subtitle: 'From shipwrecked orphan raised by wolves to Master Ronin — you survived the wild, infiltrated the Imperial City, and found your true people.',
        stats: [
          { label: 'Clan Relics Recovered', value: `${s.relicsFound} / ${s.totalRelics}` },
          { label: 'Disguise Mastered', value: s.hasDisguise ? 'Yes' : 'No' },
          { label: 'Remaining Health', value: `${Math.ceil(s.hp)}%` }
        ]
      });
    }
  }

  _damageEnemy(e, dmg, knockback) {
    e.hp -= dmg;
    e.alerted = true;
    e.pos.add(knockback);
    audio.playSwordHit();

    // Hit sparks
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.12, 0.12),
        new THREE.MeshBasicMaterial({ color: 0xfef08a })
      );
      m.position.copy(e.pos).add(new THREE.Vector3(0, 1.2, 0));
      this.scene.add(m);
      this.particles.push({
        mesh: m,
        vel: new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 5 + 1, (Math.random() - 0.5) * 6),
        life: 0.35
      });
    }

    if (e.hp <= 0) {
      e.alive = false;
      e.mesh.visible = false;
      this.callbacks.onCombo?.(e.role === 'guard' ? 'CITY GUARD DEFEATED!' : 'FOREST BANDIT DEFEATED!');
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
            const pL = Math.abs(pos.x - c.minX);
            const pR = Math.abs(c.maxX - pos.x);
            const pB = Math.abs(pos.z - c.minZ);
            const pF = Math.abs(c.maxZ - pos.z);
            const m = Math.min(pL, pR, pB, pF);
            if (m === pL) pos.x = c.minX - radius;
            else if (m === pR) pos.x = c.maxX + radius;
            else if (m === pB) pos.z = c.minZ - radius;
            else pos.z = c.maxZ + radius;
          } else {
            pos.x += (dx / d) * (radius - d);
            pos.z += (dz / d) * (radius - d);
          }
        }
      }
    }
    pos.x = THREE.MathUtils.clamp(pos.x, -95, 95);
    pos.z = THREE.MathUtils.clamp(pos.z, -95, 95);
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
    if (!this.isPaused && !this.missionCompleted) {
      this._update(dt);
    }
    this.renderer.render(this.scene, this.camera);
  }

  _update(dt) {
    const s = this.samurai;
    s.chi = Math.min(s.maxChi, s.chi + 12 * dt);
    if (s.comboWindow > 0) s.comboWindow -= dt;
    if (s.attackTimer > 0) s.attackTimer -= dt;
    if (s.taiChiDeflectTimer > 0) s.taiChiDeflectTimer -= dt;

    // Fade slash arc
    if (this.slashArc.material.opacity > 0) {
      this.slashArc.material.opacity = Math.max(0, this.slashArc.material.opacity - dt * 4.5);
    }

    // Zone identification
    if (s.pos.z < -26) s.zone = 'Imperial City';
    else if (s.pos.z < 18) s.zone = 'Bamboo Pass & Great Bridge';
    else s.zone = 'Ancient Wolf Forest';

    // Camera-relative Movement
    const camFwd = new THREE.Vector3(-Math.sin(s.camYaw), 0, -Math.cos(s.camYaw));
    const camRight = new THREE.Vector3(Math.cos(s.camYaw), 0, -Math.sin(s.camYaw));
    const move = new THREE.Vector3();
    if (this.keys['KeyW'] || this.keys['ArrowUp']) move.add(camFwd);
    if (this.keys['KeyS'] || this.keys['ArrowDown']) move.sub(camFwd);
    if (this.keys['KeyD'] || this.keys['ArrowRight']) move.add(camRight);
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) move.sub(camRight);
    if (move.lengthSq() > 0) move.normalize();

    const sprinting = (this.keys['ShiftLeft'] || this.keys['ShiftRight']) && !s.disguised;
    let moveSpeed = 0;

    if (s.sliding) {
      s.slideTimer -= dt;
      // Extra slide speed when sliding downhill!
      const currY = this._getTerrainHeight(s.pos.x, s.pos.z);
      const aheadY = this._getTerrainHeight(s.pos.x + s.slideDir.x * 1.5, s.pos.z + s.slideDir.z * 1.5);
      const slopeBoost = Math.max(0, (currY - aheadY) * 6);
      moveSpeed = 14.5 + slopeBoost;
      s.pos.addScaledVector(s.slideDir, moveSpeed * dt);
      if (Math.random() < 0.55) {
        const dust = new THREE.Mesh(
          new THREE.BoxGeometry(0.14, 0.14, 0.14),
          new THREE.MeshBasicMaterial({ color: 0x86efac, transparent: true, opacity: 0.7 })
        );
        dust.position.copy(s.pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.18, (Math.random() - 0.5) * 0.4));
        this.scene.add(dust);
        this.particles.push({ mesh: dust, vel: new THREE.Vector3(0, 1.8, 0), life: 0.35 });
      }
      if (s.slideTimer <= 0) s.sliding = false;
    } else if (move.lengthSq() > 0.01) {
      moveSpeed = s.disguised ? 5.6 : sprinting ? 11.4 : 7.6;
      s.pos.addScaledVector(move, moveSpeed * dt);
      const targetYaw = Math.atan2(-move.x, -move.z);
      let diff = targetYaw - s.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      s.yaw += diff * Math.min(1, dt * 12);

      if (s.grounded) {
        s.footstepTimer -= dt;
        if (s.footstepTimer <= 0) {
          audio.playFootstep(s.pos.z < -26 ? 'concrete' : 'grass');
          s.footstepTimer = sprinting ? 0.28 : 0.44;
        }
      }
    }

    // Gravity & terrain following
    s.vel.y -= 24 * dt;
    s.pos.y += s.vel.y * dt;
    const groundY = this._getTerrainHeight(s.pos.x, s.pos.z);
    if (s.pos.y <= groundY) {
      s.pos.y = groundY;
      s.vel.y = 0;
      s.grounded = true;
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
        u.leftArm.rotation.x = -Math.sin(u.phase) * 0.5;
      } else {
        u.leftLeg.rotation.x = THREE.MathUtils.lerp(u.leftLeg.rotation.x, 0, dt * 10);
        u.rightLeg.rotation.x = THREE.MathUtils.lerp(u.rightLeg.rotation.x, 0, dt * 10);
      }
    }

    // Katana swing arm animation
    if (s.attackTimer > 0) {
      const t = 1 - s.attackTimer / s.attackDuration;
      u.rightArmPivot.rotation.x = -1.6 + t * 2.8;
      u.rightArmPivot.rotation.y = (s.comboStep % 2 === 0 ? 1 : -1) * (t * 1.4 - 0.7);
    } else {
      u.rightArmPivot.rotation.x = THREE.MathUtils.lerp(u.rightArmPivot.rotation.x, 0.2, dt * 10);
      u.rightArmPivot.rotation.y = THREE.MathUtils.lerp(u.rightArmPivot.rotation.y, 0, dt * 10);
    }

    // Tai Chi deflect aura
    u.chiRing.material.opacity = s.taiChiDeflectTimer > 0 ? 0.78 : 0;
    u.chiRing.rotation.z += dt * 5;

    // Third-person smooth orbit camera with building/wall-clip raycast prevention!
    const camDist = 6.8;
    const anchor = new THREE.Vector3(s.pos.x, s.pos.y + 1.65, s.pos.z);
    const camOffset = new THREE.Vector3(
      Math.sin(s.camYaw) * Math.cos(s.camPitch) * camDist,
      Math.sin(s.camPitch) * camDist + 0.3,
      Math.cos(s.camYaw) * Math.cos(s.camPitch) * camDist
    );
    const rawCam = anchor.clone().add(camOffset);
    rawCam.y = Math.max(this._getTerrainHeight(rawCam.x, rawCam.z) + 0.8, rawCam.y);
    const desiredCam = this._clipCameraAgainstWalls(anchor, rawCam);
    this.camera.position.lerp(desiredCam, Math.min(1, dt * 14));
    this.camera.lookAt(s.pos.x, s.pos.y + 1.5, s.pos.z);

    // Animate Forest Wolves trotting around your den
    for (const w of this.wolves) {
      w.angle += dt * 0.45;
      const wx = w.home.x + Math.cos(w.angle) * 3.5;
      const wz = w.home.z + Math.sin(w.angle) * 3.5;
      const wy = this._getTerrainHeight(wx, wz);
      w.mesh.position.set(wx, wy, wz);
      w.mesh.rotation.y = -w.angle;
      w.mesh.userData.phase += dt * 8;
      w.mesh.userData.legs.forEach((l, i) => {
        l.rotation.x = Math.sin(w.mesh.userData.phase + (i % 2) * Math.PI) * 0.5;
      });
    }

    // Spin relics & disguise pickup
    const tNow = performance.now() * 0.002;
    this.relics.forEach(r => {
      if (!r.collected) {
        r.mesh.rotation.y = tNow;
        r.mesh.position.y = r.pos.y + Math.sin(tNow * 2) * 0.25;
      }
    });
    if (this.disguisePickupMesh?.visible) {
      this.disguisePickupMesh.rotation.y = tNow * 1.2;
    }

    // Update Tai Chi Palm Waves
    for (let i = this.chiWaves.length - 1; i >= 0; i--) {
      const cw = this.chiWaves[i];
      cw.life -= dt;
      cw.pos.addScaledVector(cw.dir, 18 * dt);
      cw.mesh.position.copy(cw.pos);
      cw.mesh.scale.addScalar(dt * 2.4);
      cw.mesh.material.opacity = Math.max(0, cw.life);

      for (const e of this.enemies) {
        if (!e.alive || cw.hitIds.has(e.id)) continue;
        if (e.pos.distanceTo(cw.pos) < 2.6) {
          cw.hitIds.add(e.id);
          e.stunTimer = 2.4;
          this._damageEnemy(e, 34, cw.dir.clone().multiplyScalar(5.5));
        }
      }
      if (cw.life <= 0) {
        this.scene.remove(cw.mesh);
        this.chiWaves.splice(i, 1);
      }
    }

    // Update Enemies (Bandits + City Guards with Disguise Stealth System!)
    let nearSuspiciousGuard = false;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e.stunTimer > 0) {
        e.stunTimer -= dt;
        continue;
      }

      const toP = s.pos.clone().sub(e.pos);
      const dist = toP.length();

      if (e.role === 'guard') {
        // City Guard Disguise Logic!
        if (dist < 13 && !e.alerted) {
          if (!s.disguised) {
            nearSuspiciousGuard = true;
            s.suspicion = Math.min(100, s.suspicion + 48 * dt);
          } else if (dist < 3.4) {
            // Even disguised, bumping directly into a guard raises slight suspicion
            nearSuspiciousGuard = true;
            s.suspicion = Math.min(100, s.suspicion + 14 * dt);
          }
          if (s.suspicion >= 100) {
            e.alerted = true;
            this.callbacks.onCombo?.('ALERT! CITY GUARDS SPOTTED YOU!');
          }
        }
        if (e.ring) {
          e.ring.material.color.setHex(e.alerted ? 0xef4444 : nearSuspiciousGuard ? 0xf97316 : 0x22c55e);
        }
      } else {
        // Forest bandits attack on sight
        if (dist < 14) e.alerted = true;
      }

      if (e.alerted && dist < 24) {
        const yaw = Math.atan2(-toP.x, -toP.z);
        e.mesh.rotation.y = yaw;
        if (dist > 2.0) {
          const dir = new THREE.Vector3(toP.x, 0, toP.z).normalize();
          const spd = e.role === 'guard' ? 5.8 : 5.0;
          e.pos.addScaledVector(dir, spd * dt);
          e.pos.y = this._getTerrainHeight(e.pos.x, e.pos.z);
          this._resolveHorizontalCollision(e.pos, 0.55);
          e.mesh.userData.phase += dt * 10;
          e.mesh.userData.leftLeg.rotation.x = Math.sin(e.mesh.userData.phase) * 0.6;
          e.mesh.userData.rightLeg.rotation.x = -Math.sin(e.mesh.userData.phase) * 0.6;
        } else {
          e.attackCooldown -= dt;
          if (e.attackCooldown <= 0) {
            e.attackCooldown = 1.1;
            if (s.taiChiDeflectTimer > 0) {
              // Perfect Tai Chi Deflect!
              e.stunTimer = 2.0;
              audio.playSwordHit();
              this.callbacks.onCombo?.('PERFECT TAI CHI DEFLECT!');
            } else {
              s.hp = Math.max(0, s.hp - (e.role === 'guard' ? 16 : 12));
              audio.playPlayerHurt();
              this.callbacks.onDamageFlash?.();
              if (s.hp <= 0) {
                if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock();
                this.missionCompleted = true;
                this.callbacks.onGameOver?.({
                  title: 'FALLEN IN BATTLE',
                  subtitle: 'Use Disguise [R] inside the Imperial City and Tai Chi Deflect [E] to survive.',
                  stats: [
                    { label: 'Zone Reached', value: s.zone },
                    { label: 'Clan Relics', value: `${s.relicsFound} / ${s.totalRelics}` }
                  ]
                });
                return;
              }
            }
          }
        }
      } else {
        // Patrol peacefully
        if (dist > 26) e.alerted = false;
        e.patrolAngle += dt * 0.45;
        const px = e.homePos.x + Math.cos(e.patrolAngle) * e.patrolRadius;
        const pz = e.homePos.z + Math.sin(e.patrolAngle) * (e.patrolRadius * 0.5);
        const dir = new THREE.Vector3(px - e.pos.x, 0, pz - e.pos.z);
        if (dir.length() > 0.2) {
          e.mesh.rotation.y = Math.atan2(-dir.x, -dir.z);
          dir.normalize();
          e.pos.addScaledVector(dir, 2.2 * dt);
          e.pos.y = this._getTerrainHeight(e.pos.x, e.pos.z);
        }
      }
      // Solid separation between Samurai and enemy so characters never overlap!
      const sepDx = s.pos.x - e.pos.x;
      const sepDz = s.pos.z - e.pos.z;
      const sepD2 = sepDx * sepDx + sepDz * sepDz;
      if (sepD2 < 1.25 * 1.25 && sepD2 > 0.0001) {
        const sepD = Math.sqrt(sepD2);
        const push = (1.25 - sepD) * 0.5;
        s.pos.x += (sepDx / sepD) * push;
        s.pos.z += (sepDz / sepD) * push;
        e.pos.x -= (sepDx / sepD) * push;
        e.pos.z -= (sepDz / sepD) * push;
      }
      e.mesh.position.copy(e.pos);
    }

    if (!nearSuspiciousGuard && s.suspicion > 0) {
      s.suspicion = Math.max(0, s.suspicion - 18 * dt);
    }

    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.life -= dt;
      pt.mesh.position.addScaledVector(pt.vel, dt);
      if (pt.life <= 0) {
        this.scene.remove(pt.mesh);
        this.particles.splice(i, 1);
      }
    }

    // Contextual interaction prompt
    let prompt = '';
    for (const r of this.relics) {
      if (!r.collected && s.pos.distanceTo(r.pos) < 3.6) {
        prompt = `Press [F] to collect ${r.label}`;
      }
    }
    if (!prompt && !s.hasDisguise && s.pos.distanceTo(this.disguiseShrinePos) < 4.5) {
      prompt = 'Press [F] to claim Traveler\'s Disguise Cloak & Hat';
    }
    if (!prompt && s.pos.distanceTo(this.elderPos) < 5.0) {
      prompt = 'Press [F] to speak with Clan Elder & reunite with your people!';
    }
    this.callbacks.onPrompt?.(prompt);

    if (Math.floor(performance.now() / 180) !== Math.floor((performance.now() - dt * 1000) / 180)) {
      this._pushHud();
    }
  }

  _pushHud() {
    const s = this.samurai;
    // Build compact radar entities for the minimap
    const mapEntities = [
      ...this.relics.filter(r => !r.collected).map(r => ({ x: r.pos.x, z: r.pos.z, color: '#fbbf24', type: 'relic' })),
      ...this.enemies.filter(e => e.alive).map(e => ({ x: e.pos.x, z: e.pos.z, color: e.role === 'guard' ? '#ef4444' : '#fb923c', type: 'enemy' })),
      { x: this.elderPos.x, z: this.elderPos.z, color: '#22c55e', type: 'elder' }
    ];
    if (!s.hasDisguise) {
      mapEntities.push({ x: this.disguiseShrinePos.x, z: this.disguiseShrinePos.z, color: '#38bdf8', type: 'disguise' });
    }

    let objective = 'Explore the Forest: Gather 3 Clan Relics & find the Disguise at the River Shrine';
    if (s.relicsFound >= s.totalRelics && !s.hasDisguise) {
      objective = 'Visit the River Shrine (Blue Beacon) to claim your Traveler\'s Disguise';
    } else if (s.hasDisguise && s.pos.z >= -26) {
      objective = 'Press [R] to equip Disguise, cross the Red Bridge, and infiltrate the Imperial City';
    } else if (s.pos.z < -26) {
      objective = 'Stay disguised [R] past City Guards and reach your Clan Elder (Green Beacon North)';
    }

    this.callbacks.onHudUpdate?.({
      game: 'samurai',
      hp: Math.ceil(s.hp),
      maxHp: s.maxHp,
      chi: Math.ceil(s.chi),
      maxChi: s.maxChi,
      zone: s.zone,
      objective,
      relicsFound: s.relicsFound,
      totalRelics: s.totalRelics,
      hasDisguise: s.hasDisguise,
      disguised: s.disguised,
      suspicion: Math.round(s.suspicion),
      playerPos: { x: s.pos.x, z: s.pos.z, yaw: s.yaw },
      mapEntities
    });
  }

  // --- EVENTS ---

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
      if (this.isPaused || this.missionCompleted) return;
      this.keys[e.code] = true;

      const s = this.samurai;
      if (e.code === 'Space' && s.grounded) {
        s.vel.y = 10.2;
        s.grounded = false;
      } else if (e.code === 'KeyC' || e.code === 'ControlLeft') {
        if (!s.sliding && s.grounded) {
          const dir = new THREE.Vector3(-Math.sin(s.yaw), 0, -Math.cos(s.yaw)).normalize();
          s.sliding = true;
          s.slideTimer = 0.65;
          s.slideDir.copy(dir);
          audio.playSlide();
          this.callbacks.onCombo?.('3D WILD SLIDE!');
        }
      } else if (e.code === 'KeyQ') {
        this._taiChiPalmWave();
      } else if (e.code === 'KeyE') {
        this._taiChiDeflect();
      } else if (e.code === 'KeyR') {
        this._toggleDisguise();
      } else if (e.code === 'KeyF') {
        this._interact();
      }
    };

    this._onKeyUp = (e) => {
      this.keys[e.code] = false;
    };

    this._onMouseMove = (e) => {
      if (this.isPaused || this.missionCompleted) return;
      if (document.pointerLockElement !== this.renderer.domElement) return;
      this.samurai.camYaw -= e.movementX * 0.0028;
      this.samurai.camPitch = THREE.MathUtils.clamp(this.samurai.camPitch + e.movementY * 0.0022, 0.08, 1.05);
    };

    this._onMouseDown = (e) => {
      if (this.isPaused || this.missionCompleted) return;
      audio.init();
      if (document.pointerLockElement !== this.renderer.domElement) {
        this.requestPointerLock();
        return;
      }
      if (e.button === 0) {
        this._katanaAttack();
      } else if (e.button === 2) {
        this._taiChiPalmWave();
      }
    };

    this._onContextMenu = (e) => e.preventDefault();

    this._onPointerLockChange = () => {
      if (document.pointerLockElement !== this.renderer.domElement && !this.isPaused && !this.missionCompleted) {
        this.setPaused(true);
      }
    };

    window.addEventListener('resize', this._onResize);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousemove', this._onMouseMove);
    this.renderer.domElement.addEventListener('mousedown', this._onMouseDown);
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
    document.removeEventListener('pointerlockchange', this._onPointerLockChange);
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
