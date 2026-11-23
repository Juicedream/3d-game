import * as THREE from 'three';

function mat(color, roughness = 0.65, metalness = 0.15, emissive = 0x000000, emissiveIntensity = 0) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    emissive,
    emissiveIntensity
  });
}

// ============================================================
// 1. SCULPTED TACTICAL OPERATOR (TPS Player, Remote Players, AI Bots)
// ============================================================
export function createOperatorMesh(team = 'ALPHA') {
  const root = new THREE.Group();
  const primary = team === 'ALPHA' ? 0x1d4ed8 : team === 'BRAVO' ? 0xb91c1c : 0x3f6212;
  const accent = team === 'ALPHA' ? 0x38bdf8 : team === 'BRAVO' ? 0xfb7185 : 0xa3e635;

  const armorMat = mat(primary, 0.42, 0.38);
  const clothMat = mat(0x1e242d, 0.82, 0.12);
  const bootMat = mat(0x111418, 0.72, 0.25);
  const skinMat = mat(0xd8a478, 0.78, 0.02);
  const visorMat = mat(accent, 0.12, 0.88, accent, 0.75);
  const gunMat = mat(0x181c22, 0.35, 0.82);

  const body = new THREE.Group();
  root.add(body);

  // Articulated Legs with thigh armor, knee pads & combat boots
  function makeLeg(xSign) {
    const legGroup = new THREE.Group();
    legGroup.position.set(xSign * 0.16, 0.82, 0);
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.105, 0.26, 6, 10), clothMat);
    thigh.position.y = -0.18;
    thigh.castShadow = true;
    const kneePad = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 8), armorMat);
    kneePad.position.set(0, -0.36, -0.06);
    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.28, 6, 10), clothMat);
    shin.position.y = -0.54;
    shin.castShadow = true;
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.14, 0.28), bootMat);
    boot.position.set(0, -0.75, -0.04);
    boot.castShadow = true;
    legGroup.add(thigh, kneePad, shin, boot);
    return legGroup;
  }

  const leftLeg = makeLeg(-1);
  const rightLeg = makeLeg(1);
  body.add(leftLeg, rightLeg);

  // Pelvis / Tactical Belt
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.23, 0.16, 12), bootMat);
  belt.position.set(0, 0.84, 0);
  body.add(belt);

  // Contoured Chest Rig + Ballistic Plate Carrier + Backpack
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.22, 0.62, 12), clothMat);
  torso.position.set(0, 1.18, 0);
  torso.scale.set(1.08, 1, 0.72);
  torso.castShadow = true;
  body.add(torso);

  const vestFront = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.44, 0.34), armorMat);
  vestFront.position.set(0, 1.21, -0.01);
  vestFront.castShadow = true;
  body.add(vestFront);

  // Chest ammo pouches
  [-0.12, 0, 0.12].forEach(px => {
    const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.14, 0.08), bootMat);
    pouch.position.set(px, 1.07, -0.19);
    body.add(pouch);
  });

  // Tactical Backpack + Radio Antenna
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.18), bootMat);
  pack.position.set(0, 1.22, 0.22);
  pack.castShadow = true;
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.012, 0.45, 5), gunMat);
  antenna.position.set(0.14, 1.58, 0.24);
  body.add(pack, antenna);

  // Rounded Shoulder Pauldrons with glowing Team IFF strips
  [-1, 1].forEach(side => {
    const pauldron = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), armorMat);
    pauldron.position.set(side * 0.33, 1.42, 0);
    pauldron.scale.set(1.0, 0.85, 1.0);
    pauldron.castShadow = true;
    const iff = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.16), visorMat);
    iff.position.set(side * 0.41, 1.43, 0);
    body.add(pauldron, iff);
  });

  // Sculpted Head + Curved Tactical FAST Helmet + Glowing Visor + NVG Mount
  const head = new THREE.Group();
  head.position.set(0, 1.66, 0);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.095, 0.14, 8), clothMat);
  neck.position.y = -0.12;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.165, 12, 10), skinMat);
  skull.scale.set(0.92, 1.06, 0.96);
  skull.castShadow = true;
  const mask = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.145, 0.13, 10), clothMat);
  mask.position.set(0, -0.05, -0.02);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.195, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), armorMat);
  helmet.position.set(0, 0.02, 0.01);
  helmet.castShadow = true;
  const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.172, 0.172, 0.085, 14, 1, true, -Math.PI * 0.35, Math.PI * 0.7), visorMat);
  visor.rotation.y = Math.PI;
  visor.position.set(0, 0.02, 0);
  const nvg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.055, 0.08), gunMat);
  nvg.position.set(0, 0.14, -0.17);
  head.add(neck, skull, mask, helmet, visor, nvg);
  body.add(head);

  // Articulated Arms
  const leftArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.42, 6, 8), clothMat);
  leftArm.position.set(-0.34, 1.18, -0.14);
  leftArm.rotation.set(0.75, 0, -0.22);
  leftArm.castShadow = true;

  const rightArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.42, 6, 8), clothMat);
  rightArm.position.set(0.34, 1.18, -0.18);
  rightArm.rotation.set(1.18, 0, 0.14);
  rightArm.castShadow = true;
  body.add(leftArm, rightArm);

  // Detailed Held Assault Rifle
  const rifle = new THREE.Group();
  rifle.position.set(0.24, 1.16, -0.44);
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.56), gunMat);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.44, 8), gunMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.02, -0.44);
  const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.028, 0.18, 8), gunMat);
  scope.rotation.x = Math.PI / 2;
  scope.position.set(0, 0.095, -0.05);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.21, 0.08), bootMat);
  mag.position.set(0, -0.14, -0.08);
  mag.rotation.x = 0.2;
  rifle.add(receiver, barrel, scope, mag);
  body.add(rifle);

  root.userData = {
    body, head, leftLeg, rightLeg, leftArm, rightArm, rifle,
    animPhase: Math.random() * 10
  };
  return root;
}

