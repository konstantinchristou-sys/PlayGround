import * as THREE from 'three';
import { sampleGround, WORLD_LIMIT } from './logic.js';
import {
  asphaltTexture, concreteTexture, parkTexture, facadeTextures, signTexture,
  plateTexture, graffitiTexture, glowTexture, softParticleTexture, sunTexture,
} from './textures.js';

export const PARK = { minX: -43, maxX: 43, minZ: -39, maxZ: 39, cx: 0, cz: 0 };
export const ROAD_X = [-162, -106, -50, 50, 106, 162];
export const ROAD_Z = [-158, -102, -46, 46, 102, 158];
const ROAD_W = 12;
const BLOCK = 44;
const WALK_H = 0.14;

export const RAMPS = [
  { id: 'pipe-n', type: 'quarter', x: 0, z: -28, yaw: 0, width: 24, radius: 5, height: 5, neon: '#63f5d4' },
  { id: 'pipe-s', type: 'quarter', x: 0, z: -12, yaw: Math.PI, width: 24, radius: 5, height: 5, neon: '#ff5f9e' },
  { id: 'kicker', type: 'wedge', x: 0, z: 13, yaw: 0, width: 10, length: 9, height: 2.8, neon: '#ffcf5c' },
  { id: 'kicker-mini', type: 'wedge', x: 25, z: 30, yaw: 0, width: 7, length: 6, height: 1.6, neon: '#9b8bff' },
  { id: 'funbox', type: 'funbox', x: -24, z: 10, yaw: 0, width: 11, depth: 9, length: 5, height: 1.5, neon: '#9b8bff' },
  { id: 'qp-west', type: 'quarter', x: -37, z: 10, yaw: Math.PI / 2, width: 18, radius: 5, height: 4.6, neon: '#63f5d4' },
  { id: 'qp-east', type: 'quarter', x: 37, z: 10, yaw: -Math.PI / 2, width: 18, radius: 5, height: 4.6, neon: '#ff5f9e' },
];

export const SPAWN = { x: 0, z: 31, yaw: Math.PI };

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function std(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05, ...opts });
}

function addShadows(obj) {
  obj.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return obj;
}

/* ------------------------------------------------------------------ */
/* Ramp geometry                                                       */
/* ------------------------------------------------------------------ */

