import * as THREE from 'three';

export const CAR_CATALOG = [
  {
    id: 'valkyrie',
    name: 'Valkyrie GT',
    tagline: 'Hypercar • Blistering Top Speed',
    primary: 0xe11d48,
    accent: 0x38bdf8,
    topSpeed: 76,
    accel: 39,
    handling: 2.35,
    maxHp: 110,
    stats: { speed: 96, accel: 84, drift: 82, armor: 72 }
  },
  {
    id: 'apex',
    name: 'Apex Drift RX',
    tagline: 'Street Tuner • Razor Drift Handling',
    primary: 0x06b6d4,
    accent: 0xfde047,
    topSpeed: 71,
    accel: 43,
    handling: 2.75,
    maxHp: 100,
    stats: { speed: 84, accel: 94, drift: 98, armor: 68 }
  },
  {
    id: 'titan',
    name: 'Titan V8 Interceptor',
    tagline: 'Armored Muscle • Heavy Ramming Rig',
    primary: 0xd97706,
    accent: 0xfef08a,
    topSpeed: 73,
    accel: 37,
    handling: 2.15,
    maxHp: 145,
    stats: { speed: 88, accel: 78, drift: 74, armor: 98 }
  },
  {
    id: 'phantom',
    name: 'Phantom Evo-X',
    tagline: 'Stealth Prototype • Balanced Elite',
    primary: 0x1e293b,
    accent: 0x22c55e,
    topSpeed: 74,
    accel: 41,
    handling: 2.55,
    maxHp: 120,
    stats: { speed: 91, accel: 89, drift: 90, armor: 84 }
  }
];

export function getCarSpec(carId) {
  return CAR_CATALOG.find(c => c.id === carId) || CAR_CATALOG[0];
}

function stdMat(color, roughness = 0.25, metalness = 0.72, emissive = 0x000000, emissiveIntensity = 0) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    emissive,
    emissiveIntensity
  });
}