export function animateOperator(mesh, dt, speed, sliding = false) {
  const u = mesh.userData;
  if (!u || !u.body) return;
  if (sliding) {
    u.body.position.y = THREE.MathUtils.lerp(u.body.position.y, -0.56, dt * 13);
    u.body.rotation.x = THREE.MathUtils.lerp(u.body.rotation.x, -0.72, dt * 13);
    u.leftLeg.rotation.x = -0.9;
    u.rightLeg.rotation.x = 0.45;
    return;
  }
  u.body.position.y = THREE.MathUtils.lerp(u.body.position.y, 0, dt * 12);
  u.body.rotation.x = THREE.MathUtils.lerp(u.body.rotation.x, 0, dt * 12);
  if (speed > 0.3) {
    u.animPhase += dt * Math.min(14, speed * 1.45);
    const swing = Math.sin(u.animPhase) * 0.68;
    u.leftLeg.rotation.x = swing;
    u.rightLeg.rotation.x = -swing;
    u.body.position.y = Math.abs(Math.sin(u.animPhase)) * 0.065;
  } else {
    u.leftLeg.rotation.x = THREE.MathUtils.lerp(u.leftLeg.rotation.x, 0, dt * 10);
    u.rightLeg.rotation.x = THREE.MathUtils.lerp(u.rightLeg.rotation.x, 0, dt * 10);
  }
}

