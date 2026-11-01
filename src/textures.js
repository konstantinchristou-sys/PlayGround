import * as THREE from 'three';

function canvas(w, h) {
  const el = document.createElement('canvas');
  el.width = w;
  el.height = h;
  return { el, ctx: el.getContext('2d') };
}

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function noiseFill(ctx, w, h, base, spread, seed = 1, speckles = 0) {
  const rand = rng(seed);
  const img = ctx.createImageData(w, h);
  const c = new THREE.Color(base);
  const br = c.r * 255, bg = c.g * 255, bb = c.b * 255;
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rand() - 0.5) * spread;
    img.data[i] = Math.max(0, Math.min(255, br + n));
    img.data[i + 1] = Math.max(0, Math.min(255, bg + n));
    img.data[i + 2] = Math.max(0, Math.min(255, bb + n));
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  for (let i = 0; i < speckles; i++) {
    const a = rand() * 0.16;
    ctx.fillStyle = rand() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a + 0.05})`;
    const s = 1 + rand() * 3;
    ctx.fillRect(rand() * w, rand() * h, s, s);
  }
}

let asphaltMap;
export function asphaltTexture() {
  if (asphaltMap) return asphaltMap;
  const { el, ctx } = canvas(256, 256);
  noiseFill(ctx, 256, 256, '#2b2d38', 26, 7, 900);
  for (let i = 0; i < 20; i++) {
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const x = Math.random() * 256, y = Math.random() * 256;
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * 60, y + (Math.random() - 0.5) * 60);
    ctx.stroke();
  }
  asphaltMap = new THREE.CanvasTexture(el);
  asphaltMap.wrapS = asphaltMap.wrapT = THREE.RepeatWrapping;
  asphaltMap.repeat.set(46, 46);
  asphaltMap.anisotropy = 4;
  asphaltMap.colorSpace = THREE.SRGBColorSpace;
  return asphaltMap;
}

let concreteMap;
export function concreteTexture() {
  if (concreteMap) return concreteMap;
  const { el, ctx } = canvas(256, 256);
  noiseFill(ctx, 256, 256, '#8a8e98', 30, 13, 700);
  ctx.strokeStyle = 'rgba(40,40,48,0.25)';
  for (let i = 1; i < 4; i++) {
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, i * 64);
    ctx.lineTo(256, i * 64);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(i * 64, 0);
    ctx.lineTo(i * 64, 256);
    ctx.stroke();
  }
  concreteMap = new THREE.CanvasTexture(el);
  concreteMap.wrapS = concreteMap.wrapT = THREE.RepeatWrapping;
  concreteMap.repeat.set(10, 10);
  concreteMap.anisotropy = 4;
  concreteMap.colorSpace = THREE.SRGBColorSpace;
  return concreteMap;
}

let parkMap;
export function parkTexture() {
  if (parkMap) return parkMap;
  const { el, ctx } = canvas(256, 256);
  noiseFill(ctx, 256, 256, '#9aa0a8', 24, 29, 1100);
  ctx.strokeStyle = 'rgba(45,45,55,0.28)';
  ctx.lineWidth = 2;
  for (let i = 1; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(0, i * 85);
    ctx.lineTo(256, i * 85);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(i * 85, 0);
    ctx.lineTo(i * 85, 256);
    ctx.stroke();
  }
  parkMap = new THREE.CanvasTexture(el);
  parkMap.wrapS = parkMap.wrapT = THREE.RepeatWrapping;
  parkMap.repeat.set(12, 12);
  parkMap.anisotropy = 4;
  parkMap.colorSpace = THREE.SRGBColorSpace;
  return parkMap;
}

const facadeCache = new Map();

export function facadeTextures(variant = 0) {
  if (facadeCache.has(variant)) return facadeCache.get(variant);
  const rand = rng(100 + variant * 37);
  const bases = ['#232b3d', '#2c2438', '#1d2b2c', '#312b2b', '#20263a'];
  const base = bases[variant % bases.length];
  const { el, ctx } = canvas(256, 256);
  const em = canvas(256, 256);
  const ectx = em.ctx;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  // subtle wall panels
  ctx.fillStyle = 'rgba(255,255,255,0.035)';
  for (let i = 0; i < 4; i++) ctx.fillRect(i * 64 + 4, 0, 2, 256);
  ctx.fillStyle = 'rgba(0,0,0,0.20)';
  for (let i = 0; i < 4; i++) ctx.fillRect(i * 64 + 58, 0, 6, 256);

  ectx.fillStyle = '#000';
  ectx.fillRect(0, 0, 256, 256);

  const cols = 4, rows = 4;
  const cw = 256 / cols, ch = 256 / rows;
  const litColors = ['#ffbf6b', '#ffd9a0', '#7fe8ff', '#b8ffe0', '#ff8fb8'];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const px = x * cw + cw * 0.22;
      const py = y * ch + ch * 0.2;
      const ww = cw * 0.56;
      const wh = ch * 0.52;
      const lit = rand() > 0.42;
      ctx.fillStyle = lit ? '#3a3e4a' : '#161a24';
      ctx.fillRect(px - 3, py - 3, ww + 6, wh + 6);
      if (lit) {
        const col = litColors[Math.floor(rand() * litColors.length)];
        ctx.fillStyle = col;
        ctx.fillRect(px, py, ww, wh);
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.fillRect(px, py, ww, wh * 0.28);
        ectx.fillStyle = col;
        ectx.fillRect(px, py, ww, wh);
      } else {
        ctx.fillStyle = '#10141d';
        ctx.fillRect(px, py, ww, wh);
        ctx.fillStyle = 'rgba(120,180,220,0.10)';
        ctx.fillRect(px, py, ww, wh * 0.5);
      }
      if (rand() > 0.72) {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(px, py + wh * 0.55, ww, 2);
      }
    }
  }
  const map = new THREE.CanvasTexture(el);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  const emissive = new THREE.CanvasTexture(em.el);
  emissive.wrapS = emissive.wrapT = THREE.RepeatWrapping;
  emissive.colorSpace = THREE.SRGBColorSpace;
  const out = { map, emissive };
  facadeCache.set(variant, out);
  return out;
}

export function signTexture(text, color = '#6ff2d0', bg = 'rgba(10,12,20,0.9)') {
  const { el, ctx } = canvas(512, 160);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 160);
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, 496, 144);
  ctx.font = '900 84px "Arial Black", Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = color;
  ctx.shadowBlur = 30;
  ctx.fillStyle = color;
  ctx.fillText(text, 256, 86);
  const tex = new THREE.CanvasTexture(el);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function plateTexture(text, color = '#eaf7ff', bg = 'rgba(12,16,28,0.94)') {
  const { el, ctx } = canvas(512, 128);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.strokeRect(6, 6, 500, 116);
  ctx.font = '700 52px "Trebuchet MS", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, 256, 68);
  const tex = new THREE.CanvasTexture(el);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let graffitiCache;
export function graffitiTexture() {
  if (graffitiCache) return graffitiCache;
  const rand = rng(9182);
  const { el, ctx } = canvas(512, 256);
  const colors = ['#ff4d8d', '#6ff2d0', '#ffd166', '#8f7bff', '#ff7a3d'];
  for (let i = 0; i < 16; i++) {
    ctx.strokeStyle = colors[Math.floor(rand() * colors.length)];
    ctx.globalAlpha = 0.5 + rand() * 0.4;
    ctx.lineWidth = 4 + rand() * 16;
    ctx.lineCap = 'round';
    ctx.beginPath();
    const x = rand() * 512, y = rand() * 256;
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + 80, y - 60, x + 90, y + 70, x + 150, y + 10);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.font = '900 62px "Arial Black", Impact, sans-serif';
  ctx.textAlign = 'center';
  ['VOLT', 'SK8', 'NO BRAKES', 'RIDE', 'CITY'].forEach((t, i) => {
    ctx.save();
    ctx.translate(80 + i * 92, 120 + (i % 2) * 52);
    ctx.rotate((rand() - 0.5) * 0.5);
    ctx.shadowColor = colors[i % colors.length];
    ctx.shadowBlur = 18;
    ctx.fillStyle = colors[(i + 2) % colors.length];
    ctx.fillText(t, 0, 0);
    ctx.restore();
  });
  graffitiCache = new THREE.CanvasTexture(el);
  graffitiCache.colorSpace = THREE.SRGBColorSpace;
  return graffitiCache;
}

let glowTexture;
export function glowTexture() {
  if (glowTexture) return glowTexture;
  const { el, ctx } = canvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,240,190,0.75)');
  g.addColorStop(0.6, 'rgba(255,190,90,0.20)');
  g.addColorStop(1, 'rgba(255,170,60,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  glowTexture = new THREE.CanvasTexture(el);
  glowTexture.colorSpace = THREE.SRGBColorSpace;
  return glowTexture;
}

let softTexture;
export function softParticleTexture() {
  if (softTexture) return softTexture;
  const { el, ctx } = canvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.4)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  softTexture = new THREE.CanvasTexture(el);
  softTexture.colorSpace = THREE.SRGBColorSpace;
  return softTexture;
}

export function sunTexture() {
  const { el, ctx } = canvas(256, 256);
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,250,220,1)');
  g.addColorStop(0.18, 'rgba(255,214,140,0.98)');
  g.addColorStop(0.42, 'rgba(255,140,80,0.35)');
  g.addColorStop(1, 'rgba(255,100,60,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(el);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