// Sculpted High-Detail 3D Combat Race Car (Used in 3D Garage Carousel, Chase View, AI & Multiplayer!)
export function createRaceCarMesh(carId = 'valkyrie') {
  const spec = getCarSpec(carId);
  const root = new THREE.Group();

  const bodyMat = stdMat(spec.primary, 0.18, 0.78);
  const carbonMat = stdMat(0x11161f, 0.45, 0.55);
  const darkMat = stdMat(0x0f131a, 0.78, 0.22);
  const glassMat = stdMat(0x0b1526, 0.08, 0.92, 0x1d4ed8, 0.2);
  const neonMat = stdMat(spec.accent, 0.18, 0.4, spec.accent, 1.55);
  const headMat = stdMat(0xffffff, 0.1, 0.1, 0xfef9c3, 2.5);
  const tailMat = stdMat(0xef4444, 0.15, 0.2, 0xef4444, 2.4);
  const gunMat = stdMat(0x475569, 0.28, 0.88);
  const chromeMat = stdMat(0xe2e8f0, 0.14, 0.96);

  const chassisGroup = new THREE.Group();
  root.add(chassisGroup);

  // Lower Carbon Splitter & Side Skirts
  const splitter = new THREE.Mesh(new THREE.BoxGeometry(2.18, 0.12, 4.92), carbonMat);
  splitter.position.set(0, 0.32, 0);
  chassisGroup.add(splitter);

  // Sculpted Main Body Core
  const mainBody = new THREE.Mesh(new THREE.BoxGeometry(2.12, 0.52, 4.65), bodyMat);
  mainBody.position.set(0, 0.62, 0);
  mainBody.castShadow = true;
  mainBody.receiveShadow = true;
  chassisGroup.add(mainBody);

  // Racing Center Stripe
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.03, 4.55), neonMat);
  stripe.position.set(0, 0.895, 0);
  chassisGroup.add(stripe);

  // Aggressive Sloped Aerodynamic Nose Hood
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.26, 1.72), bodyMat);
  hood.position.set(0, 0.82, -1.52);
  hood.rotation.x = 0.14;
  hood.castShadow = true;
  chassisGroup.add(hood);

  // Unique Hero Car Body Accents per Model!
  if (carId === 'titan') {
    // Exposed Chrome Supercharger V8 Blower on the Hood!
    const blower = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.34, 0.78), chromeMat);
    blower.position.set(0, 1.04, -1.35);
    const intake = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.12, 0.12), stdMat(0xef4444, 0.2, 0.5, 0xef4444, 0.9));
    intake.position.set(0, 1.1, -1.75);
    chassisGroup.add(blower, intake);
  } else if (carId === 'apex') {
    // Widebody JDM Fenders
    [-1.12, 1.12].forEach(fx => {
      const flare = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.36, 1.3), bodyMat);
      flare.position.set(fx, 0.58, 1.42);
      const flareF = flare.clone();
      flareF.position.z = -1.42;
      chassisGroup.add(flare, flareF);
    });
  } else if (carId === 'phantom') {
    // Stealth Dorsal Roof Fin
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.36, 1.4), carbonMat);
    fin.position.set(0, 1.46, 1.05);
    chassisGroup.add(fin);
  }

  // Sculpted Aerodynamic Cabin Canopy (Sloped Front Windshield + Rear Fastback)
  const cabinRoof = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.42, 1.6), glassMat);
  cabinRoof.position.set(0, 1.16, 0.18);
  cabinRoof.castShadow = true;
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.48, 0.12), glassMat);
  windshield.position.set(0, 1.08, -0.78);
  windshield.rotation.x = -0.68;
  const fastback = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.42, 1.15), bodyMat);
  fastback.position.set(0, 1.05, 1.36);
  fastback.rotation.x = 0.32;
  chassisGroup.add(cabinRoof, windshield, fastback);

  // Side Mirrors
  [-1.08, 1.08].forEach(mx => {
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.1, 0.18), bodyMat);
    mirror.position.set(mx, 0.96, -0.68);
    chassisGroup.add(mirror);
  });

  // Neon Underglow Ground Trim Strips
  [-1.09, 1.09].forEach(sx => {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 3.3), neonMat);
    strip.position.set(sx, 0.34, 0);
    chassisGroup.add(strip);
  });

  // Sculpted GT Rear Wing & Twin Carbon Struts
  const wing = new THREE.Mesh(new THREE.BoxGeometry(2.24, 0.08, 0.48), carId === 'valkyrie' ? bodyMat : carbonMat);
  wing.position.set(0, 1.42, 2.12);
  wing.rotation.x = 0.08;
  [-1.12, 1.12].forEach(ex => {
    const endplate = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.28, 0.56), neonMat);
    endplate.position.set(ex, 1.4, 2.12);
    chassisGroup.add(endplate);
  });
  [-0.72, 0.72].forEach(sx => {
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.48, 0.22), carbonMat);
    strut.position.set(sx, 1.15, 2.08);
    chassisGroup.add(strut);
  });
  chassisGroup.add(wing);

  // Aggressive LED Headlights & Full-Width Taillight Blade + Quad Exhaust Pipes
  [-0.7, 0.7].forEach(hx => {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.13, 0.12), headMat);
    hl.position.set(hx, 0.68, -2.35);
    hl.rotation.y = hx > 0 ? -0.15 : 0.15;
    chassisGroup.add(hl);
  });
  const tlBar = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.13, 0.1), tailMat);
  tlBar.position.set(0, 0.76, 2.34);
  chassisGroup.add(tlBar);

  [-0.64, -0.42, 0.42, 0.64].forEach(px => {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.25, 8), chromeMat);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(px, 0.42, 2.36);
    chassisGroup.add(pipe);
  });

  // Twin Hood-Mounted Combat Pulse Cannons
  [-0.8, 0.8].forEach(gx => {
    const mount = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.34), carbonMat);
    mount.position.set(gx, 0.94, -1.65);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.065, 0.88, 10), gunMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(gx, 0.95, -2.02);
    const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.068, 0.09, 10), neonMat);
    muzzle.rotation.x = Math.PI / 2;
    muzzle.position.set(gx, 0.95, -2.44);
    chassisGroup.add(mount, barrel, muzzle);
  });

  // 4 Deep-Dish Sculpted Wheels with Spokes & Glowing Rim Rings
  const tireGeo = new THREE.CylinderGeometry(0.44, 0.44, 0.38, 18);
  tireGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.4, 12);
  rimGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.TorusGeometry(0.26, 0.032, 6, 16);
  hubGeo.rotateY(Math.PI / 2);

  const wheels = [];
  [
    [-1.1, 0.44, -1.44], [1.1, 0.44, -1.44],
    [-1.1, 0.44, 1.46], [1.1, 0.44, 1.46]
  ].forEach(([wx, wy, wz]) => {
    const wg = new THREE.Group();
    wg.position.set(wx, wy, wz);
    const tire = new THREE.Mesh(tireGeo, darkMat);
    tire.castShadow = true;
    const rim = new THREE.Mesh(rimGeo, chromeMat);
    const glowRing = new THREE.Mesh(hubGeo, neonMat);
    glowRing.position.x = wx > 0 ? 0.2 : -0.2;
    // Wheel spokes so rotation is clearly visible when rolling!
    const spoke1 = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.5), carbonMat);
    const spoke2 = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.06), carbonMat);
    wg.add(tire, rim, glowRing, spoke1, spoke2);
    root.add(wg);
    wheels.push(wg);
  });

  // Twin Nitro Exhaust Flames
  const flameMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.92 });
  const flameL = new THREE.Mesh(new THREE.ConeGeometry(0.24, 1.8, 8), flameMat);
  flameL.rotation.x = Math.PI / 2;
  flameL.position.set(-0.52, 0.44, 3.25);
  flameL.visible = false;
  const flameR = flameL.clone();
  flameR.position.x = 0.52;
  chassisGroup.add(flameL, flameR);

  // Aegis Shield Forcefield
  const shieldMesh = new THREE.Mesh(
    new THREE.SphereGeometry(2.95, 18, 14),
    new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.22, wireframe: true })
  );
  shieldMesh.position.set(0, 0.95, 0);
  shieldMesh.visible = false;
  root.add(shieldMesh);

  root.userData = { chassisGroup, wheels, flameL, flameR, shieldMesh };
  return root;
}