// ============================================================
// 2. DETAILED FIRST-PERSON WEAPON VIEWMODEL
// ============================================================
export function createWeaponViewModel(type = 'rifle') {
  const group = new THREE.Group();
  const metalDark = mat(0x161a20, 0.32, 0.85);
  const metalMid = mat(0x3a4350, 0.38, 0.78);
  const polymer = mat(0x21262e, 0.72, 0.18);
  const wood = mat(0x714726, 0.68, 0.08);
  const glow = mat(0x38bdf8, 0.15, 0.1, 0x38bdf8, 1.8);
  const glove = mat(0x1f242c, 0.85, 0.1);

  // Subtle gloved tactical support hand holding the weapon
  const hand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, 0.16), glove);
  hand.position.set(-0.04, -0.09, -0.34);
  group.add(hand);

  if (type === 'rifle') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.135, 0.62), metalDark);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.025, 0.54), metalMid);
    rail.position.set(0, 0.08, -0.15);
    const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.105, 0.38), polymer);
    handguard.position.set(0, 0.008, -0.45);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.024, 0.38, 10), metalMid);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, -0.78);
    const suppressor = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 10), metalDark);
    suppressor.rotation.x = Math.PI / 2;
    suppressor.position.set(0, 0.02, -0.96);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.25, 0.095), polymer);
    mag.position.set(0, -0.16, -0.15);
    mag.rotation.x = 0.24;
    const optic = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.04, 0.19, 12), metalMid);
    optic.rotation.x = Math.PI / 2;
    optic.position.set(0, 0.125, -0.06);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 8), glow);
    dot.position.set(0, 0.125, -0.14);
    group.add(body, rail, handguard, barrel, suppressor, mag, optic, dot);
  } else if (type === 'shotgun') {
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.135, 0.36), wood);
    stock.position.set(0, -0.02, 0.16);
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.118, 0.14, 0.34), metalDark);
    receiver.position.set(0, 0, -0.14);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.034, 0.66, 12), metalMid);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.042, -0.58);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.56, 10), metalDark);
    tube.rotation.x = Math.PI / 2;
    tube.position.set(0, -0.02, -0.54);
    const pump = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.056, 0.24, 10), wood);
    pump.rotation.x = Math.PI / 2;
    pump.position.set(0, -0.028, -0.48);
    group.add(stock, receiver, barrel, tube, pump);
  } else {
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.09, 0.39), metalMid);
    slide.position.set(0, 0.032, -0.18);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.074, 0.045, 0.35), polymer);
    frame.position.set(0, -0.015, -0.16);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.21, 0.105), polymer);
    grip.position.set(0, -0.1, -0.02);
    grip.rotation.x = -0.24;
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.018, 0.018), glow);
    sight.position.set(0, 0.088, -0.34);
    group.add(slide, frame, grip, sight);
  }

  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0 });
  const flash = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), flashMat);
  flash.position.set(0, 0.03, type === 'pistol' ? -0.44 : -1.08);
  group.add(flash);

  group.userData = { flash };
  return group;
}

