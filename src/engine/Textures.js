import * as THREE from 'three';

const cache = new Map();

function makeCanvasTexture(key, size, drawFn, repeatX = 1, repeatY = 1) {
  const fullKey = `${key}_${repeatX}_${repeatY}`;
  if (cache.has(fullKey)) return cache.get(fullKey);

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  drawFn(ctx, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cache.set(fullKey, tex);
  return tex;
}

export function getGrassTexture(rep = 14) {
  return makeCanvasTexture('grass', 256, (ctx, s) => {
    ctx.fillStyle = '#2d4726';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 3200; i++) {
      const x = Math.random() * s;
      const y = Math.random() * s;
      const shade = Math.random();
      ctx.fillStyle = shade > 0.65 ? '#3d6131' : shade > 0.3 ? '#243a1f' : '#4a5d2e';
      ctx.fillRect(x, y, 2 + Math.random() * 2, 4 + Math.random() * 4);
    }
    // Dirt patches
    for (let i = 0; i < 18; i++) {
      ctx.fillStyle = 'rgba(72, 54, 36, 0.28)';
      ctx.beginPath();
      ctx.arc(Math.random() * s, Math.random() * s, 10 + Math.random() * 22, 0, Math.PI * 2);
      ctx.fill();
    }
  }, rep, rep);
}

export function getSandTexture(rep = 14) {
  return makeCanvasTexture('sand', 256, (ctx, s) => {
    ctx.fillStyle = '#cfa972';
    ctx.fillRect(0, 0, s, s);
    // Wind-blown sand ripples
    for (let y = 0; y < s; y += 8) {
      ctx.strokeStyle = y % 16 === 0 ? 'rgba(255,232,190,0.22)' : 'rgba(145,105,58,0.18)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let x = 0; x <= s; x += 16) {
        const wy = y + Math.sin((x / s) * Math.PI * 4) * 3;
        if (x === 0) ctx.moveTo(x, wy);
        else ctx.lineTo(x, wy);
      }
      ctx.stroke();
    }
    for (let i = 0; i < 2000; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,244,218,0.18)' : 'rgba(130,90,45,0.15)';
      ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2);
    }
  }, rep, rep);
}

export function getConcreteTexture(rep = 6, dark = false) {
  return makeCanvasTexture(dark ? 'concrete_dark' : 'concrete', 256, (ctx, s) => {
    ctx.fillStyle = dark ? '#2d3136' : '#7b8085';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 2800; i++) {
      const v = dark ? 30 + Math.random() * 35 : 95 + Math.random() * 55;
      ctx.fillStyle = `rgba(${v},${v},${v},0.35)`;
      ctx.fillRect(Math.random() * s, Math.random() * s, 2 + Math.random() * 3, 2 + Math.random() * 3);
    }
    // Concrete panel seams
    ctx.strokeStyle = dark ? 'rgba(10,12,15,0.55)' : 'rgba(55,58,62,0.45)';
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, s - 4, s - 4);
    ctx.beginPath();
    ctx.moveTo(0, s / 2);
    ctx.lineTo(s, s / 2);
    ctx.moveTo(s / 2, 0);
    ctx.lineTo(s / 2, s);
    ctx.stroke();
    // Grime drips
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = dark ? 'rgba(12,18,14,0.35)' : 'rgba(40,42,40,0.16)';
      ctx.fillRect(Math.random() * s, 0, 4 + Math.random() * 10, 40 + Math.random() * 120);
    }
  }, rep, rep);
}

export function getAsphaltTexture(rep = 12) {
  return makeCanvasTexture('asphalt', 256, (ctx, s) => {
    ctx.fillStyle = '#2b2e33';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 3600; i++) {
      const v = 30 + Math.random() * 45;
      ctx.fillStyle = `rgb(${v},${v},${v + 2})`;
      ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2);
    }
    // Subtle road marking dash
    ctx.fillStyle = 'rgba(235, 198, 72, 0.42)';
    ctx.fillRect(s * 0.48, s * 0.1, s * 0.04, s * 0.35);
    ctx.fillRect(s * 0.48, s * 0.6, s * 0.04, s * 0.32);
  }, rep, rep);
}