// First-Person Interior Cockpit (Inside the Car!)
export function createCockpitMesh(carId = 'valkyrie') {
  const spec = getCarSpec(carId);
  const group = new THREE.Group();

  const dashMat = stdMat(0x0f1520, 0.65, 0.35);
  const trimMat = stdMat(spec.accent, 0.2, 0.5, spec.accent, 1.1);
  const hoodMat = stdMat(spec.primary, 0.2, 0.76);
  const wheelMat = stdMat(0x1f2937, 0.55, 0.35);
  const gunMat = stdMat(0x475569, 0.28, 0.85);

  // Visible sculpted front car hood + center racing stripe
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.16, 1.48), hoodMat);
  hood.position.set(0, -0.66, -1.65);
  hood.rotation.x = 0.08;
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.03, 1.46), trimMat);
  stripe.position.set(0, -0.57, -1.65);
  stripe.rotation.x = 0.08;
  group.add(hood, stripe);

  // Twin Hood Blaster Barrels
  [-0.74, 0.74].forEach(bx => {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.85, 8), gunMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(bx, -0.54, -1.78);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.09, 8), trimMat);
    tip.rotation.x = Math.PI / 2;
    tip.position.set(bx, -0.54, -2.2);
    group.add(barrel, tip);
  });

  // Sculpted Dashboard Console & Holographic Instrument Hood
  const dash = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.44, 0.66), dashMat);
  dash.position.set(0, -0.56, -0.78);
  const cluster = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.14, 0.12), stdMat(0x020617, 0.2, 0.5));
  cluster.position.set(0, -0.34, -0.7);
  const rpmStrip = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.045, 0.04), trimMat);
  rpmStrip.position.set(0, -0.34, -0.64);
  group.add(dash, cluster, rpmStrip);

  // Windshield A-Pillars & Roof Frame
  const pillarGeo = new THREE.BoxGeometry(0.085, 1.08, 0.12);
  const pillarL = new THREE.Mesh(pillarGeo, dashMat);
  pillarL.position.set(-0.88, 0.08, -0.75);
  pillarL.rotation.set(0.32, 0, -0.22);
  const pillarR = new THREE.Mesh(pillarGeo, dashMat);
  pillarR.position.set(0.88, 0.08, -0.75);
  pillarR.rotation.set(0.32, 0, 0.22);
  const roofBar = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.11, 0.2), dashMat);
  roofBar.position.set(0, 0.54, -0.56);
  group.add(pillarL, pillarR, roofBar);

  // Rotating Sports Steering Wheel with LED Top Marker
  const wheelPivot = new THREE.Group();
  wheelPivot.position.set(0, -0.38, -0.47);
  wheelPivot.rotation.x = -0.28;

  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.028, 10, 24), wheelMat);
  const centerHub = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.068, 0.04, 12), dashMat);
  centerHub.rotation.x = Math.PI / 2;
  const spokeH = new THREE.Mesh(new THREE.BoxGeometry(0.39, 0.04, 0.025), wheelMat);
  const spokeV = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.18, 0.025), wheelMat);
  spokeV.position.y = -0.09;
  const topMarker = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.056, 0.042), trimMat);
  topMarker.position.y = 0.21;

  wheelPivot.add(rim, centerHub, spokeH, spokeV, topMarker);
  group.add(wheelPivot);

  group.userData = { wheelPivot, rpmStrip };
  return group;
}