// ============================================================
// 3. SCULPTED ZOMBIE (Apocalypse Mode — Walker / Runner / Brute)
// ============================================================
export function createZombieMesh(variant = 'walker') {
  const root = new THREE.Group();
  const scale = variant === 'brute' ? 1.38 : variant === 'runner' ? 0.94 : 1.02;
  root.scale.setScalar(scale);

  const skinColor = variant === 'brute' ? 0x45583d : variant === 'runner' ? 0x708064 : 0x5c7253;
  const clothColor = variant === 'brute' ? 0x3f1d1d : variant === 'runner' ? 0x2a313a : 0x3b3830;
  const eyeColor = variant === 'brute' ? 0xff1e1e : variant === 'runner' ? 0xffaa00 : 0xa3e635;

  const skinMat = mat(skinColor, 0.88, 0.02);
  const clothMat = mat(clothColor, 0.95, 0.0);
  const boneMat = mat(0xcbc4b4, 0.85, 0.0);
  const eyeMat = mat(eyeColor, 0.15, 0.1, eyeColor, 2.5);

  const body = new THREE.Group();
  root.add(body);

  // Gaunt Legs
  const leftLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.56, 5, 8), clothMat);
  leftLeg.position.set(-0.15, 0.39, 0);
  leftLeg.castShadow = true;
  const rightLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.56, 5, 8), clothMat);
  rightLeg.position.set(0.15, 0.39, 0);
  rightLeg.castShadow = true;

  // Hunched Torso + Exposed Rib Detail
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.19, 0.68, 10), clothMat);
  torso.position.set(0, 1.08, 0.05);
  torso.rotation.x = 0.24;
  torso.scale.set(1.12, 1, 0.78);
  torso.castShadow = true;

  // Brute heavy mutated shoulders
  if (variant === 'brute') {
    [-0.32, 0.32].forEach(sx => {
      const hump = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), skinMat);
      hump.position.set(sx, 1.35, -0.02);
      body.add(hump);
    });
  }

  // Torn chest ribs
  for (let r = 0; r < 3; r++) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.035, 0.04), boneMat);
    rib.position.set(0, 1.15 - r * 0.075, -0.14);
    body.add(rib);
  }

  // Sculpted Gaunt Head + Slack Jaw + Glowing Eyes
  const head = new THREE.Group();
  head.position.set(0, 1.56, -0.09);
  const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.165, 10, 10), skinMat);
  cranium.scale.set(0.9, 1.1, 0.95);
  cranium.castShadow = true;
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.11, 0.14), skinMat);
  jaw.position.set(0, -0.12, -0.06);
  jaw.rotation.x = 0.25;
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 6), eyeMat);
  eyeL.position.set(-0.065, 0.02, -0.145);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.065;
  head.add(cranium, jaw, eyeL, eyeR);

  // Clawed Outstretched Arms
  const leftArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.068, 0.54, 5, 8), skinMat);
  leftArm.position.set(-0.33, 1.24, -0.28);
  leftArm.rotation.x = Math.PI / 2 - 0.18;
  leftArm.castShadow = true;

  const rightArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.068, 0.54, 5, 8), skinMat);
  rightArm.position.set(0.33, 1.24, -0.28);
  rightArm.rotation.x = Math.PI / 2 - 0.28;
  rightArm.castShadow = true;

  body.add(leftLeg, rightLeg, torso, head, leftArm, rightArm);

  root.userData = { body, leftLeg, rightLeg, leftArm, rightArm, head, phase: Math.random() * 10 };
  return root;
}