function triangleList(tris) {
  const g = new THREE.BufferGeometry();
  const pos = [];
  for (const t of tris) for (const p of t) pos.push(p[0], p[1], p[2]);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

function quarterGeometry(width, R, segs = 20) {
  const tris = [];
  const w = width / 2;
  const pt = (i) => {
    const t = (i / segs) * R;
    return [t, R - Math.sqrt(Math.max(0, R * R - t * t)), -t];
  };
  for (let i = 0; i < segs; i++) {
    const a = pt(i), b = pt(i + 1);
    const A = [-w, a[1], a[2]], B = [w, a[1], a[2]], C = [w, b[1], b[2]], D = [-w, b[1], b[2]];
    tris.push([A, B, C], [A, C, D]);
    // side walls
    const L1 = [-w, 0, a[2]], L2 = [-w, a[1], a[2]], L3 = [-w, b[1], b[2]], L4 = [-w, 0, b[2]];
    tris.push([L1, L2, L3], [L1, L3, L4]);
    const R1 = [w, 0, a[2]], R2 = [w, a[1], a[2]], R3 = [w, b[1], b[2]], R4 = [w, 0, b[2]];
    tris.push([R1, R3, R2], [R1, R4, R3]);
  }
  // vertical back wall under the lip
  tris.push([[-w, 0, -R], [w, 0, -R], [w, R, -R]], [[-w, 0, -R], [w, R, -R], [-w, R, -R]]);
  // low edge face
  tris.push([[-w, 0, 0], [-w, 0, 0.001], [w, 0, 0.001]], [[-w, 0, 0], [w, 0, 0.001], [w, 0, 0]]);
  return triangleList(tris);
}

function wedgeGeometry(width, length, height) {
  const w = width / 2;
  const A = [-w, 0, 0], B = [w, 0, 0], C = [w, height, -length], D = [-w, height, -length];
  const tris = [
    [A, B, C], [A, C, D], // slope
    [A, [-w, 0, -length], D], // left side
    [B, C, [w, 0, -length]], // right side
    [[-w, 0, -length], D, C], [[-w, 0, -length], C, [w, 0, -length]], // back
  ];
  return triangleList(tris);
}

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

/* ------------------------------------------------------------------ */
/* World                                                               */
/* ------------------------------------------------------------------ */

export function createWorld(scene) {
  const colliders = [];
  const coins = [];
  const cars = [];
  const peds = [];
  const walkRects = [];
  const lights = [];
  const signs = [];
  const spawn = { ...SPAWN };

  const concrete = concreteTexture();
  const asphalt = asphaltTexture();
  const parkTex = parkTexture();

  scene.fog = new THREE.FogExp2(0xc27a68, 0.0036);

  /* ---------------- sky ---------------- */
  const skyGeo = new THREE.SphereGeometry(520, 32, 20);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color('#0a1230') },
      mid: { value: new THREE.Color('#5a3568') },
      horizon: { value: new THREE.Color('#ff9663') },
      sunDir: { value: new THREE.Vector3(-0.52, 0.1, -0.85).normalize() },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform vec3 sunDir;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y, -0.15, 1.0);
        vec3 col = mix(horizon, mid, smoothstep(0.0, 0.32, h));
        col = mix(col, top, smoothstep(0.26, 0.8, h));
        float sun = max(dot(d, normalize(sunDir)), 0.0);
        col += vec3(1.0, 0.55, 0.24) * pow(sun, 22.0) * 0.55;
        col += vec3(1.0, 0.75, 0.4) * pow(sun, 220.0) * 1.2;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.frustumCulled = false;
  scene.add(sky);

  const sun = new THREE.Sprite(new THREE.SpriteMaterial({
    map: sunTexture(), color: 0xffd9a0, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, opacity: 0.95,
  }));
  sun.scale.set(150, 150, 1);
  sun.position.set(-300, 60, -490);
  scene.add(sun);

  // far skyline silhouettes
  const farMat = new THREE.MeshBasicMaterial({ color: 0x1a2035, fog: true });
  const farWindowMat = new THREE.MeshBasicMaterial({ color: 0x8f6a4a, fog: true });
  const rand = mulberry(11);
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2 + rand() * 0.08;
    const r = 225 + rand() * 65;
    const w = 14 + rand() * 26;
    const h = 24 + rand() * 72;
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), farMat);
    b.position.set(Math.cos(a) * r, h / 2 - 4, Math.sin(a) * r);
    scene.add(b);
    if (rand() > 0.45) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(w * 0.5, h * 0.5, 0.4), farWindowMat);
      strip.position.set(b.position.x, b.position.y + 3, b.position.z + w / 2 + 0.3);
      strip.rotation.y = -a;
      scene.add(strip);
    }
  }

  /* ---------------- lights ---------------- */
  scene.add(new THREE.HemisphereLight(0xffc9a5, 0x2a2d4a, 1.05));
  const sunLight = new THREE.DirectionalLight(0xffd2a0, 2.6);
  sunLight.position.set(-70, 82, -120);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 260;
  sunLight.shadow.camera.left = -75;
  sunLight.shadow.camera.right = 75;
  sunLight.shadow.camera.top = 75;
  sunLight.shadow.camera.bottom = -75;
  sunLight.shadow.bias = -0.0006;
  sunLight.shadow.normalBias = 0.03;
  sunLight.target.position.set(0, 0, 0);
  scene.add(sunLight, sunLight.target);
  const rim = new THREE.DirectionalLight(0x7f9cff, 0.55);
  rim.position.set(90, 40, 100);
  scene.add(rim);

  /* ---------------- ground ---------------- */
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(420, 420),
    new THREE.MeshStandardMaterial({ map: asphalt, color: 0xcfd2dd, roughness: 0.97, metalness: 0.0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const parkFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(PARK.maxX - PARK.minX, PARK.maxZ - PARK.minZ),
    new THREE.MeshStandardMaterial({ map: parkTex, color: 0xe4e0d8, roughness: 0.92 }),
  );
  parkFloor.rotation.x = -Math.PI / 2;
  parkFloor.position.set(0, 0.015, 0);
  parkFloor.receiveShadow = true;
  scene.add(parkFloor);

  /* ---------------- road markings ---------------- */
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xf4e7c8, fog: true, transparent: true, opacity: 0.85 });
  const verticalDashes = [];
  const horizontalDashes = [];
  for (const x of ROAD_X) {
    for (let z = -186; z <= 186; z += 9) {
      if (ROAD_Z.some((rz) => Math.abs(z - rz) < 10)) continue;
      verticalDashes.push([x, 0.022, z]);
    }
  }
  for (const z of ROAD_Z) {
    for (let x = -186; x <= 186; x += 9) {
      if (ROAD_X.some((rx) => Math.abs(x - rx) < 10)) continue;
      horizontalDashes.push([x, 0.022, z]);
    }
  }
  const dashGeoV = new THREE.PlaneGeometry(0.22, 3.1);
  const dashGeoH = new THREE.PlaneGeometry(3.1, 0.22);
  const iV = new THREE.InstancedMesh(dashGeoV, dashMat, verticalDashes.length);
  const iH = new THREE.InstancedMesh(dashGeoH, dashMat, horizontalDashes.length);
  const m4 = new THREE.Matrix4();
  const qFlat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  const qFlatH = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, Math.PI / 2));
  verticalDashes.forEach((p, i) => {
    m4.compose(new THREE.Vector3(...p), qFlat, new THREE.Vector3(1, 1, 1));
    iV.setMatrixAt(i, m4);
  });
  horizontalDashes.forEach((p, i) => {
    m4.compose(new THREE.Vector3(...p), qFlatH, new THREE.Vector3(1, 1, 1));
    iH.setMatrixAt(i, m4);
  });
  scene.add(iV, iH);

  // crosswalk stripes at the four corners of the park
  const stripeGeo = new THREE.PlaneGeometry(0.55, 5.2);
  const stripeMat = new THREE.MeshBasicMaterial({ color: 0xf7efe0, transparent: true, opacity: 0.75, fog: true });
  const stripes = [];
  for (const sx of [-50, 50]) {
    for (const sz of [-46, 46]) {
      for (let i = -3; i <= 3; i++) {
        stripes.push({ x: sx + i * 1.1, z: sz, rot: 0 });
        stripes.push({ x: sx, z: sz + i * 1.1, rot: Math.PI / 2 });
      }
    }
  }
  const stripeMesh = new THREE.InstancedMesh(stripeGeo, stripeMat, stripes.length);
  stripes.forEach((s, i) => {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, s.rot, 0));
    m4.compose(new THREE.Vector3(s.x, 0.026, s.z), q, new THREE.Vector3(1, 1, 1));
    stripeMesh.setMatrixAt(i, m4);
  });
  scene.add(stripeMesh);

  /* ---------------- city blocks ---------------- */
  const blockCenters = [];
  for (const bx of [-134, -78, 78, 134]) for (const bz of [-130, -74, 74, 130]) blockCenters.push([bx, bz]);

  const sidewalkMat = new THREE.MeshStandardMaterial({ map: concrete, color: 0xcfc9c0, roughness: 0.95 });
  const signWords = ['VOLT', 'NOODLES', '24/7', 'SK8', 'RAMEN', 'ARCADE', 'MOTEL', 'TATTOO', 'VINYL', 'CAFE'];
  let signIdx = 0;

  blockCenters.forEach(([bx, bz], bi) => {
    const walk = box(BLOCK, WALK_H, BLOCK, sidewalkMat, bx, WALK_H / 2, bz);
    walk.receiveShadow = true;
    walk.castShadow = false;
    scene.add(walk);
    walkRects.push({ minX: bx - BLOCK / 2, maxX: bx + BLOCK / 2, minZ: bz - BLOCK / 2, maxZ: bz + BLOCK / 2 });

    // thin curb ring around the block
    const curbMat = std(0x777986, { roughness: 0.9 });
    const cw = BLOCK + 0.6;
    const curbTop = WALK_H + 0.035;
    for (const [dx, dz, w, d] of [[0, -BLOCK / 2, cw, 0.7], [0, BLOCK / 2, cw, 0.7], [-BLOCK / 2, 0, 0.7, cw], [BLOCK / 2, 0, 0.7, cw]]) {
      const curb = box(w, curbTop, d, curbMat, bx + dx, curbTop / 2, bz + dz);
      curb.receiveShadow = true;
      scene.add(curb);
    }

    const nearPark = Math.abs(bx) === 78 && Math.abs(bz) === 74;
    const bRand = mulberry(200 + bi * 17);
    const slots = [
      [-11, -11], [11, -11], [-11, 11], [11, 11],
    ];
    const count = nearPark ? 3 : 3;
    for (let s = 0; s < count; s++) {
      const [ox, oz] = slots[s];
      const w = 12 + bRand() * 6;
      const d = 12 + bRand() * 6;
      const h = nearPark ? 6 + bRand() * 5 : 10 + bRand() * 26 + (Math.abs(bx) === 134 ? 6 : 0);
      const px = bx + ox + (bRand() - 0.5) * 2;
      const pz = bz + oz + (bRand() - 0.5) * 2;
      const tex = facadeTextures((bi + s) % 5);
      const map = tex.map.clone();
      const em = tex.emissive.clone();
      map.needsUpdate = em.needsUpdate = true;
      map.repeat.set(Math.max(1, w / 7), Math.max(1, h / 7));
      em.repeat.copy(map.repeat);
      const mat = new THREE.MeshStandardMaterial({
        map, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: 0.75,
        roughness: 0.82, metalness: 0.05, color: 0xdfe3ee,
      });
      const b = box(w, h, d, mat, px, WALK_H + h / 2, pz);
      addShadows(b);
      scene.add(b);
      colliders.push({ minX: px - w / 2, maxX: px + w / 2, minZ: pz - d / 2, maxZ: pz + d / 2 });
      // roof
      const roof = box(w + 0.25, 0.35, d + 0.25, std(0x242833, { roughness: 0.9 }), px, WALK_H + h + 0.15, pz);
      roof.castShadow = true;
      scene.add(roof);
      // rooftop details
      if (bRand() > 0.35) {
        const ac = box(1.6 + bRand() * 1.6, 1.1, 1.2 + bRand() * 1.2, std(0x535a6b), px + (bRand() - 0.5) * w * 0.4, WALK_H + h + 0.9, pz + (bRand() - 0.5) * d * 0.4);
        ac.castShadow = true;
        scene.add(ac);
      }
      if (bRand() > 0.6) {
        const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 5, 6), std(0x2c3040));
        ant.position.set(px, WALK_H + h + 2.5, pz);
        scene.add(ant);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff5f6d }));
        bulb.position.set(px, WALK_H + h + 5, pz);
        scene.add(bulb);
      }

      // neon shop sign facing the street / park
      if (nearPark || bRand() > 0.55) {
        const word = signWords[signIdx++ % signWords.length];
        const col = ['#6ff2d0', '#ff6b9d', '#ffd166', '#8f7bff'][signIdx % 4];
        const signW = Math.min(w * 0.8, 8);
        const sign = new THREE.Mesh(
          new THREE.PlaneGeometry(signW, signW * 0.28),
          new THREE.MeshBasicMaterial({ map: signTexture(word, col), transparent: true, side: THREE.DoubleSide, toneMapped: false }),
        );
        const dir = nearPark ? (bx > 0 ? -1 : 1) : (bRand() > 0.5 ? 1 : -1);
        const sy = WALK_H + 3.4 + bRand() * Math.min(4, h * 0.3);
        if (nearPark) {
          sign.position.set(px + dir * (w / 2 + 0.12), sy, pz);
          sign.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        } else {
          sign.position.set(px, sy, pz + dir * (d / 2 + 0.12));
          sign.rotation.y = dir > 0 ? 0 : Math.PI;
        }
        scene.add(sign);
        signs.push(sign);
      }
    }
  });

  /* ---------------- park perimeter ---------------- */
  const wallMat = std(0x2a2d3a, { roughness: 0.92 });
  const wallTrimMat = new THREE.MeshBasicMaterial({ color: 0x66f5d6, toneMapped: false });
  const wallH = 2.7;

  function wallSegment(x, z, w, d, neon = true) {
    const m = box(w, wallH, d, wallMat, x, wallH / 2, z);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    if (neon) {
      const strip = box(Math.max(w, 0.12), 0.07, Math.max(d, 0.12), wallTrimMat, x, wallH + 0.02, z);
      scene.add(strip);
    }
    return m;
  }

  wallSegment(0, -39, 86, 0.8);
  wallSegment(-43, 0, 0.8, 78);
  wallSegment(43, 0, 0.8, 78);
  wallSegment(-26, 39, 34, 0.8);
  wallSegment(26, 39, 34, 0.8);

  // graffiti on the inside of the walls
  const graf = graffitiTexture();
  const grafMat = new THREE.MeshBasicMaterial({ map: graf, transparent: true, side: THREE.DoubleSide, toneMapped: false, opacity: 0.92 });
  const grafNorth = new THREE.Mesh(new THREE.PlaneGeometry(30, 2.2), grafMat);
  grafNorth.position.set(-20, 1.3, -38.5);
  scene.add(grafNorth);
  const grafEast = new THREE.Mesh(new THREE.PlaneGeometry(24, 2.2), grafMat);
  grafEast.position.set(42.5, 1.3, -20);
  grafEast.rotation.y = -Math.PI / 2;
  scene.add(grafEast);
  const grafWest = new THREE.Mesh(new THREE.PlaneGeometry(24, 2.2), grafMat);
  grafWest.position.set(-42.5, 1.3, 20);
  grafWest.rotation.y = Math.PI / 2;
  scene.add(grafWest);

  // big park sign on the north wall
  const parkSign = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 2.2),
    new THREE.MeshBasicMaterial({ map: plateTexture('VOLT CITY SKATEPARK', '#eaf7ff', 'rgba(8,12,24,0.9)'), transparent: true, toneMapped: false }),
  );
  parkSign.position.set(0, 4.4, -38.45);
  scene.add(parkSign);
  // support posts for the park sign
  for (const sx of [-8.4, 8.4]) {
    const post = box(0.18, 5.5, 0.18, wallMat, sx, 2.75, -38.5);
    scene.add(post);
  }

  // entrance arch
  const archMat = std(0x303445, { metalness: 0.3, roughness: 0.6 });
  for (const sx of [-10.2, 10.2]) {
    const pillar = box(1.4, 7.2, 1.4, archMat, sx, 3.6, 39);
    addShadows(pillar);
    scene.add(pillar);
    colliders.push({ minX: sx - 0.75, maxX: sx + 0.75, minZ: 38.25, maxZ: 39.75 });
    const neon = box(1.5, 0.12, 1.5, wallTrimMat, sx, 7.22, 39);
    scene.add(neon);
  }
  const beam = box(22, 1.8, 1.2, archMat, 0, 7.6, 39);
  addShadows(beam);
  scene.add(beam);
  const archSign = new THREE.Mesh(
    new THREE.PlaneGeometry(19, 2.4),
    new THREE.MeshBasicMaterial({ map: signTexture('VOLT CITY', '#ffcf5c', 'rgba(8,10,20,0.92)'), transparent: true, side: THREE.DoubleSide, toneMapped: false }),
  );
  archSign.position.set(0, 7.6, 39.64);
  scene.add(archSign);
  const archSignBack = archSign.clone();
  archSignBack.position.z = 38.36;
  archSignBack.rotation.y = Math.PI;
  scene.add(archSignBack);

  /* ---------------- ramps ---------------- */
  const rampMat = new THREE.MeshStandardMaterial({ color: 0xc5c8d2, roughness: 0.9, metalness: 0.04, side: THREE.DoubleSide });
  const rampEdgeMat = new THREE.MeshStandardMaterial({ color: 0x3a3d4c, roughness: 0.8, metalness: 0.15 });
  const copingMat = new THREE.MeshStandardMaterial({ color: 0xcfd6e6, roughness: 0.35, metalness: 0.85 });

  for (const r of RAMPS) {
    const group = new THREE.Group();
    group.position.set(r.x, 0, r.z);
    group.rotation.y = r.yaw;

    if (r.type === 'quarter') {
      const geo = quarterGeometry(r.width, r.radius);
      const m = new THREE.Mesh(geo, rampMat);
      m.castShadow = true; m.receiveShadow = true;
      group.add(m);
      // coping + neon lip
      const coping = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, r.width + 0.3, 10), copingMat);
      coping.rotation.z = Math.PI / 2;
      coping.position.set(0, r.radius + 0.02, -r.radius);
      group.add(coping);
      const neon = new THREE.Mesh(new THREE.BoxGeometry(r.width, 0.1, 0.16), new THREE.MeshBasicMaterial({ color: r.neon, toneMapped: false }));
      neon.position.set(0, r.radius - 0.16, -r.radius - 0.35);
      group.add(neon);
      const baseNeon = new THREE.Mesh(new THREE.BoxGeometry(r.width, 0.06, 0.1), new THREE.MeshBasicMaterial({ color: r.neon, toneMapped: false, transparent: true, opacity: 0.7 }));
      baseNeon.position.set(0, 0.08, 0.12);
      group.add(baseNeon);
      // side accent panels
      for (const sx of [-r.width / 2 - 0.02, r.width / 2 + 0.02]) {
        const side = new THREE.Mesh(new THREE.PlaneGeometry(r.radius, r.radius * 0.85), new THREE.MeshBasicMaterial({ color: r.neon, transparent: true, opacity: 0.12, side: THREE.DoubleSide, toneMapped: false }));
        side.position.set(sx, r.radius * 0.42, -r.radius * 0.5);
        side.rotation.y = Math.PI / 2;
        group.add(side);
      }
    } else if (r.type === 'wedge') {
      const m = new THREE.Mesh(wedgeGeometry(r.width, r.length, r.height), rampMat);
      m.castShadow = true; m.receiveShadow = true;
      group.add(m);
      const neon = new THREE.Mesh(new THREE.BoxGeometry(r.width, 0.08, 0.14), new THREE.MeshBasicMaterial({ color: r.neon, toneMapped: false }));
      neon.position.set(0, r.height + 0.03, -r.length);
      group.add(neon);
      // side plates
      for (const sx of [-r.width / 2 - 0.01, r.width / 2 + 0.01]) {
        const shape = new THREE.Shape();
        shape.moveTo(0, 0); shape.lineTo(-r.length, 0); shape.lineTo(-r.length, r.height); shape.closePath();
        const g = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: false });
        const side = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: r.neon, emissive: r.neon, emissiveIntensity: 0.45, side: THREE.DoubleSide }));
        side.rotation.y = Math.PI / 2;
        side.position.set(sx, 0.01, 0);
        group.add(side);
      }
    } else if (r.type === 'funbox') {
      const top = box(r.width, r.height, r.depth, rampMat, 0, r.height / 2, 0);
      top.castShadow = true; top.receiveShadow = true;
      group.add(top);
      for (const [dz, yaw] of [[r.depth / 2 + r.length, 0], [-(r.depth / 2 + r.length), Math.PI]]) {
        const wedge = new THREE.Mesh(wedgeGeometry(r.width, r.length, r.height), rampMat);
        wedge.rotation.y = yaw;
        wedge.position.z = dz;
        wedge.castShadow = true; wedge.receiveShadow = true;
        group.add(wedge);
        const neon = new THREE.Mesh(new THREE.BoxGeometry(r.width, 0.07, 0.12), new THREE.MeshBasicMaterial({ color: r.neon, toneMapped: false }));
        neon.position.set(0, r.height + 0.03, dz + (yaw === 0 ? 0 : 0));
        group.add(neon);
      }
      // rail across the top
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, r.width * 0.8, 8), copingMat);
      rail.rotation.z = Math.PI / 2;
      rail.position.set(0, r.height + 0.52, 0);
      group.add(rail);
      for (const sx of [-r.width * 0.38, r.width * 0.38]) {
        const post = box(0.07, 0.52, 0.07, copingMat, sx, r.height + 0.26, 0);
        group.add(post);
      }
      const topNeon = new THREE.Mesh(new THREE.BoxGeometry(r.width, 0.07, 0.12), new THREE.MeshBasicMaterial({ color: r.neon, toneMapped: false }));
      topNeon.position.set(0, r.height + 0.02, -r.depth / 2 - 0.1);
      group.add(topNeon);
    }

    scene.add(group);
  }

  /* ---------------- park props ---------------- */
  // bleachers
  const benchMat = std(0x6b5748, { roughness: 0.9 });
  const metalMat = std(0x3b4051, { metalness: 0.5, roughness: 0.5 });
  for (let i = 0; i < 4; i++) {
    const step = box(9, 0.35, 1.4, benchMat, -32, 0.4 + i * 0.55, -27 - i * 1.4);
    step.castShadow = true;
    scene.add(step);
  }
  colliders.push({ minX: -37, maxX: -27, minZ: -33, maxZ: -26 });
  for (let i = 0; i < 4; i++) {
    const leg = box(0.3, 0.9 + i * 0.55, 0.3, metalMat, -36.4, (0.9 + i * 0.55) / 2, -26.6 - i * 1.4);
    scene.add(leg);
  }

  // rail along the east side
  const railMat = copingMat;
  for (let z = -6; z <= 6; z += 3) {
    const post = box(0.1, 0.85, 0.1, railMat, 29, 0.42, z);
    scene.add(post);
  }
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 13, 8), railMat);
  rail.rotation.x = Math.PI / 2;
  rail.position.set(29, 0.85, 0);
  scene.add(rail);

  // benches
  function bench(x, z, rot = 0) {
    const g = new THREE.Group();
    const seat = box(2.6, 0.14, 0.7, benchMat, 0, 0.5, 0);
    const back = box(2.6, 0.7, 0.12, benchMat, 0, 0.85, -0.32);
    const l1 = box(0.12, 0.5, 0.6, metalMat, -1.05, 0.25, 0);
    const l2 = box(0.12, 0.5, 0.6, metalMat, 1.05, 0.25, 0);
    g.add(seat, back, l1, l2);
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    addShadows(g);
    scene.add(g);
  }
  bench(-16, 33, Math.PI);
  bench(16, 33, Math.PI);
  bench(33, -6, -Math.PI / 2);
  bench(-33, -2, Math.PI / 2);

  // park light poles
  function parkLight(x, z, height = 9) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, height, 8), metalMat);
    pole.position.set(x, height / 2, z);
    pole.castShadow = true;
    scene.add(pole);
    const head = box(1.5, 0.22, 0.4, std(0x20242f), x + 0.6, height, z);
    scene.add(head);
    const bulb = box(1.1, 0.1, 0.28, new THREE.MeshBasicMaterial({ color: 0xfff0c2, toneMapped: false }), x + 0.65, height - 0.14, z);
    scene.add(bulb);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffd9a0, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.set(4.5, 4.5, 1);
    glow.position.set(x + 0.65, height - 0.1, z);
    scene.add(glow);
    colliders.push({ minX: x - 0.3, maxX: x + 0.3, minZ: z - 0.3, maxZ: z + 0.3 });
  }
  parkLight(-37, -34);
  parkLight(37, -34);
  parkLight(-37, 34);
  parkLight(37, 34);

  // palm trees
  function palm(x, z, scale = 1) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.13 * scale, 0.24 * scale, 5.2 * scale, 7), std(0x6d4f36));
    trunk.position.y = 2.6 * scale;
    trunk.castShadow = true;
    g.add(trunk);
    const frondMat = new THREE.MeshStandardMaterial({ color: 0x2f7a56, roughness: 0.8, side: THREE.DoubleSide });
    for (let i = 0; i < 7; i++) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.55 * scale, 3.2 * scale), frondMat);
      f.position.y = 5.1 * scale;
      f.rotation.set(0, (i / 7) * Math.PI * 2, -0.85);
      f.rotateX(0.4);
      f.castShadow = true;
      g.add(f);
    }
    const nut = new THREE.Mesh(new THREE.SphereGeometry(0.28 * scale, 7, 7), std(0x3f2c1d));
    nut.position.y = 5.05 * scale;
    g.add(nut);
    g.position.set(x, 0, z);
    scene.add(g);
  }
  palm(-38, 34, 1.1);
  palm(38, 34, 1.1);
  palm(-30, 35.5, 0.9);
  palm(30, 35.5, 0.9);
  palm(-21, -35, 1.0);
  palm(22, -35, 0.95);

  /* ---------------- coins ---------------- */
  const coinGeo = new THREE.TorusGeometry(0.52, 0.15, 8, 20);
  const coinMat = new THREE.MeshStandardMaterial({ color: 0xffd45c, emissive: 0xffb21e, emissiveIntensity: 0.9, metalness: 0.75, roughness: 0.25 });
  const coinGlowMat = new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffcf5c, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending });

  const coinSpots = [
    [0, 3.6, 1], [0, 4.3, -3], [0, 4.6, -7],
    [-8, 5.5, -32], [0, 5.7, -32], [8, 5.5, -32],
    [-24, 2.4, 10], [-42, 5.2, 10], [42, 5.2, 10],
    [0, 1.3, 22], [-20, 1.3, 29], [20, 1.3, 29],
    [0, 1.3, 35], [-33, 1.3, 14], [33, 1.3, -2],
    [12, 1.3, 12], [-14, 1.3, -18],
    [0, 1.3, 46], [0, 1.3, 66], [0, 1.3, 86],
    [-50, 1.3, 0], [-50, 1.3, 24], [-50, 1.3, -24],
    [50, 1.3, 0], [50, 1.3, 24], [50, 1.3, -24],
    [0, 1.3, -46], [30, 1.3, -46], [-30, 1.3, -46],
    [50, 1.3, 46], [-50, 1.3, -46], [106, 1.3, 0],
    [-106, 1.3, 0], [0, 1.3, 102], [-30, 1.3, 102], [30, 1.3, 102],
  ];
  for (const [x, y, z] of coinSpots) {
    const g = new THREE.Group();
    const m = new THREE.Mesh(coinGeo, coinMat);
    m.castShadow = true;
    g.add(m);
    const glow = new THREE.Sprite(coinGlowMat);
    glow.scale.set(2.4, 2.4, 1);
    g.add(glow);
    g.position.set(x, y, z);
    scene.add(g);
    coins.push({ group: g, mesh: m, x, y, z, baseY: y, active: true, respawnAt: 0, phase: Math.random() * Math.PI * 2 });
  }

  /* ---------------- street props ---------------- */
  function streetLight(x, z, rot = 0) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.16, 7, 7), metalMat);
    pole.position.y = 3.5;
    pole.castShadow = true;
    g.add(pole);
    const arm = box(2.2, 0.14, 0.16, metalMat, 1.05, 7, 0);
    g.add(arm);
    const lamp = box(0.9, 0.18, 0.34, new THREE.MeshBasicMaterial({ color: 0xffe3ad, toneMapped: false }), 1.9, 6.95, 0);
    g.add(lamp);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffc781, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.set(4, 4, 1);
    glow.position.set(1.9, 6.9, 0);
    g.add(glow);
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    scene.add(g);
  }
  // ring road lamps
  for (const x of [-50, 50]) for (const z of [-30, -6, 18, 34]) streetLight(x + (x > 0 ? 4 : -4), z, x > 0 ? Math.PI : 0);
  for (const z of [-46, 46]) for (const x of [-34, -12, 12, 34]) streetLight(x, z + (z > 0 ? 5 : -5), z > 0 ? Math.PI / 2 : -Math.PI / 2);
  // a few downtown lamps on sidewalks
  for (const [x, z] of [[-72, -60], [72, -60], [-72, 60], [72, 60], [-128, -60], [128, 60]]) streetLight(x, z, 0);

  // traffic lights at the park corners
  function trafficLight(x, z, rot) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 5.4, 8), metalMat);
    pole.position.y = 2.7;
    g.add(pole);
    const arm = box(3.4, 0.14, 0.16, metalMat, 1.7, 5.2, 0);
    g.add(arm);
    const boxHead = box(0.42, 1.1, 0.42, std(0x171a24), 3.2, 5.0, 0);
    g.add(boxHead);
    const colors = [0xff4d4d, 0xffc94d, 0x4dff88];
    colors.forEach((c, i) => {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), new THREE.MeshBasicMaterial({ color: i === 2 ? c : 0x2a1b1b, toneMapped: false }));
      dot.position.set(3.2, 5.36 - i * 0.32, 0.22);
      g.add(dot);
      lights.push(dot);
    });
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    scene.add(g);
  }
  trafficLight(-46, 42, 0);
  trafficLight(46, 42, Math.PI);
  trafficLight(-46, -42, 0);
  trafficLight(46, -42, Math.PI);

  // parked cars + moving cars
  const carColors = [0x6ff2d0, 0xff6b9d, 0xffd166, 0x8f7bff, 0xdfe3ee, 0xff7a3d, 0x5ad1ff];
  function makeCar(color, headlights = true) {
    const g = new THREE.Group();
    const body = box(1.9, 0.62, 4.1, new THREE.MeshStandardMaterial({ color, metalness: 0.55, roughness: 0.35 }), 0, 0.62, 0);
    const cabin = box(1.65, 0.55, 1.9, new THREE.MeshStandardMaterial({ color: 0x1a1e2a, metalness: 0.6, roughness: 0.25 }), 0, 1.08, -0.15);
    g.add(body, cabin);
    const wheelMat = std(0x16181f);
    for (const [wx, wz] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.28, 10), wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wx, 0.34, wz);
      g.add(wheel);
    }
    if (headlights) {
      const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2c4, toneMapped: false });
      for (const wx of [-0.62, 0.62]) {
        const l = box(0.42, 0.18, 0.06, lightMat, wx, 0.62, 2.06);
        g.add(l);
      }
      const tailMat = new THREE.MeshBasicMaterial({ color: 0xff3b3b, toneMapped: false });
      for (const wx of [-0.68, 0.68]) {
        const l = box(0.36, 0.16, 0.06, tailMat, wx, 0.62, -2.06);
        g.add(l);
      }
    }
    addShadows(g);
    return g;
  }

  const carRand = mulberry(77);
  const movingLanes = [
    { x: 47, axis: 'z', dir: 1, speed: 11 },
    { x: 53, axis: 'z', dir: -1, speed: 9 },
    { x: -47, axis: 'z', dir: -1, speed: 12 },
    { x: -53, axis: 'z', dir: 1, speed: 8 },
    { z: 43, axis: 'x', dir: 1, speed: 10 },
    { z: 49, axis: 'x', dir: -1, speed: 13 },
    { z: -43, axis: 'x', dir: -1, speed: 9 },
    { z: -49, axis: 'x', dir: 1, speed: 11 },
    { x: 103, axis: 'z', dir: 1, speed: 14 },
    { z: 99, axis: 'x', dir: -1, speed: 12 },
  ];
  movingLanes.forEach((lane, i) => {
    const car = makeCar(carColors[(i + 2) % carColors.length]);
    car.position.set(lane.axis === 'z' ? lane.x : -170 + i * 17, 0, lane.axis === 'z' ? -170 + i * 17 : lane.z);
    car.rotation.y = lane.axis === 'z' ? (lane.dir > 0 ? 0 : Math.PI) : (lane.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    scene.add(car);
    cars.push({ mesh: car, ...lane, t: -170 + i * 17 });
  });

  // parked cars on ring road shoulders
  for (let i = 0; i < 8; i++) {
    const side = i % 2 ? 1 : -1;
    const x = side * 54.0;
    const z = -28 + (i >> 1) * 22;
    const car = makeCar(carColors[i % carColors.length], false);
    car.position.set(x, 0, z);
    car.rotation.y = Math.PI / 2;
    scene.add(car);
    colliders.push({ minX: x - 1.2, maxX: x + 1.2, minZ: z - 2.2, maxZ: z + 2.2 });
  }

  // pedestrians
  const pedColors = [0xffd166, 0x6ff2d0, 0xff6b9d, 0x8f7bff, 0xf2f2f2, 0xff7a3d];
  const pedRand = mulberry(303);
  const pedSpots = [
    [-76, -56, 1], [76, -56, -1], [-76, 56, -1], [76, 56, 1],
    [76, -20, 1], [-76, 20, -1], [56, 74, 1], [-56, -74, -1],
    [-132, -74, 1], [132, 74, -1], [-36, 36, 1], [36, 36, -1],
  ];
  pedSpots.forEach(([x, z, dir], i) => {
    const g = new THREE.Group();
    const col = pedColors[i % pedColors.length];
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.85, 7), new THREE.MeshStandardMaterial({ color: col, roughness: 0.8 }));
    body.position.y = 1.05;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 8, 8), std(0xe8b48b));
    head.position.y = 1.62;
    const legMat = std(0x242838);
    const legL = box(0.12, 0.62, 0.14, legMat, -0.12, 0.36, 0);
    const legR = box(0.12, 0.62, 0.14, legMat, 0.12, 0.36, 0);
    g.add(body, head, legL, legR);
    g.position.set(x, WALK_H, z);
    g.rotation.y = dir > 0 ? 0 : Math.PI;
    addShadows(g);
    scene.add(g);
    peds.push({ mesh: g, x, z, dir, speed: 0.7 + pedRand() * 0.5, phase: pedRand() * 10, legL, legR, baseY: WALK_H });
  });

  /* ---------------- ramp back/edge colliders ---------------- */
  // Funbox sides are walls when you are on the ground: keep the player from
  // popping up the vertical faces. Handled softly in-game instead.

  /* ---------------- effects helpers ---------------- */
  const dustMat = new THREE.PointsMaterial({
    map: softParticleTexture(), color: 0xd9cfc0, size: 0.5, transparent: true,
    opacity: 0.75, depthWrite: false, sizeAttenuation: true,
  });
  const dustGeometry = new THREE.BufferGeometry();
  const dustCount = 120;
  const dustPositions = new Float32Array(dustCount * 3);
  const dustVel = new Float32Array(dustCount * 3);
  const dustLife = new Float32Array(dustCount);
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dust = new THREE.Points(dustGeometry, dustMat);
  dust.frustumCulled = false;
  scene.add(dust);
  let dustCursor = 0;
  let worldElapsed = 0;

  function spawnDust(x, y, z, amount = 18, power = 3) {
    for (let i = 0; i < amount; i++) {
      const k = dustCursor++ % dustCount;
      dustPositions[k * 3] = x + (Math.random() - 0.5) * 1.2;
      dustPositions[k * 3 + 1] = y + Math.random() * 0.4;
      dustPositions[k * 3 + 2] = z + (Math.random() - 0.5) * 1.2;
      dustVel[k * 3] = (Math.random() - 0.5) * power;
      dustVel[k * 3 + 1] = Math.random() * power * 0.8;
      dustVel[k * 3 + 2] = (Math.random() - 0.5) * power;
      dustLife[k] = 0.7 + Math.random() * 0.5;
    }
  }

  function updateDust(dt) {
    for (let i = 0; i < dustCount; i++) {
      if (dustLife[i] <= 0) {
        dustPositions[i * 3 + 1] = -100;
        continue;
      }
      dustLife[i] -= dt;
      dustPositions[i * 3] += dustVel[i * 3] * dt;
      dustPositions[i * 3 + 1] += dustVel[i * 3 + 1] * dt;
      dustPositions[i * 3 + 2] += dustVel[i * 3 + 2] * dt;
      dustVel[i * 3 + 1] -= 2.4 * dt;
      dustVel[i * 3] *= 1 - dt * 1.6;
      dustVel[i * 3 + 2] *= 1 - dt * 1.6;
    }
    dustGeometry.attributes.position.needsUpdate = true;
    dustMat.opacity = 0.55;
  }

  /* ---------------- public helpers ---------------- */
  function groundAt(x, z) {
    const s = sampleGround(RAMPS, x, z);
    let h = s.height;
    let n = 0;
    for (let i = 0; i < walkRects.length; i++) {
      const r = walkRects[i];
      if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) {
        if (WALK_H > h) { h = WALK_H; n = 1; }
      }
    }
    return { height: h, ramp: s.ramp, onSidewalk: n === 1 };
  }

  function resolveCollision(pos, radius = 0.55) {
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
      const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
      let dx = pos.x - cx;
      let dz = pos.z - cz;
      let d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      if (d2 < 1e-8) {
        // center is inside: push along the nearest face
        const dl = pos.x - c.minX, dr = c.maxX - pos.x;
        const dn = pos.z - c.minZ, df = c.maxZ - pos.z;
        const m = Math.min(dl, dr, dn, df);
        if (m === dl) pos.x = c.minX - radius;
        else if (m === dr) pos.x = c.maxX + radius;
        else if (m === dn) pos.z = c.minZ - radius;
        else pos.z = c.maxZ + radius;
      } else {
        const d = Math.sqrt(d2);
        pos.x += (dx / d) * (radius - d);
        pos.z += (dz / d) * (radius - d);
      }
    }
    const lim = WORLD_LIMIT - 2;
    pos.x = Math.max(-lim, Math.min(lim, pos.x));
    pos.z = Math.max(-lim, Math.min(lim, pos.z));
  }

  function zoneAt(x, z) {
    if (x > PARK.minX && x < PARK.maxX && z > PARK.minZ && z < PARK.maxZ) return { id: 'park', name: 'Volt City Skate Park' };
    if (Math.abs(x) < 60 && Math.abs(z) < 60) return { id: 'ring', name: 'Park Ring Road' };
    if (x > 60 || z > 60) return { id: 'downtown', name: 'Neon Downtown' };
    return { id: 'west', name: 'Westside Blocks' };
  }

  function update(dt, elapsed, playerPos) {
    worldElapsed = elapsed;
    // shadow follows the rider
    if (playerPos) {
      sunLight.position.set(playerPos.x - 70, 82, playerPos.z - 120);
      sunLight.target.position.set(playerPos.x, 0, playerPos.z);
      sunLight.target.updateMatrixWorld();
    }
    // coins
    for (let i = 0; i < coins.length; i++) {
      const c = coins[i];
      if (!c.active) {
        if (elapsed > c.respawnAt) {
          c.active = true;
          c.group.visible = true;
        }
        continue;
      }
      c.mesh.rotation.y = elapsed * 2.2 + c.phase;
      c.group.position.y = c.baseY + Math.sin(elapsed * 2 + c.phase) * 0.12;
    }
    // traffic
    for (const car of cars) {
      car.t += car.speed * car.dir * dt;
      if (car.t > 186) car.t = -186;
      if (car.t < -186) car.t = 186;
      if (car.axis === 'z') car.mesh.position.z = car.t;
      else car.mesh.position.x = car.t;
    }
    // pedestrians
    for (const p of peds) {
      p.phase += dt * p.speed;
      p.mesh.position.y = WALK_H + Math.abs(Math.sin(p.phase * 3)) * 0.03;
      p.legL.rotation.x = Math.sin(p.phase * 6) * 0.55;
      p.legR.rotation.x = -Math.sin(p.phase * 6) * 0.55;
      // small shuffle back and forth
      if (p.mesh.position.x !== undefined) {
        // keep in place for simplicity; walk animation only
      }
    }
    // traffic light dots pulse
    const t = Math.floor(elapsed * 0.5) % 3;
    for (let i = 0; i < lights.length; i++) {
      lights[i].material.color.setHex(i % 3 === t ? [0xff4d4d, 0xffc94d, 0x4dff88][i % 3] : 0x2a1b1b);
    }
    // neon flicker
    const flick = 0.85 + Math.sin(elapsed * 7.3) * 0.05 + Math.sin(elapsed * 23.1) * 0.04;
    for (const s of signs) {
      if (s.material) s.material.opacity = flick;
    }
    updateDust(dt);
  }

  function collectCoins(pos, radius = 2.1) {
    let collected = 0;
    for (const c of coins) {
      if (!c.active) continue;
      const dx = pos.x - c.x;
      const dy = (pos.y + 0.8) - c.group.position.y;
      const dz = pos.z - c.z;
      if (dx * dx + dy * dy + dz * dz < radius * radius) {
        c.active = false;
        c.group.visible = false;
        c.respawnAt = worldElapsed + 26;
        collected++;
      }
    }
    return collected;
  }

  function randomCoinSpot() {
    const active = coins.filter((c) => c.active);
    if (!active.length) return null;
    return active[Math.floor(Math.random() * active.length)];
  }

  // breathing light for the park
  const parkGlow = new THREE.PointLight(0xff9d63, 22, 55, 2);
  parkGlow.position.set(0, 7, 0);
  scene.add(parkGlow);

  return {
    ramps: RAMPS,
    colliders,
    coins,
    spawn,
    groundAt,
    resolveCollision,
    zoneAt,
    update,
    collectCoins,
    spawnDust,
    randomCoinSpot,
    parkGlow,
    sunLight,
    sky,
  };
}
