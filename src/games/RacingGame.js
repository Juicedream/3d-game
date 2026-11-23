import * as THREE from 'three';
import { audio } from '../audio/AudioEngine.js';
import {
  getAsphaltTexture,
  getSandTexture,
  getGrassTexture,
  getBuildingFacadeTexture,
  getConcreteTexture
} from '../engine/Textures.js';
import {
  CAR_CATALOG,
  getCarSpec,
  createRaceCarMesh,
  createCockpitMesh
} from '../engine/CarMesh.js';

export const RACE_TRACKS = {
  asia: {
    id: 'asia',
    name: 'Asia — Neon Touge GP',
    flag: '🇯🇵',
    laps: 4,
    sky: 0x0b1026,
    fog: 0x111936,
    groundColor: 0x1a2234,
    accentColor: 0xec4899,
    accent2: 0x22d3ee,
    roadWidth: 16,
    points: [
      [0, 0, 0],
      [75, 4, -22],
      [148, 12, 18],
      [172, 16, 98],
      [112, 8, 162],
      [25, 14, 148],
      [-55, 20, 195],
      [-142, 11, 148],
      [-155, 4, 52],
      [-86, 2, -26]
    ],
    shortcuts: [
      { fromIdx: 2, toIdx: 4, label: 'NEON ALLEY SHORTCUT' },
      { fromIdx: 6, toIdx: 8, label: 'TOUGE CLIFF JUMP' }
    ]
  },
  nigeria: {
    id: 'nigeria',
    name: 'Nigeria — Lagos Eko Circuit',
    flag: '🇳🇬',
    laps: 6,
    sky: 0x62b6e6,
    fog: 0x7ec8e8,
    groundColor: 0x1f6e5c,
    accentColor: 0x16a34a,
    accent2: 0xfacc15,
    roadWidth: 17,
    points: [
      [0, 1, 0],
      [90, 9, -18],
      [182, 12, 12],
      [204, 4, 96],
      [135, 2, 174],
      [48, 8, 138],
      [-32, 13, 186],
      [-126, 6, 152],
      [-148, 2, 62],
      [-88, 2, -14]
    ],
    shortcuts: [
      { fromIdx: 1, toIdx: 3, label: 'EKO LAGOON BYPASS' },
      { fromIdx: 5, toIdx: 7, label: 'PALM EXPRESS CUT' }
    ]
  },
  morocco: {
    id: 'morocco',
    name: 'Morocco — Marrakech Atlas Run',
    flag: '🇲🇦',
    laps: 4,
    sky: 0xe79a66,
    fog: 0xdc8c58,
    groundColor: 0xa85532,
    accentColor: 0xdc2626,
    accent2: 0xfbbf24,
    roadWidth: 16,
    points: [
      [0, 0, 0],
      [78, 11, -36],
      [154, 21, 8],
      [162, 14, 108],
      [92, 6, 166],
      [12, 15, 132],
      [-68, 22, 178],
      [-144, 12, 126],
      [-136, 4, 34],
      [-74, 2, -28]
    ],
    shortcuts: [
      { fromIdx: 2, toIdx: 4, label: 'MEDINA ARCH SHORTCUT' },
      { fromIdx: 6, toIdx: 8, label: 'ATLAS CANYON LEAP' }
    ]
  },
  egypt: {
    id: 'egypt',
    name: 'Egypt — Giza Pharaoh Grand Prix',
    flag: '🇪🇬',
    laps: 8,
    sky: 0xf1c27d,
    fog: 0xe6b570,
    groundColor: 0xc99c5b,
    accentColor: 0xf59e0b,
    accent2: 0x38bdf8,
    roadWidth: 17.5,
    points: [
      [0, 0, 0],
      [95, 5, -24],
      [190, 14, 14],
      [212, 10, 104],
      [142, 4, 188],
      [42, 12, 152],
      [-48, 18, 206],
      [-152, 8, 162],
      [-168, 3, 58],
      [-92, 2, -20]
    ],
    shortcuts: [
      { fromIdx: 1, toIdx: 3, label: 'SPHINX DUNE SHORTCUT' },
      { fromIdx: 5, toIdx: 7, label: 'PYRAMID VALLEY CUT' }
    ]
  }
};

const SPECIAL_OPS = [
  { id: 'missile', label: '🚀 HOMING MISSILE', color: 0xf43f5e },
  { id: 'emp', label: '⚡ EMP SHOCKWAVE', color: 0x38bdf8 },
  { id: 'nitro', label: '🔥 NITRO SURGE', color: 0x06b6d4 },
  { id: 'shield', label: '🛡️ AEGIS SHIELD', color: 0x22c55e },
  { id: 'mine', label: '💣 ROAD MINE', color: 0xf59e0b }
];

const AI_RIVAL_NAMES = ['BLUR_KAZE', 'EKO_TURBO', 'SAHARA_FOX', 'ANUBIS_V10', 'DRIFT_QUEEN'];

export class RacingGame {
  constructor(container, callbacks, mpClient) {
    this.container = container;
    this.callbacks = callbacks; // { onHudUpdate, onActionBanner, onPauseChange, onRaceFinish }
    this.mp = mpClient;

    this.isPaused = false;
    this.isDisposed = false;
    this.raceFinished = false;
    this.role = 'racer'; // 'racer' | 'spectator'
    this.cameraMode = 'fps'; // 'fps' (inside car) | 'chase' (car view)
    this.spectateTargetIndex = 0;

    this.trackId = 'asia';
    this.track = RACE_TRACKS.asia;
    this.totalLaps = 4;
    this.playerName = 'RACER';
    this.carId = 'valkyrie';

    // Blur-style Slow-Motion Cinematic State!
    this.timeScale = 1.0;
    this.slowMoTimer = 0;
    this.slowMoTargetPos = new THREE.Vector3();
    this.slowMoAngle = 0;

    // Race countdown & timer
    this.countdown = 3.2;
    this.lastBeepInt = 4;
    this.raceElapsed = 0;

    // Three.js scene & renderer
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.1, 650);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.container.appendChild(this.renderer.domElement);

    // Track spline & sampled centerline
    this.spline = null;
    this.samples = []; // { t, pos, tangent, right }
    this.shortcutZones = []; // { startPos, endPos, targetT, label, cooldown }
    this.boostPads = [];
    this.pickups = []; // Road Special Ops & Nitro pickups
    this.projectiles = []; // Blaster bolts & Homing Missiles
    this.mines = [];
    this.particles = [];
    this.worldGroup = new THREE.Group();
    this.scene.add(this.worldGroup);

    // Cars
    this.playerCar = null;
    this.cockpitMesh = null;
    this.aiCars = [];
    this.remoteCars = new Map();

    // Input
    this.keys = {};
    this.lastNetSync = 0;
    this.driftSoundTimer = 0;

    this._bindEvents();
    this._bindMultiplayer();