// ============================================================
// 4. SCULPTED RONIN SAMURAI (Raised by Wolves + Flowing Hakama + Katana + Disguise)
// ============================================================
export function createSamuraiMesh() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const kimonoMat = mat(0x1b2a44, 0.82, 0.08);
  const hakamaMat = mat(0x111722, 0.88, 0.05);
  const sashMat = mat(0xb91c1c, 0.72, 0.12);
  const skinMat = mat(0xdba878, 0.72, 0.02);
  const hairMat = mat(0x111216, 0.82, 0.12);
  const peltMat = mat(0x7c7870, 0.94, 0.02);
  const boneMat = mat(0xe5e0d5, 0.7, 0.05);
  const steelMat = mat(0xf1f5f9, 0.14, 0.95, 0x93c5fd, 0.22);
  const goldMat = mat(0xf59e0b, 0.28, 0.88);
  const hiltMat = mat(0x271c15, 0.72, 0.15);

  // Flowing Pleated Hakama Legs + Sandals
  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.15, 0.78, 0);
  const hakL = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.66, 8), hakamaMat);
  hakL.position.y = -0.35;
  hakL.castShadow = true;
  leftLeg.add(hakL);

  const rightLeg = new THREE.Group();
  rightLeg.position.set(0.15, 0.78, 0);
  const hakR = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.66, 8), hakamaMat);
  hakR.position.y = -0.35;
  hakR.castShadow = true;
  rightLeg.add(hakR);

  // Sculpted Kimono Torso + Layered Obi Sash + Hip Scabbard (Saya)
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.21, 0.66, 12), kimonoMat);
  torso.position.set(0, 1.12, 0);
  torso.scale.set(1.12, 1, 0.74);
  torso.castShadow = true;

  // Crossed Kimono Collar
  const collarL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.42, 0.04), sashMat);
  collarL.position.set(-0.07, 1.24, -0.17);
  collarL.rotation.z = -0.36;
  const collarR = collarL.clone();
  collarR.position.x = 0.07;
  collarR.rotation.z = 0.36;

  const obi = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.25, 0.19, 12), sashMat);
  obi.position.set(0, 0.84, 0);
  obi.scale.set(1.14, 1, 0.78);

  // Scabbard (Saya) tucked at left hip
  const scabbard = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.024, 1.05, 8), mat(0x18181b, 0.35, 0.5));
  scabbard.position.set(-0.3, 0.84, 0.18);
  scabbard.rotation.x = Math.PI / 2 - 0.25;
  scabbard.rotation.z = 0.18;

  // Sculpted Wolf-Pelt Cloak & Wolf-Skull Pauldron (Origin Symbol!)
  const wolfMantle = new THREE.Group();
  const peltTrim = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.1, 8, 16), peltMat);
  peltTrim.rotation.x = Math.PI / 2;
  peltTrim.position.set(0, 1.4, 0.02);
  peltTrim.castShadow = true;
  const peltCape = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.92, 10, 1, true, -Math.PI * 0.45, Math.PI * 0.9), peltMat);
  peltCape.material.side = THREE.DoubleSide;
  peltCape.position.set(0, 1.0, 0.18);
  peltCape.rotation.y = Math.PI;
  const wolfPauldron = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.26, 6), boneMat);
  wolfPauldron.position.set(-0.36, 1.44, -0.02);
  wolfPauldron.rotation.z = 0.7;
  wolfMantle.add(peltTrim, peltCape, wolfPauldron);

  // Sculpted Ronin Head + Flowing Topknot + Crimson Headband
  const head = new THREE.Group();
  head.position.set(0, 1.62, 0);
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.155, 12, 10), skinMat);
  face.scale.set(0.92, 1.08, 0.95);
  face.castShadow = true;
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.168, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.56), hairMat);
  hairCap.position.y = 0.02;
  const headband = new THREE.Mesh(new THREE.TorusGeometry(0.162, 0.022, 6, 16), sashMat);
  headband.rotation.x = Math.PI / 2;
  headband.position.y = 0.05;
  const topknot = new THREE.Mesh(new THREE.CapsuleGeometry(0.048, 0.14, 6, 8), hairMat);
  topknot.position.set(0, 0.22, 0.09);
  topknot.rotation.x = -0.52;
  head.add(face, hairCap, headband, topknot);

  // Disguise Outfit: Wide Woven Kasa Straw Hat + Flowing Traveler Mantle
  const disguiseGroup = new THREE.Group();
  const strawMat = mat(0xd6b472, 0.88, 0.02);
  const cloakMat = mat(0x574c3f, 0.94, 0.0);
  const kasaHat = new THREE.Mesh(new THREE.ConeGeometry(0.68, 0.26, 20), strawMat);
  kasaHat.position.set(0, 1.85, 0);
  kasaHat.castShadow = true;
  const hatBand = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.028, 6, 16), sashMat);
  hatBand.rotation.x = Math.PI / 2;
  hatBand.position.set(0, 1.88, 0);
  const travelerCloak = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.62, 1.12, 14, 1, true), cloakMat);
  travelerCloak.material.side = THREE.DoubleSide;
  travelerCloak.position.set(0, 1.02, 0);
  disguiseGroup.add(kasaHat, hatBand, travelerCloak);
  disguiseGroup.visible = false;

  // Sleeved Arms
  const leftArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.44, 6, 8), kimonoMat);
  leftArm.position.set(-0.36, 1.14, 0);
  leftArm.castShadow = true;

  const rightArmPivot = new THREE.Group();
  rightArmPivot.position.set(0.36, 1.35, 0);
  const rightArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.44, 6, 8), kimonoMat);
  rightArm.position.set(0, -0.22, 0);
  rightArm.castShadow = true;
  rightArmPivot.add(rightArm);

  // Razor-Sharp Forged Katana
  const katana = new THREE.Group();
  katana.position.set(0, -0.46, -0.08);
  const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.28, 8), hiltMat);
  hilt.rotation.x = Math.PI / 2;
  const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.072, 0.02, 12), goldMat);
  guard.rotation.x = Math.PI / 2;
  guard.position.set(0, 0, -0.15);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.058, 1.18), steelMat);
  blade.position.set(0, 0, -0.74);
  blade.castShadow = true;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.14, 4), steelMat);
  tip.rotation.x = -Math.PI / 2;
  tip.position.set(0, 0, -1.39);
  katana.add(hilt, guard, blade, tip);
  rightArmPivot.add(katana);

  // Tai Chi Harmony Ring
  const chiMat = new THREE.MeshBasicMaterial({ color: 0x2dd4bf, transparent: true, opacity: 0, side: THREE.DoubleSide });
  const chiRing = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.72, 28), chiMat);
  chiRing.position.set(0, 1.15, -0.62);

  body.add(leftLeg, rightLeg, torso, collarL, collarR, obi, scabbard, wolfMantle, head, leftArm, rightArmPivot, disguiseGroup, chiRing);

  root.userData = {
    body, head, leftLeg, rightLeg, leftArm, rightArmPivot, katana, disguiseGroup, wolfMantle, chiRing, phase: 0
  };
  return root;
}