export function getBuildingFacadeTexture(repX = 2, repY = 3) {
  return makeCanvasTexture('facade', 256, (ctx, s) => {
    ctx.fillStyle = '#3d4552';
    ctx.fillRect(0, 0, s, s);
    const cols = 4;
    const rows = 4;
    const cw = s / cols;
    const ch = s / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const lit = Math.random() > 0.55;
        ctx.fillStyle = lit ? '#8fb7d4' : '#1b222c';
        ctx.fillRect(c * cw + 8, r * ch + 10, cw - 16, ch - 20);
        ctx.strokeStyle = '#252c36';
        ctx.lineWidth = 3;
        ctx.strokeRect(c * cw + 8, r * ch + 10, cw - 16, ch - 20);
      }
    }
  }, repX, repY);
}

export function getBrickTexture(rep = 3) {
  return makeCanvasTexture('brick', 256, (ctx, s) => {
    ctx.fillStyle = '#7c7872';
    ctx.fillRect(0, 0, s, s);
    const rows = 8;
    const cols = 4;
    const rh = s / rows;
    const cw = s / cols;
    for (let r = 0; r < rows; r++) {
      const offset = (r % 2) * (cw / 2);
      for (let c = -1; c <= cols; c++) {
        const tone = 110 + Math.floor(Math.random() * 40);
        ctx.fillStyle = `rgb(${tone + 20}, ${tone - 10}, ${tone - 22})`;
        ctx.fillRect(c * cw + offset + 2, r * rh + 2, cw - 4, rh - 4);
      }
    }
  }, rep, rep);
}

export function getCrateTexture() {
  return makeCanvasTexture('crate', 256, (ctx, s) => {
    ctx.fillStyle = '#8b633b';
    ctx.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 32) {
      ctx.fillStyle = y % 64 === 0 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.04)';
      ctx.fillRect(0, y, s, 32);
    }
    ctx.strokeStyle = '#53371d';
    ctx.lineWidth = 14;
    ctx.strokeRect(7, 7, s - 14, s - 14);
    ctx.beginPath();
    ctx.moveTo(14, 14);
    ctx.lineTo(s - 14, s - 14);
    ctx.moveTo(s - 14, 14);
    ctx.lineTo(14, s - 14);
    ctx.stroke();
  }, 1, 1);
}

export function getBarkTexture() {
  return makeCanvasTexture('bark', 128, (ctx, s) => {
    ctx.fillStyle = '#4a3525';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 400; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? '#352418' : '#5f4632';
      ctx.fillRect(Math.random() * s, Math.random() * s, 3, 14 + Math.random() * 20);
    }
  }, 1, 2);
}

export function getStoneTileTexture(rep = 8) {
  return makeCanvasTexture('stone_tile', 256, (ctx, s) => {
    ctx.fillStyle = '#6c6d6b';
    ctx.fillRect(0, 0, s, s);
    const n = 4;
    const step = s / n;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const v = 95 + Math.floor(Math.random() * 35);
        ctx.fillStyle = `rgb(${v},${v + 2},${v - 2})`;
        ctx.fillRect(c * step + 2, r * step + 2, step - 4, step - 4);
      }
    }
    ctx.strokeStyle = '#3b3e3a';
    ctx.lineWidth = 3;
    for (let i = 0; i <= n; i++) {
      ctx.beginPath();
      ctx.moveTo(i * step, 0);
      ctx.lineTo(i * step, s);
      ctx.moveTo(0, i * step);
      ctx.lineTo(s, i * step);
      ctx.stroke();
    }
  }, rep, rep);
}

export function getBunkerFloorTexture(rep = 10) {
  return makeCanvasTexture('bunker_floor', 256, (ctx, s) => {
    ctx.fillStyle = '#1e2124';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 2400; i++) {
      const v = 22 + Math.random() * 25;
      ctx.fillStyle = `rgb(${v},${v + 2},${v})`;
      ctx.fillRect(Math.random() * s, Math.random() * s, 3, 3);
    }
    // Hazard/grime markings
    ctx.strokeStyle = 'rgba(130, 35, 25, 0.25)';
    ctx.lineWidth = 6;
    ctx.strokeRect(4, 4, s - 8, s - 8);
  }, rep, rep);
}