    this.clock = new THREE.Clock();
    this._loop = this._loop.bind(this);
  }

  start({ trackId = 'asia', playerName = 'RACER', carId = 'valkyrie', role = 'racer', roomState = null }) {
    this.trackId = RACE_TRACKS[trackId] ? trackId : 'asia';
    this.track = RACE_TRACKS[this.trackId];
    this.totalLaps = this.track.laps;
    this.playerName = playerName || 'RACER';
    this.carId = carId || 'valkyrie';
    this.role = role;
    this.cameraMode = role === 'spectator' ? 'chase' : 'fps';
    this.isPaused = false;
    this.raceFinished = false;
    this.countdown = role === 'spectator' ? 0 : 3.2;
    this.lastBeepInt = 4;
    this.raceElapsed = 0;
    this.timeScale = 1.0;
    this.slowMoTimer = 0;

    this._buildTrackWorld();
    this._spawnGrid(roomState);

    audio.playMusic('racing');
    if (this.role === 'racer') {
      audio.startEngine();
    }

    this.clock.start();
    this._pushHud();
    requestAnimationFrame(this._loop);
  }

  restart() {
    this.start({
      trackId: this.trackId,
      playerName: this.playerName,
      carId: this.carId,
      role: this.role,
      roomState: this.mp?.raceRoomState || null
    });
  }

  toggleCameraView() {
    this.cameraMode = this.cameraMode === 'fps' ? 'chase' : 'fps';
    if (this.playerCar && this.role === 'racer') {
      this.playerCar.mesh.visible = this.cameraMode === 'chase';
      if (this.cockpitMesh) this.cockpitMesh.visible = this.cameraMode === 'fps';
    }
    this.callbacks.onActionBanner?.(
      this.cameraMode === 'fps' ? 'CAMERA: FIRST-PERSON COCKPIT' : 'CAMERA: CAR CHASE VIEW'
    );
    this._pushHud();
  }

  cycleSpectateTarget() {
    const all = this._getAllRacersList();
    if (all.length === 0) return;
    this.spectateTargetIndex = (this.spectateTargetIndex + 1) % all.length;
    const t = all[this.spectateTargetIndex];
    this.callbacks.onActionBanner?.(`SPECTATING: ${t.name} (${getCarSpec(t.carId).name})`);
    this._pushHud();
  }

  setPaused(paused) {
    this.isPaused = paused;
    this.callbacks.onPauseChange?.(paused);
  }

  // --- MOBILE TOUCH CONTROL APIS ---

  setTouchKey(code, pressed) {
    if (pressed) audio.init();
    this.keys[code] = Boolean(pressed);
  }

  triggerTouchAction(action) {
    if (this.isPaused || this.raceFinished || this.role !== 'racer') return;
    audio.init();
    if (action === 'shoot') this._firePrimaryBlaster();
    else if (action === 'special_op') this._useSpecialOp();
  }

  // --- TRACK GEOMETRY, CRAZY ROADS, HIDDEN SHORTCUTS & THEMED SCENERY ---

  _clearTrack() {
    while (this.worldGroup.children.length > 0) this.worldGroup.remove(this.worldGroup.children[0]);
    if (this.playerCar) {
      this.scene.remove(this.playerCar.mesh);
      this.playerCar = null;
    }
    if (this.cockpitMesh) {
      this.camera.remove(this.cockpitMesh);
      this.cockpitMesh = null;
    }
    this.aiCars.forEach(c => this.scene.remove(c.mesh));
    this.aiCars = [];
    this.remoteCars.forEach(c => this.scene.remove(c.mesh));
    this.remoteCars.clear();
    this.pickups.forEach(p => this.scene.remove(p.mesh));
    this.pickups = [];
    this.projectiles.forEach(p => this.scene.remove(p.mesh));
    this.projectiles = [];
    this.mines.forEach(m => this.scene.remove(m.mesh));
    this.mines = [];
    this.particles.forEach(p => this.scene.remove(p.mesh));
    this.particles = [];
    this.shortcutZones = [];
    this.boostPads = [];
  }

  _buildTrackWorld() {
    this._clearTrack();
    const tr = this.track;

    this.scene.background = new THREE.Color(tr.sky);
    this.scene.fog = new THREE.FogExp2(tr.fog, 0.0024);

    // Lighting tailored per country
    const hemi = new THREE.HemisphereLight(
      tr.id === 'asia' ? 0x67e8f9 : 0xfff5e4,
      tr.groundColor,
      tr.id === 'asia' ? 0.65 : 0.95
    );
    const sun = new THREE.DirectionalLight(tr.id === 'asia' ? 0x93c5fd : 0xffe4b5, tr.id === 'asia' ? 1.1 : 1.55);
    sun.position.set(110, 160, 80);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    this.worldGroup.add(hemi, sun);

    // Ground plane / coastal lagoon / desert sands
    const groundTex = tr.id === 'egypt' || tr.id === 'morocco'
      ? getSandTexture(32)
      : tr.id === 'nigeria'
        ? getGrassTexture(32)
        : getConcreteTexture(32, true);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(950, 950),
      new THREE.MeshStandardMaterial({ map: groundTex, color: tr.groundColor, roughness: 0.92 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(20, -2.2, 85);
    ground.receiveShadow = true;
    this.worldGroup.add(ground);

    // For Nigeria: sparkling turquoise Lagos Lagoon water surrounding the elevated bridge!
    if (tr.id === 'nigeria') {
      const lagoon = new THREE.Mesh(
        new THREE.PlaneGeometry(900, 900),
        new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.15, metalness: 0.35, transparent: true, opacity: 0.72 })
      );
      lagoon.rotation.x = -Math.PI / 2;
      lagoon.position.set(20, -0.6, 85);
      this.worldGroup.add(lagoon);
    }

    // Build Closed 3D Spline for the Crazy Road!
    const ctrlPts = tr.points.map(([x, y, z]) => new THREE.Vector3(x, y, z));
    this.spline = new THREE.CatmullRomCurve3(ctrlPts, true, 'catmullrom', 0.45);

    const N = 260;
    this.samples = [];
    for (let i = 0; i < N; i++) {
      const t = i / N;
      const pos = this.spline.getPointAt(t);
      const tangent = this.spline.getTangentAt(t).normalize();
      const right = new THREE.Vector3().crossVectors(tangent, new THREE.Vector3(0, 1, 0)).normalize();
      this.samples.push({ t, pos, tangent, right });
    }

    // Build Ribbon Road Mesh + Glowing Curbs
    const halfW = tr.roadWidth / 2;
    const vertices = [];
    const uvs = [];
    const indices = [];

    for (let i = 0; i <= N; i++) {
      const s = this.samples[i % N];
      const leftPt = s.pos.clone().addScaledVector(s.right, -halfW);
      const rightPt = s.pos.clone().addScaledVector(s.right, halfW);
      vertices.push(leftPt.x, leftPt.y, leftPt.z);
      vertices.push(rightPt.x, rightPt.y, rightPt.z);
      uvs.push(0, i * 0.45, 1, i * 0.45);
      if (i < N) {
        const b = i * 2;
        indices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
      }
    }
    const roadGeo = new THREE.BufferGeometry();
    roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    roadGeo.setIndex(indices);
    roadGeo.computeVertexNormals();

    const roadMesh = new THREE.Mesh(
      roadGeo,
      new THREE.MeshStandardMaterial({ map: getAsphaltTexture(1), roughness: 0.72, side: THREE.DoubleSide })
    );
    roadMesh.receiveShadow = true;
    this.worldGroup.add(roadMesh);

    // Glowing Side Guardrails & Bridge Pylons along the crazy elevated road
    const railMatA = new THREE.MeshStandardMaterial({ color: tr.accentColor, emissive: tr.accentColor, emissiveIntensity: 0.85 });
    const railMatB = new THREE.MeshStandardMaterial({ color: tr.accent2, emissive: tr.accent2, emissiveIntensity: 0.85 });
    const pylonMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.8 });

    for (let i = 0; i < N; i += 4) {
      const s = this.samples[i];
      const next = this.samples[(i + 4) % N];
      const segLen = s.pos.distanceTo(next.pos) + 0.6;
      const yaw = Math.atan2(s.tangent.x, s.tangent.z);

      [-1, 1].forEach((side) => {
        const p = s.pos.clone().lerp(next.pos, 0.5).addScaledVector(s.right, side * (halfW + 0.5));
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.95, segLen), (i / 4) % 2 === 0 ? railMatA : railMatB);
        bar.position.set(p.x, p.y + 0.45, p.z);
        bar.rotation.y = yaw;
        this.worldGroup.add(bar);
      });

      // Road support pillars when road rises high above ground!
      if (s.pos.y > 3.5 && i % 12 === 0) {
        const h = s.pos.y + 3;
        const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.1, h, 8), pylonMat);
        pillar.position.set(s.pos.x, s.pos.y - h / 2 - 0.1, s.pos.z);
        this.worldGroup.add(pillar);
      }
    }

    // Start / Finish Checkered Gantry Arch at t = 0
    const s0 = this.samples[0];
    const startYaw = Math.atan2(s0.tangent.x, s0.tangent.z);
    const gantry = new THREE.Group();
    gantry.position.copy(s0.pos);
    gantry.rotation.y = startYaw;
    const pMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.5 });
    const postL = new THREE.Mesh(new THREE.BoxGeometry(1.1, 11, 1.1), pMat);
    postL.position.set(-halfW - 0.6, 5.5, 0);
    const postR = postL.clone();
    postR.position.x = halfW + 0.6;
    const banner = new THREE.Mesh(
      new THREE.BoxGeometry(tr.roadWidth + 2.4, 2.2, 1.2),
      new THREE.MeshStandardMaterial({ color: tr.accentColor, emissive: tr.accentColor, emissiveIntensity: 0.7 })
    );
    banner.position.set(0, 10.2, 0);
    gantry.add(postL, postR, banner);
    this.worldGroup.add(gantry);

    // --- 2 HIDDEN SHORTCUTS WITH GLOWING SECRET PORTAL GATES & BOOST RAMP ---
    tr.shortcuts.forEach((sc) => {
      const tFrom = sc.fromIdx / tr.points.length;
      const tTo = sc.toIdx / tr.points.length;
      const pFrom = this.spline.getPointAt(tFrom);
      const pTo = this.spline.getPointAt(tTo);
      const mid = pFrom.clone().lerp(pTo, 0.5);
      const dist = pFrom.distanceTo(pTo);
      const dir = pTo.clone().sub(pFrom).normalize();
      const scYaw = Math.atan2(dir.x, dir.z);

      // Visual glowing shortcut road strip cutting across the curve
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(6.8, 0.35, dist),
        new THREE.MeshStandardMaterial({ color: 0x10b981, emissive: 0x10b981, emissiveIntensity: 0.55, roughness: 0.4 })
      );
      strip.position.set(mid.x, mid.y - 0.1, mid.z);
      strip.rotation.y = scYaw;
      this.worldGroup.add(strip);

      // Subtle shimmering Secret Gate at entry
      const gate = new THREE.Mesh(
        new THREE.TorusGeometry(4.2, 0.35, 8, 20, Math.PI),
        new THREE.MeshBasicMaterial({ color: 0x34d399 })
      );
      const entryPt = pFrom.clone().lerp(pTo, 0.15);
      gate.position.set(entryPt.x, entryPt.y + 0.5, entryPt.z);
      gate.rotation.y = scYaw;
      this.worldGroup.add(gate);

      this.shortcutZones.push({
        entryPos: entryPt,
        exitPos: pTo.clone(),
        targetT: tTo,
        label: sc.label,
        cooldown: 0
      });
    });

    // --- ROAD SPECIAL OPS & NITRO PICKUPS ---
    for (let i = 10; i < N; i += 14) {
      const s = this.samples[i];
      const op = SPECIAL_OPS[(i / 14) % SPECIAL_OPS.length | 0];
      const lateral = ((i % 28 === 10) ? -3.8 : 3.8);
      const pos = s.pos.clone().addScaledVector(s.right, lateral).add(new THREE.Vector3(0, 1.35, 0));

      const group = new THREE.Group();
      const orb = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.95, 0),
        new THREE.MeshStandardMaterial({ color: op.color, emissive: op.color, emissiveIntensity: 1.4, metalness: 0.5 })
      );
      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(1.3, 0.1, 6, 16),
        new THREE.MeshBasicMaterial({ color: op.color, transparent: true, opacity: 0.65 })
      );
      halo.rotation.x = Math.PI / 2;
      group.add(orb, halo);
      group.position.copy(pos);
      this.scene.add(group);

      this.pickups.push({
        mesh: group,
        pos,
        op,
        respawnTimer: 0
      });
    }

    // --- ICONIC COUNTRY LANDMARKS & SCENERY ---
    this._buildCountryScenery(tr);
  }

  _buildCountryScenery(tr) {
    if (tr.id === 'egypt') {
      // Towering 3D Golden Pyramids & Obelisks!
      const pyrMat = new THREE.MeshStandardMaterial({ map: getSandTexture(4), color: 0xd9a760, roughness: 0.88 });
      [
        [60, 75, 52, 42],
        [-30, 82, 44, 36],
        [15, 255, 64, 52],
        [240, 180, 48, 38]
      ].forEach(([x, z, r, h]) => {
        const pyr = new THREE.Mesh(new THREE.ConeGeometry(r, h, 4), pyrMat);
        pyr.rotation.y = Math.PI / 4;
        pyr.position.set(x, h / 2 - 2, z);
        pyr.castShadow = true;
        this.worldGroup.add(pyr);
      });
      // Golden Obelisks along the route
      for (let i = 0; i < 16; i++) {
        const s = this.samples[(i * 16) % this.samples.length];
        const p = s.pos.clone().addScaledVector(s.right, (i % 2 === 0 ? 1 : -1) * 16);
        const ob = new THREE.Mesh(new THREE.BoxGeometry(2.4, 18, 2.4), pyrMat);
        ob.position.set(p.x, p.y + 8, p.z);
        this.worldGroup.add(ob);
      }
    } else if (tr.id === 'asia') {
      // Cyberpunk Neon Skyscrapers & Glowing Arches
      const towerMat = new THREE.MeshStandardMaterial({ map: getBuildingFacadeTexture(2, 4), roughness: 0.4, metalness: 0.3 });
      for (let i = 0; i < 34; i++) {
        const s = this.samples[(i * 7 + 4) % this.samples.length];
        const side = i % 2 === 0 ? 1 : -1;
        const p = s.pos.clone().addScaledVector(s.right, side * (22 + (i % 3) * 8));
        const h = 28 + (i % 5) * 14;
        const tower = new THREE.Mesh(new THREE.BoxGeometry(12, h, 12), towerMat);
        tower.position.set(p.x, h / 2 - 2, p.z);
        this.worldGroup.add(tower);

        // Glowing Neon Sign strips
        const sign = new THREE.Mesh(
          new THREE.BoxGeometry(12.6, 2.2, 12.6),
          new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? 0xec4899 : 0x22d3ee })
        );
        sign.position.set(p.x, h * 0.72, p.z);
        this.worldGroup.add(sign);
      }
    } else if (tr.id === 'nigeria') {
      // Lagos Eko Suspension Bridge Towers, Golden Palm Trees & Vibrant Billboards
      const steelMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.65, roughness: 0.35 });
      const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.9 });
      const palmMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.7 });
      // Suspension arches over the coastal straight
      [18, 42, 66].forEach(idx => {
        const s = this.samples[idx];
        const yaw = Math.atan2(s.tangent.x, s.tangent.z);
        const arch = new THREE.Mesh(new THREE.TorusGeometry(13, 0.75, 8, 22, Math.PI), steelMat);
        arch.position.copy(s.pos);
        arch.rotation.y = yaw;
        this.worldGroup.add(arch);
      });
      // Tropical Palms & colorful Lagos skyline towers
      for (let i = 0; i < 42; i++) {
        const s = this.samples[(i * 6 + 3) % this.samples.length];
        const p = s.pos.clone().addScaledVector(s.right, (i % 2 === 0 ? 1 : -1) * (16 + (i % 3) * 6));
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.55, 11, 6), trunkMat);
        trunk.position.set(p.x, p.y + 4.5, p.z);
        const crown = new THREE.Mesh(new THREE.ConeGeometry(4.2, 3.2, 7), palmMat);
        crown.position.set(p.x, p.y + 10.5, p.z);
        this.worldGroup.add(trunk, crown);
      }
    } else {
      // Morocco — Red Atlas Canyon Mesas & Terracotta Medina Arches
      const rockMat = new THREE.MeshStandardMaterial({ color: 0x9a3412, roughness: 0.92 });
      const archMat = new THREE.MeshStandardMaterial({ color: 0xc2410c, roughness: 0.8 });
      for (let i = 0; i < 28; i++) {
        const s = this.samples[(i * 9 + 2) % this.samples.length];
        const p = s.pos.clone().addScaledVector(s.right, (i % 2 === 0 ? 1 : -1) * (20 + (i % 3) * 9));
        const h = 16 + (i % 4) * 10;
        const mesa = new THREE.Mesh(new THREE.CylinderGeometry(7, 13, h, 6), rockMat);
        mesa.position.set(p.x, h / 2 - 2, p.z);
        this.worldGroup.add(mesa);
      }
      [30, 95, 165, 220].forEach(idx => {
        const s = this.samples[idx];
        const arch = new THREE.Mesh(new THREE.TorusGeometry(12, 1.3, 8, 16, Math.PI), archMat);
        arch.position.copy(s.pos);
        arch.rotation.y = Math.atan2(s.tangent.x, s.tangent.z);
        this.worldGroup.add(arch);
      });
    }
  }

  // --- GRID SPAWNING (PLAYER + REMOTE MULTIPLAYER + AI RIVALS) ---

  _spawnGrid(roomState) {
    const gridIndex = roomState?.racers?.find(r => r.id === this.mp?.playerId)?.gridIndex || 0;

    if (this.role === 'racer') {
      const spec = getCarSpec(this.carId);
      const startT = (1 - (gridIndex * 0.012)) % 1;
      const sp = this.spline.getPointAt(startT);
      const tan = this.spline.getTangentAt(startT).normalize();
      const right = new THREE.Vector3().crossVectors(tan, new THREE.Vector3(0, 1, 0)).normalize();
      const lat = (gridIndex % 2 === 0 ? -3.2 : 3.2);
      const pos = sp.clone().addScaledVector(right, lat);

      const mesh = createRaceCarMesh(this.carId);
      mesh.position.copy(pos);
      mesh.visible = this.cameraMode === 'chase';
      this.scene.add(mesh);

      this.cockpitMesh = createCockpitMesh(this.carId);
      this.cockpitMesh.visible = this.cameraMode === 'fps';
      this.camera.add(this.cockpitMesh);
      this.scene.add(this.camera);

      this.playerCar = {
        id: this.mp?.playerId || 'LOCAL',
        name: this.playerName,
        carId: this.carId,
        spec,
        mesh,
        pos,
        yaw: Math.atan2(-tan.x, -tan.z),
        speed: 0,
        steerAngle: 0,
        driftAngle: 0,
        drifting: false,
        nitro: 45, // Starts with partial nitro, pick up more on road!
        nitroActive: false,
        hp: spec.maxHp,
        maxHp: spec.maxHp,
        alive: true,
        wreckTimer: 0,
        shieldTimer: 0,
        slowTimer: 0,
        fireCooldown: 0,
        heldOp: null, // Equipped Special Op pickup
        lap: 1,
        trackT: startT,
        lastT: startT,
        takedowns: 0,
        finished: false,
        finishTime: 0
      };
    } else {
      this.scene.add(this.camera);
    }

    // Spawn remote players if already in room
    if (roomState?.racers) {
      this._syncRemoteRacers(roomState);
    }

    // Fill grid up to 6 total racers with competitive AI combat drivers!
    const humanCount = roomState?.racers?.length || (this.role === 'racer' ? 1 : 0);
    const aiCount = Math.max(2, 6 - humanCount);

    for (let i = 0; i < aiCount; i++) {
      const cSpec = CAR_CATALOG[(i + 1) % CAR_CATALOG.length];
      const slot = humanCount + i;
      const startT = (1 - (slot * 0.014) + 1) % 1;
      const sp = this.spline.getPointAt(startT);
      const tan = this.spline.getTangentAt(startT).normalize();
      const right = new THREE.Vector3().crossVectors(tan, new THREE.Vector3(0, 1, 0)).normalize();
      const laneOffset = (i % 2 === 0 ? -3.4 : 3.4);
      const mesh = createRaceCarMesh(cSpec.id);
      mesh.position.copy(sp).addScaledVector(right, laneOffset);
      this.scene.add(mesh);

      this.aiCars.push({
        id: `AI-${i + 1}`,
        name: AI_RIVAL_NAMES[i % AI_RIVAL_NAMES.length],
        carId: cSpec.id,
        spec: cSpec,
        mesh,
        pos: mesh.position.clone(),
        yaw: Math.atan2(-tan.x, -tan.z),
        speed: 0,
        targetSpeed: cSpec.topSpeed * (0.76 + Math.random() * 0.14),
        laneOffset,
        trackT: startT,
        lastT: startT,
        lap: 1,
        hp: cSpec.maxHp,
        maxHp: cSpec.maxHp,
        alive: true,
        wreckTimer: 0,
        slowTimer: 0,
        nitroActive: false,
        drifting: false,
        takedowns: 0,
        finished: false,
        finishTime: 0,
        fireTimer: 3 + Math.random() * 4
      });
    }
  }

  // --- BLUR-STYLE SLOW-MOTION ACTION CAMERA TRIGGER ---

  _triggerSlowMo(focusPos, bannerText) {
    this.timeScale = 0.28;
    this.slowMoTimer = 1.25;
    this.slowMoTargetPos.copy(focusPos);
    this.slowMoAngle = Math.random() * Math.PI * 2;
    audio.playSlowMoDrop();
    if (bannerText) this.callbacks.onActionBanner?.(bannerText);
  }

  // --- COMBAT: SHOOTING RIVALS & SPECIAL OPS ---

  _firePrimaryBlaster() {
    const c = this.playerCar;
    if (!c || !c.alive || c.fireCooldown > 0 || this.countdown > 0) return;
    c.fireCooldown = 0.26;
    audio.playCarBlaster();

    const fwd = new THREE.Vector3(-Math.sin(c.yaw), 0, -Math.cos(c.yaw)).normalize();
    const start = c.pos.clone().add(new THREE.Vector3(0, 1.0, 0)).addScaledVector(fwd, 2.5);

    const bolt = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
    );
    bolt.position.copy(start);
    this.scene.add(bolt);

    this.projectiles.push({
      mesh: bolt,
      pos: start,
      vel: fwd.multiplyScalar(c.speed + 125),
      ownerId: c.id,
      type: 'pulse',
      damage: 24,
      life: 1.5,
      target: null
    });
  }

  _useSpecialOp() {
    const c = this.playerCar;
    if (!c || !c.alive || !c.heldOp || this.countdown > 0) return;
    const op = c.heldOp;
    c.heldOp = null;

    if (op.id === 'nitro') {
      c.nitro = Math.min(100, c.nitro + 65);
      c.nitroActive = true;
      audio.playNitroBoost();
      this.callbacks.onActionBanner?.('🔥 SPECIAL OP: NITRO SURGE ACTIVATED!');
    } else if (op.id === 'shield') {
      c.hp = Math.min(c.maxHp, c.hp + 45);
      c.shieldTimer = 5.5;
      audio.playPickup();
      this.callbacks.onActionBanner?.('🛡️ SPECIAL OP: AEGIS SHIELD & REPAIR!');
    } else if (op.id === 'emp') {
      audio.playExplosion();
      this._spawnSparks(c.pos.clone().add(new THREE.Vector3(0, 1.2, 0)), 0x38bdf8, 22, 16);
      let hits = 0;
      for (const rival of this._getOpponents()) {
        if (rival.alive && rival.pos.distanceTo(c.pos) < 26) {
          this._damageRival(rival, 38, 'EMP SHOCKWAVE', true);
          hits++;
        }
      }
      if (hits > 0) {
        this._triggerSlowMo(c.pos, `⚡ EMP SHOCKWAVE HIT ${hits} RIVAL${hits > 1 ? 'S' : ''}!`);
      } else {
        this.callbacks.onActionBanner?.('⚡ EMP SHOCKWAVE DISCHARGED!');
      }
    } else if (op.id === 'mine') {
      const back = new THREE.Vector3(Math.sin(c.yaw), 0, Math.cos(c.yaw));
      const mPos = c.pos.clone().addScaledVector(back, 4.2).add(new THREE.Vector3(0, 0.4, 0));
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.95, 1.1, 0.35, 12),
        new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0xef4444, emissiveIntensity: 1.4 })
      );
      mesh.position.copy(mPos);
      this.scene.add(mesh);
      this.mines.push({ mesh, pos: mPos, ownerId: c.id, life: 25 });
      audio.playGrenadeThrow();
      this.callbacks.onActionBanner?.('💣 SPECIAL OP: ROAD MINE DEPLOYED!');
    } else if (op.id === 'missile') {
      // Lock onto nearest rival ahead!
      const fwd = new THREE.Vector3(-Math.sin(c.yaw), 0, -Math.cos(c.yaw)).normalize();
      let bestTarget = null;
      let bestDist = 110;
      for (const r of this._getOpponents()) {
        if (!r.alive) continue;
        const d = r.pos.distanceTo(c.pos);
        const dir = r.pos.clone().sub(c.pos).normalize();
        if (d < bestDist && dir.dot(fwd) > 0.25) {
          bestDist = d;
          bestTarget = r;
        }
      }
      audio.playNitroBoost();
      const start = c.pos.clone().add(new THREE.Vector3(0, 1.2, 0)).addScaledVector(fwd, 3.0);
      const mMesh = new THREE.Mesh(
        new THREE.ConeGeometry(0.35, 1.6, 8),
        new THREE.MeshBasicMaterial({ color: 0xf43f5e })
      );
      mMesh.rotation.x = Math.PI / 2;
      mMesh.position.copy(start);
      this.scene.add(mMesh);
      this.projectiles.push({
        mesh: mMesh,
        pos: start,
        vel: fwd.multiplyScalar(c.speed + 95),
        ownerId: c.id,
        type: 'missile',
        damage: 72,
        life: 3.2,
        target: bestTarget
      });
      this.callbacks.onActionBanner?.(bestTarget ? `🚀 MISSILE LOCKED ON ${bestTarget.name}!` : '🚀 HOMING MISSILE FIRED!');
    }
    this._pushHud();
  }

  _getOpponents() {
    const list = [...this.aiCars];
    for (const rc of this.remoteCars.values()) list.push(rc);
    return list;
  }

  _damageRival(rival, dmg, weaponName, isHeavy = false) {
    if (!rival.alive) return;
    rival.hp -= dmg;
    rival.slowTimer = 2.4;
    rival.speed *= 0.52;
    this._spawnSparks(rival.pos.clone().add(new THREE.Vector3(0, 1, 0)), 0xffa500, 12, 10);

    const eliminated = rival.hp <= 0;
    if (rival.isRemote && this.mp?.raceRoomState) {
      this.mp.send({
        type: 'race_combat_hit',
        targetId: rival.id,
        damage: dmg,
        weapon: weaponName,
        eliminated
      });
    }

    if (eliminated) {
      rival.alive = false;
      rival.hp = 0;
      rival.wreckTimer = 3.6;
      rival.speed = 0;
      if (this.playerCar) this.playerCar.takedowns += 1;
      audio.playExplosion();
      this._spawnSparks(rival.pos.clone().add(new THREE.Vector3(0, 1.2, 0)), 0xf43f5e, 28, 16);
      this._triggerSlowMo(rival.pos, `💥 TAKEDOWN! ${rival.name} ELIMINATED!`);
    } else if (isHeavy) {
      audio.playExplosion();
      this._triggerSlowMo(rival.pos, `🎯 ${weaponName} HIT ${rival.name}!`);
    } else {
      audio.playPunch();
    }
  }

  _damagePlayer(dmg) {
    const c = this.playerCar;
    if (!c || !c.alive) return;
    if (c.shieldTimer > 0) {
      this.callbacks.onActionBanner?.('🛡️ AEGIS SHIELD BLOCKED ATTACK!');
      return;
    }
    c.hp = Math.max(0, c.hp - dmg);
    c.slowTimer = 1.6;
    c.speed *= 0.62;
    audio.playPlayerHurt();
    if (c.hp <= 0) {
      c.alive = false;
      c.wreckTimer = 2.8;
      c.speed = 0;
      audio.playExplosion();
      this._triggerSlowMo(c.pos, '💥 CAR WRECKED! REBUILDING CHASSIS...');
    }
  }

  _spawnSparks(pos, color, count = 8, speed = 8) {
    const geo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
    const mat = new THREE.MeshBasicMaterial({ color });
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(pos);
      this.scene.add(m);
      this.particles.push({
        mesh: m,
        vel: new THREE.Vector3((Math.random() - 0.5) * speed, Math.random() * speed * 0.7 + 2, (Math.random() - 0.5) * speed),
        life: 0.45 + Math.random() * 0.25
      });
    }
  }

  // --- CLOSEST POINT ON TRACK SPLINE ---

  _findClosestSample(pos) {
    let bestIdx = 0;
    let bestD2 = Infinity;
    for (let i = 0; i < this.samples.length; i++) {
      const s = this.samples[i].pos;
      const dx = pos.x - s.x;
      const dz = pos.z - s.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) {
        bestD2 = d2;
        bestIdx = i;
      }
    }
    return { idx: bestIdx, sample: this.samples[bestIdx], dist: Math.sqrt(bestD2) };
  }

  _getAllRacersList() {
    const list = [];
    if (this.playerCar) list.push(this.playerCar);
    for (const r of this.remoteCars.values()) list.push(r);
    for (const ai of this.aiCars) list.push(ai);
    // Sort in real-time by Finished > Lap > Track Progress!
    list.sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      const scoreA = a.lap + a.trackT;
      const scoreB = b.lap + b.trackT;
      return scoreB - scoreA;
    });
    return list;
  }

  // --- MAIN LOOP ---

  _loop() {
    if (this.isDisposed) return;
    requestAnimationFrame(this._loop);
    const rawDt = Math.min(0.05, this.clock.getDelta());
    if (!this.isPaused && !this.raceFinished) {
      // Smoothly recover from Blur Slow-Mo back to 1.0x!
      if (this.slowMoTimer > 0) {
        this.slowMoTimer -= rawDt;
        if (this.slowMoTimer <= 0) {
          this.timeScale = 1.0;
        }
      } else {
        this.timeScale = THREE.MathUtils.lerp(this.timeScale, 1.0, rawDt * 6);
      }
      this._update(rawDt * this.timeScale, rawDt);
    }
    this.renderer.render(this.scene, this.camera);
  }

  _update(dt, rawDt) {
    // 3-2-1-GO Race Start Countdown
    if (this.countdown > 0) {
      this.countdown -= rawDt;
      const curInt = Math.ceil(this.countdown);
      if (curInt < this.lastBeepInt && curInt > 0) {
        this.lastBeepInt = curInt;
        audio.playCountdownBeep(false);
      }
      if (this.countdown <= 0) {
        this.countdown = 0;
        audio.playCountdownBeep(true);
        this.callbacks.onActionBanner?.('🏁 GO! FULL THROTTLE!');
      }
      this._updateCamera(rawDt);
      if (Math.floor(performance.now() / 160) !== Math.floor((performance.now() - rawDt * 1000) / 160)) {
        this._pushHud();
      }
      return;
    }

    this.raceElapsed += dt;

    // 1. Update Local Player Car (if Racer)
    if (this.playerCar && this.role === 'racer') {
      this._updatePlayerCar(dt, rawDt);
    }

    // 2. Update AI Rival Cars
    this._updateAiCars(dt);

    // 3. Interpolate Remote Multiplayer Cars
    for (const rc of this.remoteCars.values()) {
      rc.pos.lerp(rc.targetPos, Math.min(1, rawDt * 12));
      rc.mesh.position.copy(rc.pos);
      rc.mesh.rotation.y = rc.yaw;
      if (rc.mesh.userData.flameL) {
        rc.mesh.userData.flameL.visible = rc.nitro;
        rc.mesh.userData.flameR.visible = rc.nitro;
      }
    }

    // 4. Update Pickups, Projectiles, Mines & Particles
    this._updatePickupsAndCombat(dt);

    // 5. Update Camera (FPS Cockpit / Chase View / Spectator / Blur Slow-Mo Orbit!)
    this._updateCamera(rawDt);

    // 6. Broadcast multiplayer racer telemetry (~18Hz)
    const now = performance.now();
    if (this.role === 'racer' && this.playerCar && this.mp?.connected && this.mp.raceRoomState && now - this.lastNetSync > 55) {
      this.lastNetSync = now;
      const c = this.playerCar;
      this.mp.send({
        type: 'race_state_update',
        x: c.pos.x, y: c.pos.y, z: c.pos.z,
        yaw: c.yaw, speed: c.speed,
        lap: c.lap, progress: c.trackT,
        hp: c.hp, alive: c.alive,
        drifting: c.drifting, nitro: c.nitroActive,
        takedowns: c.takedowns
      });
    }

    if (Math.floor(now / 150) !== Math.floor((now - rawDt * 1000) / 150)) {
      this._pushHud();
    }
  }

  _updatePlayerCar(dt, rawDt) {
    const c = this.playerCar;
    if (c.fireCooldown > 0) c.fireCooldown -= dt;
    if (c.shieldTimer > 0) c.shieldTimer -= dt;
    if (c.slowTimer > 0) c.slowTimer -= dt;

    if (!c.alive) {
      c.wreckTimer -= rawDt;
      c.mesh.rotation.y += rawDt * 4;
      if (c.wreckTimer <= 0) {
        c.alive = true;
        c.hp = c.maxHp;
        const cl = this._findClosestSample(c.pos);
        c.pos.copy(cl.sample.pos);
        c.yaw = Math.atan2(-cl.sample.tangent.x, -cl.sample.tangent.z);
        c.speed = 18;
      }
      audio.updateEngine(0, false, this.slowMoTimer > 0);
      return;
    }

    const throttle = (this.keys['KeyW'] || this.keys['ArrowUp']) ? 1 : 0;
    const brake = (this.keys['KeyS'] || this.keys['ArrowDown']) ? 1 : 0;
    const steerInput = ((this.keys['KeyA'] || this.keys['ArrowLeft']) ? 1 : 0) - ((this.keys['KeyD'] || this.keys['ArrowRight']) ? 1 : 0);
    const driftKey = Boolean(this.keys['Space']);
    const nitroKey = Boolean(this.keys['ShiftLeft'] || this.keys['ShiftRight'] || this.keys['KeyN']);

    // Nitro Boost activation & drain
    const wasNitro = c.nitroActive;
    c.nitroActive = nitroKey && c.nitro > 1 && throttle > 0;
    if (c.nitroActive) {
      c.nitro = Math.max(0, c.nitro - 28 * dt);
      if (!wasNitro) audio.playNitroBoost();
    } else {
      c.nitro = Math.min(100, c.nitro + 2.2 * dt);
    }

    const maxSpd = c.spec.topSpeed * (c.nitroActive ? 1.38 : 1.0) * (c.slowTimer > 0 ? 0.55 : 1.0);
    const accel = c.spec.accel * (c.nitroActive ? 1.85 : 1.0);

    if (throttle) c.speed += accel * dt;
    else if (brake) c.speed -= accel * 1.35 * dt;
    else c.speed *= Math.pow(0.58, dt); // smooth natural rolling drag

    c.speed = THREE.MathUtils.clamp(c.speed, -22, maxSpd);

    // Drift & Responsive Steering Physics!
    c.drifting = driftKey && Math.abs(c.speed) > 22 && Math.abs(steerInput) > 0.1;
    const turnPower = c.spec.handling * (c.drifting ? 1.48 : 1.0) * Math.min(1, Math.abs(c.speed) / 14);
    const dirSign = c.speed >= 0 ? 1 : -1;
    c.yaw += steerInput * turnPower * dirSign * dt;

    c.steerAngle = THREE.MathUtils.lerp(c.steerAngle, steerInput * 0.75, rawDt * 12);
    c.driftAngle = THREE.MathUtils.lerp(c.driftAngle, c.drifting ? steerInput * 0.34 : 0, rawDt * 8);

    if (c.drifting) {
      // Drifting charges bonus Nitro & kicks orange sparks!
      c.nitro = Math.min(100, c.nitro + 14 * dt);
      this.driftSoundTimer -= rawDt;
      if (this.driftSoundTimer <= 0) {
        audio.playDriftScreech();
        this.driftSoundTimer = 0.22;
      }
      if (Math.random() < 0.65) {
        this._spawnSparks(c.pos.clone().add(new THREE.Vector3(0, 0.2, 0)), 0xfbbf24, 1, 5);
      }
    }

    // Move car along forward + subtle drift slip vector
    const moveYaw = c.yaw - c.driftAngle * 0.45;
    const fwd = new THREE.Vector3(-Math.sin(moveYaw), 0, -Math.cos(moveYaw));
    c.pos.addScaledVector(fwd, c.speed * dt);

    // Check Hidden Shortcuts first!
    for (const sc of this.shortcutZones) {
      if (sc.cooldown > 0) sc.cooldown -= rawDt;
      if (sc.cooldown <= 0 && c.pos.distanceTo(sc.entryPos) < 8.5) {
        sc.cooldown = 10;
        // Propel smoothly along the shortcut & launch Blur Slow-Mo!
        const jumpDir = sc.exitPos.clone().sub(c.pos).normalize();
        c.pos.copy(sc.entryPos.clone().lerp(sc.exitPos, 0.78));
        c.yaw = Math.atan2(-jumpDir.x, -jumpDir.z);
        c.speed = Math.max(c.speed, c.spec.topSpeed * 1.32);
        c.nitro = Math.min(100, c.nitro + 35);
        this._triggerSlowMo(c.pos, `⚡ HIDDEN SHORTCUT: ${sc.label}!`);
      }
    }

    // Keep car hugging the crazy 3D road with smooth wall-scraping guardrail slide physics!
    const closest = this._findClosestSample(c.pos);
    const maxOffRoad = this.track.roadWidth * 0.46;
    const toCar = c.pos.clone().sub(closest.sample.pos);
    const lateralDist = toCar.dot(closest.sample.right);
    if (Math.abs(lateralDist) > maxOffRoad) {
      const sign = Math.sign(lateralDist);
      const excess = Math.abs(lateralDist) - maxOffRoad;
      c.pos.addScaledVector(closest.sample.right, -sign * excess);

      // Gently align yaw toward road tangent & emit metallic guardrail sparks!
      const roadYaw = Math.atan2(-closest.sample.tangent.x, -closest.sample.tangent.z);
      let yawDiff = roadYaw - c.yaw;
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
      c.yaw += yawDiff * Math.min(1, rawDt * 9);
      c.speed *= 0.94;
      if (Math.abs(c.speed) > 16 && Math.random() < 0.7) {
        this._spawnSparks(
          c.pos.clone().addScaledVector(closest.sample.right, sign * 1.1).add(new THREE.Vector3(0, 0.55, 0)),
          0xffa500, 2, 7
        );
      }
    }
    c.pos.y = THREE.MathUtils.lerp(c.pos.y, closest.sample.pos.y, Math.min(1, dt * 18));

    // Smooth Car-to-Car Elastic Collision & Ramming Takedowns!
    for (const rival of this._getOpponents()) {
      if (!rival.alive) continue;
      const dx = c.pos.x - rival.pos.x;
      const dz = c.pos.z - rival.pos.z;
      const d2 = dx * dx + dz * dz;
      const minSep = 3.15;
      if (d2 < minSep * minSep && d2 > 0.001) {
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const nz = dz / d;
        const overlap = minSep - d;
        c.pos.x += nx * overlap * 0.55;
        c.pos.z += nz * overlap * 0.55;
        rival.pos.x -= nx * overlap * 0.45;
        rival.pos.z -= nz * overlap * 0.45;

        const impactSpd = Math.abs(c.speed - (rival.speed || 0));
        this._spawnSparks(c.pos.clone().lerp(rival.pos, 0.5).add(new THREE.Vector3(0, 0.8, 0)), 0xfef08a, 8, 10);
        if (impactSpd > 14 && c.speed > (rival.speed || 0)) {
          // High-speed ramming attack! Titan V8 Interceptor deals heavy ram damage!
          const ramDmg = c.carId === 'titan' ? 38 : 22;
          this._damageRival(rival, ramDmg, 'RAM SLAM', ramDmg >= 35);
          c.speed *= 0.88;
        } else {
          audio.playPunch();
          c.speed *= 0.92;
        }
      }
    }

    // Track 3D slope pitch & corner lean roll for realistic chassis feel!
    const slopePitch = Math.asin(THREE.MathUtils.clamp(closest.sample.tangent.y, -0.4, 0.4));
    c.pitch = THREE.MathUtils.lerp(c.pitch || 0, slopePitch, Math.min(1, rawDt * 10));
    c.roll = THREE.MathUtils.lerp(c.roll || 0, -c.steerAngle * 0.085 - c.driftAngle * 0.14, Math.min(1, rawDt * 10));

    // Lap & progress tracking (detect wrap from t > 0.82 to t < 0.18)
    const prevT = c.lastT;
    const newT = closest.sample.t;
    if (prevT > 0.8 && newT < 0.2) {
      c.lap += 1;
      if (c.lap > this.totalLaps) {
        this._completeRace(c);
        return;
      } else {
        audio.playPickup();
        this.callbacks.onActionBanner?.(
          c.lap === this.totalLaps ? '🔥 FINAL LAP!' : `🏁 LAP ${c.lap} / ${this.totalLaps}`
        );
      }
    }
    c.lastT = newT;
    c.trackT = newT;

    // Update 3D car mesh + pitch/roll tilt + wheels + nitro flames + shield
    c.mesh.position.copy(c.pos);
    c.mesh.rotation.order = 'YXZ';
    c.mesh.rotation.set(c.pitch || 0, c.yaw + c.driftAngle, c.roll || 0);
    const u = c.mesh.userData;
    u.wheels.forEach((w, idx) => {
      w.rotation.x -= c.speed * dt * 0.35;
      if (idx < 2) w.rotation.y = c.steerAngle * 0.5;
    });
    u.flameL.visible = c.nitroActive;
    u.flameR.visible = c.nitroActive;
    u.shieldMesh.visible = c.shieldTimer > 0;

    // Animate First-Person Interior Steering Wheel & LED RPM Strip!
    if (this.cockpitMesh?.userData.wheelPivot) {
      this.cockpitMesh.userData.wheelPivot.rotation.z = c.steerAngle * 1.45;
      const ratio = Math.min(1, Math.abs(c.speed) / c.spec.topSpeed);
      this.cockpitMesh.userData.rpmStrip.scale.x = 0.2 + ratio * 0.95;
    }

    audio.updateEngine(c.speed / c.spec.topSpeed, c.nitroActive, this.slowMoTimer > 0);
  }

  _updateAiCars(dt) {
    for (const ai of this.aiCars) {
      if (!ai.alive) {
        ai.wreckTimer -= dt;
        ai.mesh.rotation.y += dt * 4.5;
        if (ai.wreckTimer <= 0) {
          ai.alive = true;
          ai.hp = ai.maxHp;
          ai.speed = 20;
        }
        continue;
      }
      if (ai.slowTimer > 0) ai.slowTimer -= dt;

      const spdMult = ai.slowTimer > 0 ? 0.48 : 1.0;
      const desiredSpd = ai.targetSpeed * spdMult;
      ai.speed = THREE.MathUtils.lerp(ai.speed, desiredSpd, dt * 2.5);

      const prevT = ai.trackT;
      const trackLen = this.spline.getLength();
      ai.trackT = (ai.trackT + (ai.speed * dt) / trackLen) % 1;

      if (prevT > 0.8 && ai.trackT < 0.2) {
        ai.lap += 1;
        if (ai.lap > this.totalLaps && !ai.finished) {
          ai.finished = true;
          ai.finishTime = this.raceElapsed;
        }
      }

      const pt = this.spline.getPointAt(ai.trackT);
      const tan = this.spline.getTangentAt(ai.trackT).normalize();
      const right = new THREE.Vector3().crossVectors(tan, new THREE.Vector3(0, 1, 0)).normalize();
      ai.pos.copy(pt).addScaledVector(right, ai.laneOffset);
      ai.yaw = Math.atan2(-tan.x, -tan.z);

      ai.mesh.position.copy(ai.pos);
      ai.mesh.rotation.y = ai.yaw;
      ai.mesh.userData.wheels.forEach(w => { w.rotation.x -= ai.speed * dt * 0.35; });

      // AI Combat shooting when close behind the player
      if (this.playerCar && this.playerCar.alive) {
        ai.fireTimer -= dt;
        const d = ai.pos.distanceTo(this.playerCar.pos);
        if (ai.fireTimer <= 0 && d < 32 && d > 5) {
          ai.fireTimer = 3.5 + Math.random() * 3.5;
          const dir = this.playerCar.pos.clone().sub(ai.pos).normalize();
          const bolt = new THREE.Mesh(
            new THREE.SphereGeometry(0.28, 6, 6),
            new THREE.MeshBasicMaterial({ color: 0xf43f5e })
          );
          bolt.position.copy(ai.pos).add(new THREE.Vector3(0, 1, 0));
          this.scene.add(bolt);
          this.projectiles.push({
            mesh: bolt,
            pos: bolt.position.clone(),
            vel: dir.multiplyScalar(115),
            ownerId: ai.id,
            type: 'ai_pulse',
            damage: 14,
            life: 1.2,
            target: null
          });
        }
      }
    }
  }

  _updatePickupsAndCombat(dt) {
    const tNow = performance.now() * 0.003;
    // Spin road Special Ops & Nitro pickups
    for (const pk of this.pickups) {
      if (pk.respawnTimer > 0) {
        pk.respawnTimer -= dt;
        if (pk.respawnTimer <= 0) pk.mesh.visible = true;
        continue;
      }
      pk.mesh.rotation.y = tNow;
      if (this.playerCar && this.playerCar.alive && pk.pos.distanceTo(this.playerCar.pos) < 3.6) {
        pk.mesh.visible = false;
        pk.respawnTimer = 8.0;
        if (pk.op.id === 'nitro') {
          this.playerCar.nitro = Math.min(100, this.playerCar.nitro + 55);
          audio.playPickup();
          this.callbacks.onActionBanner?.('🔥 LUCKY PICKUP: +55% NITRO SPEED!');
        } else {
          this.playerCar.heldOp = pk.op;
          audio.playPickup();
          this.callbacks.onActionBanner?.(`SPECIAL OP ACQUIRED: ${pk.op.label} [PRESS E]`);
        }
        this._pushHud();
      }
    }

    // Update Projectiles (Blaster Bolts & Homing Missiles)
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.life -= dt;
      if (pr.type === 'missile' && pr.target && pr.target.alive) {
        const desired = pr.target.pos.clone().add(new THREE.Vector3(0, 0.9, 0)).sub(pr.pos).normalize().multiplyScalar(120);
        pr.vel.lerp(desired, Math.min(1, dt * 8));
      }
      pr.pos.addScaledVector(pr.vel, dt);
      pr.mesh.position.copy(pr.pos);

      let hit = false;
      if (pr.ownerId === this.playerCar?.id) {
        for (const r of this._getOpponents()) {
          if (r.alive && pr.pos.distanceTo(r.pos) < 3.2) {
            this._damageRival(r, pr.damage, pr.type === 'missile' ? 'HOMING MISSILE' : 'PULSE BLASTER', pr.type === 'missile');
            hit = true;
            break;
          }
        }
      } else if (this.playerCar && this.playerCar.alive && pr.pos.distanceTo(this.playerCar.pos) < 2.8) {
        this._damagePlayer(pr.damage);
        hit = true;
      }

      if (hit || pr.life <= 0) {
        this.scene.remove(pr.mesh);
        this.projectiles.splice(i, 1);
      }
    }

    // Update Road Mines
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const m = this.mines[i];
      m.life -= dt;
      let detonated = false;
      for (const r of this._getOpponents()) {
        if (r.alive && r.pos.distanceTo(m.pos) < 3.8) {
          this._damageRival(r, 65, 'ROAD MINE', true);
          detonated = true;
          break;
        }
      }
      if (detonated || m.life <= 0) {
        this.scene.remove(m.mesh);
        this.mines.splice(i, 1);
      }
    }

    // Update Sparks/Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.vel.y -= 18 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.particles.splice(i, 1);
      }
    }
  }

  _updateCamera(rawDt) {
    // Blur-Style Slow-Motion Sweeping Action Camera!
    if (this.slowMoTimer > 0) {
      this.slowMoAngle += rawDt * 1.45;
      const offset = new THREE.Vector3(Math.cos(this.slowMoAngle) * 11, 4.4, Math.sin(this.slowMoAngle) * 11);
      this.camera.position.lerp(this.slowMoTargetPos.clone().add(offset), Math.min(1, rawDt * 8));
      this.camera.lookAt(this.slowMoTargetPos.x, this.slowMoTargetPos.y + 1.0, this.slowMoTargetPos.z);
      if (this.cockpitMesh) this.cockpitMesh.visible = false;
      if (this.playerCar) this.playerCar.mesh.visible = true;
      return;
    }

    // Determine which car camera follows (Player if Racer, selected live racer if Spectator!)
    let targetCar = this.playerCar;
    if (this.role === 'spectator') {
      const all = this._getAllRacersList();
      if (all.length > 0) {
        targetCar = all[this.spectateTargetIndex % all.length];
      }
    }
    if (!targetCar) return;

    const isFps = this.cameraMode === 'fps' && this.role === 'racer';
    if (this.cockpitMesh) this.cockpitMesh.visible = isFps;
    if (this.playerCar) this.playerCar.mesh.visible = !isFps;

    const fwd = new THREE.Vector3(-Math.sin(targetCar.yaw), 0, -Math.cos(targetCar.yaw));

    if (isFps) {
      // INSIDE THE CAR FIRST-PERSON COCKPIT VIEW with road pitch & corner lean!
      const seatPos = targetCar.pos.clone().add(new THREE.Vector3(0, 1.32, 0)).addScaledVector(fwd, 0.25);
      this.camera.position.copy(seatPos);
      const pitchY = Math.sin(targetCar.pitch || 0) * 18;
      const lookTarget = seatPos.clone().addScaledVector(fwd, 24).add(new THREE.Vector3(0, -0.3 + pitchY, 0));
      this.camera.lookAt(lookTarget);
      this.camera.rotation.z += (targetCar.roll || 0) * 0.45;
      // Dynamic FOV warp during Nitro!
      const targetFov = targetCar.nitroActive ? 92 : 74 + Math.min(10, Math.abs(targetCar.speed) * 0.12);
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, rawDt * 8);
      this.camera.updateProjectionMatrix();
    } else {
      // THIRD-PERSON CAR CHASE VIEW (Also used for Spectators)
      const back = fwd.clone().multiplyScalar(-9.5);
      const desiredPos = targetCar.pos.clone().add(back).add(new THREE.Vector3(0, 3.85, 0));
      this.camera.position.lerp(desiredPos, Math.min(1, rawDt * 10));
      this.camera.lookAt(targetCar.pos.clone().addScaledVector(fwd, 10).add(new THREE.Vector3(0, 1.1, 0)));
      const targetFov = targetCar.nitroActive ? 86 : 70;
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, rawDt * 8);
      this.camera.updateProjectionMatrix();
    }
  }

  _completeRace(c) {
    this.raceFinished = true;
    c.finished = true;
    c.finishTime = this.raceElapsed;
    audio.stopEngine();

    const standings = this._getAllRacersList();
    const position = standings.findIndex(r => r.id === c.id) + 1;
    const won = position === 1;
    if (won) audio.playTrophyFanfare();
    else audio.playPickup();

    this.mp?.submitRaceResult({
      won,
      name: c.name,
      carId: c.carId,
      trackId: this.trackId,
      timeSec: c.finishTime,
      takedowns: c.takedowns
    });

    this.callbacks.onRaceFinish?.({
      won,
      position,
      totalRacers: standings.length,
      playerName: c.name,
      carName: c.spec.name,
      trackName: this.track.name,
      timeSec: c.finishTime,
      takedowns: c.takedowns,
      standings: standings.map((r, idx) => ({
        pos: idx + 1,
        name: r.name,
        carName: getCarSpec(r.carId).name,
        lap: Math.min(this.totalLaps, r.lap),
        takedowns: r.takedowns || 0,
        isPlayer: r.id === c.id
      }))
    });
  }

  _pushHud() {
    const standings = this._getAllRacersList();
    const myPos = this.playerCar ? standings.findIndex(r => r.id === this.playerCar.id) + 1 : 0;
    const followed = this.role === 'spectator' && standings.length > 0
      ? standings[this.spectateTargetIndex % standings.length]
      : this.playerCar;

    const mins = Math.floor(this.raceElapsed / 60);
    const secs = (this.raceElapsed % 60).toFixed(1).padStart(4, '0');

    this.callbacks.onHudUpdate?.({
      game: 'racing',
      role: this.role,
      cameraMode: this.cameraMode,
      trackName: this.track.name,
      trackFlag: this.track.flag,
      totalLaps: this.totalLaps,
      countdown: Math.ceil(this.countdown),
      timeStr: `${String(mins).padStart(2, '0')}:${secs}`,
      position: myPos,
      totalRacers: standings.length,
      lap: Math.min(this.totalLaps, followed?.lap || 1),
      speedKmh: Math.round(Math.abs(followed?.speed || 0) * 3.8),
      hp: Math.ceil(followed?.hp ?? 100),
      maxHp: followed?.maxHp || 100,
      nitro: Math.round(this.playerCar?.nitro || 0),
      nitroActive: Boolean(this.playerCar?.nitroActive),
      drifting: Boolean(this.playerCar?.drifting),
      heldOp: this.playerCar?.heldOp || null,
      takedowns: this.playerCar?.takedowns || 0,
      spectatingName: followed?.name || 'RACER',
      roomState: this.mp?.raceRoomState || null,
      isHost: this.mp?.raceRoomState?.hostId === this.mp?.playerId,
      standings: standings.slice(0, 6).map((r, idx) => ({
        pos: idx + 1,
        name: r.name,
        lap: Math.min(this.totalLaps, r.lap),
        isPlayer: r.id === this.playerCar?.id,
        alive: r.alive
      }))
    });
  }

  // --- MULTIPLAYER SYNC ---

  _bindMultiplayer() {
    if (!this.mp) return;
    this._unsubs = [
      this.mp.on('race_room_state', (state) => {
        this._syncRemoteRacers(state);
        this._pushHud();
      }),
      this.mp.on('race_locked_start', (state) => {
        this._syncRemoteRacers(state);
        this.callbacks.onActionBanner?.('🔒 GRID FULL & LOCKED — EXTRA USERS NOW SPECTATING LIVE!');
        this._pushHud();
      }),
      this.mp.on('race_racer_moved', (d) => {
        if (d.id === this.mp.playerId) return;
        let rc = this.remoteCars.get(d.id);
        if (!rc) {
          const mesh = createRaceCarMesh(d.carId || 'apex');
          mesh.position.set(d.x, d.y, d.z);
          this.scene.add(mesh);
          rc = {
            id: d.id, name: d.name, carId: d.carId || 'apex',
            mesh, isRemote: true,
            pos: new THREE.Vector3(d.x, d.y, d.z),
            targetPos: new THREE.Vector3(d.x, d.y, d.z),
            yaw: d.yaw, speed: d.speed, lap: d.lap, trackT: d.progress,
            hp: d.hp, maxHp: 110, alive: d.alive, nitro: d.nitro, takedowns: d.takedowns || 0
          };
          this.remoteCars.set(d.id, rc);
        }
        rc.targetPos.set(d.x, d.y, d.z);
        rc.yaw = d.yaw;
        rc.speed = d.speed;
        rc.lap = d.lap;
        rc.trackT = d.progress;
        rc.hp = d.hp;
        rc.alive = d.alive;
        rc.nitro = d.nitro;
        rc.takedowns = d.takedowns || 0;
      }),
      this.mp.on('race_combat_event', (d) => {
        if (d.targetId === this.mp.playerId && this.role === 'racer') {
          this._damagePlayer(d.damage);
        } else if (this.role === 'spectator' && d.eliminated) {
          this.callbacks.onActionBanner?.(`💥 LIVE ACTION: CAR ELIMINATED BY ${d.weapon}!`);
        }
      })
    ];
  }

  _syncRemoteRacers(state) {
    if (!state?.racers) return;
    const ids = new Set();
    for (const r of state.racers) {
      if (r.id === this.mp.playerId) continue;
      ids.add(r.id);
      if (!this.remoteCars.has(r.id)) {
        const mesh = createRaceCarMesh(r.carId || 'apex');
        mesh.position.set(r.x, r.y, r.z);
        this.scene.add(mesh);
        this.remoteCars.set(r.id, {
          id: r.id, name: r.name, carId: r.carId || 'apex',
          mesh, isRemote: true,
          pos: new THREE.Vector3(r.x, r.y, r.z),
          targetPos: new THREE.Vector3(r.x, r.y, r.z),
          yaw: r.yaw || 0, speed: r.speed || 0, lap: r.lap || 1,
          trackT: r.progress || 0, hp: r.hp || 100, maxHp: 110,
          alive: r.alive !== false, nitro: false, takedowns: r.takedowns || 0
        });
      }
    }
    for (const [id, rc] of this.remoteCars.entries()) {
      if (!ids.has(id)) {
        this.scene.remove(rc.mesh);
        this.remoteCars.delete(id);
      }
    }
  }

  // --- EVENTS ---

  _bindEvents() {
    this._onResize = () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    };

    this._onKeyDown = (e) => {
      if (e.code === 'KeyP' || e.code === 'Escape') {
        this.setPaused(!this.isPaused);
        return;
      }
      if (this.isPaused || this.raceFinished) return;
      this.keys[e.code] = true;

      if (e.code === 'KeyV') {
        this.toggleCameraView();
      } else if (e.code === 'Tab' && this.role === 'spectator') {
        e.preventDefault();
        this.cycleSpectateTarget();
      } else if (this.role === 'racer') {
        if (e.code === 'KeyF') this._firePrimaryBlaster();
        if (e.code === 'KeyE') this._useSpecialOp();
      }
    };

    this._onKeyUp = (e) => {
      this.keys[e.code] = false;
    };

    this._onMouseDown = (e) => {
      if (this.isPaused || this.raceFinished || this.role !== 'racer') return;
      audio.init();
      if (e.button === 0) this._firePrimaryBlaster();
      if (e.button === 2) this._useSpecialOp();
    };

    this._onContextMenu = (e) => e.preventDefault();

    window.addEventListener('resize', this._onResize);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    this.renderer.domElement.addEventListener('mousedown', this._onMouseDown);
    this.renderer.domElement.addEventListener('contextmenu', this._onContextMenu);
  }

  dispose() {
    this.isDisposed = true;
    audio.stopEngine();
    audio.stopMusic();
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    if (this._unsubs) this._unsubs.forEach(fn => fn());
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