// ============================================================
// 5. SCULPTED FOREST WOLF
// ============================================================
export function createWolfMesh(isAlpha = false) {
  const root = new THREE.Group();
  const fur = mat(isAlpha ? 0xe2e8f0 : 0x64748b, 0.88, 0.02);
  const ruff = mat(isAlpha ? 0xf8fafc : 0x94a3b8, 0.92, 0.0);
  const dark = mat(0x272c35, 0.9, 0.0);
  const eye = mat(0xfbbf24, 0.15, 0.1, 0xfbbf24, 1.8);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.68, 6, 10), fur);
  torso.rotation.x = Math.PI / 2;
  torso.position.set(0, 0.68, 0);
  torso.castShadow = true;

  const mane = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), ruff);
  mane.position.set(0, 0.76, -0.36);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), fur);
  head.position.set(0, 0.9, -0.64);
  const snout = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.28, 8), dark);
  snout.rotation.x = -Math.PI / 2;
  snout.position.set(0, 0.85, -0.88);

  const earGeo = new THREE.ConeGeometry(0.065, 0.19, 5);
  const earL = new THREE.Mesh(earGeo, dark);
  earL.position.set(-0.11, 1.1, -0.58);
  const earR = earL.clone();
  earR.position.x = 0.11;

  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.026, 6, 6), eye);
  eyeL.position.set(-0.08, 0.94, -0.78);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.08;

  const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.44, 5, 8), ruff);
  tail.position.set(0, 0.72, 0.68);
  tail.rotation.x = 0.75;

  const legs = [
    [-0.14, 0.3, -0.34], [0.14, 0.3, -0.34],
    [-0.14, 0.3, 0.34], [0.14, 0.3, 0.34]
  ].map(([x, y, z]) => {
    const l = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.42, 5, 8), dark);
    l.position.set(x, y, z);
    l.castShadow = true;
    root.add(l);
    return l;
  });

  root.add(torso, mane, head, snout, earL, earR, eyeL, eyeR, tail);
  if (isAlpha) root.scale.setScalar(1.24);
  root.userData = { legs, tail, phase: Math.random() * 10 };
  return root;
}

// ============================================================
// 6. IMPERIAL SAMURAI GUARD / FOREST BANDIT / CLAN ELDER
// ============================================================
export function createNpcMesh(role = 'guard') {
  const root = new THREE.Group();
  const isGuard = role === 'guard';
  const isElder = role === 'elder';

  const primary = isGuard ? 0x991b1b : isElder ? 0xd97706 : 0x4b3b2c;
  const secondary = isGuard ? 0x18181b : isElder ? 0xfef3c7 : 0x26211b;
  const armorMat = mat(primary, 0.45, isGuard ? 0.55 : 0.08);
  const clothMat = mat(secondary, 0.85, 0.05);
  const skinMat = mat(0xd8a878, 0.78, 0.02);
  const goldMat = mat(0xfbbf24, 0.25, 0.9);

  const leftLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.56, 5, 8), clothMat);
  leftLeg.position.set(-0.15, 0.38, 0);
  const rightLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.56, 5, 8), clothMat);
  rightLeg.position.set(0.15, 0.38, 0);

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.22, 0.68, 12), armorMat);
  torso.position.set(0, 1.1, 0);
  torso.scale.set(1.1, 1, 0.76);
  torso.castShadow = true;

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.155, 10, 10), skinMat);
  head.position.set(0, 1.62, 0);
  head.castShadow = true;

  root.add(leftLeg, rightLeg, torso, head);

  if (isGuard) {
    // Layered Samurai Shoulder Plates + Kabuto Helmet + Golden Crescent Crest + Naginata
    [-0.33, 0.33].forEach(sx => {
      const sode = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.28, 0.26), armorMat);
      sode.position.set(sx, 1.3, 0);
      root.add(sode);
    });
    const helm = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.22, 12), mat(0x18181b, 0.35, 0.7));
    helm.position.set(0, 1.82, 0);
    const crest = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.026, 6, 12, Math.PI), goldMat);
    crest.rotation.z = Math.PI;
    crest.position.set(0, 1.94, -0.15);
    const spear = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 2.35, 6), mat(0x4a2c17, 0.8));
    spear.position.set(0.36, 1.24, -0.22);
    spear.rotation.x = 0.24;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.058, 0.36, 4), mat(0xf1f5f9, 0.18, 0.92));
    tip.position.set(0.36, 2.34, 0.06);
    tip.rotation.x = 0.24;
    root.add(helm, crest, spear, tip);
  } else if (isElder) {
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.48, 0.22, 16), clothMat);
    hat.position.set(0, 1.84, 0);
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 2.0, 6), mat(0x78350f, 0.8));
    staff.position.set(0.36, 1.0, -0.15);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 10), mat(0xfbbf24, 0.2, 0.2, 0xfbbf24, 1.8));
    orb.position.set(0.36, 2.06, -0.15);
    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.55, 16, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.14, side: THREE.DoubleSide })
    );
    beacon.position.set(0, 8, 0);
    root.add(hat, staff, orb, beacon);
  } else {
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), clothMat);
    hood.position.set(0, 1.65, 0);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.07, 0.92), mat(0x94a3b8, 0.28, 0.85));
    blade.position.set(0.34, 1.06, -0.46);
    root.add(hood, blade);
  }

  root.userData = { leftLeg, rightLeg, phase: Math.random() * 10 };
  return root;
}

// ============================================================
// 7. STRANGE ASTRA REALM CREATURE & BOSSES (Void Stalker / Magma Warden)
// ============================================================
export function createAstraCreatureMesh(isBoss = false) {
  const root = new THREE.Group();
  const scale = isBoss ? 1.85 : 1.05;
  root.scale.setScalar(scale);

  const obsidian = mat(0x18131a, 0.35, 0.72);
  const magma = mat(0xff4500, 0.2, 0.2, 0xff4500, 2.2);
  const violet = mat(0xa855f7, 0.25, 0.5, 0xa855f7, 1.5);

  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.58, 1), obsidian);
  core.position.y = 1.45;
  core.castShadow = true;

  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.08, 8, 20), isBoss ? magma : violet);
  halo.position.y = 1.45;
  halo.rotation.x = Math.PI / 3;

  // 3 Glowing Strange Eyes
  const eyes = [[-0.22, 1.56, -0.46], [0, 1.66, -0.5], [0.22, 1.56, -0.46]].map(([x, y, z]) => {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 8), magma);
    e.position.set(x, y, z);
    root.add(e);
    return e;
  });

  // Floating Spiked Tentacle Limbs
  const limbs = [];
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.14, 1.15, 6), obsidian);
    spike.position.set(Math.cos(angle) * 0.78, 0.95, Math.sin(angle) * 0.78);
    spike.rotation.z = Math.cos(angle) * 0.5;
    root.add(spike);
    limbs.push(spike);
  }

  // Crown horns for Boss
  if (isBoss) {
    [-0.38, 0.38].forEach(hx => {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.85, 6), magma);
      horn.position.set(hx, 2.25, 0);
      horn.rotation.z = hx > 0 ? -0.35 : 0.35;
      root.add(horn);
    });
  }

  root.add(core, halo);
  root.userData = { core, halo, limbs, eyes, phase: Math.random() * 10 };
  return root;
}

// ============================================================
// 8. MIGHTY DRAGON EMPEROR BOSS (Colossal Celestial Dragon!)
// ============================================================
export function createDragonEmperorMesh() {
  const root = new THREE.Group();
  const scaleMat = mat(0x991b1b, 0.3, 0.65, 0x7f1d1d, 0.35);
  const goldMat = mat(0xfbbf24, 0.22, 0.88, 0xf59e0b, 0.45);
  const fireEye = mat(0xfef08a, 0.1, 0.1, 0xfacc15, 3.0);
  const wingMat = mat(0xdc2626, 0.5, 0.2, 0x991b1b, 0.4);
  wingMat.side = THREE.DoubleSide;

  // Serpentine Armored Body Segments
  const segments = [];
  for (let i = 0; i < 9; i++) {
    const radius = Math.max(0.45, 1.35 - i * 0.1);
    const seg = new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 10), i % 2 === 0 ? scaleMat : goldMat);
    seg.position.set(0, 4.2 + Math.sin(i * 0.7) * 0.5, i * 1.45);
    seg.scale.set(1.0, 0.9, 1.25);
    seg.castShadow = true;
    // Dorsal dragon spine crest
    const spine = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.95, 4), goldMat);
    spine.position.set(0, radius + 0.3, 0);
    seg.add(spine);
    root.add(seg);
    segments.push(seg);
  }

  // Fierce Sculpted Dragon Head + Imperial Horns + Whiskers + Glowing Eyes
  const head = new THREE.Group();
  head.position.set(0, 4.7, -1.65);
  const skull = new THREE.Mesh(new THREE.BoxGeometry(1.85, 1.45, 2.3), scaleMat);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.85, 1.5), scaleMat);
  snout.position.set(0, -0.18, -1.55);
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.42, 1.35), goldMat);
  jaw.position.set(0, -0.78, -1.35);
  jaw.rotation.x = 0.18;

  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), fireEye);
  eyeL.position.set(-0.68, 0.25, -0.95);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.68;

  // Twin Royal Antler Horns
  [-0.65, 0.65].forEach(hx => {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.22, 2.2, 6), goldMat);
    horn.position.set(hx, 1.35, 0.45);
    horn.rotation.set(-0.45, 0, hx > 0 ? -0.35 : 0.35);
    head.add(horn);
  });
  head.add(skull, snout, jaw, eyeL, eyeR);
  root.add(head);

  // Massive Flapping Dragon Wings
  const wingL = new THREE.Group();
  wingL.position.set(-1.3, 4.9, 1.2);
  const wMeshL = new THREE.Mesh(new THREE.PlaneGeometry(6.8, 3.6), wingMat);
  wMeshL.position.set(-3.4, 0.4, 0.5);
  wMeshL.rotation.x = -Math.PI / 2 + 0.35;
  wingL.add(wMeshL);

  const wingR = new THREE.Group();
  wingR.position.set(1.3, 4.9, 1.2);
  const wMeshR = new THREE.Mesh(new THREE.PlaneGeometry(6.8, 3.6), wingMat);
  wMeshR.position.set(3.4, 0.4, 0.5);
  wMeshR.rotation.x = -Math.PI / 2 + 0.35;
  wingR.add(wMeshR);

  root.add(wingL, wingR);

  root.userData = { head, segments, wingL, wingR, phase: 0 };
  return root;
}
